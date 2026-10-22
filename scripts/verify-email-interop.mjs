// Real PHP code checker + actual Node issuer/routes; temporary SQL/files, no SMTP/DB/network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'eastel-email-interop-'));
const php = process.env.EASTEL_PHP_BIN || 'php';
const originalTZ = process.env.TZ;
process.env.TZ = 'UTC'; // Deliberately pinned fixture clock; hosted timezones remain unverified.
let passed = 0;
const helper = {
  success: data => Response.json({ status: 'success', ...data }),
  error: (message, status = 400) => Response.json({ status: 'error', message }, { status }),
};
function phpCall(input) {
  const result = spawnSync(php, ['-n', '-d', `sys_temp_dir=${scratch}`, 'scripts/fixtures/email-interop.php'], {
    input: JSON.stringify(input), encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0, result.error ? 'PHP CLI unavailable; set EASTEL_PHP_BIN.' : 'PHP verification fixture failed.');
  return JSON.parse(result.stdout);
}
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.function('NOW', () => new Date().toISOString().slice(0, 19).replace('T', ' '));
  sql.exec(`CREATE TABLE email_verifications (id INTEGER PRIMARY KEY, email TEXT, code TEXT, token TEXT UNIQUE, verified INTEGER, expires_at TEXT);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, email TEXT, email_verified INTEGER);
    CREATE TABLE login_attempts (email TEXT, ip_address TEXT, success INTEGER, attempted_at TEXT, attempt_type TEXT);
    INSERT INTO customers VALUES (7, 'fixture@example.invalid', 0), (8, 'other@example.invalid', 0);`);
  let failOnSql = '', session = { customerId: 7, email: 'fixture@example.invalid', emailVerified: false };
  const sent = [], cache = new Map();
  const db = {
    async query(query, params = []) { return [sql.prepare(query.replace(/\s+FOR UPDATE/gi, '')).all(...params), []]; },
    async execute(query, params = []) {
      if (failOnSql && query.includes(failOnSql)) throw new Error('Synthetic write failure');
      const result = sql.prepare(query).run(...params);
      return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []];
    },
    async getConnection() { return { ...db, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => { if (sql.isTransaction) sql.exec('ROLLBACK'); }, release() {} }; },
  };
  const deps = {
    '@/lib/db': db,
    '@/lib/email': { sendVerificationCode: async (...args) => { sent.push(args); return true; } },
    '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true }) },
    '@/lib/site': { SITE_URL: 'https://example.invalid' },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const module = { exports: {} }; cache.set(relative, module);
    const source = fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(output, { module, exports: module.exports, require: id => {
      if (Object.hasOwn(deps, id)) return deps[id];
      if (id === '../_helpers' || id === '@/app/api/auth/_helpers') return { ...helper, requireSession: async () => session };
      if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
      return require(id);
    }, Date, Buffer, Response, Request, URL, console: { error() {} } }, { filename: relative });
    return module.exports;
  }
  return { sql, load, sent, deps, setSession: value => { session = value; }, setFailure: value => { failOnSql = value; }, close: () => sql.close() };
}
function insert(f, record) {
  f.sql.prepare('INSERT INTO email_verifications (id,email,code,token,verified,expires_at) VALUES (?,?,?,?,?,?)')
    .run(record.id, record.email, record.code, record.token, record.verified, record.expires_at);
}
const post = (api, body) => api.POST(new Request('http://localhost/api/auth/verify-email', { method: 'POST', body: JSON.stringify(body) }));
async function test(name, check) { const f = fixture(); try { await check(f); passed++; console.log(`PASS: ${name}`); } finally { f.close(); } }
try {
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL('fixtures/php-email-code.php', import.meta.url))).digest('hex'),
    '2743d33057c760c6c1a3d0f1aeeb6ac834bc8f9825e48f2fe0f2b021a0162ba7', 'PHP helper must remain the reviewed reference bytes');
  await test('PHP-issued raw 64-hex token and leading-zero code work through the Node account route', async f => {
    const record = phpCall({ operation: 'issue', code: '000042' }); insert(f, record);
    assert.match(record.token, /^[a-f0-9]{64}$/);
    const response = await post(f.load('app/api/auth/verify-email/route.ts'), { token: record.token, code: record.code });
    assert.equal(response.status, 200); assert.equal((await response.json()).emailVerified, true);
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=7').get().email_verified, 1);
    assert.equal(f.sql.prepare('SELECT verified FROM email_verifications').get().verified, 1);
  });
  await test('Node issuer stores the raw token and PHP accepts its code and SQL expiry', async f => {
    const result = await f.load('lib/account-verification.ts').issueAccountVerification(' FIXTURE@EXAMPLE.INVALID ', 'zh');
    const record = { ...f.sql.prepare('SELECT * FROM email_verifications').get() };
    assert.equal(result.sent, true); assert.equal(record.token, result.token);
    assert.match(record.code, /^[0-9]{6}$/); assert.equal(f.sent[0][0], 'fixture@example.invalid');
    assert.equal(f.sent[0][2], 'zh'); assert.equal(f.sent[0][3], result.token);
    assert.equal(phpCall({ operation: 'check', record, code: record.code, email: record.email }).valid, true);
    const html = f.load('lib/email-templates.ts').verificationEmailTemplate(record.code, 'zh', result.token);
    const href = /href="([^"]+)"/.exec(html)?.[1].replaceAll('&#x2F;', '/').replaceAll('&amp;', '&');
    assert.equal(href, `https://example.invalid/zh/account/verify-email?token=${result.token}`);
  });
  await test('email proof is bound to the account and token alone cannot verify it', async f => {
    const record = phpCall({ operation: 'issue' }); insert(f, record);
    const api = f.load('app/api/auth/verify-email/route.ts');
    assert.equal((await post(api, { token: record.token })).status, 400);
    f.setSession({ customerId: 8, email: 'other@example.invalid' });
    assert.equal((await post(api, { token: record.token, code: record.code })).status, 400);
    assert.equal(f.sql.prepare('SELECT SUM(email_verified) AS n FROM customers').get().n, 0);
    assert.equal(phpCall({ operation: 'check', record, code: record.code, email: 'other@example.invalid' }).valid, false);
  });
  await test('verification raw token is not confused with the reset-token SHA-256 format', async f => {
    const record = phpCall({ operation: 'issue' }); insert(f, record);
    const digest = createHash('sha256').update(record.token).digest('hex');
    assert.equal((await post(f.load('app/api/auth/verify-email/route.ts'), { token: digest, code: record.code })).status, 400);
    assert.equal(f.sql.prepare('SELECT verified FROM email_verifications').get().verified, 0);
  });
  await test('token-plus-code survives loss of PHP cookies; absent token/session stays unauthorized', async f => {
    const record = phpCall({ operation: 'issue' }); insert(f, record); f.setSession(null);
    const api = f.load('app/api/auth/verify-email/route.ts');
    assert.equal((await post(api, { code: record.code })).status, 401);
    assert.equal((await post(api, { token: record.token, code: record.code })).status, 200);
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=7').get().email_verified, 1);
  });
  await test('expiry is enforced by both runtimes with a pinned UTC fixture', async f => {
    const record = { ...phpCall({ operation: 'issue' }), expires_at: '2000-01-01 00:00:00' }; insert(f, record);
    assert.equal(phpCall({ operation: 'check', record, code: record.code, email: record.email }).valid, false);
    assert.equal((await post(f.load('app/api/auth/verify-email/route.ts'), { token: record.token, code: record.code })).status, 400);
    assert.equal(f.sql.prepare('SELECT verified FROM email_verifications').get().verified, 0);
  });
  await test('actual guest/account routes share a durable five-wrong-code ceiling', async f => {
    const record = phpCall({ operation: 'issue', code: '000042' }); insert(f, record);
    const account = f.load('app/api/auth/verify-email/route.ts'), guest = f.load('app/api/auth/verify-otp/route.ts');
    for (let i = 0; i < 5; i++) assert.equal((await post(i % 2 ? account : guest, { token: record.token, code: '999999' })).status, i === 4 ? 429 : 400);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM login_attempts').get().n, 5);
    assert.equal((await post(account, { token: record.token, code: record.code })).status, 400);
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=7').get().email_verified, 0);
  });
  await test('resend replaces unverified codes and the session-only path verifies the new code', async f => {
    const old = phpCall({ operation: 'issue' }); insert(f, old);
    const response = await f.load('app/api/auth/resend-code/route.ts').POST();
    assert.equal(response.status, 200); const result = await response.json();
    const current = f.sql.prepare('SELECT * FROM email_verifications').get();
    assert.notEqual(current.token, old.token); assert.equal(current.token, result.verificationToken);
    const api = f.load('app/api/auth/verify-email/route.ts');
    assert.equal((await post(api, { token: old.token, code: old.code })).status, 400);
    assert.equal((await post(api, { code: current.code })).status, 200);
  });
  await test('failed final verification write rolls back customer and proof together', async f => {
    const record = phpCall({ operation: 'issue' }); insert(f, record); f.setFailure('UPDATE email_verifications SET verified');
    assert.equal((await post(f.load('app/api/auth/verify-email/route.ts'), { token: record.token, code: record.code })).status, 500);
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=7').get().email_verified, 0);
    assert.equal(f.sql.prepare('SELECT verified FROM email_verifications').get().verified, 0);
  });
  await test('SMTP failure is reported without a fake verification success', async f => {
    f.deps['@/lib/email'].sendVerificationCode = async () => false;
    assert.equal((await f.load('app/api/auth/resend-code/route.ts').POST()).status, 502);
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=7').get().email_verified, 0);
    assert.equal(f.sql.prepare('SELECT verified FROM email_verifications').get().verified, 0);
  });
  console.log(`Email verification interop checks passed: ${passed}; real local PHP, synthetic SQL/SMTP, UTC fixture only.`);
} finally {
  if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
  const resolved = path.resolve(scratch); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(resolved, { recursive: true, force: true });
}

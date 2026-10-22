// Actual route/admission/lock/password source. SQLite and filesystem locks model
// MariaDB; separate Node workers prove local persistence, not hosted acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url), exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const baseline = process.argv.includes('--baseline'), worker = process.argv.includes('--worker')
const oldRoute = baseline ? execFileSync('git', ['show', '51d0d741106757d9a0ebd5aaa664653b3d49587a:app/api/admin/login/route.ts'], { cwd: root, encoding: 'utf8' }) : null
function load(file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const source = file === 'app/api/admin/login/route.ts' && oldRoute ? oldRoute : fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(output, { module, exports: module.exports, require(id) {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('@/') || id.startsWith('.')) throw new Error(`Unmocked dependency: ${id}`)
    return require(id)
  }, Request, Response, Headers, URL, Date, Buffer, process: { env: { DB_NAME: 'synthetic_admin_test' } }, console: { error() {} }, ...globals }, { filename: file })
  return module.exports
}
const auth = load('lib/auth.ts', { jose: {} }), validation = load('lib/validation.ts'), ipHelper = load('lib/client-ip.ts')
const password = 'AdminFixture123!', hash = await auth.hashPassword(password)
function harness(options = {}) {
  const temporary = options.directory ?? fs.mkdtempSync(path.join(os.tmpdir(), 'eastel-admin-login-'))
  const lockRoot = path.join(temporary, 'locks'); fs.mkdirSync(lockRoot, { recursive: true })
  const sql = new DatabaseSync(path.join(temporary, 'fixture.sqlite'))
  sql.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL')
  let now = '2026-10-17 08:00:00'
  sql.function('NOW', () => now)
  sql.exec(`CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT, is_active INTEGER);
    CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY, ip_address TEXT, email TEXT, password_tried TEXT, attempt_type TEXT, user_agent TEXT, ${options.nativeSchema ? 'success INTEGER DEFAULT 0,' : ''} attempted_at TEXT);`)
  for (const [i, email] of ['admin@example.invalid', ...Array.from({ length: 12 }, (_, n) => `admin${n}@example.invalid`)].entries()) {
    sql.prepare('INSERT OR IGNORE INTO admin_users VALUES (?,?,?,?,1)').run(i + 7, 'Synthetic Admin', email, hash)
  }
  const calls = { verify: 0, sessions: 0, cookies: 0, audit: 0, active: 0, peak: 0, acquired: 0, releases: 0, destroyed: 0, statements: [], logs: [], lockNames: [], releasedNames: [] }
  const normalize = query => query.replace(/DATE_SUB\(NOW\(\), INTERVAL (5|15) MINUTE\)/g, (_, minutes) => `datetime(NOW(), '-${minutes} minutes')`)
  async function query(statement, params = []) {
    calls.statements.push({ statement, params })
    if (options.readFails && statement.includes('COUNT(*)')) throw new Error('synthetic DB failure')
    if (Object.hasOwn(options, 'countOverride') && statement.includes('COUNT(*)')) {
      const key = statement.includes('ip_attempts') ? 'ip_attempts' : statement.includes('email_attempts') ? 'email_attempts' : 'cnt'
      return [[{ [key]: options.countOverride }], []]
    }
    return [sql.prepare(normalize(statement)).all(...params), []]
  }
  async function execute(statement, params = []) {
    calls.statements.push({ statement, params })
    if (options.writeFails) throw new Error('synthetic audit failure')
    const result = sql.prepare(statement).run(...params)
    return [{ affectedRows: Number(result.changes) }, []]
  }
  async function getConnection() {
    if (calls.active >= (options.poolLimit ?? 10)) throw new Error('pool exhausted/nested borrow')
    calls.active++; calls.peak = Math.max(calls.peak, calls.active)
    const held = new Map(); let closed = false, acquisitions = 0
    const cleanup = () => { if (closed) return; for (const filename of held.values()) fs.rmdirSync(filename); held.clear(); closed = true; calls.active-- }
    return { execute, query: async (statement, params) => {
      if (statement.includes('GET_LOCK')) {
        acquisitions++
        calls.lockNames.push(params[0])
        if (options.denyAt === acquisitions) return [[{ acquired: 0 }], []]
        const name = params[0], filename = path.join(lockRoot, createHash('sha256').update(name).digest('hex'))
        try { fs.mkdirSync(filename) } catch (error) { if (error.code === 'EEXIST') return [[{ acquired: 0 }], []]; throw error }
        held.set(name, filename); calls.acquired++
        if (options.lostAcquireAt === acquisitions) throw new Error('lost acquire acknowledgement')
        return [[{ acquired: 1 }], []]
      }
      if (statement.includes('RELEASE_LOCK')) {
        calls.releases++
        calls.releasedNames.push(params[0])
        if (options.releaseFails) throw new Error('lost release acknowledgement')
        const filename = held.get(params[0]); assert.ok(filename); fs.rmdirSync(filename); held.delete(params[0]); return [[{ released: 1 }], []]
      }
      return query(statement, params)
    }, release: cleanup, destroy: () => { calls.destroyed++; cleanup() } }
  }
  const pooled = operation => async (...args) => { const c = await getConnection(); try { return await operation(...args) } finally { c.release() } }
  const db = { getConnection, query: pooled(query), execute: pooled(execute) }
  const locks = () => load('lib/database-lock.ts', { '@/lib/db': { __esModule: true, default: db } })
  const admission = () => load('lib/admin-login-attempts.ts', { '@/lib/database-lock': locks() })
  function api() {
    return load('app/api/admin/login/route.ts', {
      '@/lib/db': { __esModule: true, default: db }, '@/lib/admin-login-attempts': baseline ? {} : admission(),
      '@/lib/auth': { verifyPassword: async (...args) => { calls.verify++; return options.verify ? options.verify(...args) : auth.verifyPassword(...args) } },
      '@/lib/session': { createSession: async (_id, _ip, _ua, role) => {
        assert.equal(calls.active, 0, 'release admission connection before session pool borrow')
        const c = await getConnection(); try { assert.equal(role, 'admin'); calls.sessions++; return 'synthetic-session' } finally { c.release() }
      } },
      '@/lib/cookies': { setSessionCookie: async () => { calls.cookies++ } }, '@/lib/audit': { logAdminAction: async () => { calls.audit++ } },
      '@/lib/site': { SITE_URL: 'https://staging.example.test' }, '@/lib/validation': validation, '@/lib/client-ip': ipHelper,
      '@/lib/turnstile': { verifyTurnstile: async () => options.captcha !== false },
      '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: options.localAllowed !== false }), resetRateLimit() {} },
      '@/lib/db-helpers': { formatDate: () => now },
      '../_helpers': { success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) },
    }, { console: { error: (...args) => calls.logs.push(args.map(String).join(' ')) } })
  }
  const submit = (server = api(), body = {}, ip = '203.0.113.50') => server.POST(new Request('https://staging.example.test/api/admin/login', {
    method: 'POST', headers: { 'x-forwarded-for': `127.0.0.1, ${ip}`, 'user-agent': 'Synthetic agent' },
    body: JSON.stringify({ email: 'admin@example.invalid', password: 'IncorrectFixture123!', turnstileToken: 'synthetic', ...body }),
  }))
  return { sql, calls, api, submit, temporary, setNow: value => { now = value },
    locks, recordWithAgent: userAgent => admission().withAdminLoginAttempt({ ip: '203.0.113.50', email: 'admin@example.invalid', userAgent }, async () => ({ status: 'invalid' })),
    attempts: () => sql.prepare('SELECT * FROM login_attempts ORDER BY id').all(),
    seed(count, { ip = '203.0.113.50', email = 'prior@example.invalid', type = 'WRONG_PASSWORD', attemptedAt = now } = {}) {
      for (let i = 0; i < count; i++) sql.prepare('INSERT INTO login_attempts(ip_address,email,attempt_type,attempted_at,password_tried) VALUES (?,?,?,?,?)').run(ip, email, type, attemptedAt, '***')
    },
    close(remove = !options.directory) {
      assert.equal(calls.active, 0); if (!options.directory) assert.equal(fs.readdirSync(lockRoot).length, 0); sql.close()
      if (remove) { assert.equal(path.dirname(temporary), path.resolve(os.tmpdir())); assert.ok(path.basename(temporary).startsWith('eastel-admin-login-')); fs.rmSync(temporary, { recursive: true, force: true }) }
    },
  }
}
if (worker) {
  const directory = process.argv.find(value => value.startsWith('--directory=')).slice(12)
  const amount = Number(process.argv.find(value => value.startsWith('--amount='))?.slice(9) ?? 1)
  const offset = Number(process.argv.find(value => value.startsWith('--offset='))?.slice(9) ?? 0)
  const h = harness({ directory })
  try {
    const statuses = []
    for (let i = 0; i < amount; i++) statuses.push((await h.submit(h.api(), process.argv.includes('--correct') ? { password } : { email: `admin${offset + i}@example.invalid` })).status)
    console.log(JSON.stringify({ statuses, verifies: h.calls.verify }))
  } finally { h.close(false) }
} else {
  test('durable IP ceiling survives route reloads; correct credentials cannot clear ten failures', async () => {
    const h = harness()
    try {
      for (let i = 0; i < 10; i++) assert.equal((await h.submit(h.api(), { email: `admin${i}@example.invalid` })).status, 400)
      const checks = h.calls.verify; assert.equal((await h.submit(h.api(), { password })).status, 429)
      assert.equal(h.calls.verify, checks); assert.equal(h.calls.cookies, 0); assert.equal(h.attempts().length, 10)
    } finally { h.close() }
  })
  test('wrong/inactive/unknown admin failures remain masked and PHP-shaped without success column', async () => {
    const h = harness()
    try {
      assert.equal((await h.submit()).status, 400)
      assert.equal((await h.submit(h.api(), { email: 'missing@example.invalid' })).status, 400)
      h.sql.exec('UPDATE admin_users SET is_active=0'); assert.equal((await h.submit()).status, 400)
      for (const row of h.attempts()) { assert.equal(row.password_tried, '***'); assert.equal(row.attempt_type, 'WRONG_PASSWORD'); assert.equal(row.ip_address, '203.0.113.50'); assert.equal(Object.hasOwn(row, 'success'), false) }
      assert.ok(!JSON.stringify({ statements: h.calls.statements, logs: h.calls.logs, attempts: h.attempts() }).includes('IncorrectFixture123!'))
      assert.equal(h.calls.cookies, 0)
    } finally { h.close() }
  })
  test('success records SUCCESS without erasing previous failures and releases connection before session', async () => {
    const h = harness({ poolLimit: 1 })
    try { h.seed(9); assert.equal((await h.submit(h.api(), { password })).status, 200); assert.equal(h.attempts().filter(row => row.attempt_type === 'WRONG_PASSWORD').length, 9); assert.equal(h.attempts().at(-1).attempt_type, 'SUCCESS'); assert.equal(h.calls.cookies, 1); assert.equal(h.calls.peak, 1); await h.submit(); assert.equal((await h.submit(h.api(), { password })).status, 429) }
    finally { h.close() }
  })
  test('fifteen-minute inclusive IP window follows DB clock and expires without cleanup', async () => {
    const h = harness()
    try { h.seed(10, { attemptedAt: '2026-10-17 07:45:00' }); assert.equal((await h.submit()).status, 429); h.setNow('2026-10-17 08:00:01'); assert.equal((await h.submit(h.api(), { password })).status, 200) }
    finally { h.close() }
  })
  test('email lock keeps five-minute strict boundary and existing LOCKED_OUT logging semantics', async () => {
    const h = harness()
    try {
      h.seed(5, { ip: '203.0.113.51', email: 'admin@example.invalid' }); assert.equal((await h.submit(h.api(), { password })).status, 400)
      assert.equal(h.calls.verify + h.calls.cookies, 0); assert.equal(h.attempts().at(-1).attempt_type, 'LOCKED_OUT')
      h.setNow('2026-10-17 08:05:00'); assert.equal((await h.submit(h.api(), { password })).status, 200)
    } finally { h.close() }
  })
  test('customer/OTP/AI/success/locked rows and other IPs do not consume admin IP failure ceiling', async () => {
    const h = harness()
    try { for (const type of ['CUSTOMER_WRONG_PASSWORD', 'EMAIL_VERIFICATION', 'AI_PAID_REQUEST', 'SUCCESS', 'LOCKED_OUT']) h.seed(10, { type }); h.seed(10, { ip: '203.0.113.51' }); assert.equal((await h.submit(h.api(), { password })).status, 200) }
    finally { h.close() }
  })
  for (const dimension of ['IP', 'email']) test(`concurrent same-${dimension} calls serialize check/password/write with no threshold overshoot`, async () => {
    let reached, resume, first, checks = 0
    const ready = new Promise(resolve => { reached = resolve }), paused = new Promise(resolve => { resume = resolve })
    const h = harness({ verify: async () => { if (checks++ === 0) { reached(); await paused }; return false } })
    try {
      h.seed(dimension === 'IP' ? 9 : 4, dimension === 'IP' ? {} : { email: 'admin@example.invalid', ip: '203.0.113.51' })
      first = h.submit(h.api()); await ready
      assert.equal((await h.submit(h.api(), dimension === 'IP' ? { email: 'admin1@example.invalid' } : {}, dimension === 'IP' ? undefined : '203.0.113.52')).status, 503)
      resume(); assert.equal((await first).status, 400)
      assert.equal((await h.submit(h.api(), { password })).status, dimension === 'IP' ? 429 : 400)
      assert.equal(h.attempts().filter(row => row.attempt_type === 'WRONG_PASSWORD').length, dimension === 'IP' ? 10 : 5)
      assert.equal(h.calls.verify, 1)
    } finally { resume?.(); await first; h.close() }
  })
  test('ten distinct IPs/emails use ten held connections, not nested pool borrows', async () => {
    const h = harness({ verify: async () => { await Promise.resolve(); return false } })
    try { const replies = await Promise.all(Array.from({ length: 10 }, (_, i) => h.submit(h.api(), { email: `admin${i}@example.invalid` }, `203.0.113.${i + 1}`))); assert.ok(replies.every(response => response.status === 400)); assert.equal(h.calls.peak, 10); assert.equal(h.attempts().length, 10) }
    finally { h.close() }
  })
  test('read/write/first-or-second lock failures deny without sessions and clean up known/uncertain locks', async () => {
    for (const options of [{ readFails: true }, { writeFails: true }, { denyAt: 1 }, { denyAt: 2 }, { lostAcquireAt: 1 }, { lostAcquireAt: 2 }]) {
      const h = harness(options)
      try { assert.equal((await h.submit()).status, 503); assert.equal(h.calls.cookies + h.calls.sessions + h.calls.audit, 0); if (options.lostAcquireAt) assert.equal(h.calls.destroyed, 1) }
      finally { h.close() }
    }
  })
  test('invalid shared-state counters fail closed before password verification', async () => {
    for (const countOverride of [undefined, null, '', 'NaN', -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const h = harness({ countOverride })
      try { assert.equal((await h.submit(h.api(), { password })).status, 503); assert.equal(h.calls.verify + h.calls.cookies, 0) }
      finally { h.close() }
    }
  })
  test('release failures attempt both releases and destroy the connection after a completed record', async () => {
    const h = harness({ releaseFails: true })
    try { assert.equal((await h.submit()).status, 400); assert.equal(h.calls.releases, 2); assert.equal(h.calls.destroyed, 1); assert.equal(h.attempts().length, 1) }
    finally { h.close() }
  })
  test('CAPTCHA/process quota/invalid input/honeypot reject before database admission', async () => {
    for (const [options, body, status] of [[{ captcha: false }, {}, 400], [{ localAllowed: false }, {}, 429], [{}, { email: 'invalid' }, 400], [{}, { hp_field: 'bot' }, 400]]) {
      const h = harness(options)
      try { assert.equal((await h.submit(h.api(), body)).status, status); assert.equal(h.calls.acquired + h.calls.verify + h.attempts().length, 0) }
      finally { h.close() }
    }
  })
  if (!baseline) test('audit user-agent is capped at512 complete Unicode characters on both PHP/native shapes', async () => {
    for (const nativeSchema of [false, true]) {
      const h = harness({ nativeSchema })
      try { assert.equal((await h.recordWithAgent('😀'.repeat(600))).status, 'invalid'); assert.equal(h.attempts()[0].user_agent, '😀'.repeat(512)); assert.equal(h.attempts()[0].password_tried, '***'); if (nativeSchema) assert.equal(h.attempts()[0].success, 0) }
      finally { h.close() }
    }
  })
  if (!baseline) test('multi-lock helper sorts/deduplicates names and releases all locks on callback failure', async () => {
    const h = harness()
    try {
      await assert.rejects(() => h.locks().withDatabaseLocks(['email:test', 'ip:test', 'email:test'], async () => { throw new Error('synthetic callback failure') }))
      assert.equal(h.calls.acquired, 2); assert.equal(h.calls.releases, 2); assert.equal(h.calls.active, 0)
      const names = ['email:test', 'ip:test'].map(key => `eastel:${createHash('sha256').update(key).digest('hex').slice(0, 48)}`).sort()
      assert.deepEqual(h.calls.lockNames, names); assert.deepEqual(h.calls.releasedNames, [...names].reverse())
      await assert.rejects(() => h.locks().withDatabaseLocks([], async () => {})); assert.equal(h.calls.active, 0)
    } finally { h.close() }
  })
  const child = async (directory, amount, offset = 0, correct = false) => {
    const result = await exec(process.execPath, [fileURLToPath(import.meta.url), '--worker', `--directory=${directory}`, `--amount=${amount}`, `--offset=${offset}`, ...(correct ? ['--correct'] : []), ...(baseline ? ['--baseline'] : [])], { cwd: root, timeout: 30000, maxBuffer: 100000 })
    return JSON.parse(result.stdout.trim())
  }
  test('separate real Node processes retain ten IP failures after prior workers exit', async () => {
    const h = harness()
    try { assert.deepEqual((await child(h.temporary, 5)).statuses, Array(5).fill(400)); assert.deepEqual((await child(h.temporary, 5, 5)).statuses, Array(5).fill(400)); const next = await child(h.temporary, 1, 0, true); assert.deepEqual(next.statuses, [429]); assert.equal(next.verifies, 0); assert.equal(h.attempts().length, 10) }
    finally { h.close() }
  })
  test('concurrent real child workers share modeled locks and add at most one tenth failure', async () => {
    const h = harness()
    try { h.seed(9); const replies = await Promise.allSettled([child(h.temporary, 1), child(h.temporary, 1, 1), child(h.temporary, 1, 2)]); for (const reply of replies) assert.equal(reply.status, 'fulfilled', reply.reason?.message); const statuses = replies.flatMap(reply => reply.value.statuses); assert.equal(statuses.filter(status => status === 400).length, 1); assert.ok(statuses.every(status => [400, 429, 503].includes(status))); assert.equal(h.attempts().length, 10) }
    finally { h.close() }
  })
}

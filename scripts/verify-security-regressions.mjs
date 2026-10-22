import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const require = createRequire(import.meta.url)
const blockedDb = { query: async () => { throw new Error('Unmocked database') }, execute: async () => { throw new Error('Unmocked database') }, getConnection: async () => { throw new Error('Unmocked database') } }
const next = { NextResponse: class extends Response { static json(data, init) { return Response.json(data, init) } static next() { return new Response(null) } } }
function load(file, deps = {}, extra = '', globals = {}) {
  const cache = new Map()
  function resolveSource(name) {
    if (cache.has(name)) return cache.get(name).exports
    const module = { exports: {} }; cache.set(name, module)
    const source = fs.readFileSync(path.join(root, name), 'utf8') + (name === file ? extra : '')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    vm.runInNewContext(output, { module, exports: module.exports, require: id => {
      if (Object.hasOwn(deps, id)) return deps[id]
      if (id === '@/lib/db') return blockedDb
      if (id === 'next/server') return next
      if (id.startsWith('@/')) return resolveSource(id.slice(2) + '.ts')
      if (id.startsWith('.')) return resolveSource(path.posix.normalize(path.posix.join(path.posix.dirname(name), id)) + '.ts')
      return require(id)
    }, process, console: { log() {}, error() {}, warn() {} }, Response, Request, Headers, File, FormData, URL, URLSearchParams, Buffer, Date, crypto: globalThis.crypto, AbortSignal, setTimeout, clearTimeout, setInterval, ...globals }, { filename: name })
    return module.exports
  }
  return resolveSource(file)
}
let passed = 0; let failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS: ${name}`) }
  catch (error) { failed++; console.error(`FAIL: ${name}`, error) }
}
const helper = { requireAdmin: async () => null, requireAdminCsrf: async () => null, success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) }

await test('disabled admin cannot retain privileged session; active admin remains valid', async () => {
  let active = 0
  const db = { query: async sql => [[/a\.`is_active`\s*=\s*1/.test(sql) && !active ? undefined : { customerId: 7, name: 'Fixture', email: 'fixture@example.invalid' }].filter(Boolean), []] }
  const sessions = load('lib/session.ts', { '@/lib/db': db, '@/lib/migrate': { ensureAllTables: async () => {} } })
  assert.equal(await sessions.validateAdminSession('fixture-session'), null)
  active = 1; assert.equal((await sessions.validateAdminSession('fixture-session')).isAdmin, true)
})
for (const route of ['whatsapp/debounce', 'whatsapp/missed', 'orders/abandoned-reminder', 'media/cleanup']) {
  await test(`${route} rejects empty cron secret before side effects`, async () => {
    const old = process.env.CRON_SECRET; process.env.CRON_SECRET = ''
    try {
      const api = load(`app/api/${route}/route.ts`, { '@/app/api/admin/_helpers': helper, '@/app/api/auth/_helpers': helper, '@/lib/whatsapp/ai': { processPendingQueue: async () => 0, checkMissedMessages: async () => 0 }, '@/lib/queries/settings': { getSettings: async () => ({}) }, '@/lib/email': { sendAbandonedReminder: async () => true } })
      assert.equal((await api.POST(new Request('http://localhost/api/fixture', { method: 'POST', headers: { 'x-cron-secret': '' } }))).status, 401)
    } finally { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old }
  })
}
await test('all order email templates keep customer markup inert and preserve ordinary text', async () => {
  const templates = load('lib/email-templates.ts', { '@/lib/site': { SITE_URL: 'https://example.invalid' } })
  const attack = '<a href="https://evil.invalid">Pay here</a>'
  const order = { orderRef: 'fixture', customerName: attack, productName: attack, shippingAddress: attack, courierName: attack, trackingNumber: attack, quantity: 1, totalAmount: 15, unitPrice: 10, deliveryFee: 5, payUrl: 'https://example.invalid/pay' }
  for (const locale of ['en', 'ms', 'zh']) {
    for (const name of ['orderConfirmationTemplate', 'shippingNotificationTemplate', 'abandonedReminderTemplate']) {
      const html = templates[name](order, locale)
      assert.ok(!html.includes('<a href="https://evil.invalid">')); assert.ok(html.includes('&lt;a'))
      assert.ok(templates[name]({ ...order, customerName: 'Fixture Customer' }, locale).includes('Fixture Customer'))
    }
  }
})
await test('CSV report export neutralizes formulas while retaining numeric cells', async () => {
  const api = load('app/api/admin/reports/export/route.ts', { '../../_helpers': { ...helper, requireAdmin: async () => ({ isAdmin: true }) }, '@/lib/db': { query: async () => [[{ full_name: '=HYPERLINK("https://evil.invalid")', total_amount: 15 }], []] } })
  const res = await api.GET(new Request('http://localhost/api/admin/reports/export?type=orders'))
  const csv = await res.text(); assert.ok(csv.includes('"\'=HYPERLINK')); assert.ok(csv.includes('15'))
})
await test('Telegram detection GET is inert', async () => {
  let effects = 0
  const api = load('app/api/admin/telegram/route.ts', { '../_helpers': { ...helper, requireAdmin: async () => ({ isAdmin: true }) }, '@/lib/db': { query: async () => [[{ key: 'bot_token', value: 'synthetic-token' }], []], execute: async () => { effects++; return [{ affectedRows: 1 }, []] } }, '@/lib/telegram/client': { getWebhookInfo: async () => ({}), deleteWebhook: async () => { effects++ }, getUpdates: async () => [] } })
  assert.equal((await api.GET(new Request('http://localhost/api/admin/telegram?action=detect_chat_id'))).status, 405)
  assert.equal(effects, 0)
})
await test('bounded limiter denies new identities at capacity without resetting existing windows', () => {
  const limiter = load('lib/rate-limit.ts')
  let rejected = false
  for (let i = 0; i < 10_100; i++) if (!limiter.checkRateLimit(`fixture-${i}`, 1, 60_000).allowed) rejected = true
  assert.equal(rejected, true); assert.equal(limiter.checkRateLimit('fixture-0', 1, 60_000).allowed, false)
})
function sqlFixture() {
  const sql = new DatabaseSync(':memory:')
  sql.function('NOW', () => new Date().toISOString().slice(0, 19).replace('T', ' '))
  sql.exec(`CREATE TABLE email_verifications (id INTEGER PRIMARY KEY, email TEXT, code TEXT, token TEXT, verified INTEGER, expires_at TEXT);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, email TEXT, email_verified INTEGER, password_hash TEXT, is_temp_pass INTEGER, reset_token TEXT, reset_expires TEXT);
    CREATE TABLE login_attempts (email TEXT, ip_address TEXT, success INTEGER, attempted_at TEXT, attempt_type TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, customer_id INTEGER, role TEXT, expires_at TEXT, ip_address TEXT, user_agent TEXT);
    CREATE TABLE wa_rate_limits (phone TEXT, window_start TEXT, msg_count INTEGER, UNIQUE(phone, window_start));`)
  let tail = Promise.resolve(); let failWrite = false; let failOnSql = ''; let grant = true
  const db = {
    async query(query, params = []) {
      if (query.includes('GET_LOCK')) return [[{ acquired: grant ? 1 : 0 }], []]
      if (query.includes('RELEASE_LOCK')) return [[{ released: 1 }], []]
      query = query.replace(/\s+FOR UPDATE/gi, '').replace(/DATE_SUB\(NOW\(\), INTERVAL 1 (MINUTE|DAY)\)/g, (_, unit) => `datetime('now', '-1 ${unit.toLowerCase()}')`)
      return [sql.prepare(query).all(...params), []]
    },
    async execute(query, params = []) {
      if (failWrite || (failOnSql && query.includes(failOnSql))) throw new Error('fixture write failure')
      query = query.replace('ON DUPLICATE KEY UPDATE msg_count = msg_count + 1', 'ON CONFLICT(phone,window_start) DO UPDATE SET msg_count = msg_count + 1')
      const result = sql.prepare(query).run(...params.map(value => value instanceof Date ? value.toISOString() : value))
      return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []]
    },
    async getConnection() {
      const previous = tail; let unlock; tail = new Promise(resolve => { unlock = resolve }); await previous
      return { ...db, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => { if (sql.isTransaction) sql.exec('ROLLBACK') }, release: () => unlock(), destroy: () => unlock() }
    },
  }
  return { sql, db, setFail: value => { failWrite = value }, setFailOnSql: value => { failOnSql = value }, setGrant: value => { grant = value }, close: () => sql.close() }
}
const expiry = () => new Date(Date.now() + 3_600_000).toISOString()
const expired = () => new Date(Date.now() - 1_000).toISOString()
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex')
const auth = load('lib/auth.ts', { jose: {} })
assert.equal(auth.hashPasswordResetToken('password-reset-fixture'), sha256('password-reset-fixture'))
function resetApiFor(f, authOverrides = {}) {
  return load('app/api/auth/reset/route.ts', {
    '@/lib/turnstile': { verifyTurnstile: async () => true },
    '@/lib/site': { SITE_URL: 'https://example.invalid' },
    '@/lib/db': f.db,
    '../_helpers': { ...helper, getClientIp: () => '203.0.113.20' },
    '@/lib/auth': { hashPassword: async () => 'new-hash', hashPasswordResetToken: auth.hashPasswordResetToken, ...authOverrides },
    '@/lib/validation': { resetSchema: {}, validate: (_, data) => ({ success: true, data }) },
  })
}
function forgotApiFor(f, sent) {
  return load('app/api/auth/forgot/route.ts', {
    '@/lib/db': f.db,
    '@/lib/auth': auth,
    '@/lib/turnstile': { verifyTurnstile: async () => true },
    '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true }) },
    '@/lib/validation': { forgotSchema: {}, validate: (_, data) => ({ success: true, data }) },
    '@/lib/email': { sendPasswordReset: async (...args) => { sent.push(args); return true } },
    '../_helpers': { ...helper, getClientIp: () => '203.0.113.20' },
  })
}
const resetRequest = (api, token) => api.POST(new Request('http://localhost/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password: 'Synthetic-Pass123', turnstileToken: 'synthetic' }) }))
const forgotRequest = (api, email, lang = 'en') => api.POST(new Request('http://localhost/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email, lang, turnstileToken: 'synthetic' }) }))
await test('reset rate limit rejects before parsing, password hashing or database access', async () => {
  let attempts = 0; let hashes = 0; let reads = 0
  const limiter = load('lib/rate-limit.ts')
  const api = load('app/api/auth/reset/route.ts', {
    '@/lib/db': { getConnection: async () => { reads++; throw new Error('unexpected database access') } },
    '@/lib/auth': { hashPassword: async () => { hashes++; return 'fixture' }, hashPasswordResetToken: auth.hashPasswordResetToken },
    '@/lib/rate-limit': { checkRateLimit: (key, maximum, window) => {
      assert.equal(key, 'reset:203.0.113.21'); assert.equal(maximum, 5); assert.equal(window, 900_000)
      attempts++; return limiter.checkRateLimit(key, maximum, window)
    } },
    '@/lib/validation': { resetSchema: {}, validate: () => ({ success: false, errors: { _form: 'Synthetic invalid request' } }) },
    '../_helpers': { ...helper, getClientIp: () => '203.0.113.21' },
  })
  for (let i = 0; i < 5; i++) assert.equal((await resetRequest(api, 'invalid')).status, 400)
  assert.equal((await api.POST({ headers: new Headers(), json: async () => { throw new Error('must not parse') } })).status, 429)
  assert.equal(attempts, 6); assert.equal(hashes, 0); assert.equal(reads, 0)
})
function insertResetCustomer(sql, { id, email = `fixture-${id}@example.invalid`, token, expires = expiry(), passwordHash = 'old-hash', emailVerified = 0 }) {
  sql.prepare('INSERT INTO customers (id,email,password_hash,is_temp_pass,reset_token,reset_expires,email_verified) VALUES (?,?,?,?,?,?,?)').run(id, email, passwordHash, 1, token, expires, emailVerified)
}
await test('unknown, expired, missing and malformed reset proofs do not hash or acquire a transaction', async () => {
  const f = sqlFixture(); let hashes = 0, connections = 0
  try {
    const db = { ...f.db, getConnection: async () => { connections++; return f.db.getConnection() } }
    const api = resetApiFor({ ...f, db }, { hashPassword: async () => { hashes++; return 'new-hash' } })
    assert.equal((await resetRequest(api, 'unknown-proof')).status, 400)
    for (const [index, expires] of [expired(), null, 'invalid-date'].entries()) {
      const token = String(index + 1).repeat(64)
      insertResetCustomer(f.sql, { id: index + 70, token: sha256(token), expires })
      assert.equal((await resetRequest(api, token)).status, 400)
      assert.equal(f.sql.prepare('SELECT password_hash FROM customers WHERE id=?').get(index + 70).password_hash, 'old-hash')
    }
    assert.equal(hashes, 0); assert.equal(connections, 0)
  } finally { f.close() }
})
await test('valid reset proof is checked before hashing and rechecked under lock before consumption', async () => {
  const f = sqlFixture(); let hashes = 0, reads = 0, connections = 0
  try {
    const token = '2'.repeat(64); insertResetCustomer(f.sql, { id: 80, token: sha256(token) })
    const db = { ...f.db,
      query: async (...args) => { reads++; return f.db.query(...args) },
      getConnection: async () => {
        connections++; const connection = await f.db.getConnection()
        return { ...connection, query: async (query, params) => {
          reads++; assert.match(query, /FOR UPDATE/); assert.equal(params[0], 80); assert.equal(params[1], sha256(token))
          return connection.query(query, params)
        } }
      },
    }
    const api = resetApiFor({ ...f, db }, { hashPassword: async () => {
      hashes++; assert.equal(reads, 1); assert.equal(connections, 0); assert.equal(f.sql.isTransaction, false)
      return 'new-hash'
    } })
    assert.equal((await resetRequest(api, token)).status, 200)
    assert.equal(hashes, 1); assert.equal(reads, 2); assert.equal(connections, 1)
    assert.equal(f.sql.prepare('SELECT reset_token FROM customers WHERE id=80').get().reset_token, null)
  } finally { f.close() }
})
await test('reset proof consumed, expired or reassigned during hashing is not accepted by the transaction', async () => {
  for (const change of ['consumed', 'expired', 'reassigned']) {
    const f = sqlFixture()
    try {
      const token = '3'.repeat(64); insertResetCustomer(f.sql, { id: 81, token: sha256(token) })
      insertResetCustomer(f.sql, { id: 82, token: null })
      const api = resetApiFor(f, { hashPassword: async () => {
        if (change === 'expired') f.sql.prepare('UPDATE customers SET reset_expires=? WHERE id=81').run(expired())
        else {
          f.sql.exec('UPDATE customers SET reset_token=NULL WHERE id=81')
          if (change === 'reassigned') f.sql.prepare('UPDATE customers SET reset_token=?,reset_expires=? WHERE id=82').run(sha256(token), expiry())
        }
        return 'new-hash'
      } })
      assert.equal((await resetRequest(api, token)).status, 400)
      assert.equal(f.sql.prepare('SELECT password_hash FROM customers WHERE id=81').get().password_hash, 'old-hash')
      assert.equal(f.sql.prepare('SELECT password_hash FROM customers WHERE id=82').get().password_hash, 'old-hash')
    } finally { f.close() }
  }
})
await test('reset preflight database failure fails closed before hashing or opening a transaction', async () => {
  const f = sqlFixture(); let hashes = 0, connections = 0
  try {
    const db = { ...f.db, query: async () => { throw new Error('synthetic lookup failure') }, getConnection: async () => { connections++; return f.db.getConnection() } }
    const api = resetApiFor({ ...f, db }, { hashPassword: async () => { hashes++; return 'new-hash' } })
    assert.equal((await resetRequest(api, 'candidate')).status, 500)
    assert.equal(hashes, 0); assert.equal(connections, 0)
  } finally { f.close() }
})

await test('shared verification attempts survive cookie removal, endpoint switching and concurrent guesses', async () => {
  const f = sqlFixture()
  try {
    f.sql.prepare('INSERT INTO email_verifications VALUES (1, ?, ?, ?, 0, ?)').run('guest@example.invalid', '123456', 'a'.repeat(64), expiry())
    const verify = load('lib/email-verification.ts', { '@/lib/db': f.db }).verifyEmailRecord
    await Promise.all(Array.from({ length: 8 }, (_, i) => verify({ token: 'a'.repeat(64), code: '000000', account: Boolean(i % 2) })))
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM login_attempts').get().n, 5)
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM email_verifications').get().n, 0)
    assert.equal((await verify({ token: 'a'.repeat(64), code: '123456', account: false })).ok, false)
  } finally { f.close() }
})
await test('guest OTP and account verification preserve separate success modes and email binding', async () => {
  const f = sqlFixture()
  try {
    f.sql.prepare('INSERT INTO email_verifications VALUES (1, ?, ?, ?, 0, ?)').run('guest@example.invalid', '123456', 'b'.repeat(64), expiry())
    f.sql.exec("INSERT INTO customers (id,email,email_verified) VALUES (7,'guest@example.invalid',0), (8,'other@example.invalid',0)")
    const verify = load('lib/email-verification.ts', { '@/lib/db': f.db }).verifyEmailRecord
    assert.equal((await verify({ token: 'b'.repeat(64), code: '123456', account: false })).ok, true)
    assert.equal((await verify({ token: 'b'.repeat(64), code: '123456', account: true, customerId: 8 })).ok, false)
    assert.equal((await verify({ token: 'b'.repeat(64), code: '123456', account: true, customerId: 7 })).ok, true)
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=7').get().email_verified, 1)
    f.sql.prepare('INSERT INTO email_verifications VALUES (2, ?, ?, ?, 0, ?)').run('no-account@example.invalid', '654321', 'c'.repeat(64), expiry())
    assert.equal((await verify({ token: 'c'.repeat(64), code: '654321', account: false })).ok, true)
    f.setFail(true)
    await assert.rejects(verify({ token: 'c'.repeat(64), code: '000000', account: false }))
  } finally { f.close() }
})
await test('PHP SHA-256 reset link is accepted by the Node reset route and remains one-time', async () => {
  const f = sqlFixture()
  try {
    const token = 'a'.repeat(64)
    insertResetCustomer(f.sql, { id: 7, token: sha256(token) })
    const api = resetApiFor(f)
    assert.equal((await resetRequest(api, token)).status, 200)
    assert.equal(f.sql.prepare('SELECT password_hash FROM customers WHERE id=7').get().password_hash, 'new-hash')
    assert.equal(f.sql.prepare('SELECT reset_token FROM customers WHERE id=7').get().reset_token, null)
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=7').get().email_verified, 1, 'A valid reset proves the mailbox, matching PHP')
    assert.equal((await resetRequest(api, token)).status, 400)
  } finally { f.close() }
})
await test('successful reset verifies only an unverified target and preserves other PHP verification states', async () => {
  const f = sqlFixture()
  try {
    insertResetCustomer(f.sql, { id: 99, token: null })
    const api = resetApiFor(f)
    for (const [index, state] of [0, 1, null, 2].entries()) {
      const id = 20 + index, token = String(index + 1).repeat(64)
      insertResetCustomer(f.sql, { id, token: sha256(token), emailVerified: state })
      assert.equal((await resetRequest(api, token)).status, 200)
      const row = f.sql.prepare('SELECT email_verified,is_temp_pass,reset_token FROM customers WHERE id=?').get(id)
      assert.equal(row.email_verified, state === 0 ? 1 : state)
      assert.equal(row.is_temp_pass, 0); assert.equal(row.reset_token, null)
    }
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=99').get().email_verified, 0)
  } finally { f.close() }
})
await test('invalid reset expiry never verifies the mailbox or consumes the proof', async () => {
  const f = sqlFixture()
  try {
    const api = resetApiFor(f)
    for (const [index, expires] of ['invalid-date', null].entries()) {
      const id = 30 + index, token = String(index + 5).repeat(64), digest = sha256(token)
      insertResetCustomer(f.sql, { id, token: digest, expires })
      assert.equal((await resetRequest(api, token)).status, 400)
      const row = f.sql.prepare('SELECT email_verified,password_hash,reset_token FROM customers WHERE id=?').get(id)
      assert.equal(row.email_verified, 0); assert.equal(row.password_hash, 'old-hash'); assert.equal(row.reset_token, digest)
    }
  } finally { f.close() }
})
await test('reset then real password login and session check do not request redundant email verification', async () => {
  const f = sqlFixture()
  try {
    const token = '8'.repeat(64), previousPassword = 'BeforeResetPass123!'
    insertResetCustomer(f.sql, { id: 40, token: sha256(token), passwordHash: await auth.hashPassword(previousPassword) })
    const helpers = { ...helper, getClientIp: () => '203.0.113.25' }
    const reset = load('app/api/auth/reset/route.ts', {
      '@/lib/db': f.db, '@/lib/auth': auth, '../_helpers': helpers,
      '@/lib/turnstile': { verifyTurnstile: async () => true },
      '@/lib/site': { SITE_URL: 'https://example.invalid' },
    })
    assert.equal((await resetRequest(reset, token)).status, 200)
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0, 'Reset alone must not sign in')
    const sessions = load('lib/session.ts', { '@/lib/db': f.db, '@/lib/migrate': { ensureAllTables: async () => {} } })
    let cookie
    const login = load('app/api/auth/login/route.ts', {
      '@/lib/db': f.db, '@/lib/auth': auth, '@/lib/session': sessions,
      '@/lib/customer-login-attempts': { withCustomerLoginAttempt: async (_identity, operation) => operation(f.db) },
      '@/lib/cookies': { setSessionCookie: async value => { cookie = value } },
      '@/lib/turnstile': { verifyTurnstile: async () => true }, '../_helpers': helpers,
    })
    const loginRequest = password => login.POST(new Request('http://localhost/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: 'fixture-40@example.invalid', password, turnstileToken: 'synthetic' }),
    }))
    assert.equal((await loginRequest(previousPassword)).status, 400)
    const response = await loginRequest('Synthetic-Pass123')
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.emailVerified, true); assert.equal(data.requiresEmailVerification, false); assert.equal(data.requiresPasswordChange, false)
    assert.match(cookie, /^[a-f0-9]{64}$/)
    const check = load('app/api/auth/check/route.ts', { '../_helpers': { ...helper, requireSession: () => sessions.validateSession(cookie) } })
    const sessionResponse = await check.GET()
    assert.equal(sessionResponse.status, 200); assert.equal((await sessionResponse.json()).emailVerified, true)
  } finally { f.close() }
})
await test('new Node forgot route mails the raw link token but stores only its SHA-256 digest', async () => {
  const f = sqlFixture(); const sent = []
  try {
    f.sql.prepare('INSERT INTO customers (id,email,password_hash,is_temp_pass) VALUES (7,?,?,1)').run('fixture@example.invalid', 'old-hash')
    const forgot = forgotApiFor(f, sent); const reset = resetApiFor(f)
    assert.equal((await forgotRequest(forgot, 'fixture@example.invalid', 'zh')).status, 200)
    assert.equal(sent.length, 1)
    const [, token, locale] = sent[0]
    assert.match(token, /^[a-f0-9]{64}$/)
    assert.equal(locale, 'zh')
    const row = f.sql.prepare('SELECT reset_token, reset_expires FROM customers WHERE id=7').get()
    assert.equal(row.reset_token, sha256(token))
    assert.notEqual(row.reset_token, token)
    assert.ok(new Date(row.reset_expires).getTime() > Date.now())
    assert.equal((await resetRequest(reset, token)).status, 200)
  } finally { f.close() }
})
await test('legacy Node raw-token row is rejected and only a fresh forgot request restores reset', async () => {
  const f = sqlFixture(); const sent = []
  try {
    const oldNodeToken = 'b'.repeat(64)
    insertResetCustomer(f.sql, { id: 8, token: oldNodeToken })
    const reset = resetApiFor(f)
    assert.equal((await resetRequest(reset, oldNodeToken)).status, 400)
    assert.equal(f.sql.prepare('SELECT reset_token FROM customers WHERE id=8').get().reset_token, oldNodeToken)

    const forgot = forgotApiFor(f, sent)
    assert.equal((await forgotRequest(forgot, 'fixture-8@example.invalid')).status, 200)
    assert.equal(sent.length, 1)
    const [, replacement] = sent[0]
    assert.notEqual(replacement, oldNodeToken)
    assert.equal(f.sql.prepare('SELECT reset_token FROM customers WHERE id=8').get().reset_token, sha256(replacement))
    assert.equal((await resetRequest(reset, replacement)).status, 200)
  } finally { f.close() }
})
await test('database SHA-256 digest itself is not accepted as the bearer token', async () => {
  const f = sqlFixture()
  try {
    const bearer = 'c'.repeat(64)
    const digest = sha256(bearer)
    insertResetCustomer(f.sql, { id: 9, token: digest })
    const api = resetApiFor(f)
    assert.equal((await resetRequest(api, digest)).status, 400)
    assert.equal(f.sql.prepare('SELECT password_hash,reset_token FROM customers WHERE id=9').get().password_hash, 'old-hash')
    assert.equal(f.sql.prepare('SELECT reset_token FROM customers WHERE id=9').get().reset_token, digest)
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=9').get().email_verified, 0)
  } finally { f.close() }
})
await test('expired PHP-style digest is rejected without consuming or changing the account', async () => {
  const f = sqlFixture()
  try {
    const token = 'd'.repeat(64)
    insertResetCustomer(f.sql, { id: 10, token: sha256(token), expires: expired() })
    const api = resetApiFor(f)
    assert.equal((await resetRequest(api, token)).status, 400)
    const row = f.sql.prepare('SELECT password_hash,reset_token,email_verified FROM customers WHERE id=10').get()
    assert.equal(row.password_hash, 'old-hash')
    assert.equal(row.reset_token, sha256(token))
    assert.equal(row.email_verified, 0)
  } finally { f.close() }
})
await test('concurrent reset submissions consume once and revoke customer sessions while preserving same-ID admin session', async () => {
  const f = sqlFixture()
  try {
    const token = 'e'.repeat(64)
    insertResetCustomer(f.sql, { id: 11, token: sha256(token) })
    f.sql.exec("INSERT INTO sessions VALUES ('customer',11,'customer','2099-01-01','',''), ('admin',11,'admin','2099-01-01','','')")
    const api = resetApiFor(f)
    const results = await Promise.all([resetRequest(api, token), resetRequest(api, token)])
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400])
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM sessions WHERE customer_id=11 AND role='customer'").get().n, 0)
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM sessions WHERE customer_id=11 AND role='admin'").get().n, 1)
    assert.equal(f.sql.prepare('SELECT reset_token FROM customers WHERE id=11').get().reset_token, null)
    assert.equal(f.sql.prepare('SELECT email_verified FROM customers WHERE id=11').get().email_verified, 1)
  } finally { f.close() }
})
await test('failure after the password/token write rolls back the whole reset transaction', async () => {
  const f = sqlFixture()
  try {
    const token = 'f'.repeat(64)
    const digest = sha256(token)
    insertResetCustomer(f.sql, { id: 12, token: digest })
    f.sql.exec("INSERT INTO sessions VALUES ('customer',12,'customer','2099-01-01','',''), ('admin',12,'admin','2099-01-01','','')")
    f.setFailOnSql('DELETE FROM sessions')
    const api = resetApiFor(f)
    assert.equal((await resetRequest(api, token)).status, 500)
    const row = f.sql.prepare('SELECT password_hash,reset_token,reset_expires,email_verified FROM customers WHERE id=12').get()
    assert.equal(row.password_hash, 'old-hash')
    assert.equal(row.reset_token, digest)
    assert.ok(row.reset_expires)
    assert.equal(row.email_verified, 0, 'Email verification must roll back with the password and token')
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions WHERE customer_id=12').get().n, 2)
  } finally { f.close() }
})
await test('a login verified before password revocation cannot insert a stale session afterward', async () => {
  const f = sqlFixture()
  try {
    f.sql.exec("INSERT INTO customers (id,password_hash) VALUES (7,'new-hash')")
    const sessions = load('lib/session.ts', { '@/lib/db': f.db, '@/lib/migrate': { ensureAllTables: async () => {} } })
    await assert.rejects(sessions.createSession(7, '', '', 'customer', 'old-hash'))
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
    await sessions.createSession(7, '', '', 'customer', 'new-hash')
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1)
  } finally { f.close() }
})
await test('WhatsApp admission sums second buckets and serializes concurrent reservations', async () => {
  const f = sqlFixture()
  try {
    const api = load('lib/whatsapp/ai.ts', { '@/lib/db': f.db, '@/lib/whatsapp/client': {}, '@/lib/ai/gemini': {}, '@/lib/telegram/notifications': {}, '@/lib/toyyibpay': {}, '@/lib/site': { SITE_URL: 'https://example.invalid' } }, '\nexports.fixtureRate = checkPhoneRateLimit;')
    const results = await Promise.all(Array.from({ length: 15 }, () => api.fixtureRate('fixture-phone')))
    assert.equal(results.filter(result => result === false).length, 10)
    f.setGrant(false); assert.equal(await api.fixtureRate('other-phone'), true)
  } finally { f.close() }
})
await test('WhatsApp creates a catalogue-priced bill, rejects incomplete quotes and preserves pending resend', async () => {
  let bills = []; let stored = []; let missing = false; let pending = false
  const db = { query: async sql => {
    if (sql.includes('FROM orders')) return [pending ? [{ order_ref: 'old', bill_code: 'oldbill', total_amount: 15 }] : [], []]
    if (sql.includes('FROM wa_customers')) return [[{ full_name: 'Fixture', delivery_addr: 'Fixture Road', postcode: '12345' }], []]
    if (sql.includes('FROM postcode_zones')) return [missing ? [] : [{ zone: 'WM' }], []]
    if (sql.includes('FROM couriers')) return [[{ id: 1, name: 'Fixture Courier', fee: 5 }], []]
    if (sql.includes('FROM products')) return [[{ id: 1, price: 10, stock: -1 }], []]
    throw new Error('Unexpected query')
  }, execute: async (_, params) => { stored.push(params); return [{ affectedRows: 1 }, []] } }
  const api = load('lib/whatsapp/ai.ts', { '@/lib/db': db, '@/lib/whatsapp/client': { sendText: async () => 'fixture' }, '@/lib/ai/gemini': {}, '@/lib/telegram/notifications': {}, '@/lib/toyyibpay': { createBill: async bill => { bills.push(bill); return { billCode: 'fixturebill', paymentUrl: 'https://example.invalid/fixturebill' } } }, '@/lib/site': { SITE_URL: 'https://example.invalid' } }, '\nexports.fixturePrice = sendPaymentLink;')
  await api.fixturePrice('fixture-phone', 'en', null)
  assert.equal(bills[0].billAmount, 1500); assert.equal(stored[0][10], 15)
  missing = true; await api.fixturePrice('fixture-phone', 'en', null); assert.equal(bills.length, 1)
  pending = true; await api.fixturePrice('fixture-phone', 'en', null); assert.equal(bills.length, 1)
})
await test('website and Telegram share durable global budget, reserve fallback units, and fail closed on lock denial', async () => {
  const f = sqlFixture()
  try {
    const budget = load('lib/ai/public-budget.ts', { '@/lib/db': f.db })
    for (let i = 0; i < 10; i++) { const release = await budget.reservePublicInference('web:fixture'); assert.ok(release); release() }
    assert.equal(await budget.reservePublicInference('web:fixture'), null)
    const release = await budget.reservePublicInference('telegram:fixture', 3); assert.ok(release); release()
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM login_attempts').get().n, 13)
    f.setGrant(false); assert.equal(await budget.reservePublicInference('web:other'), null)
    f.setGrant(true); f.setFail(true); assert.equal(await budget.reservePublicInference('web:other'), null)
  } finally { f.close() }
})
await test('public chat preserves anonymous response and quota rejection prevents upstream calls', async () => {
  let calls = 0; let allow = true; let released = 0
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'synthetic-key'
  try {
    const api = load('app/api/chat/route.ts', { '@/lib/ai/public-budget': { reservePublicInference: async () => allow ? () => { released++ } : null } }, '', { fetch: async (_, options) => { calls++; assert.ok(options.signal); return Response.json({ candidates: [{ content: { parts: [{ text: 'Fixture reply' }] } }] }) } })
    const req = () => new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ message: 'Hi' }) })
    assert.equal((await (await api.POST(req())).json()).reply, 'Fixture reply'); assert.equal(released, 1)
    allow = false; assert.equal((await api.POST(req())).status, 429); assert.equal(calls, 1)
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old }
})
await test('Telegram empty secret is rejected before bot processing', async () => {
  const api = load('app/api/telegram/webhook/route.ts', { '@/lib/db': { query: async () => [[{ value: '' }], []] }, '@/lib/telegram/client': {}, '@/lib/ai/gemini': {}, '@/lib/ai/public-budget': {} })
  assert.equal((await api.POST(new Request('http://localhost/api/telegram/webhook', { method: 'POST', body: '{}' }))).status, 403)
})
await test('CSV text variants and WhatsApp JSON download keep formulas inert', async () => {
  const csv = load('lib/csv.ts')
  for (const value of ['=1+1', '+1+1', '-1+1', '@SUM(A1)', ' \t=1+1', '\tplain', '\rplain', '\nplain']) assert.ok(csv.csvText(value).startsWith('"\''))
  assert.equal(csv.csvText('Fixture, "text"'), '"Fixture, ""text"""')
  const api = load('app/api/admin/whatsapp/route.ts', { '../_helpers': { ...helper, requireAdmin: async () => ({ isAdmin: true }) }, '@/lib/db': { query: async () => [[{ phone: '+60123456789', message: '=1+1', contact_name: '@SUM(A1)' }], []] }, '@/lib/whatsapp/client': {}, '@/lib/whatsapp/ai': {} })
  const res = await api.GET(new Request('http://localhost/api/admin/whatsapp?action=export'))
  const data = await res.json(); assert.equal(data.status, 'success'); assert.ok(data.csv.includes('"\'=1+1"'))
})
await test('canonical forwarding identity ignores client prefix and rejects malformed identities', () => {
  const { clientIp } = load('lib/client-ip.ts')
  assert.equal(clientIp({ headers: new Headers({ 'x-forwarded-for': 'attacker, 192.0.2.10' }) }), '192.0.2.10')
  assert.equal(clientIp({ headers: new Headers({ 'x-forwarded-for': 'not-an-ip' }) }), 'unknown')
})
await test('upload counts legacy bytes and atomically caps total and owner storage', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eastel-upload-security-'))
  const f = sqlFixture()
  try {
    const uploads = path.join(directory, 'public', 'uploads'); fs.mkdirSync(uploads, { recursive: true })
    const api = load('lib/upload-storage.ts', { '@/lib/db': f.db }, '', { process: { env: {}, cwd: () => directory } })
    const name = await api.storeReviewImage('c7', '.jpg', Buffer.from('fixture'))
    assert.ok(name.startsWith('c7_')); assert.equal(fs.readFileSync(path.join(uploads, name), 'utf8'), 'fixture')
    const legacy = path.join(uploads, 'legacy.jpg'); const fd = fs.openSync(legacy, 'w'); fs.ftruncateSync(fd, api.MAX_UPLOAD_TOTAL_BYTES); fs.closeSync(fd)
    await assert.rejects(api.storeReviewImage('c8', '.png', Buffer.from('extra')))
    assert.equal(fs.existsSync(legacy), true); assert.equal(fs.existsSync(path.join(uploads, name)), true)
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(api.MAX_UPLOAD_FILE_BYTES + 65 * 1024)); controller.close() } })
    await assert.rejects(api.boundedUploadForm(new Request('http://localhost/upload', { method: 'POST', body, duplex: 'half' })))
  } finally { f.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})
await test('registration resumed after password revocation cannot issue a session', async () => {
  const f = sqlFixture()
  try {
    let resume; let inserted
    const paused = new Promise(resolve => { resume = resolve })
    const reached = new Promise(resolve => { inserted = resolve })
    const sessions = load('lib/session.ts', { '@/lib/db': f.db, '@/lib/migrate': { ensureAllTables: async () => {} } })
    const api = load('app/api/auth/register/route.ts', {
      '@/lib/db': { query: async () => [[], []], execute: async (_, params) => {
        f.sql.prepare('INSERT INTO customers (id,email,password_hash) VALUES (7,?,?)').run(params[1], params[3])
        return [{ insertId: 7 }, []]
      } },
      '@/lib/auth': { hashPassword: async () => 'original-hash' },
      '@/lib/session': sessions,
      '@/lib/cookies': { setSessionCookie: async () => { throw new Error('Must not issue cookie') } },
      '@/lib/turnstile': { verifyTurnstile: async () => true },
      '@/lib/validation': { registerSchema: {}, validate: (_, body) => ({ success: true, data: body }) },
      '@/lib/vouchers': { voucherIssueWelcome: async () => {} },
      '@/lib/account-verification': { issueAccountVerification: async () => { inserted(); await paused; return { token: 'fixture', sent: true } } },
      '../_helpers': { ...helper, getClientIp: () => '192.0.2.1' },
    })
    const pending = api.POST(new Request('http://localhost/register', { method: 'POST', body: JSON.stringify({ name: 'Fixture', email: 'fixture@example.invalid', phone: 'fixture', password: 'fixture' }) }))
    await reached
    f.sql.exec("BEGIN; UPDATE customers SET password_hash='reset-hash' WHERE id=7; DELETE FROM sessions WHERE customer_id=7 AND role='customer'; COMMIT;")
    resume(); assert.equal((await pending).status, 500)
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
  } finally { f.close() }
})
await test('Cloudflare proxy configuration separates visitors and ignores untrusted client headers', () => {
  const config = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8')
  assert.ok(config.includes('real_ip_header CF-Connecting-IP;'))
  assert.ok(config.includes('real_ip_recursive off;'))
  assert.equal((config.match(/proxy_set_header X-Forwarded-For \$remote_addr;/g) || []).length, 2)
  const ranges = [...config.matchAll(/set_real_ip_from ([\d.]+)\/(\d+);/g)].map(m => [m[1], Number(m[2])])
  assert.equal(ranges.length, 15)
  assert.equal((config.match(/set_real_ip_from [\da-f:]+\/\d+;/g) || []).length, 7)
  const number = ip => ip.split('.').reduce((n, part) => (n * 256 + Number(part)) >>> 0, 0)
  const transform = (peer, visitor) => {
    const trusted = ranges.some(([base, bits]) => Math.floor(number(peer) / 2 ** (32 - bits)) === Math.floor(number(base) / 2 ** (32 - bits)))
    return trusted ? visitor : peer
  }
  const { clientIp } = load('lib/client-ip.ts')
  const identity = (peer, visitor) => clientIp({ headers: new Headers({ 'x-forwarded-for': transform(peer, visitor) }) })
  const limiter = load('lib/rate-limit.ts')
  const first = identity('104.16.1.1', '192.0.2.1'); const second = identity('104.16.1.1', '192.0.2.2')
  assert.notEqual(first, second)
  assert.equal(limiter.checkRateLimit(first, 1, 60_000).allowed, true)
  assert.equal(limiter.checkRateLimit(first, 1, 60_000).allowed, false)
  assert.equal(limiter.checkRateLimit(second, 1, 60_000).allowed, true)
  assert.equal(identity('192.0.2.3', '192.0.2.99'), '192.0.2.3')
})
await test('database lock destroys uncertain connections and releases successful locks', async () => {
  for (const mode of ['acquire-error', 'release-error', 'success']) {
    let released = 0; let destroyed = 0; let ran = 0
    const db = { getConnection: async () => ({ query: async sql => {
      if (sql.includes('GET_LOCK')) { if (mode === 'acquire-error') throw new Error('lost response'); return [[{ acquired: 1 }], []] }
      if (mode === 'release-error') throw new Error('lost response')
      return [[{ released: 1 }], []]
    }, release: () => { released++ }, destroy: () => { destroyed++ } }) }
    const { withDatabaseLock } = load('lib/database-lock.ts', { '@/lib/db': db })
    const action = () => withDatabaseLock('fixture', async () => { ran++; return 1 })
    if (mode === 'acquire-error') await assert.rejects(action())
    else assert.equal(await action(), 1)
    assert.equal(ran, mode === 'acquire-error' ? 0 : 1)
    assert.equal(destroyed, mode === 'success' ? 0 : 1)
    assert.equal(released, mode === 'success' ? 1 : 0)
  }
})
await test('Telegram POST detection restores webhook secret/options even on polling failure', async () => {
  for (const pollingFails of [false, true]) {
    let restored; let effects = 0
    const api = load('app/api/admin/telegram/route.ts', {
      '../_helpers': { ...helper, requireAdminCsrf: async () => ({ isAdmin: true }) },
      '@/lib/database-lock': { withDatabaseLock: async (_, operation) => operation({}) },
      '@/lib/db': { query: async () => [[{ key: 'bot_token', value: 'synthetic' }, { key: 'secret_token', value: 'fixture-secret' }], []], execute: async () => { effects++ } },
      '@/lib/telegram/client': {
        getWebhookInfo: async () => ({ url: 'https://example.invalid/webhook', max_connections: 25, allowed_updates: ['message'] }),
        deleteWebhook: async drop => { assert.equal(drop, false) },
        getUpdates: async offset => { assert.equal(offset, 0); if (pollingFails) throw new Error('fixture polling failure'); return [] },
        setWebhook: async (...args) => { restored = args },
      },
    })
    const res = await api.POST(new Request('http://localhost/telegram', { method: 'POST', body: JSON.stringify({ action: 'detect_chat_id' }) }))
    assert.equal(res.status, pollingFails ? 500 : 200)
    assert.equal(restored[0], 'https://example.invalid/webhook'); assert.equal(restored[1], 'fixture-secret')
    assert.equal(restored[2].drop_pending_updates, false); assert.equal(restored[2].max_connections, 25)
    assert.equal(restored[2].allowed_updates[0], 'message'); assert.equal(effects, 0)
  }
})
await test('test admin seed rejects a production database before any database access', async () => {
  let effects = 0; let finish
  const done = new Promise(resolve => { finish = resolve })
  load('scripts/seed-test-admin.ts', { 'dotenv/config': {}, '../lib/db': { query: async () => { effects++ }, execute: async () => { effects++ } }, '../lib/auth': { validatePassword: () => ({ valid: true }) } }, '', {
    process: { env: { NODE_ENV: 'production', DB_HOST: '127.0.0.1', DB_NAME: 'fixture_test', SEED_TEST_ADMIN_CONFIRM: 'isolated-local-test' }, exit: code => finish(code) },
  })
  assert.equal(await done, 1); assert.equal(effects, 0)
})
await test('patched Nodemailer parses adversarial addresses within a bound and retains ordinary mail composition', () => {
  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const nodemailer = require('nodemailer');
    const parser = require('nodemailer/lib/addressparser');
    parser('[x]'.repeat(40000) + '@');
    assert.equal(parser('Fixture <fixture@example.invalid>')[0].address, 'fixture@example.invalid');
    nodemailer.createTransport({ jsonTransport: true }).sendMail({
      from: 'Eastel <sender@example.invalid>', to: 'Fixture <fixture@example.invalid>',
      subject: 'Fixture verification', text: 'Local-only', html: '<p>Local-only</p>',
    }).then(result => {
      const message = JSON.parse(result.message);
      assert.equal(message.to[0].address, 'fixture@example.invalid');
      assert.equal(message.subject, 'Fixture verification');
      assert.equal(message.html, '<p>Local-only</p>');
    }).catch(() => { process.exitCode = 1 });
  `], { cwd: root, timeout: 5000, stdio: 'pipe' })
})
console.log(`Security regressions: ${passed} passed, ${failed} failed; synthetic/local only.`)
if (failed) process.exitCode = 1

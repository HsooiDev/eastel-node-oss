// Actual route, Turnstile verifier and budget SQL; private SQLite, intercepted
// provider/mail and a serialized lock substitute. No real mail or external IO.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function load(file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const source = process.argv.includes('--security-baseline') && file === 'app/api/auth/send-otp/route.ts'
    ? execFileSync('git', ['show', 'f8b1acc:' + file], { encoding: 'utf8' })
    : fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: id => {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('@/')) throw Error('Unmocked dependency: ' + id)
    return require(id)
  }, Date, URL, URLSearchParams, AbortSignal, process: { env: { DB_NAME: 'synthetic_otp' } }, console: { error() {} }, ...globals })
  return module.exports
}
function fixture(options = {}) {
  const sql = new DatabaseSync(':memory:')
  let clock = Date.parse('2026-10-22T00:00:00Z'), queue = Promise.resolve()
  const now = () => new Date(clock).toISOString().slice(0, 19).replace('T', ' ')
  sql.function('NOW', now)
  sql.exec('CREATE TABLE login_attempts(email TEXT, ip_address TEXT, attempted_at TEXT, attempt_type TEXT); CREATE TABLE email_verifications(id INTEGER PRIMARY KEY, email TEXT, code TEXT, token TEXT, verified INTEGER, expires_at TEXT)')
  const calls = { mail: [], captcha: 0, writes: 0, proof: [] }
  const db = {
    async query(statement, params = []) {
      if (options.dbFails) throw Error('Synthetic DB unavailable')
      statement = statement.replace(/DATE_SUB\(NOW\(\), INTERVAL 1 (MINUTE|HOUR|DAY)\)/g, (_, unit) => `datetime(NOW(), '-1 ${unit.toLowerCase()}')`)
      return [sql.prepare(statement).all(...params), []]
    },
    async execute(statement, params = []) {
      calls.writes++
      const result = sql.prepare(statement).run(...params.map(value => value instanceof Date ? value.toISOString() : value))
      return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }, []]
    },
    async getConnection() { return { ...db, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => sql.exec('ROLLBACK'), release() {} } },
  }
  const budget = load('lib/guest-otp-budget.ts', { '@/lib/database-lock': {
    withDatabaseLock: async (key, operation) => {
      assert.equal(key, 'guest-otp-mail-budget:synthetic_otp')
      const previous = queue
      let release
      queue = new Promise(resolve => { release = resolve })
      await previous
      try { return await operation(db) } finally { release() }
    },
  } })
  const verifier = load('lib/turnstile.ts', {}, {
    process: { env: { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'synthetic-key' } },
    fetch: async (_, init) => {
      calls.captcha++
      const token = new URLSearchParams(init.body).get('response')
      if (options.waitCaptcha) await options.waitCaptcha
      return Response.json({ success: token !== 'invalid', hostname: token === 'wrong-host' ? 'evil.invalid' : 'eastel.site', action: token === 'wrong-action' ? 'login' : 'order' })
    },
  })
  const route = load('app/api/auth/send-otp/route.ts', {
    '@/lib/db': { __esModule: true, default: db }, '@/lib/guest-otp-budget': budget,
    '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true }) },
    '@/lib/turnstile': { verifyTurnstile: (...args) => { calls.proof.push(args); return verifier.verifyTurnstile(...args) } },
    '@/lib/site': { SITE_URL: 'https://eastel.site' },
    '@/lib/email': { sendVerificationCode: async (...args) => { calls.mail.push(args); return options.mailFails !== true } },
    '@/app/api/auth/_helpers': { getClientIp: req => req.headers.get('x-test-ip') || '203.0.113.4',
      success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) },
  })
  return { calls, sql, budget, advance: ms => { clock += ms }, close: () => sql.close(),
    submit: (body = {}, ip) => route.POST(new Request('https://evil.invalid/api/auth/send-otp', { method: 'POST', headers: ip ? { 'x-test-ip': ip } : {}, body: JSON.stringify({ email: 'owner@example.invalid', lang: 'en', turnstileToken: 'valid', ...body }) })),
    restartBudget: () => load('lib/guest-otp-budget.ts', { '@/lib/database-lock': { withDatabaseLock: (_key, operation) => operation(db) } }),
  }
}
test('invalid bounded inputs and missing/wrong CAPTCHA cannot allocate rows or send mail', async () => {
  const f = fixture()
  try {
    for (const body of [{ turnstileToken: '' }, { email: 'a'.repeat(255) + '@example.invalid' }, { email: {} }, { lang: '../en' }, { turnstileToken: {} }, { turnstileToken: 'invalid' }, { turnstileToken: 'wrong-host' }, { turnstileToken: 'wrong-action' }]) {
      assert.equal((await f.submit(body)).status, 400)
      assert.equal(f.calls.writes + f.calls.mail.length, 0)
    }
  } finally { f.close() }
})
test('normal localized issuance succeeds, same-recipient cooldown survives new budget instance', async () => {
  for (const lang of ['en', 'ms', 'zh']) {
    const f = fixture()
    try {
      const response = await f.submit({ email: ' OWNER@example.invalid ', lang })
      assert.equal(response.status, 200); assert.equal((await response.json()).token.length, 64)
      assert.equal(f.calls.mail[0][0], 'owner@example.invalid'); assert.equal(f.calls.mail[0][2], lang)
      assert.match(f.calls.mail[0][1], /^\d{6}$/)
      assert.equal(await f.restartBudget().reserveGuestOtp('owner@example.invalid', '203.0.113.7'), false)
      f.advance(61_000)
      assert.equal((await f.submit()).status, 200)
    } finally { f.close() }
  }
})
test('rotating recipient addresses cannot bypass caller limits or consume shared Map keys', async () => {
  const f = fixture()
  try {
    for (let i = 0; i < 3; i++) assert.equal((await f.submit({ email: `rotated${i}@example.invalid` })).status, 200)
    const writes = f.calls.writes
    assert.equal((await f.submit({ email: 'rotated4@example.invalid' })).status, 429)
    assert.equal(f.calls.writes, writes); assert.equal(f.calls.mail.length, 3)
    assert.equal((await f.submit({ email: 'unrelated@example.invalid' }, '203.0.113.8')).status, 200)
  } finally { f.close() }
})
test('serialized global budget caps concurrent workers and persists failed mail admission', async () => {
  const f = fixture({ mailFails: true })
  try {
    assert.equal((await f.submit()).status, 502)
    assert.equal((await f.submit()).status, 429)
    const outcomes = await Promise.all(Array.from({ length: 40 }, (_, i) => f.budget.reserveGuestOtp(`global${i}@example.invalid`, `203.0.113.${i + 10}`)))
    assert.equal(outcomes.filter(Boolean).length, 29)
    assert.equal(await f.restartBudget().reserveGuestOtp('new@example.invalid', '203.0.113.200'), false)
  } finally { f.close() }
})
test('DB failure denies mail; at most four simultaneous CAPTCHA/mail workflows per process', async () => {
  const failed = fixture({ dbFails: true })
  try { assert.equal((await failed.submit()).status, 429); assert.equal(failed.calls.mail.length, 0) } finally { failed.close() }
  let release
  const f = fixture({ waitCaptcha: new Promise(resolve => { release = resolve }) })
  try {
    const pending = Array.from({ length: 4 }, (_, i) => f.submit({ email: `concurrent${i}@example.invalid` }, `203.0.113.${i + 10}`))
    assert.equal((await f.submit()).status, 429); assert.equal(f.calls.writes, 0)
    release(); await Promise.all(pending)
    f.advance(61_000)
    assert.equal((await f.submit()).status, 200)
  } finally { release(); f.close() }
})

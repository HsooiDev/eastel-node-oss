// Real route/admission/lock source and SQLite; MariaDB named locks are modeled
// with private filesystem locks. Real child processes prove fixture persistence,
// not hosted MariaDB locking, replication, timezone or service acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash, scryptSync } from 'node:crypto'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const baseline = process.argv.includes('--baseline')
const worker = process.argv.includes('--worker')
const baselineSource = baseline ? execFileSync('git', ['show', 'eccd9d65f009dc8a091a1b9843e44083dfa96040:app/api/auth/login/route.ts'], { cwd: root, encoding: 'utf8' }) : null
function load(file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const source = file === 'app/api/auth/login/route.ts' && baselineSource ? baselineSource : fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  vm.runInNewContext(output, { module, exports: module.exports, require(id) {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('@/') || id.startsWith('.')) throw new Error(`Unmocked dependency: ${id}`)
    return require(id)
  }, Request, Response, Headers, URL, Date, Buffer, process: { env: { DB_NAME: 'synthetic_login_test' } }, console: { error() {} }, ...globals }, { filename: file })
  return module.exports
}
const auth = load('lib/auth.ts', { jose: {} })
const validation = load('lib/validation.ts')
const ipHelper = load('lib/client-ip.ts')
const password = 'CustomerFixture123!'
const fixtureHash = await auth.hashPassword(password)
const marker = 'CUSTOMER_WRONG_PASSWORD'
function harness(options = {}) {
  const temporary = options.directory ?? fs.mkdtempSync(path.join(os.tmpdir(), 'eastel-customer-login-'))
  const lockRoot = path.join(temporary, 'locks'); fs.mkdirSync(lockRoot, { recursive: true })
  const sql = new DatabaseSync(path.join(temporary, 'fixture.sqlite'))
  sql.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL')
  let now = '2026-10-17 04:00:00'
  sql.function('NOW', () => now)
  sql.exec(`CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, phone TEXT, password_hash TEXT, is_temp_pass INTEGER, email_verified INTEGER);
    CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY, ip_address TEXT NOT NULL, email TEXT NOT NULL, password_tried TEXT, attempt_type TEXT, user_agent TEXT, ${options.nativeSchema ? 'success INTEGER DEFAULT 0,' : ''} attempted_at TEXT NOT NULL);`)
  sql.prepare('INSERT OR IGNORE INTO customers VALUES (1,?,?,?,?,0,1)').run('Fixture Customer', 'fixture@example.invalid', '0123456789', fixtureHash)
  const calls = { verify: 0, hash: 0, cookies: 0, sessions: 0, acquired: 0, active: 0, peak: 0, destroyed: 0, statements: [], logs: [] }
  const poolLimit = options.poolLimit ?? 10
  const normalize = query => query.replace(/DATE_SUB\(NOW\(\), INTERVAL 15 MINUTE\)/g, "datetime(NOW(), '-15 minutes')")
  async function query(statement, params = []) {
    calls.statements.push({ statement, params })
    if (options.countFails && statement.includes('COUNT(*) AS attempts')) throw new Error('synthetic count failure')
    if (Object.hasOwn(options, 'countOverride') && statement.includes('COUNT(*) AS attempts')) return [[{ attempts: options.countOverride }], []]
    return [sql.prepare(normalize(statement)).all(...params), []]
  }
  async function execute(statement, params = []) {
    calls.statements.push({ statement, params })
    if (options.writeFails && statement.includes('INSERT INTO login_attempts')) throw new Error('synthetic audit failure')
    if (options.rehashConflict && statement.includes('UPDATE customers')) return [{ affectedRows: 0 }, []]
    const result = sql.prepare(statement).run(...params)
    return [{ affectedRows: Number(result.changes) }, []]
  }
  async function getConnection() {
    if (calls.active >= poolLimit) throw new Error('synthetic pool exhausted/nested borrow')
    calls.active++; calls.peak = Math.max(calls.peak, calls.active)
    const held = new Set(); let closed = false
    const cleanup = () => {
      if (closed) return
      for (const filename of held) fs.rmdirSync(filename)
      held.clear(); closed = true; calls.active--
    }
    return { execute, query: async (statement, params) => {
      if (statement.includes('GET_LOCK')) {
        if (options.lockDenied) return [[{ acquired: 0 }], []]
        const filename = path.join(lockRoot, createHash('sha256').update(params[0]).digest('hex'))
        try { fs.mkdirSync(filename) } catch (error) { if (error.code === 'EEXIST') return [[{ acquired: 0 }], []]; throw error }
        held.add(filename); calls.acquired++
        if (options.acquireFails) throw new Error('lost acquire response')
        return [[{ acquired: 1 }], []]
      }
      if (statement.includes('RELEASE_LOCK')) {
        if (options.releaseFails) throw new Error('lost release response')
        for (const filename of held) fs.rmdirSync(filename)
        held.clear(); return [[{ released: 1 }], []]
      }
      return query(statement, params)
    }, release: cleanup, destroy: () => { calls.destroyed++; cleanup() } }
  }
  const pooled = operation => async (...args) => { const c = await getConnection(); try { return await operation(...args) } finally { c.release() } }
  const db = { getConnection, query: pooled(query), execute: pooled(execute) }
  function api() {
    const locks = load('lib/database-lock.ts', { '@/lib/db': { __esModule: true, default: db } })
    const admission = load('lib/customer-login-attempts.ts', { '@/lib/database-lock': locks })
    return load('app/api/auth/login/route.ts', {
      '@/lib/db': { __esModule: true, default: db }, '@/lib/customer-login-attempts': admission,
      '@/lib/auth': { hashPassword: async value => { calls.hash++; return auth.hashPassword(value) }, verifyPassword: async (...args) => { calls.verify++; return options.verify ? options.verify(...args) : auth.verifyPassword(...args) } },
      '@/lib/session': { createSession: async (_id, _ip, _ua, role, expected) => {
        const c = await getConnection()
        try { assert.equal(role, 'customer'); assert.equal(sql.prepare('SELECT password_hash FROM customers WHERE id=1').get().password_hash, expected); calls.sessions++; return 'synthetic-session' }
        finally { c.release() }
      } },
      '@/lib/cookies': { setSessionCookie: async () => { calls.cookies++ } },
      '@/lib/site': { SITE_URL: 'https://staging.example.test' }, '@/lib/validation': validation,
      '@/lib/turnstile': { verifyTurnstile: async () => options.captcha !== false },
      '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: options.localAllowed !== false }) },
      '../_helpers': { getClientIp: ipHelper.clientIp, success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) },
    }, { console: { error: (...args) => calls.logs.push(args.map(String).join(' ')) } })
  }
  const submit = (server = api(), body = {}, ip = '203.0.113.50', prefix = '198.51.100.1', userAgent = 'Synthetic agent') => server.POST(new Request('https://staging.example.test/api/auth/login', {
    method: 'POST', headers: { 'x-forwarded-for': `${prefix}, ${ip}`, 'user-agent': userAgent },
    body: JSON.stringify({ email: 'fixture@example.invalid', password: 'IncorrectFixture123!', turnstileToken: 'synthetic', ...body }),
  }))
  return { sql, calls, api, submit, temporary, setNow: value => { now = value },
    recordWithAgent: userAgent => load('lib/customer-login-attempts.ts', { '@/lib/database-lock': load('lib/database-lock.ts', { '@/lib/db': { __esModule: true, default: db } }) }).withCustomerLoginAttempt({ ip: '203.0.113.50', email: 'fixture@example.invalid', userAgent }, async () => ({ status: 'invalid' })),
    async adminAttempts(type, authorized = true) {
      const route = load('app/api/admin/security/route.ts', { '@/lib/db': { __esModule: true, default: db }, '@/lib/db-helpers': load('lib/db-helpers.ts'), '../_helpers': { requireAdmin: async () => authorized ? { customerId: 7 } : null, success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) } })
      return route.GET(new Request(`https://fixture.invalid/api/admin/security?attempt_type=${encodeURIComponent(type)}`))
    },
    attempts: () => sql.prepare('SELECT * FROM login_attempts ORDER BY id').all(),
    seed: (count, { ip = '203.0.113.50', type = marker, attemptedAt = now } = {}) => {
      for (let i = 0; i < count; i++) sql.prepare('INSERT INTO login_attempts(ip_address,email,attempt_type,attempted_at,password_tried) VALUES (?,?,?,?,?)').run(ip, 'prior@example.invalid', type, attemptedAt, '***')
    },
    close(remove = !options.directory) {
      assert.equal(calls.active, 0)
      if (!options.directory) assert.equal(fs.readdirSync(lockRoot).length, 0)
      sql.close()
      if (remove) { assert.equal(path.dirname(temporary), path.resolve(os.tmpdir())); assert.ok(path.basename(temporary).startsWith('eastel-customer-login-')); fs.rmSync(temporary, { recursive: true, force: true }) }
    },
  }
}
if (worker) {
  const directory = process.argv.find(value => value.startsWith('--directory=')).slice(12)
  const amount = Number(process.argv.find(value => value.startsWith('--amount='))?.slice(9) ?? 1)
  const h = harness({ directory })
  try {
    const statuses = []
    for (let i = 0; i < amount; i++) statuses.push((await h.submit(h.api(), process.argv.includes('--correct') ? { password } : {})).status)
    console.log(JSON.stringify({ statuses, attempts: h.attempts().length, passwordChecks: h.calls.verify }))
  } finally { h.close(false) }
} else {
  test('wrong existing and unknown accounts create masked durable records with the trusted IP', async () => {
    const h = harness()
    try {
      assert.equal((await h.submit()).status, 400)
      assert.equal((await h.submit(h.api(), { email: 'missing@example.invalid' }, undefined, '127.0.0.1')).status, 400)
      const rows = h.attempts(); assert.equal(rows.length, 2)
      for (const row of rows) { assert.equal(row.password_tried, '***'); assert.equal(row.attempt_type, marker); assert.equal(row.ip_address, '203.0.113.50'); assert.equal(Object.hasOwn(row, 'success'), false) }
      assert.ok(!JSON.stringify({ statements: h.calls.statements, logs: h.calls.logs, rows }).includes('IncorrectFixture123!'))
    } finally { h.close() }
  })
  test('ten failures persist across newly loaded handlers; the next correct password is limited before verification', async () => {
    const h = harness()
    try { for (let i = 0; i < 10; i++) assert.equal((await h.submit(h.api())).status, 400); const checks = h.calls.verify; assert.equal((await h.submit(h.api(), { password })).status, 429); assert.equal(h.calls.verify, checks); assert.equal(h.calls.cookies, 0); assert.equal(h.attempts().length, 10) }
    finally { h.close() }
  })
  test('a success creates no failure row and does not erase previous failures', async () => {
    const h = harness({ poolLimit: 1 })
    try { h.seed(9); const response = await h.submit(h.api(), { password }); assert.equal(response.status, 200); assert.equal((await response.json()).emailVerified, true); assert.equal(h.attempts().length, 9); assert.equal(h.calls.cookies, 1); assert.equal(h.calls.peak, 1) }
    finally { h.close() }
  })
  test('the inclusive fifteen-minute database window expires without cleanup or app-clock dependence', async () => {
    const h = harness()
    try { h.seed(10, { attemptedAt: '2026-10-17 03:45:00' }); assert.equal((await h.submit()).status, 429); h.setNow('2026-10-17 04:00:01'); assert.equal((await h.submit(h.api(), { password })).status, 200); assert.equal(h.attempts().length, 10) }
    finally { h.close() }
  })
  test('other IP, admin, OTP, AI and ambiguous legacy rows do not consume customer quota', async () => {
    const h = harness()
    try { for (const type of ['WRONG_PASSWORD', 'LOCKED_OUT', 'EMAIL_VERIFICATION', 'AI_PAID_REQUEST', 'SUCCESS']) h.seed(10, { type }); h.seed(10, { ip: '203.0.113.51' }); assert.equal((await h.submit(h.api(), { password })).status, 200) }
    finally { h.close() }
  })
  test('concurrent same-IP requests cannot overshoot the failure ceiling', async () => {
    let reached, resume, first, checks = 0
    const ready = new Promise(resolve => { reached = resolve }), paused = new Promise(resolve => { resume = resolve })
    const h = harness({ verify: async () => { if (checks++ === 0) { reached(); await paused }; return false } })
    try { h.seed(9); first = h.submit(h.api()); await ready; assert.equal((await h.submit(h.api())).status, 503); resume(); assert.equal((await first).status, 400); assert.equal((await h.submit(h.api())).status, 429); assert.equal(h.attempts().length, 10); assert.equal(h.calls.verify, 1) }
    finally { resume?.(); await first; h.close() }
  })
  test('ten distinct IPs reuse their held connections without exhausting a ten-connection pool', async () => {
    const h = harness({ poolLimit: 10, verify: async () => { await Promise.resolve(); return false } })
    try { const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => h.submit(h.api(), {}, `203.0.113.${i + 1}`))); assert.ok(responses.every(response => response.status === 400)); assert.equal(h.attempts().length, 10); assert.equal(h.calls.peak, 10) }
    finally { h.close() }
  })
  test('quota read, audit write and lock failures deny access and release or destroy connections', async () => {
    for (const options of [{ countFails: true }, { writeFails: true }, { lockDenied: true }, { acquireFails: true }]) {
      const h = harness(options)
      try { assert.equal((await h.submit()).status, 503); assert.equal(h.calls.cookies + h.calls.sessions, 0); if (options.acquireFails) assert.equal(h.calls.destroyed, 1) }
      finally { h.close() }
    }
  })
  test('malformed counters fail closed instead of admitting an unbounded authentication', async () => {
    for (const countOverride of [undefined, null, '', 'NaN', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const h = harness({ countOverride })
      try { assert.equal((await h.submit(h.api(), { password })).status, 503); assert.equal(h.calls.verify + h.calls.cookies, 0) }
      finally { h.close() }
    }
  })
  test('lost release acknowledgement destroys the connection after a completed masked record', async () => {
    const h = harness({ releaseFails: true })
    try { assert.equal((await h.submit()).status, 400); assert.equal(h.calls.destroyed, 1); assert.equal(h.attempts().length, 1) }
    finally { h.close() }
  })
  test('CAPTCHA, local quota and invalid input remain before durable admission', async () => {
    for (const [options, body, expected] of [[{ captcha: false }, {}, 400], [{ localAllowed: false }, {}, 429], [{}, { email: 'invalid' }, 400]]) {
      const h = harness(options)
      try { assert.equal((await h.submit(h.api(), body)).status, expected); assert.equal(h.calls.acquired + h.attempts().length + h.calls.verify, 0) }
      finally { h.close() }
    }
  })
  test('user-agent audit data is bounded to complete Unicode characters', async () => {
    const h = harness()
    try { assert.equal((await h.submit(h.api(), {}, undefined, undefined, 'A'.repeat(600))).status, 400); assert.equal(Array.from(h.attempts()[0].user_agent).length, 512); assert.equal((await h.recordWithAgent('😀'.repeat(600))).status, 'invalid'); assert.equal(h.attempts()[1].user_agent, '😀'.repeat(512)) }
    finally { h.close() }
  })
  test('legacy hash CAS is retained and a credential race creates no failure record or session', async () => {
    const salt = 'ab'.repeat(32), legacy = `scrypt:${salt}:${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`
    for (const rehashConflict of [false, true]) {
      const h = harness({ rehashConflict })
      try { h.sql.prepare('UPDATE customers SET password_hash=?').run(legacy); assert.equal((await h.submit(h.api(), { password })).status, rehashConflict ? 409 : 200); assert.equal(h.attempts().length, 0); assert.equal(h.calls.cookies, rehashConflict ? 0 : 1); if (!rehashConflict) assert.equal(await auth.verifyPassword(password, h.sql.prepare('SELECT password_hash FROM customers').get().password_hash), true) }
      finally { h.close() }
    }
  })
  const child = async (directory, amount, correct = false) => {
    const result = await exec(process.execPath, [fileURLToPath(import.meta.url), '--worker', `--directory=${directory}`, `--amount=${amount}`, ...(correct ? ['--correct'] : []), ...(baseline ? ['--baseline'] : [])], { cwd: root, timeout: 20000, maxBuffer: 100000 })
    return JSON.parse(result.stdout.trim())
  }
  test('real separate Node processes retain the failure count after the prior process exits', async () => {
    const h = harness()
    try { assert.deepEqual((await child(h.temporary, 5)).statuses, Array(5).fill(400)); assert.deepEqual((await child(h.temporary, 5)).statuses, Array(5).fill(400)); const afterRestart = await child(h.temporary, 1, true); assert.deepEqual(afterRestart.statuses, [429]); assert.equal(afterRestart.passwordChecks, 0); assert.equal(h.attempts().length, 10) }
    finally { h.close() }
  })
  test('real concurrent child workers share the modeled lock and cannot exceed ten failed records', async () => {
    const h = harness()
    try { h.seed(9); const replies = await Promise.allSettled([child(h.temporary, 1), child(h.temporary, 1), child(h.temporary, 1)]); for (const reply of replies) assert.equal(reply.status, 'fulfilled', reply.reason?.message); const statuses = replies.flatMap(reply => reply.value.statuses); assert.equal(statuses.filter(status => status === 400).length, 1); assert.ok(statuses.every(status => [400, 429, 503].includes(status))); assert.equal(h.attempts().length, 10) }
    finally { h.close() }
  })
  test('both PHP imported tables without success and fresh Node tables accept failure records', async () => {
    for (const nativeSchema of [false, true]) {
      const h = harness({ nativeSchema })
      try { assert.equal((await h.submit()).status, 400); assert.equal(h.attempts().length, 1); assert.equal(h.attempts()[0].password_tried, '***'); if (nativeSchema) assert.equal(h.attempts()[0].success, 0) }
      finally { h.close() }
    }
  })
  test('new customer failures are selectable in the actual admin reader and security UI without leaking password fields', async () => {
    const h = harness()
    try {
      await h.submit(); h.seed(1, { type: 'WRONG_PASSWORD' })
      const response = await h.adminAttempts(marker); assert.equal(response.status, 200)
      const data = await response.json(); assert.equal(data.pagination.total, 1); assert.equal(data.attempts[0].attempt_type, marker); assert.equal(data.attempts[0].password_tried, undefined)
      assert.equal((await h.adminAttempts(marker, false)).status, 401); assert.equal((await h.adminAttempts('invalid-type')).status, 400)
      const jsx = (type, props) => ({ type, props })
      const Page = load('app/hs/security/page.tsx', { react: { useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useCallback: fn => fn, useEffect() {} }, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/ui/table': {}, '@/components/ui/card': {}, '@/components/ui/button': {} }).default
      const visit = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(visit)]
      const option = visit(Page()).find(node => node.type === 'option' && node.props.value === marker)
      assert.equal(option.props.children, 'Customer wrong password')
    } finally { h.close() }
  })
}

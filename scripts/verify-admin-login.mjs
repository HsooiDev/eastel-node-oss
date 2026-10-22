import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import bcrypt from 'bcryptjs'
import { verifyPassword } from '../lib/auth.ts'

const require = createRequire(import.meta.url)
const password = 'local-fixture-password-only'
const phpHash = (await bcrypt.hash(password, 4)).replace('$2b$', '$2y$')
function load(relative, deps) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, require: id => deps[id] ?? require(id), URL, Date, Buffer, console, process: { env: { NODE_ENV: 'production' } } }, { filename: relative })
  return module.exports
}
function fixture({ failed = 0, active = true, captcha = true, databaseFailure = false } = {}) {
  const attempts = []
  const sessions = new Map()
  let cookie = null
  let cookieOptions = null
  let passwordChecks = 0
  const db = {
    async query(sql, params) {
      if (sql.includes('`success`')) throw new Error("Unknown column 'success' in 'WHERE'")
      if (databaseFailure) throw new Error('database unavailable')
      if (sql.includes('COUNT(*)')) {
        if (sql.includes('ip_attempts')) return [[{ ip_attempts: 0 }], []]
        assert.match(sql, /`attempt_type` IN \('WRONG_PASSWORD', 'LOCKED_OUT'\)/)
        assert.match(sql, /INTERVAL 5 MINUTE/)
        assert.equal(params[0], 'admin@example.invalid')
        return [[{ email_attempts: failed }], []]
      }
      if (sql.includes('FROM `admin_users`')) {
        assert.match(sql, /`is_active` = 1/)
        return [active ? [{ id: 7, name: 'Fixture Admin', email: 'admin@example.invalid', password_hash: phpHash }] : [], []]
      }
      if (sql.includes('FROM `sessions`')) {
        assert.match(sql, /s\.`role` = 'admin'/)
        return [sessions.has(params[0]) ? [{ customerId: 7, name: 'Fixture Admin', email: 'admin@example.invalid' }] : [], []]
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
    async execute(sql, params) {
      if (sql.includes('`login_attempts`')) {
        assert.ok(!sql.includes('`success`'))
        assert.match(sql, /`attempt_type`/)
        attempts.push(params[2])
      } else if (sql.includes('INSERT INTO `sessions`')) {
        assert.equal(params[2], 'admin')
        sessions.set(params[0], params)
      } else { throw new Error(`Unexpected write: ${sql}`) }
      return [{ affectedRows: 1 }, []]
    },
  }
  const session = load('../lib/session.ts', {
    '@/lib/db': db, '@/lib/migrate': { ensureAllTables: async () => {} },
    '@/lib/db-helpers': { formatDate: date => date.toISOString().slice(0, 19).replace('T', ' ') },
  })
  const cookies = load('../lib/cookies.ts', {
    'next/headers': { cookies: async () => ({ set: (name, value, options) => {
      assert.equal(name, 'eastel_session')
      cookie = value
      cookieOptions = options
    } }) },
  })
  const route = load('../app/api/admin/login/route.ts', {
    '@/lib/admin-login-attempts': load('../lib/admin-login-attempts.ts', {
      '@/lib/database-lock': { withDatabaseLocks: async (_keys, operation) => operation(db) },
    }),
    '@/lib/db': { __esModule: true, default: db },
    '@/lib/auth': { verifyPassword: async (...args) => { passwordChecks++; return verifyPassword(...args) } },
    '@/lib/session': session,
    '@/lib/cookies': cookies,
    '@/lib/client-ip': load('../lib/client-ip.ts', {}),
    '@/lib/site': { SITE_URL: 'https://staging.example.test' },
    '@/lib/turnstile': { verifyTurnstile: async () => captcha },
    '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true }), resetRateLimit: () => {} },
    '@/lib/db-helpers': { formatDate: () => '2026-10-08 00:00:00' },
    '@/lib/validation': { loginSchema: {}, validate: (_schema, body) => ({ success: true, data: body }) },
    '@/lib/audit': { logAdminAction: async () => {} },
    '../_helpers': {
      success: data => Response.json({ status: 'success', ...data }),
      error: (message, status = 400) => Response.json({ status: 'error', message }, { status }),
    },
  })
  return {
    session, attempts, sessions,
    cookie: () => cookie,
    cookieOptions: () => cookieOptions,
    checks: () => passwordChecks,
    login: secret => route.POST(new Request('http://fixture.invalid/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.invalid', password: secret, turnstileToken: 'local-fixture-token' }),
    })),
  }
}
const valid = fixture()
const response = await valid.login(password)
assert.equal(response.status, 200)
assert.equal((await response.json()).status, 'success')
assert.equal(valid.attempts[0], 'SUCCESS')
assert.match(valid.cookie(), /^[a-f0-9]{64}$/)
assert.equal(valid.cookieOptions().httpOnly, true)
assert.equal(valid.cookieOptions().secure, true)
assert.equal(valid.cookieOptions().sameSite, 'lax')
assert.equal(valid.cookieOptions().path, '/')
assert.equal((await valid.session.validateAdminSession(valid.cookie())).isAdmin, true)

for (const scenario of [
  { options: {}, secret: 'wrong-password', logged: 'WRONG_PASSWORD', checks: 1 },
  { options: { active: false }, secret: password, logged: 'WRONG_PASSWORD', checks: 0 },
  { options: { failed: 5 }, secret: password, logged: 'LOCKED_OUT', checks: 0 },
  { options: { captcha: false }, secret: password, logged: undefined, checks: 0 },
]) {
  const current = fixture(scenario.options)
  const result = await current.login(scenario.secret)
  assert.equal(result.status, 400)
  assert.equal((await result.json()).status, 'error')
  assert.equal(current.cookie(), null)
  assert.equal(current.sessions.size, 0)
  assert.equal(current.attempts[0], scenario.logged)
  assert.equal(current.checks(), scenario.checks)
}
console.log('PASS: complete admin login on PHP-shaped login_attempts, legacy $2y$ password, admin session and cookie; wrong password, inactive account, lockout and CAPTCHA reject without sessions.')

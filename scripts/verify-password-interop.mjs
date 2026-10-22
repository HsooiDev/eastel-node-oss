import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { scryptSync } from 'node:crypto'
import ts from 'typescript'
import { hashPassword, verifyPassword } from '../lib/auth.ts'
import bcrypt from 'bcryptjs'

const php = process.env.EASTEL_PHP_BIN || 'php'
function phpCall(input) {
  const result = spawnSync(php, ['-n', 'scripts/fixtures/password-interop.php'], {
    input: JSON.stringify(input), encoding: 'utf8', timeout: 15000,
  })
  assert.equal(result.status, 0, result.error ? 'PHP CLI unavailable; set EASTEL_PHP_BIN.' : 'PHP Argon2 fixture failed.')
  return JSON.parse(result.stdout)
}
const passwords = ['SyntheticPass123!', '共享密码Example123🔐', `${'a'.repeat(72)}One9!`, 'Null\0ByteExample9!']
for (const password of passwords) {
  const nodeHash = await hashPassword(password)
  assert.match(nodeHash, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/)
  assert.equal(phpCall({ operation: 'verify', password, hash: nodeHash }).valid, true)
  assert.equal(phpCall({ operation: 'verify', password: password + 'wrong', hash: nodeHash }).valid, false)
  assert.equal(await verifyPassword(password, nodeHash), true)
  const phpHash = phpCall({ operation: 'hash', password }).hash
  assert.equal(await verifyPassword(password, phpHash), true)
  assert.equal(await verifyPassword(password + 'wrong', phpHash), false)
}
const longPassword = `${'a'.repeat(72)}One9!`
const longHash = await hashPassword(longPassword)
assert.equal(await verifyPassword(`${'a'.repeat(72)}Two9!`, longHash), false, 'suffix beyond bcrypt limit must affect the password')
for (const invalid of ['$argon2id$v=19$m=999999,t=3,p=1$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA', '$argon2id$invalid', 'scrypt:bad:bad']) {
  assert.equal(await verifyPassword('Synthetic9!', invalid), false)
}
const legacyPassword = 'LegacyOwnerExample9!'
const salt = 'ab'.repeat(32)
const legacyHash = `scrypt:${salt}:${scryptSync(legacyPassword, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`
assert.equal(await verifyPassword(legacyPassword, legacyHash), true)
assert.equal(await verifyPassword('wrong', legacyHash), false)
assert.equal(phpCall({ operation: 'verify', password: legacyPassword, hash: legacyHash }).valid, false, 'unmigrated legacy scrypt remains a documented PHP rollback gate')
const phpBcrypt = (await bcrypt.hash(legacyPassword, 12)).replace('$2b$', '$2y$')
assert.equal(await verifyPassword(legacyPassword, phpBcrypt), true)

// Execute the real login route, replacing only DB/session/provider boundaries.
function loginFixture({ race = false } = {}) {
  let currentHash = legacyHash, cookie = null, updates = 0
  const db = {
    query: async () => [[{ id: 7, name: 'Synthetic', email: 'fixture@example.invalid', password_hash: currentHash, is_temp_pass: 0, email_verified: 1 }], []],
    execute: async (_sql, [hash, id, expected]) => {
      assert.equal(id, 7); assert.equal(expected, legacyHash); updates++
      if (race) { currentHash = 'concurrent-password-reset'; return [{ affectedRows: 0 }, []] }
      assert.equal(currentHash, expected); currentHash = hash; return [{ affectedRows: 1 }, []]
    },
  }
  const deps = {
    '@/lib/db': { default: db }, '@/lib/auth': { hashPassword, verifyPassword },
    '@/lib/customer-login-attempts': { withCustomerLoginAttempt: async (_identity, operation) => operation(db) },
    '@/lib/session': { createSession: async (_id, _ip, _ua, role, expected) => { assert.equal(role, 'customer'); assert.equal(expected, currentHash); return 'synthetic-session' } },
    '@/lib/cookies': { setSessionCookie: async value => { cookie = value } },
    '@/lib/turnstile': { verifyTurnstile: async () => true }, '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true }) },
    '@/lib/site': { SITE_URL: 'https://example.invalid' },
    '@/lib/validation': { loginSchema: {}, validate: (_schema, value) => ({ success: true, data: value }) },
    '../_helpers': { getClientIp: () => '127.0.0.1', success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) },
  }
  deps['@/lib/db'].__esModule = true
  const module = { exports: {} }
  const source = fs.readFileSync(path.join(process.cwd(), 'app/api/auth/login/route.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(compiled, { module, exports: module.exports, URL, require: name => { assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`); return deps[name] }, console: { error() {} } })
  return { api: module.exports, state: () => ({ currentHash, cookie, updates }) }
}
for (const race of [false, true]) {
  const fixture = loginFixture({ race })
  const response = await fixture.api.POST(new Request('http://localhost/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'fixture@example.invalid', password: legacyPassword }) }))
  assert.equal(response.status, race ? 409 : 200)
  const state = fixture.state()
  assert.equal(state.updates, 1)
  if (race) { assert.equal(state.cookie, null); assert.equal(state.currentHash, 'concurrent-password-reset') }
  else { assert.equal(state.cookie, 'synthetic-session'); assert.equal(phpCall({ operation: 'verify', password: legacyPassword, hash: state.currentHash }).valid, true) }
}
const wrong = loginFixture()
assert.equal((await wrong.api.POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ email: 'fixture@example.invalid', password: 'wrong' }) }))).status, 400)
assert.equal(wrong.state().updates, 0)
console.log('PASS: real PHP/Node Argon2id both ways, UTF-8/long/NUL passwords, legacy bcrypt/scrypt, login rehash and reset-race preservation; synthetic only')

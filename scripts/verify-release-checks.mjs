import assert from 'node:assert/strict'
import { releaseChecks, validateReleaseResponse, validateReleaseURL } from './check-release.mjs'
let passed = 0
function test(name, fn) { fn(); passed++ }
const sha = 'a'.repeat(40)
test('Node exact SHA required', () => assert.throws(() => releaseChecks('node')))
test('stack required', () => assert.throws(() => releaseChecks('other', sha)))
for (const stack of ['php', 'node']) {
  for (const check of releaseChecks(stack, sha)) {
    const html = '<title>Eastel</title><input type="password">'
    const json = JSON.stringify({ status: check.status, message: check.message, buildId: check.sha })
    const type = check.html || check.password ? 'text/html' : 'application/json'
    const good = check.html || check.password ? html : json
    test(stack + ' ' + check.name + ' accepted', () => assert.equal(validateReleaseResponse(check, check.http, type, good), true))
    test(stack + ' ' + check.name + ' blank 500 rejected', () => assert.equal(validateReleaseResponse(check, 500, type, ''), false))
    test(stack + ' ' + check.name + ' wrong type rejected', () => assert.equal(validateReleaseResponse(check, check.http, 'text/plain', good), false))
    if (check.status) {
      test(stack + ' ' + check.name + ' wrong envelope rejected', () => assert.equal(validateReleaseResponse(check, check.http, type, '{"status":"unexpected"}'), false))
      test(stack + ' ' + check.name + ' malformed JSON rejected', () => assert.equal(validateReleaseResponse(check, check.http, type, '<html>challenge</html>'), false))
    }
    if (check.password) test(stack + ' ' + check.name + ' missing login form rejected', () => assert.equal(validateReleaseResponse(check, check.http, type, '<title>Eastel error</title>'), false))
    if (check.sha) test('wrong deployed SHA rejected', () => assert.equal(validateReleaseResponse(check, check.http, type, JSON.stringify({ status: check.status, buildId: 'b'.repeat(40) })), false))
  }
}
const base = 'https://eastel.site'
for (const stack of ['php', 'node']) {
  const admin = releaseChecks(stack, sha).find(check => check.name === 'admin login')
  test(stack + ' admin path accepted', () => assert.equal(validateReleaseURL(admin, base, new URL(admin.path, base).href), true))
  test(stack + ' customer login redirect rejected', () => assert.equal(validateReleaseURL(admin, base, base + '/en/account/login'), false))
  test(stack + ' cross-origin redirect rejected', () => assert.equal(validateReleaseURL(admin, base, 'https://other.site' + admin.path), false))
}
const phpAuth = releaseChecks('php').find(check => check.name === 'customer session')
test('different API action rejected', () => assert.equal(validateReleaseURL(phpAuth, base, base + '/api/auth.php?action=forgot'), false))

console.log('PASS: ' + passed + ' release response scenarios')

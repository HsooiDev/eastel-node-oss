// Offline checks use Next's installed route matcher rather than a second
// implementation of next.config redirect semantics. Optional --url reads only
// public paths; it never submits orders, authenticates, or contacts payment APIs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadTs(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} }
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, URL, URLSearchParams,
    require: name => name.startsWith('.') ? loadTs(path.join(path.dirname(relative), `${name}.ts`)) : require(name),
  }, { filename: relative })
  return mod.exports
}
const { getLegacyRedirects, resolveLegacyPrivateRedirect } = loadTs('lib/legacy-redirects.ts')
const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match.js')
const { matchHas, prepareDestination } = require('next/dist/shared/lib/router/utils/prepare-destination.js')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/legacy-public-urls.json')))
const redirects = getLegacyRedirects()

function resolvePublic(input) {
  const url = new URL(input, 'https://legacy.invalid')
  const query = Object.fromEntries(url.searchParams)
  for (const rule of redirects) {
    const params = getPathMatch(rule.source)(url.pathname)
    if (!params) continue
    const has = matchHas({ headers: { host: 'legacy.invalid' } }, query, rule.has ?? [])
    if (!has) continue
    const result = prepareDestination({ destination: rule.destination, params: { ...params, ...has }, query, appendParamsToQuery: false })
    const target = new URL(result.newUrl, 'https://legacy.invalid')
    target.search = new URLSearchParams(result.parsedDestination.query).toString()
    return { rule, url: target }
  }
  return null
}

assert.equal(fixture.urlCount, 30, 'review the latest PHP sitemap before changing the fixture')
const signatures = new Set()
for (const rule of redirects) {
  assert.equal(rule.permanent, true)
  assert.ok(rule.destination.startsWith('/') && !rule.destination.startsWith('//'))
  assert.ok(!rule.source.includes(':path'), 'catch-all legacy redirects are forbidden')
  const signature = `${rule.source}|${JSON.stringify(rule.has ?? [])}`
  assert.ok(!signatures.has(signature), `duplicate redirect: ${signature}`)
  signatures.add(signature)
}
for (const { source, destination } of fixture.urls) {
  const result = resolvePublic(source)
  if (result) assert.equal(result.url.pathname, destination, source)
  else assert.equal(new URL(source, 'https://legacy.invalid').pathname.replace(/\/$/, ''), destination, `unmapped old URL: ${source}`)
  const clean = destination.replace(/^\/(en|ms|zh)/, '')
  assert.ok(fs.existsSync(path.join(root, 'app/[locale]', clean, 'page.tsx')), `missing destination page: ${destination}`)
}
for (const locale of ['en', 'ms', 'zh']) {
  for (const [source, destination] of [['index.html', ''], ['plans.html', '/plans'], ['roaming.php', '/roaming']]) {
    assert.equal(resolvePublic(`/${locale}/${source}`).url.pathname, `/${locale}${destination}`)
  }
}
const selectedPlan = resolvePublic('/order.html?lang=zh&plan=EZ365D&utm_source=old-link')
assert.equal(selectedPlan.url.pathname, '/zh/order')
assert.equal(selectedPlan.url.searchParams.get('plan'), 'EZ365D')
assert.equal(selectedPlan.url.searchParams.get('utm_source'), 'old-link')
for (const input of ['/missing.html', '/en/unknown.php', '/api/payment_return.php?billcode=private', '/thankyou.html?order_ref=private', '/account/reset.html?token=private']) {
  assert.equal(resolvePublic(input), null, `private/unknown path must not have a public permanent redirect: ${input}`)
}
const privateRedirect = input => {
  const url = new URL(input, 'https://legacy.invalid')
  return resolveLegacyPrivateRedirect(url.pathname, url.searchParams)
}
assert.equal(privateRedirect('/thankyou.html?order_ref=private&billcode=private&status=success&lang=zh'), '/zh/track')
assert.equal(privateRedirect('/account/orders.html?email=private&billcode=private'), '/en/account/orders')
assert.equal(privateRedirect('/account/login.html?lang=ms&redirect=https%3A%2F%2Fevil.example'), '/ms/account/login')
const login = new URL(privateRedirect('/account/login.html?redirect=%2Forder.html%3Flang%3Dzh%26plan%3DEZ35'), 'https://legacy.invalid')
assert.equal(login.searchParams.get('redirect'), '/zh/order?plan=EZ35')
const token = 'a'.repeat(64)
assert.equal(privateRedirect(`/account/reset.html?token=${token}&email=private`), `/en/account/reset?token=${token}`)
for (const locale of ['en', 'ms', 'zh']) {
  assert.equal(privateRedirect(`/account/reset.html?token=${token}&lang=${locale}`), `/${locale}/account/reset?token=${token}`)
}
assert.equal(privateRedirect('/account/reset.html?token=bad'), '/en/account/reset')
const resetPage = fs.readFileSync(path.join(root, 'app/[locale]/account/(auth)/reset/page.tsx'), 'utf8')
assert.match(resetPage, /useSearchParams\(\)/)
assert.match(resetPage, /searchParams\.get\("token"\)/)
assert.equal(privateRedirect(`/account/verify-email.html?token=${token}&lang=zh`), `/zh/account/verify-email?token=${token}`)
assert.equal(privateRedirect('/api/payment_return.php?billcode=private'), null)
assert.equal(privateRedirect('/unknown.html'), null)
console.log(`PASS: ${fixture.urlCount} PHP sitemap URLs, ${redirects.length} finite redirects, language queries, real destinations, private/token/callback exclusions.`)

const arg = process.argv.find(value => value.startsWith('--url='))
if (arg) {
  const origin = new URL(arg.slice('--url='.length))
  assert.ok(['http:', 'https:'].includes(origin.protocol))
  for (const { source, destination } of fixture.urls) {
    const url = new URL(source, origin)
    const response = await fetch(url, { redirect: 'manual' })
    const unchanged = source === destination
    if (unchanged) assert.equal(response.status, 200, source)
    else {
      assert.ok([301, 308].includes(response.status), `${source}: expected permanent redirect, got ${response.status}`)
      const target = new URL(response.headers.get('location'), origin)
      assert.equal(target.origin, origin.origin, `${source}: crossed origin`)
      assert.equal(target.pathname, destination, source)
    }
    await response.body?.cancel()
  }
  console.log(`PASS: read-only HTTP matrix for all ${fixture.urlCount} old sitemap URLs on ${origin.origin}.`)
}

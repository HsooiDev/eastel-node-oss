import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const origin = 'https://eastel.example.invalid'
function load(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, require: id => dependencies[id] ?? require(id),
    process, console, URL, Request, Response, Headers, TextDecoder, Uint8Array, Error, Buffer,
  }, { filename: file })
  return module.exports
}
const clientIp = load('lib/client-ip.ts', {})

const originalSecret = process.env.JWT_SECRET
process.env.JWT_SECRET = 'fixture-only-encryption-secret-with-32-characters'
process.on('exit', () => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
})
const details = {
  full_name: 'Fixture Customer', email: 'buyer@example.invalid', phone: '60123456789',
  address_line1: 'Fixture address', postcode: '50000', city: 'Kuala Lumpur', state: 'W.P. Kuala Lumpur',
}
const catalogue = JSON.parse(fs.readFileSync(new URL('../public/recommender/catalogue.json', import.meta.url)))
const engine = await import('../public/recommender/engine.mjs')
const crypto = load('lib/ai-checkout-details.ts', { '@/lib/site': { SITE_URL: origin } })
let storefront
let dbFailure = false
const commerce = load('lib/ai-commerce.ts', {
  '@/lib/plan-recommender': { getPlanCatalogue: async () => { if (dbFailure) throw Error('fixture DB secret'); return catalogue } },
  '@/lib/storefront': { getStorefrontCheckout: async () => { if (dbFailure) throw Error('fixture DB secret'); return storefront } },
  '@/lib/site': { SITE_URL: origin }, '@/public/recommender/engine.mjs': engine,
  '@/lib/ai-checkout-details': crypto,
})
function reset() {
  dbFailure = false
  storefront = { product: { id: 7, name: 'Fixture SIM', price: 12.5, available: true }, couriers: [{ id: 2 }] }
}
const call = commerce.executeCommerceTool

test('catalogue separates purchasable SIM from currently available plan fees', async () => {
  reset()
  const out = await call('eastel_get_catalogue', {})
  assert.equal(out.product.price, 12.5)
  assert.equal(out.purchase_policy.plan_included, false)
  assert.equal(out.purchase_policy.quantity, 1)
  assert.ok(out.plans.every(plan => plan.status === 'available'))
  assert.equal(out.checkout_url, `${origin}/ms/order`)
})

test('recommendation executes real budget, quota and shared-hotspot rules', async () => {
  reset()
  const result = await call('eastel_recommend_plan', { dataGB: 100, budget: 35 })
  assert.equal(result.recommendation.status, 'match')
  assert.equal(result.recommendation.plan.id, 'ez35')
  const over = await call('eastel_recommend_plan', { dataGB: 100, budget: 10 })
  assert.equal(over.recommendation.status, 'over_budget')
  assert.equal(over.recommendation.shortfall, 25)
  const gaps = await call('eastel_recommend_plan', { dataGB: 10000, budget: 35 })
  assert.equal(gaps.recommendation.status, 'no_match')
  assert.ok(gaps.recommendation.gaps.dataGB > 0)
})

test('checkout defaults to assisted and preserves website choice without claiming purchase', async () => {
  reset()
  const out = await call('eastel_prepare_checkout', { locale: 'zh', plan_id: 'ez50' })
  assert.equal(out.checkout_url, `${origin}/zh/order?plan=ez50&purchase=sim_and_plan`)
  assert.equal(out.checkout_mode, 'assisted')
  assert.equal(out.order_created, false)
  assert.equal(out.payment_completed, false)
  assert.equal(out.customer_action_required, true)
  assert.equal(out.estimated_charges.total, null)
  assert.equal(out.estimated_charges.plan_fee_included, true)
  assert.equal(out.estimated_charges.plan_fee, 50)
  assert.equal(out.purchase_option, 'sim_and_plan')
  assert.equal(out.purchase_policy.plan_included, true)
  const manual = await call('eastel_prepare_checkout', { checkout_mode: 'website' })
  assert.equal(manual.checkout_mode, 'website')
  assert.equal(manual.details_prefilled, false)
  assert.equal(manual.purchase_option, 'sim_only')
  assert.equal(manual.estimated_charges.plan_fee, 0)
  const simOnly = await call('eastel_prepare_checkout', { plan_id: 'ez50', purchase_option: 'sim_only' })
  assert.equal(simOnly.checkout_url, `${origin}/ms/order?purchase=sim_only`)
  assert.equal(simOnly.recommended_plan, null)
  assert.equal(simOnly.estimated_charges.plan_fee, 0)
  await assert.rejects(call('eastel_prepare_checkout', { purchase_option: 'sim_and_plan' }), { code: 'invalid_arguments' })
  await assert.rejects(call('eastel_prepare_checkout', { checkout_mode: 'website', details }), { code: 'invalid_arguments' })
})

test('assisted checkout encrypts contact data in a private fragment and validates its purpose', async () => {
  reset()
  const out = await call('eastel_prepare_checkout', { details })
  const url = new URL(out.checkout_url)
  assert.equal(url.search, '?purchase=sim_only')
  assert.equal(out.details_prefilled, true)
  assert.equal(out.details_expire_in_seconds, 900)
  assert.ok(!out.checkout_url.includes(details.email))
  const token = url.hash.slice('#ai_checkout='.length)
  assert.equal((await crypto.decryptCheckoutDetails(token)).email, details.email)
  await assert.rejects(crypto.decryptCheckoutDetails(token.slice(0, -5) + 'xxxxx'))
  const { EncryptJWT } = await import('jose')
  const { createHash } = await import('node:crypto')
  const key = createHash('sha256').update(`eastel/ai-checkout-details/v1\0${process.env.JWT_SECRET}`).digest()
  const expired = await new EncryptJWT({ details }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(origin).setAudience('eastel-ai-checkout-details').setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 10).encrypt(key)
  await assert.rejects(crypto.decryptCheckoutDetails(expired))
  const wrongPurpose = await new EncryptJWT({ details }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(origin).setAudience('customer-session').setIssuedAt().setExpirationTime('15m').encrypt(key)
  await assert.rejects(crypto.decryptCheckoutDetails(wrongPurpose))
})

test('unavailable plans, sold-out SIMs, missing couriers and DB failures cannot create checkout links', async () => {
  reset()
  await assert.rejects(call('eastel_prepare_checkout', { plan_id: 'does-not-exist' }), { code: 'plan_unavailable' })
  storefront.product.available = false
  await assert.rejects(call('eastel_prepare_checkout', {}), { code: 'checkout_unavailable' })
  storefront.product = null
  assert.equal((await call('eastel_get_catalogue', {})).checkout_url, null)
  reset(); storefront.couriers = []
  await assert.rejects(call('eastel_prepare_checkout', {}), { code: 'checkout_unavailable' })
  dbFailure = true
  await assert.rejects(call('eastel_get_catalogue', {}), error => error.code === 'service_unavailable' && !error.message.includes('secret'))
})

test('tool inputs reject caller prices, external redirects, credentials and invalid amounts', async () => {
  reset()
  for (const args of [{ price: 0 }, { redirect_url: 'https://attacker.invalid' }, { payment_card: 'fixture' }, { locale: '../en' }]) {
    await assert.rejects(call('eastel_prepare_checkout', args), { code: 'invalid_arguments' })
  }
  await assert.rejects(call('eastel_recommend_plan', { dataGB: -1, budget: 10 }), { code: 'invalid_arguments' })
  await assert.rejects(call('eastel_prepare_checkout', { details: { ...details, otp: '123456' } }), { code: 'invalid_arguments' })
})

let rateAllowed = true
const routes = load('app/api/mcp/route.ts', {
  '@/lib/ai-commerce': commerce,
  '@/lib/site': { SITE_URL: origin },
  '@/lib/client-ip': clientIp,
  '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: rateAllowed, resetAt: Date.now() + 60000 }) },
})
test('official MCP client initializes, discovers three tools and obtains a structured checkout result', async () => {
  reset(); rateAllowed = true
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
    fetch: async (input, init) => {
      const request = new Request(input, init)
      return routes[request.method](request)
    },
  })
  const client = new Client({ name: 'eastel-fixture-client', version: '1.0.0' })
  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    assert.equal(tools.length, 3)
    assert.ok(tools.every(tool => tool.annotations.readOnlyHint))
    const out = await client.callTool({ name: 'eastel_prepare_checkout', arguments: { plan_id: 'ez50' } })
    assert.equal(out.structuredContent.checkout_url, `${origin}/ms/order?plan=ez50&purchase=sim_and_plan`)
    assert.equal(out.structuredContent.order_created, false)
    const invalid = await client.callTool({ name: 'eastel_prepare_checkout', arguments: { plan_id: 'missing' } })
    assert.equal(invalid.isError, true)
    assert.equal(invalid.structuredContent.code, 'plan_unavailable')
  } finally { await client.close() }
})

test('MCP transport rejects cross-origin, large bodies, malformed messages and rate excess', async () => {
  rateAllowed = true
  const init = { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }
  const evil = await routes.POST(new Request(`${origin}/api/mcp`, { ...init, headers: { ...init.headers, origin: 'https://attacker.invalid' }, body: '{}' }))
  assert.equal(evil.status, 403)
  const large = await routes.POST(new Request(`${origin}/api/mcp`, { ...init, body: JSON.stringify({ data: 'x'.repeat(17000) }) }))
  assert.equal(large.status, 413)
  const malformed = await routes.POST(new Request(`${origin}/api/mcp`, { ...init, body: 'not-json' }))
  assert.equal(malformed.status, 400)
  rateAllowed = false
  const limited = await routes.POST(new Request(`${origin}/api/mcp`, { ...init, body: '{}' }))
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('retry-after')) > 0)
})

test('browser draft exchange returns only that draft and rejects invalid tokens and origins', async () => {
  const helper = load('lib/ai-commerce-http.ts', {
    '@/lib/site': { SITE_URL: origin },
    '@/lib/client-ip': clientIp,
    '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 }) },
  })
  const redeem = load('app/api/ai/checkout-details/route.ts', {
    '@/lib/ai-checkout-details': crypto, '@/lib/ai-commerce': commerce, '@/lib/ai-commerce-http': helper,
  })
  const token = await crypto.encryptCheckoutDetails(details)
  const request = (body, headers = {}) => new Request(`${origin}/api/ai/checkout-details`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body),
  })
  const out = await redeem.POST(request({ token }))
  assert.equal(out.status, 200)
  assert.equal(out.headers.get('cache-control'), 'no-store')
  assert.equal((await out.json()).details.email, details.email)
  assert.equal((await redeem.POST(request({ token: 'invalid' }))).status, 400)
  assert.equal((await redeem.POST(request({ token }, { origin: 'https://attacker.invalid' }))).status, 403)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { z } from 'zod'

const require = createRequire(import.meta.url)
const origin = 'https://eastel.example.invalid'

// Exercise the real TS modules with fixture database reads and no network/server.
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, require: id => dependencies[id] ?? require(id),
    process, console, URL, Request, Response, Headers, TextDecoder, TextEncoder,
    Uint8Array, Error, Buffer, ReadableStream, setInterval,
  }, { filename: file })
  return module.exports
}

let rateAllowed = true
let lastRateKey
const clientIp = load('lib/client-ip.ts')
const helper = load('lib/ai-commerce-http.ts', {
  '@/lib/site': { SITE_URL: origin },
  '@/lib/client-ip': clientIp,
  '@/lib/rate-limit': {
    checkRateLimit: (key, maximum, window) => {
      lastRateKey = key
      assert.equal(maximum, 60)
      assert.equal(window, 60000)
      return { allowed: rateAllowed, remaining: rateAllowed ? 59 : 0, resetAt: Date.now() + 60000 }
    },
  },
})

const rawRequest = (body, headers = {}) => new Request(`${origin}/api/ai/checkout`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
})
const jsonRequest = (path, body, headers = {}) => new Request(`${origin}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
})

const catalogue = JSON.parse(fs.readFileSync(new URL('../public/recommender/catalogue.json', import.meta.url)))
const engine = await import('../public/recommender/engine.mjs')
const checkoutCrypto = load('lib/ai-checkout-details.ts', { '@/lib/site': { SITE_URL: origin } })
let dbFailure = false
const commerce = load('lib/ai-commerce.ts', {
  '@/lib/plan-recommender': { getPlanCatalogue: async () => {
    if (dbFailure) throw new Error('fixture database credentials must stay private')
    return catalogue
  } },
  '@/lib/storefront': { getStorefrontCheckout: async () => {
    if (dbFailure) throw new Error('fixture database credentials must stay private')
    return { product: { id: 7, name: 'Fixture SIM', price: 13.25, available: true }, couriers: [{ id: 2 }] }
  } },
  '@/lib/site': { SITE_URL: origin }, '@/public/recommender/engine.mjs': engine,
  '@/lib/ai-checkout-details': { ...checkoutCrypto, encryptCheckoutDetails: async () => 'private-fixture-token' },
})
const routeDependencies = { '@/lib/ai-commerce': commerce, '@/lib/ai-commerce-http': helper, '@/lib/site': { SITE_URL: origin } }
const getCatalogue = load('app/api/ai/catalogue/route.ts', routeDependencies).GET
const recommend = load('app/api/ai/recommend/route.ts', routeDependencies).POST
const checkout = load('app/api/ai/checkout/route.ts', routeDependencies).POST
const openapi = load('app/api/ai/openapi/route.ts', routeDependencies).GET

const fixtureDetails = {
  full_name: 'Fixture Customer', email: 'buyer@example.invalid', phone: '60123456789',
  address_line1: 'Fixture address', postcode: '50000', city: 'Kuala Lumpur', state: 'W.P. Kuala Lumpur',
}

test('bounded JSON parser preserves valid UTF-8 and accepts exactly 16 KiB', async () => {
  const valid = await helper.readCommerceJson(rawRequest('{"text":"你好"}', { 'content-type': 'application/json; charset=utf-8' }))
  assert.equal(valid.text, '你好')
  const atLimit = JSON.stringify('x'.repeat(16382))
  assert.equal(Buffer.byteLength(atLimit), 16384)
  assert.equal((await helper.readCommerceJson(rawRequest(atLimit))).length, 16382)
})

test('JSON parser enforces actual bytes for multibyte, chunked and falsely declared bodies', async () => {
  const multibyte = JSON.stringify({ value: '😀'.repeat(4100) })
  assert.ok(multibyte.length < 16384 && Buffer.byteLength(multibyte) > 16384)
  await assert.rejects(helper.readCommerceJson(rawRequest(multibyte)), { httpStatus: 413 })
  await assert.rejects(helper.readCommerceJson(rawRequest('x'.repeat(17000), { 'content-length': '1' })), { httpStatus: 413 })
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(9000))
    controller.enqueue(new Uint8Array(9000))
    controller.close()
  } })
  const chunked = new Request(`${origin}/api/ai/checkout`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half',
  })
  await assert.rejects(helper.readCommerceJson(chunked), { httpStatus: 413 })
  await assert.rejects(helper.readCommerceJson(rawRequest('{}', { 'content-length': '16385' })), { httpStatus: 413 })
})

test('JSON parser rejects malformed, empty, invalid UTF-8 and wrong media type', async () => {
  for (const body of ['', '{', 'undefined']) await assert.rejects(helper.readCommerceJson(rawRequest(body)), { httpStatus: 400 })
  await assert.rejects(helper.readCommerceJson(rawRequest(new Uint8Array([0x22, 0xc3, 0x28, 0x22]))), { httpStatus: 400 })
  await assert.rejects(helper.readCommerceJson(rawRequest('{}', { 'content-type': 'text/plain' })), { httpStatus: 415 })
  for (const length of ['invalid', '-1', '1.5']) {
    await assert.rejects(helper.readCommerceJson(rawRequest('{}', { 'content-length': length })), { httpStatus: 400 })
  }
  await assert.rejects(helper.readCommerceJson(new Request(`${origin}/api/ai/checkout`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
  })), { httpStatus: 400 })
})

test('Origin permits configured website and server clients, rejects foreign and null origins', async () => {
  rateAllowed = true
  for (const headers of [{}, { origin }]) {
    assert.equal((await checkout(jsonRequest('/api/ai/checkout', {}, headers))).status, 200)
  }
  for (const foreign of ['https://attacker.invalid', 'null', `${origin}/`]) {
    const response = await checkout(jsonRequest('/api/ai/checkout', {}, { origin: foreign }))
    assert.equal(response.status, 403)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
})

test('rate limiter uses the valid last trusted proxy hop and validated fallback IP', async () => {
  rateAllowed = true
  helper.commerceRateLimit(rawRequest('{}', { 'x-forwarded-for': '192.0.2.1, 203.0.113.7', 'x-real-ip': '198.51.100.1' }))
  assert.equal(lastRateKey, 'ai-commerce:203.0.113.7')
  for (const headers of [
    { 'x-real-ip': '198.51.100.1' },
    { 'x-forwarded-for': '192.0.2.1, invalid', 'x-real-ip': ' 198.51.100.1 ' },
    { 'x-forwarded-for': `${'x'.repeat(1025)}, 203.0.113.7`, 'x-real-ip': '198.51.100.1' },
  ]) {
    helper.commerceRateLimit(rawRequest('{}', headers))
    assert.equal(lastRateKey, 'ai-commerce:198.51.100.1')
  }
  helper.commerceRateLimit(rawRequest('{}', { 'x-forwarded-for': 'spoofed, 2001:db8::7' }))
  assert.equal(lastRateKey, 'ai-commerce:2001:db8::7')
  helper.commerceRateLimit(rawRequest('{}'))
  assert.equal(lastRateKey, 'ai-commerce:unknown')
  for (const headers of [
    { 'x-forwarded-for': '192.0.2.1, invalid', 'x-real-ip': 'invalid' },
    { 'x-forwarded-for': '192.0.2.1,' },
    { 'x-real-ip': 'https://198.51.100.1' },
  ]) {
    helper.commerceRateLimit(rawRequest('{}', headers))
    assert.equal(lastRateKey, 'ai-commerce:unknown')
  }
})

test('spoofing the first forwarded IP cannot reset the actual 60-per-minute bucket', async () => {
  const limiter = load('lib/rate-limit.ts')
  const realHelper = load('lib/ai-commerce-http.ts', {
    '@/lib/site': { SITE_URL: origin }, '@/lib/rate-limit': limiter, '@/lib/client-ip': clientIp,
  })
  for (let i = 0; i < 60; i++) {
    const spoofed = rawRequest('{}', { 'x-forwarded-for': `192.0.2.${i + 1}, 203.0.113.99` })
    assert.equal(realHelper.commerceRateLimit(spoofed).allowed, true)
  }
  const changedSpoof = rawRequest('{}', { 'x-forwarded-for': '198.51.100.250, 203.0.113.99' })
  const limit = realHelper.commerceRateLimit(changedSpoof)
  assert.equal(limit.allowed, false)
  const response = realHelper.commerceRateLimitError(limit)
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('x-ratelimit-remaining'), '0')
  assert.ok(Number(response.headers.get('retry-after')) > 0)
})

test('all discovered REST routes return a no-store rate-limit error and retry guidance', async () => {
  rateAllowed = false
  for (const [route, request] of [
    [getCatalogue, new Request(`${origin}/api/ai/catalogue`)],
    [openapi, new Request(`${origin}/api/ai/openapi`)],
    [recommend, jsonRequest('/api/ai/recommend', { dataGB: 100, budget: 35 })],
    [checkout, jsonRequest('/api/ai/checkout', {})],
  ]) {
    const response = await route(request)
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.ok(Number(response.headers.get('retry-after')) > 0)
    assert.equal((await response.json()).code, 'rate_limited')
  }
  rateAllowed = true
})

test('catalogue accepts one locale only and rejects unknown, repeated and invalid query parameters', async () => {
  rateAllowed = true
  const good = await getCatalogue(new Request(`${origin}/api/ai/catalogue?locale=zh`))
  assert.equal(good.status, 200)
  assert.equal((await good.json()).checkout_url, `${origin}/zh/order`)
  for (const query of ['locale=zh&locale=ms', 'locale=zh&email=buyer', 'locale=../en', 'locale=', 'price=0']) {
    const response = await getCatalogue(new Request(`${origin}/api/ai/catalogue?${query}`))
    assert.equal(response.status, 400)
    assert.equal((await response.json()).code, 'invalid_arguments')
  }
})

test('REST recommendation executes real plan logic and rejects additional or non-object arguments', async () => {
  rateAllowed = true
  const response = await recommend(jsonRequest('/api/ai/recommend', { dataGB: 100, budget: 35 }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).recommendation.plan.id, 'ez35')
  for (const body of [{ dataGB: 100, budget: 35, price: 0 }, null, [], 'text']) {
    const response = await recommend(jsonRequest('/api/ai/recommend', body))
    assert.equal(response.status, 400)
    assert.equal((await response.json()).code, 'invalid_arguments')
  }
  const malformed = await recommend(rawRequest('{'))
  assert.equal(malformed.status, 400)
})

test('REST checkout exposes assisted default, website choice, private prefill and customer confirmation', async () => {
  rateAllowed = true
  const defaultResponse = await checkout(jsonRequest('/api/ai/checkout', {}))
  const defaults = await defaultResponse.json()
  assert.equal(defaults.checkout_mode, 'assisted')
  assert.equal(defaults.details_prefilled, false)
  assert.equal(defaults.details_expire_in_seconds, null)
  assert.equal(defaults.customer_action_required, true)
  assert.equal(defaults.order_created, false)
  assert.equal(defaults.purchase_option, 'sim_only')
  assert.equal(defaults.estimated_charges.plan_fee, 0)
  assert.equal(defaults.payment_completed, false)
  assert.equal(defaults.estimated_charges.total, null)
  const manual = await checkout(jsonRequest('/api/ai/checkout', { checkout_mode: 'website' }))
  assert.equal((await manual.json()).checkout_mode, 'website')
  const assisted = await checkout(jsonRequest('/api/ai/checkout', { locale: 'zh', details: fixtureDetails }))
  const prefilled = await assisted.json()
  assert.equal(prefilled.details_prefilled, true)
  assert.equal(prefilled.details_expire_in_seconds, 900)
  assert.equal(new URL(prefilled.checkout_url).hash, '#ai_checkout=private-fixture-token')
  const bundled = await checkout(jsonRequest('/api/ai/checkout', { plan_id: 'ez35' })).then(r => r.json())
  assert.equal(bundled.purchase_option, 'sim_and_plan')
  assert.equal(bundled.estimated_charges.plan_fee, 35)
  assert.equal(bundled.estimated_charges.plan_fee_included, true)
  const simOnly = await checkout(jsonRequest('/api/ai/checkout', { plan_id: 'ez35', purchase_option: 'sim_only' })).then(r => r.json())
  assert.equal(simOnly.estimated_charges.plan_fee, 0)
  assert.equal(simOnly.purchase_option, 'sim_only')
  for (const body of [
    { checkout_mode: 'website', details: fixtureDetails },
    { checkout_mode: 'invalid' }, { redirect_url: 'https://attacker.invalid' }, { price: 0 },
    { purchase_option: 'sim_and_plan' }, { purchase_option: 'invalid' },
    { details: { ...fixtureDetails, otp: '123456' } },
  ]) assert.equal((await checkout(jsonRequest('/api/ai/checkout', body))).status, 400)
})

test('REST errors preserve public contract and never expose internal database errors', async () => {
  rateAllowed = true
  const unavailable = await checkout(jsonRequest('/api/ai/checkout', { plan_id: 'does-not-exist' }))
  assert.equal(unavailable.status, 409)
  assert.equal((await unavailable.json()).code, 'plan_unavailable')
  dbFailure = true
  const failure = await getCatalogue(new Request(`${origin}/api/ai/catalogue`))
  assert.equal(failure.status, 503)
  const body = await failure.json()
  assert.equal(body.status, 'error')
  assert.equal(body.code, 'service_unavailable')
  assert.ok(!body.message.includes('credentials'))
  dbFailure = false
  const unexpected = helper.commerceHttpError(new Error('private internal details'))
  assert.equal(unexpected.status, 503)
  assert.ok(!(await unexpected.text()).includes('private internal details'))
})

test('OpenAPI derives strict real input schemas, assisted defaults and only the three public tools', async () => {
  rateAllowed = true
  const response = await openapi(new Request(`${origin}/api/ai/openapi`))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  const doc = await response.json()
  assert.equal(doc.openapi, '3.1.0')
  assert.equal(doc.servers[0].url, origin)
  assert.deepEqual(doc.security, [])
  assert.deepEqual(Object.keys(doc.paths).sort(), ['/api/ai/catalogue', '/api/ai/checkout', '/api/ai/recommend'])
  const expected = [
    ['CatalogueInput', 'eastel_get_catalogue'],
    ['RecommendPlanInput', 'eastel_recommend_plan'],
    ['PrepareCheckoutInput', 'eastel_prepare_checkout'],
  ]
  for (const [schemaName, toolName] of expected) {
    assert.deepEqual(doc.components.schemas[schemaName], JSON.parse(JSON.stringify(z.toJSONSchema(commerce.commerceSchemas[toolName], { io: 'input' }))))
  }
  const input = doc.components.schemas.PrepareCheckoutInput
  assert.equal(input.additionalProperties, false)
  assert.equal(input.properties.checkout_mode.default, 'assisted')
  assert.deepEqual(input.properties.checkout_mode.enum, ['assisted', 'website'])
  assert.equal(input.properties.details.additionalProperties, false)
  assert.ok(input.properties.details.required.includes('email'))
  assert.ok(!('otp' in input.properties.details.properties))
  assert.ok(!doc.components.schemas.RecommendPlanInput.required.includes('locale'))
  const operations = Object.values(doc.paths).flatMap(path => Object.values(path))
  assert.deepEqual(operations.map(operation => operation.operationId).sort(), expected.map(([, name]) => name).sort())
  for (const operation of operations) {
    assert.equal(operation['x-openai-isConsequential'], false)
    assert.equal(operation.description, commerce.commerceToolDescriptions[operation.operationId])
  }
  const output = doc.components.schemas.CheckoutResult.properties
  assert.equal(output.order_created.const, false)
  assert.equal(output.payment_completed.const, false)
  assert.equal(output.customer_action_required.const, true)
  assert.equal(output.estimated_charges.properties.total.type, 'null')
  assert.ok('details_expire_in_seconds' in output)
})

test('documented success objects contain exactly the real public response fields', async () => {
  rateAllowed = true
  const doc = await (await openapi(new Request(`${origin}/api/ai/openapi`))).json()
  for (const [schemaName, response] of [
    ['CatalogueResult', await getCatalogue(new Request(`${origin}/api/ai/catalogue`))],
    ['RecommendationResult', await recommend(jsonRequest('/api/ai/recommend', { dataGB: 100, budget: 35 }))],
    ['CheckoutResult', await checkout(jsonRequest('/api/ai/checkout', {}))],
  ]) {
    assert.equal(response.status, 200)
    const body = await response.json()
    const schema = doc.components.schemas[schemaName]
    assert.deepEqual(Object.keys(body).sort(), Object.keys(schema.properties).sort())
    for (const required of schema.required) assert.ok(required in body)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
})

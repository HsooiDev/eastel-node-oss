import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { availablePlan, validateCatalogue } from '../public/recommender/engine.mjs'

// Exercise the real data contract without connecting to or modifying any database.
const storefrontUrl = new URL('../lib/storefront.ts', import.meta.url).href
const databaseStub = `data:text/javascript,${encodeURIComponent('export default { query: (...args) => globalThis.__eastelStorefrontQuery(...args) }')}`
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/db' && context.parentURL === storefrontUrl) {
      return { url: databaseStub, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { getStorefrontCheckout } = await import(storefrontUrl)
const product = (overrides = {}) => ({ id: 7, name: 'Eastel SIM', price: '12.50', stock: -1, ...overrides })
const courier = (overrides = {}) => ({
  id: 2, name: 'Courier', wm_fee: '5.00', em_fee: '12.00', labuan_fee: '14.50', ...overrides,
})

function fixture(products = [product()], couriers = [courier()]) {
  const calls = []
  globalThis.__eastelStorefrontQuery = async (sql) => {
    assert.match(sql, /^SELECT /, 'Public storefront must only read data')
    calls.push(sql)
    if (sql.includes('FROM products')) return [products]
    if (sql.includes('FROM couriers')) return [couriers]
    throw new Error(`Unexpected query: ${sql}`)
  }
  return calls
}

test('public contract uses the current SIM price and excludes administrative fields', async () => {
  const calls = fixture(
    [product({ secret: 'private product data' })],
    [courier({ tracking_url: 'private tracking metadata', is_active: 1 })],
  )
  assert.deepEqual(await getStorefrontCheckout(), {
    product: { id: 7, name: 'Eastel SIM', price: 12.5, available: true },
    couriers: [{ id: 2, name: 'Courier', wm_fee: '5.00', em_fee: '12.00', labuan_fee: '14.50' }],
  })
  assert.ok(calls.some(sql => sql.includes('FROM products WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1')),
    'Select the same single active SIM as orders/create')
  assert.ok(calls.some(sql => sql.includes('FROM couriers WHERE is_active = 1')),
    'Inactive couriers must not be offered at checkout')
  assert.ok(calls.every(sql => !sql.includes('SELECT *')), 'Read explicit public fields only')
})

test('missing or sold-out products never become a fabricated RM10 SIM', async () => {
  fixture([], [])
  assert.deepEqual(await getStorefrontCheckout(), { product: null, couriers: [] })
  fixture([product({ stock: 0 })])
  assert.equal((await getStorefrontCheckout()).product.available, false)
  fixture([product({ stock: 3, price: '0.00' })])
  assert.deepEqual((await getStorefrontCheckout()).product, { id: 7, name: 'Eastel SIM', price: 0, available: true })
})

test('invalid or nonfinite SIM prices fail closed', async () => {
  for (const price of ['', null, NaN, Infinity, -1, '-1.00', '1.999', 'broken', '1e2', '100000000.00']) {
    fixture([product({ price })])
    await assert.rejects(getStorefrontCheckout(), /Invalid storefront price/)
  }
})

test('malformed stock cannot be advertised as available', async () => {
  for (const stock of [null, undefined, true, NaN, -2, 1.5, '1.5', '']) {
    fixture([product({ stock })])
    await assert.rejects(getStorefrontCheckout(), /Invalid storefront stock/)
  }
})

test('invalid regional courier prices fail closed instead of suggesting free shipping', async () => {
  for (const feeName of ['wm_fee', 'em_fee', 'labuan_fee']) {
    for (const fee of ['', null, NaN, Infinity, -1, '1.999']) {
      fixture([product()], [courier({ [feeName]: fee })])
      await assert.rejects(getStorefrontCheckout(), /Invalid storefront price/)
    }
  }
})

test('database failure propagates so the API can return 503', async () => {
  const failure = new Error('Database unavailable')
  globalThis.__eastelStorefrontQuery = async () => { throw failure }
  await assert.rejects(getStorefrontCheckout(), error => error === failure)
})

const orderFormSource = fs.readFileSync(new URL('../app/[locale]/order/_components/OrderForm.tsx', import.meta.url), 'utf8')
const compiledForm = ts.transpileModule(orderFormSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const selectorModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/orders/order-plan-selector.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: selectorModule, exports: selectorModule.exports, require: () => ({}) })

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

// A small hook harness runs the actual form's async initialization and submit
// guards, including React's effect replay, without a DOM or external services.
function formHarness(saved = {}) {
  const hooks = []
  const effects = []
  const requests = []
  const historyChanges = []
  const auth = deferred()
  const draft = deferred()
  const storage = new Map([['eastel-order-form', JSON.stringify(saved)]])
  const location = { hash: '#ai_checkout=encrypted-fixture', pathname: '/zh/order', search: '?plan=ez50' }
  let cursor = 0
  let dirty = false
  let tree
  const react = {
    useState(initial) {
      const index = cursor++
      hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [hooks[index].value, value => {
        const next = typeof value === 'function' ? value(hooks[index].value) : value
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true }
      }]
    },
    useRef(initial) {
      const index = cursor++
      hooks[index] ??= { current: initial }
      return hooks[index]
    },
    useEffect(callback, deps) {
      const index = cursor++
      const previous = hooks[index]
      const changed = !previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))
      hooks[index] = { callback, deps, cleanup: previous?.cleanup }
      if (changed) effects.push(index)
    },
  }
  const response = data => ({ ok: true, json: async () => data })
  const jsx = (type, props) => ({ type, props })
  const module = { exports: {} }
  const context = {
    module, exports: module.exports, crypto: globalThis.crypto, AbortSignal, setTimeout, clearTimeout, URLSearchParams,
    window: {
      location,
      history: { state: null, replaceState(_state, _title, url) { historyChanges.push(url); location.hash = '' } },
    },
    document: { hidden: false, addEventListener() {}, removeEventListener() {}, getElementById() { return null } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, options = {}) => {
      requests.push({ url, options })
      if (url === '/api/auth/check') return auth.promise
      if (url === '/api/ai/checkout-details') return draft.promise
      if (url === '/api/plan-recommender') return response({ status: 'success', catalogue: JSON.parse(fs.readFileSync(new URL('../public/recommender/catalogue.json', import.meta.url), 'utf8')) })
      if (url === '/api/storefront/checkout') return response({
        status: 'success', product: { id: 7, name: 'SIM', price: 12.5, available: true },
        couriers: [courier()],
      })
      if (url === '/api/payment/check-dnqr') return response({ status: 'success', available: false })
      if (url.startsWith('/api/auth/check-email')) return response({ status: 'success', registered: false })
      if (url.startsWith('/api/orders/zone')) return response({ status: 'success', zone: 'WM' })
      throw new Error(`Unexpected request: ${url}`)
    },
    require(specifier) {
      if (specifier === 'react') return react
      if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (specifier === 'next/navigation') return { useRouter: () => ({ push() {} }) }
      if (specifier === '@/lib/i18n') return { t: (translations, key, fallback) => translations[key] ?? fallback }
      if (specifier === '@/components/orders/order-plan-selector') return selectorModule.exports
      if (specifier === '@/public/recommender/engine.mjs') return { availablePlan, validateCatalogue }
      return {}
    },
  }
  vm.runInNewContext(compiledForm, context, { filename: 'OrderForm.fixture.js' })
  const render = () => {
    dirty = false
    cursor = 0
    tree = module.exports.default({ locale: 'zh', tr: {} })
    for (const index of effects.splice(0)) {
      hooks[index].cleanup?.()
      hooks[index].cleanup = hooks[index].callback()
    }
  }
  render()
  const find = predicate => {
    const visit = node => {
      if (!node || typeof node !== 'object') return null
      if (predicate(node)) return node
      for (const child of [node.props?.children].flat(Infinity)) {
        const found = visit(child)
        if (found) return found
      }
      return null
    }
    return visit(tree)
  }
  return {
    requests, historyChanges, auth, draft, response, find,
    replayEffects() {
      for (const hook of hooks) {
        if (hook?.callback) { hook.cleanup?.(); hook.cleanup = hook.callback() }
      }
    },
    async settle() {
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setImmediate(resolve))
        if (!dirty) return
        render()
      }
      throw new Error('Form did not settle')
    },
  }
}

const draftDetails = {
  full_name: 'Draft Customer', email: 'draft@example.test', phone: '+60123456789',
  address_line1: 'Draft address', postcode: '50000', city: 'Kuala Lumpur', state: 'W.P. Kuala Lumpur',
}

test('AI guest prefill strips its fragment, requires verification and cannot create an order automatically', async () => {
  const form = formHarness({ email: 'old@example.test', address1: 'Old address' })
  assert.deepEqual(form.historyChanges, ['/zh/order?plan=ez50'])
  const exchange = form.requests.find(request => request.url === '/api/ai/checkout-details')
  assert.equal(exchange.options.method, 'POST')
  assert.deepEqual(JSON.parse(exchange.options.body), { token: 'encrypted-fixture' })
  form.auth.resolve(form.response({ status: 'success', authenticated: false }))
  form.draft.resolve(form.response({ status: 'success', details: draftDetails }))
  await form.settle()
  assert.equal(form.find(node => node.props?.id === 'email').props.value, draftDetails.email)
  assert.equal(form.find(node => node.props?.id === 'email').props.disabled, false, 'Draft email must not be pre-verified')
  assert.equal(form.find(node => node.props?.id === 'phone').props.value, '123456789', 'The fixed +60 prefix must not be duplicated by AI prefill')
  assert.equal(form.find(node => node.props?.id === 'addr1').props.value, draftDetails.address_line1)
  assert.equal(form.find(node => node.type === 'fieldset').props.disabled, false)
  // Postcode alone still goes through the existing public zone lookup.
  for (const personalValue of [draftDetails.full_name, draftDetails.email, draftDetails.phone, draftDetails.address_line1]) {
    assert.ok(form.requests.every(request => !request.url.includes(encodeURIComponent(personalValue))), 'AI handoff must not add personal details to request URLs')
  }
  form.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  await form.settle()
  assert.ok(form.requests.every(request => request.url !== '/api/orders/create'), 'Prefill must never submit a purchase without verification')
})

test('session identity wins over draft email regardless of request completion order', async () => {
  for (const sessionFirst of [true, false]) {
    const form = formHarness({ address1: 'Old address' })
    const resolveSession = () => form.auth.resolve(form.response({ status: 'success', customer: { email: 'account@example.test' }, emailVerified: true }))
    const resolveDraft = () => form.draft.resolve(form.response({ status: 'success', details: draftDetails }))
    if (sessionFirst) resolveSession(); else resolveDraft()
    await form.settle()
    assert.equal(form.find(node => node.type === 'fieldset').props.disabled, true)
    if (sessionFirst) resolveDraft(); else resolveSession()
    await form.settle()
    const email = form.find(node => node.props?.id === 'email')
    assert.equal(email.props.value, 'account@example.test')
    assert.equal(email.props.disabled, true)
    assert.equal(form.find(node => node.props?.id === 'addr1').props.value, draftDetails.address_line1)
  }
})

test('expired drafts leave saved manual checkout fields usable', async () => {
  const form = formHarness({ email: 'manual@example.test', address1: 'Manual address' })
  form.auth.resolve(form.response({ status: 'success', authenticated: false }))
  form.draft.resolve({ ok: false, json: async () => ({ status: 'error' }) })
  await form.settle()
  assert.equal(form.find(node => node.props?.id === 'email').props.value, 'manual@example.test')
  assert.equal(form.find(node => node.props?.id === 'addr1').props.value, 'Manual address')
  assert.equal(form.find(node => node.type === 'fieldset').props.disabled, false)
  assert.match(form.find(node => node.props?.role === 'status').props.children, /已过期或无效/)
})

test('React effect replay does not lose the removed AI fragment or exchange it twice', async () => {
  const form = formHarness()
  form.replayEffects()
  form.auth.resolve(form.response({ status: 'success', authenticated: false }))
  form.draft.resolve(form.response({ status: 'success', details: draftDetails }))
  await form.settle()
  assert.equal(form.requests.filter(request => request.url === '/api/ai/checkout-details').length, 1)
  assert.equal(form.historyChanges.length, 1)
  assert.equal(form.find(node => node.props?.id === 'addr1').props.value, draftDetails.address_line1)
})

test('an unverified signed-in account email is not silently marked verified by a draft', async () => {
  const form = formHarness()
  form.auth.resolve(form.response({ status: 'success', customer: { email: 'unverified@example.test' }, emailVerified: false }))
  form.draft.resolve(form.response({ status: 'success', details: draftDetails }))
  await form.settle()
  assert.equal(form.find(node => node.props?.id === 'email').props.value, 'unverified@example.test')
  assert.equal(form.find(node => node.type === 'span' && node.props?.children === 'ordVerified'), null)
  form.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  await form.settle()
  assert.ok(form.requests.every(request => request.url !== '/api/orders/create'))
})

await import('./verify-theme-provider.mjs')

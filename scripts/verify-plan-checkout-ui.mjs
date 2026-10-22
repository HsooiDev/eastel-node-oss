import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { availablePlan, validateCatalogue } from '../public/recommender/engine.mjs'

const compile = file => ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const jsx = (type, props) => ({ type, props })
const selectorModule = { exports: {} }
vm.runInNewContext(compile('components/orders/order-plan-selector.tsx'), {
  module: selectorModule, exports: selectorModule.exports,
  require: () => ({ jsx, jsxs: jsx }),
})
const selector = selectorModule.exports
const compiledForm = compile('app/[locale]/order/_components/OrderForm.tsx')
const plan = (overrides = {}) => ({
  id: 'ez35', name: 'EZ35', price: 35, dataGB: 200, hotspotGB: 100,
  roamingGB: 0, hotspotMode: 'separate', validityDays: 30, status: 'available', ...overrides,
})
const catalogue = plans => ({ version: 1, plans: plans ?? [plan()] })
const response = (data, ok = true) => ({ ok, json: async () => data })
const descendants = tree => {
  const nodes = []
  const visit = node => {
    if (!node || typeof node !== 'object') return
    nodes.push(node)
    for (const child of [node.props?.children].flat(Infinity)) visit(child)
  }
  visit(tree)
  return nodes
}
const text = tree => descendants(tree).flatMap(node => [node.props?.children].flat(Infinity).filter(value => typeof value === 'string')).join(' ')

// Exercise the actual form's state, requests and submit protection without a
// database or payment gateway. Component props remain observable in its JSX.
function harness(search = '', options = {}) {
  const hooks = []
  const effects = []
  const requests = []
  const timers = new Set()
  const Turnstile = () => null
  const Button = () => null
  let cursor = 0
  let dirty = false
  let tree
  let catalogueReply = options.catalogueReply ?? response({ status: 'success', catalogue: catalogue() })
  let orderReply = options.orderReply ?? response({ status: 'success', payment_url: 'https://gateway.example.test/authorize' })
  const saved = {
    fullName: 'Checkout Customer', email: 'customer@example.test', phone: '123456789',
    address1: '18 Test Road', postcode: '50000', city: 'Kuala Lumpur', stateName: 'W.P. Kuala Lumpur',
  }
  const storage = new Map([['eastel-order-form', JSON.stringify(saved)]])
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
  const module = { exports: {} }
  vm.runInNewContext(compiledForm, {
    module, exports: module.exports, crypto: globalThis.crypto, AbortSignal, URLSearchParams,
    setTimeout: (callback, ms) => { const id = setTimeout(callback, ms); id.unref(); timers.add(id); return id }, clearTimeout,
    window: { location: { hash: '', pathname: '/en/order', search }, history: { replaceState() {} } },
    document: { hidden: false, addEventListener() {}, removeEventListener() {}, getElementById() { return null } },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
    },
    fetch: async (url, fetchOptions = {}) => {
      requests.push({ url, options: fetchOptions })
      if (url === '/api/plan-recommender') return catalogueReply
      if (url === '/api/auth/check') return response(options.guest ? { status: 'error' } : { status: 'success', customer: { email: saved.email }, emailVerified: !options.unverified })
      if (url.startsWith('/api/auth/check-email?')) return response({ status: 'success', registered: !!options.registered })
      if (url === '/api/auth/send-otp') return options.otpReply ?? response({ status: 'success', token: 'a'.repeat(64) })
      if (url === '/api/auth/verify-otp') return response({ status: 'success' })
      if (url === '/api/auth/verify-email') return response({ status: 'success', emailVerified: true })
      if (url === '/api/storefront/checkout') return response({
        status: 'success', product: { id: 1, name: 'SIM', price: 12.5, available: true },
        couriers: [{ id: 1, name: 'Courier', wm_fee: 8, em_fee: 15, labuan_fee: 15 }],
      })
      if (url === '/api/payment/check-dnqr') return response({ status: 'success', available: false })
      if (url.startsWith('/api/orders/zone')) return response({ status: 'success', zone: 'WM' })
      if (url === '/api/orders/create') return orderReply
      if (url === '/api/vouchers?action=validate') return response({ status: 'success', discount: 5 })
      throw new Error(`Unexpected fixture request: ${url}`)
    },
    require(specifier) {
      if (specifier === 'react') return react
      if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (specifier === 'next/navigation') return { useRouter: () => ({ push() {} }) }
      if (specifier === '@/lib/i18n') return { t: (translations, key, fallback) => translations[key] ?? fallback }
      if (specifier === '@/components/orders/order-plan-selector') return selector
      if (specifier === '@/public/recommender/engine.mjs') return { availablePlan, validateCatalogue }
      if (specifier === '@/components/turnstile-widget') return { TurnstileWidget: Turnstile }
      if (specifier === '@/components/ui/button') return { Button }
      return {}
    },
  })
  const render = () => {
    dirty = false
    cursor = 0
    tree = module.exports.default({ locale: options.locale ?? 'en', tr: {} })
    for (const index of effects.splice(0)) {
      hooks[index].cleanup?.()
      hooks[index].cleanup = hooks[index].callback()
    }
  }
  render()
  const find = predicate => descendants(tree).find(predicate)
  return {
    requests, find,
    get widget() { return find(node => node.type === Turnstile) },
    button(label) { return find(node => node.type === 'button' && text(node).includes(label)) },
    dispose() { for (const id of timers) clearTimeout(id) },
    get selector() { return find(node => node.type === selector.OrderPlanSelector).props },
    get text() { return text(tree) },
    get paymentDisabled() { return find(node => node.type === Button && node.props.onClick).props.disabled },
    get submitted() { return requests.filter(request => request.url === '/api/orders/create').map(request => JSON.parse(request.options.body)) },
    setCatalogueReply(reply) { catalogueReply = reply },
    setOrderReply(reply) { orderReply = reply },
    authorizeSecurityCheck() { find(node => node.type === Turnstile).props.onToken('customer-security-check') },
    submit() { find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }) },
    async settle() {
      for (let i = 0; i < 25; i++) {
        await new Promise(resolve => setImmediate(resolve))
        if (!dirty) return
        render()
      }
      throw new Error('Checkout fixture did not settle')
    },
  }
}

test('SIM-only and recommendation-only links do not add a plan charge or record a purchase', async () => {
  for (const search of ['', '?plan=ez35', '?purchase=sim_only&plan=ez35', '?purchase=unknown&plan=ez35']) {
    const form = harness(search)
    await form.settle()
    assert.equal(form.selector.purchaseMode, 'sim_only')
    assert.match(form.text, /RM 20\.50/)
    form.authorizeSecurityCheck()
    await form.settle()
    form.submit()
    await form.settle()
    assert.equal(form.submitted.length, 1)
    assert.equal(form.submitted[0].plan_id, undefined)
    assert.equal(form.submitted[0].plan_price_cents, undefined)
  }
})

test('guest OTP consumes its scoped CAPTCHA; guest and unverified account checkout require fresh proof', async () => {
  for (const options of [{ guest: true }, { guest: true, registered: true }, { unverified: true }]) {
    const form = harness('', options)
    try {
      await form.settle()
      assert.equal(form.widget.props.action, 'order')
      if (options.registered) form.button('ordRegYes').props.onClick()
      else form.button('ordVerifyBtn').props.onClick()
      await form.settle()
      assert.equal(form.requests.filter(r => r.url === '/api/auth/send-otp').length, 0)
      assert.ok(form.button('ordVerifyBtn'), 'security check prompt leaves a retry action')
      form.authorizeSecurityCheck(); await form.settle()
      const oldWidget = form.widget
      form.button('ordVerifyBtn').props.onClick(); await form.settle()
      const issuance = form.requests.find(r => r.url === '/api/auth/send-otp')
      assert.equal(JSON.parse(issuance.options.body)['cf-turnstile-response'], 'customer-security-check')
      assert.notEqual(form.widget.props, oldWidget.props)
      form.find(node => node.props?.placeholder === '000000').props.onChange({ target: { value: '123456' } })
      await form.settle()
      const verification = form.requests.find(r => r.url === (options.unverified ? '/api/auth/verify-email' : '/api/auth/verify-otp'))
      assert.equal(JSON.parse(verification.options.body).token, 'a'.repeat(64))
      form.submit(); await form.settle()
      assert.equal(form.submitted.length, 0, 'consumed OTP CAPTCHA cannot authorize a payment')
      form.authorizeSecurityCheck(); await form.settle(); form.submit(); await form.settle()
      assert.equal(form.submitted.length, 1)
      assert.equal(form.submitted[0].guest_override, !!options.registered)
    } finally { form.dispose() }
  }
})

test('OTP issuance failure also clears the token and leaves an ordinary retry', async () => {
  const form = harness('', { guest: true, otpReply: response({ status: 'error', message: 'Synthetic mail unavailable' }, false) })
  try {
    await form.settle(); form.authorizeSecurityCheck(); await form.settle()
    form.button('ordVerifyBtn').props.onClick(); await form.settle()
    form.button('ordVerifyBtn').props.onClick(); await form.settle()
    assert.equal(form.requests.filter(r => r.url === '/api/auth/send-otp').length, 1)
  } finally { form.dispose() }
})

test('explicit bundle quotes a separate fee and sends only plan ID and consent-price comparison', async () => {
  const form = harness('?purchase=sim_and_plan&plan=EZ35')
  await form.settle()
  assert.equal(form.selector.purchaseMode, 'sim_and_plan')
  assert.equal(form.selector.selectedPlan.id, 'ez35')
  assert.match(form.text, /Mobile plan \(one purchase\)/)
  assert.match(form.text, /RM 35\.00/)
  assert.match(form.text, /RM 55\.50/)
  assert.match(text(selector.OrderPlanSelector(form.selector)), /register it in the official app/)
  form.submit()
  await form.settle()
  assert.equal(form.submitted.length, 0, 'A quoted plan does not bypass CAPTCHA')
  form.authorizeSecurityCheck()
  await form.settle()
  form.submit()
  await form.settle()
  assert.equal(form.submitted[0].plan_id, 'ez35')
  assert.equal(form.submitted[0].plan_price_cents, 3500)
  for (const forbidden of ['plan_snapshot', 'plan_price', 'plan_name', 'total_amount']) assert.equal(form.submitted[0][forbidden], undefined)
})

test('missing, unknown and inactive bundle selections block checkout until an explicit alternative', async () => {
  for (const [search, plans] of [
    ['?purchase=sim_and_plan', [plan()]],
    ['?purchase=sim_and_plan&plan=unknown', [plan()]],
    ['?purchase=sim_and_plan&plan=ez35', [plan({ status: 'inactive' })]],
  ]) {
    const form = harness(search, { catalogueReply: response({ status: 'success', catalogue: catalogue(plans) }) })
    await form.settle()
    form.authorizeSecurityCheck()
    await form.settle()
    assert.equal(form.paymentDisabled, true)
    form.submit()
    await form.settle()
    assert.equal(form.submitted.length, 0)
    assert.equal(form.selector.purchaseMode, 'sim_and_plan', 'Unavailable plans must not silently downgrade')
    form.selector.onPurchaseModeChange('sim_only')
    await form.settle()
    assert.match(form.text, /RM 20\.50/)
    form.submit()
    await form.settle()
    assert.equal(form.submitted.length, 1)
    assert.equal(form.submitted[0].plan_id, undefined)
  }
})

test('failed or corrupt live catalogue never uses stale defaults and a retry restores bundle checkout', async () => {
  for (const reply of [response({ status: 'error' }, false), response({ status: 'success', catalogue: { version: 1, plans: [plan({ price: -1 })] } })]) {
    const form = harness('?purchase=sim_and_plan&plan=ez35', { catalogueReply: reply, locale: 'zh' })
    await form.settle()
    assert.equal(form.selector.failed, true)
    assert.equal(form.paymentDisabled, true)
    assert.match(text(selector.OrderPlanSelector(form.selector)), /暂时无法获取套餐/)
    form.setCatalogueReply(response({ status: 'success', catalogue: catalogue() }))
    form.selector.onRetry()
    await form.settle()
    assert.equal(form.selector.failed, false)
    assert.equal(form.paymentDisabled, false)
    assert.match(form.text, /RM 55\.50/)
  }
})

test('a customer can select a plan and later remove it without losing SIM checkout details', async () => {
  const form = harness()
  await form.settle()
  form.selector.onPurchaseModeChange('sim_and_plan')
  await form.settle()
  assert.equal(form.paymentDisabled, true)
  form.selector.onPlanChange('ez35')
  await form.settle()
  assert.match(form.text, /RM 55\.50/)
  form.selector.onPurchaseModeChange('sim_only')
  await form.settle()
  assert.match(form.text, /RM 20\.50/)
  assert.equal(form.find(node => node.props?.id === 'fullName').props.value, 'Checkout Customer')
})

test('voucher eligibility excludes the mobile plan and preserves its full price', async () => {
  const form = harness('?purchase=sim_and_plan&plan=ez35')
  await form.settle()
  form.find(node => node.props?.placeholder === 'Promo Code').props.onChange({ target: { value: 'SIM5' } })
  await form.settle()
  form.find(node => node.type === 'button' && node.props.children === 'Apply').props.onClick()
  await form.settle()
  const validation = form.requests.find(request => request.url === '/api/vouchers?action=validate')
  assert.equal(JSON.parse(validation.options.body).subtotal, 20.5)
  assert.match(form.text, /RM 50\.50/)
  assert.match(form.text, /RM 35\.00/)
})

test('a changed server quote refreshes price, clears CAPTCHA and requires a new customer action', async () => {
  const form = harness('?purchase=sim_and_plan&plan=ez35', {
    orderReply: response({ status: 'error', error_code: 'plan_price_changed', message: 'The plan price changed. Review your total.' }, false),
  })
  await form.settle()
  form.authorizeSecurityCheck()
  await form.settle()
  form.setCatalogueReply(response({ status: 'success', catalogue: catalogue([plan({ price: 37 })]) }))
  form.submit()
  await form.settle()
  assert.equal(form.submitted.length, 1)
  assert.match(form.text, /RM 57\.50/)
  assert.match(form.text, /price changed/)
  form.submit()
  await form.settle()
  assert.equal(form.submitted.length, 1, 'Price refresh cannot reattempt payment automatically')
  form.authorizeSecurityCheck()
  form.setOrderReply(response({ status: 'success', payment_url: 'https://gateway.example.test/authorize' }))
  await form.settle()
  form.submit()
  await form.settle()
  assert.equal(form.submitted[1].plan_price_cents, 3700)
})

test('selector presents all three languages, shared hotspot and no automatic renewal', () => {
  for (const locale of ['en', 'ms', 'zh']) {
    const chosen = plan({ hotspotMode: 'shared', hotspotGB: 200 })
    const tree = selector.OrderPlanSelector({
      locale, purchaseMode: 'sim_and_plan', selectedPlanId: 'ez35', plans: [chosen], selectedPlan: chosen,
      loading: false, failed: false, disabled: false,
      onPurchaseModeChange() {}, onPlanChange() {}, onRetry() {},
    })
    const copy = selector.ORDER_PLAN_COPY[locale]
    assert.ok(text(tree).includes(copy.simOnly))
    assert.ok(text(tree).includes(copy.activation))
    assert.ok(text(tree).includes(copy.shared))
    assert.equal(descendants(tree).filter(node => node.type === 'input' && node.props.type === 'radio').length, 2)
  }
})

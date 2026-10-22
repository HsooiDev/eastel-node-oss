import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

// This same test file runs in either checkout without network, database, or app startup.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isNode = fs.existsSync(path.join(root, 'public/recommender/engine.mjs'))
const assets = path.join(root, isNode ? 'public/recommender' : 'recommender')
const { validateCatalogue, recommend, availablePlan } = await import(pathToFileURL(path.join(assets, 'engine.mjs')))
const { COPY } = await import(pathToFileURL(path.join(assets, 'copy.mjs')))
const catalogue = (plans = []) => ({ version: 1, plans })
const plan = (overrides = {}) => ({
  id: 'standard', name: 'Standard', price: 35, dataGB: 100, hotspotGB: 10,
  roamingGB: 1, hotspotMode: 'separate', validityDays: 30, status: 'available',
  ...overrides,
})
const needs = (overrides = {}) => ({
  dataGB: 0, hotspotGB: 0, roamingGB: 0, budget: 100, minValidityDays: 30,
  ...overrides,
})
const clone = (value) => structuredClone(value)

class FakeEventTarget {
  constructor() {
    this.listeners = new Map()
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? []
    this.listeners.set(type, handlers.filter((entry) => entry !== handler))
  }

  dispatchEvent(event) {
    if (!event || !event.type) throw new TypeError('An event type is required')
    if (!event.target) event.target = this
    for (const handler of [...(this.listeners.get(event.type) ?? [])]) handler.call(this, event)
    return !event.defaultPrevented
  }
}

class FakeClassList {
  constructor(value = '') {
    this.values = new Set(String(value).split(/\s+/).filter(Boolean))
  }

  add(...values) { values.forEach((value) => this.values.add(value)) }
  remove(...values) { values.forEach((value) => this.values.delete(value)) }
  contains(value) { return this.values.has(value) }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName) {
    super()
    this.tagName = String(tagName).toUpperCase()
    this.children = []
    this.parentNode = null
    this.className = ''
    this.classList = new FakeClassList()
    this.attributes = new Map()
    this.dataset = {}
    this.textContent = ''
    this.disabled = false
    this.hidden = false
    this.value = ''
  }

  get firstChild() { return this.children[0] ?? null }

  appendChild(child) {
    if (!child) return child
    if (child.parentNode) child.parentNode.removeChild(child)
    this.children.push(child)
    child.parentNode = this
    return child
  }

  append(...children) { children.forEach((child) => this.appendChild(child)) }

  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index < 0) throw new Error('Child not found')
    this.children.splice(index, 1)
    child.parentNode = null
    return child
  }

  setAttribute(name, value) {
    const stringValue = String(value)
    this.attributes.set(name, stringValue)
    if (name === 'class') {
      this.className = stringValue
      this.classList = new FakeClassList(stringValue)
    } else if (name === 'id') {
      this.id = stringValue
    } else if (name === 'name') {
      this.name = stringValue
    } else if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      this.dataset[key] = stringValue
    }
  }

  getAttribute(name) { return this.attributes.get(name) ?? null }

  querySelectorAll(selector) {
    const selectors = String(selector).split(',').map((entry) => entry.trim()).filter(Boolean)
    const matches = (node) => selectors.some((entry) => entry === '*' || entry.toLowerCase() === node.tagName.toLowerCase())
    const result = []
    const visit = (node) => {
      for (const child of node.children) {
        if (matches(child)) result.push(child)
        visit(child)
      }
    }
    visit(this)
    return result
  }
}

class FakeDocument extends FakeEventTarget {
  constructor(lang = 'en') {
    super()
    this.documentElement = { lang }
    this.baseURI = 'http://fixture.test/en/plans'
  }

  createElement(tagName) { return new FakeElement(tagName) }
}

function fakeWindow(search = '') {
  const target = new FakeEventTarget()
  target.location = { href: `http://fixture.test/en/order${search}`, pathname: '/en/order', search }
  return target
}

function findElements(node, predicate) {
  const result = []
  const visit = (current) => {
    if (predicate(current)) result.push(current)
    for (const child of current.children ?? []) visit(child)
  }
  visit(node)
  return result
}

function textOf(node) {
  return [node.textContent ?? '', ...(node.children ?? []).map((child) => textOf(child))].join(' ')
}

function responseFor(input, extra = {}) {
  return { ok: true, json: async () => ({ status: 'success', catalogue: clone(input), ...extra }) }
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

function installBrowserGlobals(documentValue, windowValue, fetchValue) {
  const previous = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch }
  globalThis.document = documentValue
  globalThis.window = windowValue
  globalThis.fetch = fetchValue
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
}

function expectResult(input, requirements, status, id = null, shortfall = 0) {
  const actual = recommend(input, requirements)
  assert.equal(actual.status, status)
  assert.equal(actual.plan?.id ?? null, id)
  if (id === null) assert.equal(actual.plan, null)
  assert.equal(typeof actual.shortfall, 'number')
  assert.ok(Number.isFinite(actual.shortfall))
  assert.ok(Math.abs(actual.shortfall - shortfall) < 1e-9,
    `expected shortfall ${shortfall}, got ${actual.shortfall}`)
  return actual
}

test('default catalogue is valid and includes the five initial EZ plans', () => {
  const defaults = JSON.parse(fs.readFileSync(path.join(assets, 'catalogue.json'), 'utf8'))
  assert.equal(validateCatalogue(defaults), true)
  for (const id of ['ez15', 'ez35', 'ez50', 'ez68', 'ez98']) {
    assert.ok(defaults.plans.some((entry) => entry.id === id), `missing ${id}`)
  }
  assert.equal(defaults.plans.find((entry) => entry.id === 'ez15').validityDays, 15)
  expectResult(defaults, needs({ dataGB: 30, minValidityDays: 15 }), 'match', 'ez15')
  expectResult(defaults, needs({ dataGB: 200, hotspotGB: 100, minValidityDays: 30 }), 'match', 'ez35')
  expectResult(defaults, needs({ dataGB: 201, minValidityDays: 30 }), 'match', 'ez50')
  expectResult(defaults, needs({ dataGB: 501, minValidityDays: 30 }), 'match', 'ez68')
  expectResult(defaults, needs({ dataGB: 701, minValidityDays: 30 }), 'match', 'ez98')
  expectResult(defaults, needs({ dataGB: 1000, minValidityDays: 30 }), 'no_match', 'ez98')
  expectResult(defaults, needs({ roamingGB: 3, budget: 98, minValidityDays: 30 }), 'match', 'ez50')
  expectResult(defaults, needs({ roamingGB: 3.01, budget: 98, minValidityDays: 30 }), 'match', 'ez68')
  expectResult(defaults, needs({ roamingGB: 5.01, budget: 98, minValidityDays: 30 }), 'match', 'ez98')
  expectResult(defaults, needs({ roamingGB: 10.01, budget: 98, minValidityDays: 30 }), 'no_match', 'ez98')
})

test('English, Malay and Chinese copy expose the same keys', () => {
  const expected = Object.keys(COPY.en).sort()
  for (const locale of ['en', 'ms', 'zh']) assert.deepEqual(Object.keys(COPY[locale]).sort(), expected, locale)
})

test('separate allowances include exact data, hotspot, roaming, budget and validity boundaries', () => {
  expectResult(catalogue([plan()]), needs({
    dataGB: 100, hotspotGB: 10, roamingGB: 1, budget: 35, minValidityDays: 30,
  }), 'match', 'standard')
  for (const exceeded of [
    { dataGB: 100.01 }, { hotspotGB: 10.01 }, { roamingGB: 1.01 }, { minValidityDays: 31 },
  ]) {
    expectResult(catalogue([plan()]), needs(exceeded), 'no_match', 'standard')
  }
})

test('shared hotspot consumes the total data allowance and retains its own cap', () => {
  const shared = catalogue([plan({ dataGB: 100, hotspotGB: 30, hotspotMode: 'shared' })])
  expectResult(shared, needs({ dataGB: 70, hotspotGB: 30 }), 'match', 'standard')
  expectResult(shared, needs({ dataGB: 70.01, hotspotGB: 30 }), 'no_match', 'standard')
  expectResult(shared, needs({ dataGB: 60, hotspotGB: 30.01 }), 'no_match', 'standard')
  expectResult(shared, needs({ dataGB: 100, hotspotGB: 0 }), 'match', 'standard')
  expectResult(shared, needs({ dataGB: 100, hotspotGB: 0.01 }), 'no_match', 'standard')
})

test('shared decimal sums tolerate binary floating point without accepting a real excess', () => {
  const shared = catalogue([plan({ dataGB: 0.3, hotspotGB: 0.2, hotspotMode: 'shared' })])
  expectResult(shared, needs({ dataGB: 0.1, hotspotGB: 0.2 }), 'match', 'standard')
  expectResult(shared, needs({ dataGB: 0.100000000001, hotspotGB: 0.2 }), 'no_match', 'standard')
})

test('separate hotspot does not consume the phone data allowance', () => {
  expectResult(catalogue([plan({ dataGB: 100, hotspotGB: 30 })]),
    needs({ dataGB: 100, hotspotGB: 30 }), 'match', 'standard')
})

test('zero usage and a free plan are valid, while zero budget is a hard ceiling', () => {
  expectResult(catalogue([plan({ id: 'free', price: 0, dataGB: 0, hotspotGB: 0, roamingGB: 0 })]),
    needs({ budget: 0 }), 'match', 'free')
  expectResult(catalogue([plan()]), needs({ budget: 0 }), 'over_budget', 'standard', 35)
})

test('budget is inclusive; a one-cent shortfall is reported without claiming a match', () => {
  const input = catalogue([plan({ price: 35.1 })])
  expectResult(input, needs({ budget: 35.1 }), 'match', 'standard')
  expectResult(input, needs({ budget: 35.09 }), 'over_budget', 'standard', 0.01)
})

test('the cheapest complete fit wins regardless of catalogue order or extra quota', () => {
  const plans = [
    plan({ id: 'luxury', price: 98, dataGB: 1000 }),
    plan({ id: 'insufficient', price: 15, dataGB: 10 }),
    plan({ id: 'best-fit', price: 35 }),
    plan({ id: 'middle', price: 50 }),
  ]
  for (const entries of [plans, [...plans].reverse()]) {
    expectResult(catalogue(entries), needs({ dataGB: 80 }), 'match', 'best-fit')
    expectResult(catalogue(entries), needs({ dataGB: 80, budget: 30 }), 'over_budget', 'best-fit', 5)
  }
})

test('an affordable plan lacking required capabilities is never a budget fallback', () => {
  const input = catalogue([
    plan({ id: 'cheap-no-roaming', price: 15, roamingGB: 0 }),
    plan({ id: 'roaming-fit', price: 50, roamingGB: 5 }),
  ])
  expectResult(input, needs({ roamingGB: 5, budget: 35 }), 'over_budget', 'roaming-fit', 15)
  expectResult(input, needs({ roamingGB: 5.01, budget: 1000 }), 'no_match', 'roaming-fit')
})

test('validity is explicit: 15 days fits 15 days but cannot satisfy 30 days', () => {
  const input = catalogue([
    plan({ id: 'short', price: 15, validityDays: 15 }),
    plan({ id: 'monthly', price: 35, validityDays: 30 }),
  ])
  expectResult(input, needs({ minValidityDays: 15 }), 'match', 'short')
  expectResult(input, needs({ minValidityDays: 16 }), 'match', 'monthly')
  expectResult(input, needs({ minValidityDays: 30, budget: 15 }), 'over_budget', 'monthly', 20)
  expectResult(input, needs({ minValidityDays: 31 }), 'no_match', 'monthly')
  expectResult(catalogue([plan({ validityDays: 366 })]), needs({ minValidityDays: 366 }), 'match', 'standard')
  expectResult(catalogue([plan({ validityDays: 1 })]), needs({ minValidityDays: 1 }), 'match', 'standard')
})

test('Coming Soon and inactive entries are excluded from recommendations and order lookup', () => {
  const input = catalogue([
    plan({ id: 'soon', price: 0, status: 'coming_soon' }),
    plan({ id: 'disabled', price: 0, status: 'inactive' }),
    plan({ id: 'live', price: 50 }),
  ])
  expectResult(input, needs(), 'match', 'live')
  expectResult(input, needs({ budget: 0 }), 'over_budget', 'live', 50)
  assert.equal(availablePlan(input, 'soon'), null)
  assert.equal(availablePlan(input, 'disabled'), null)
  assert.equal(availablePlan(input, 'live')?.id, 'live')
  expectResult(catalogue(input.plans.slice(0, 2)), needs(), 'no_match')
})

test('new admin-managed IDs, quotas, prices and statuses take effect without an allowlist', () => {
  const input = catalogue([
    plan({ id: 'ez35' }),
    plan({ id: 'new-admin-plan-2026', name: 'New admin plan', price: 25, dataGB: 200 }),
  ])
  expectResult(input, needs({ dataGB: 150 }), 'match', 'new-admin-plan-2026')
  assert.equal(availablePlan(input, 'new-admin-plan-2026')?.name, 'New admin plan')
  input.plans[1].price = 30
  expectResult(input, needs({ dataGB: 150, budget: 25 }), 'over_budget', 'new-admin-plan-2026', 5)
  input.plans[1].status = 'coming_soon'
  expectResult(input, needs({ dataGB: 150 }), 'no_match', 'ez35')
  assert.equal(availablePlan(input, 'new-admin-plan-2026'), null)
  input.plans[1].status = 'available'
  input.plans[1].dataGB = 50
  expectResult(input, needs({ dataGB: 80 }), 'match', 'ez35')
})

test('equal prices use ascending bytewise ID ordering and never input order', () => {
  const entries = ['z', 'a0', 'a-1', 'a', '9'].map((id) => plan({ id }))
  for (const plans of [entries, [...entries].reverse()]) {
    expectResult(catalogue(plans), needs(), 'match', '9')
    expectResult(catalogue(plans.filter((entry) => entry.id !== '9')), needs(), 'match', 'a')
    expectResult(catalogue(plans.filter((entry) => !['9', 'a'].includes(entry.id))), needs(), 'match', 'a-1')
    expectResult(catalogue(plans), needs({ budget: 34 }), 'over_budget', '9', 1)
  }
})

test('empty and exhausted catalogues return no match and no order selection', () => {
  assert.equal(validateCatalogue(catalogue()), true)
  expectResult(catalogue(), needs(), 'no_match')
  assert.equal(availablePlan(catalogue(), 'standard'), null)
  assert.equal(availablePlan(catalogue([plan()]), 'missing'), null)
  for (const id of [null, undefined, 1, {}, [], 'STANDARD', '../standard', ' standard ']) {
    assert.equal(availablePlan(catalogue([plan()]), id), null)
  }
})

test('invalid numeric needs are rejected instead of being coerced or silently defaulted', () => {
  const invalidNumbers = [-0.01, 1_000_000.01, NaN, Infinity, -Infinity, '1', '', null, undefined, true, false, {}, []]
  for (const field of ['dataGB', 'hotspotGB', 'roamingGB', 'budget']) {
    for (const value of invalidNumbers) {
      expectResult(catalogue([plan()]), needs({ [field]: value }), 'invalid')
    }
  }
  for (const value of [0, -1, 1.5, 367, NaN, Infinity, '30', '', null, undefined, false]) {
    expectResult(catalogue([plan()]), needs({ minValidityDays: value }), 'invalid')
  }
  for (const value of [null, undefined, [], {}, '30', 30, true]) {
    expectResult(catalogue([plan()]), value, 'invalid')
  }
})

test('numeric upper limits are valid for needs and catalogue quotas', () => {
  const input = catalogue([plan({ price: 1_000_000, dataGB: 1_000_000, hotspotGB: 1_000_000, roamingGB: 1_000_000 })])
  assert.equal(validateCatalogue(input), true)
  expectResult(input, needs({ dataGB: 1_000_000, hotspotGB: 1_000_000, roamingGB: 1_000_000, budget: 1_000_000 }),
    'match', 'standard')
})

test('catalogue envelope, version, uniqueness and 100-entry limit are validated', () => {
  const invalid = [null, undefined, [], {}, 'catalogue', { version: '1', plans: [] },
    { version: 2, plans: [] }, { version: 1, plans: null }, { version: 1, plans: {} },
    { version: 1, plans: [], extra: true }, catalogue([plan(), plan()]), catalogue([null]),
    catalogue([{}]), catalogue([[]]), catalogue([plan({ extra: true })])]
  for (const input of invalid) {
    assert.equal(validateCatalogue(input), false)
    expectResult(input, needs(), 'invalid')
    assert.equal(availablePlan(input, 'standard'), null)
  }
  const hundred = Array.from({ length: 100 }, (_, index) => plan({ id: `plan-${index}` }))
  assert.equal(validateCatalogue(catalogue(hundred)), true)
  assert.equal(validateCatalogue(catalogue([...hundred, plan({ id: 'overflow' })])), false)
})

test('catalogue plan fields are required and malformed entries fail closed', () => {
  for (const field of Object.keys(plan())) {
    const missing = plan()
    delete missing[field]
    assert.equal(validateCatalogue(catalogue([missing])), false, `missing ${field}`)
  }
  for (const field of ['price', 'dataGB', 'hotspotGB', 'roamingGB']) {
    for (const value of [-0.01, 1_000_000.01, NaN, Infinity, -Infinity, '35', '', null, undefined, false, {}, []]) {
      assert.equal(validateCatalogue(catalogue([plan({ [field]: value })])), false, `invalid ${field}: ${String(value)}`)
    }
  }
  for (const value of [0, -1, 1.5, 367, Infinity, NaN, '30', null, false]) {
    assert.equal(validateCatalogue(catalogue([plan({ validityDays: value })])), false)
  }
  for (const status of ['Coming Soon', 'coming soon', 'active', '', null, false]) {
    assert.equal(validateCatalogue(catalogue([plan({ status })])), false)
  }
  for (const hotspotMode of ['unlimited', '', null, false]) {
    assert.equal(validateCatalogue(catalogue([plan({ hotspotMode })])), false)
  }
  const malformedWithValid = catalogue([plan(), plan({ id: 'bad', price: '10' })])
  expectResult(malformedWithValid, needs(), 'invalid')
  assert.equal(availablePlan(malformedWithValid, 'standard'), null)
})

test('catalogue identifiers, names and monetary precision obey safe boundaries', () => {
  for (const id of ['a', '0', 'a'.repeat(40), 'new-plan-2026']) {
    assert.equal(validateCatalogue(catalogue([plan({ id })])), true)
  }
  for (const id of ['', 'a'.repeat(41), '-a', 'EZ35', 'with space', 'a_b', '../a', 'a?x=1', '<script>', null, 35]) {
    assert.equal(validateCatalogue(catalogue([plan({ id })])), false)
  }
  for (const name of ['A', '新套餐', 'A'.repeat(80)]) {
    assert.equal(validateCatalogue(catalogue([plan({ name })])), true)
  }
  for (const name of ['', ' ', ' A', 'A ', 'A'.repeat(81), null, 35]) {
    assert.equal(validateCatalogue(catalogue([plan({ name })])), false)
  }
  for (const price of [0, 0.01, 0.29, 35.1, 999999.99, 1_000_000]) {
    assert.equal(validateCatalogue(catalogue([plan({ price })])), true)
  }
  for (const price of [0.001, 35.101, 999999.999]) {
    assert.equal(validateCatalogue(catalogue([plan({ price })])), false)
  }
})

test('repeated recommendations preserve the catalogue and user inputs', () => {
  const input = catalogue([plan({ id: 'z' }), plan({ id: 'a' })])
  const requirements = needs({ dataGB: 80, hotspotGB: 5, roamingGB: 1 })
  const originalInput = clone(input)
  const originalNeeds = clone(requirements)
  const first = recommend(input, requirements)
  assert.deepEqual(recommend(input, requirements), first)
  assert.deepEqual(input, originalInput)
  assert.deepEqual(requirements, originalNeeds)
})

test('shared UI modules expose the required synchronous mount functions', async () => {
  const ui = await import(pathToFileURL(path.join(assets, 'ui.mjs')))
  assert.equal(typeof ui.mountRecommender, 'function')
  assert.equal(typeof ui.mountAdmin, 'function')
  assert.equal(typeof ui.mountSelection, 'function')
})

test('public input edits cancel a pending fetch and re-enable submit', async () => {
  const documentValue = new FakeDocument()
  const windowValue = fakeWindow()
  let resolveFetch
  let fetchOptions
  const restore = installBrowserGlobals(documentValue, windowValue, (_url, options) => {
    fetchOptions = options
    return new Promise((resolve) => { resolveFetch = resolve })
  })
  let cleanup = () => {}
  try {
    const { mountRecommender } = await import(pathToFileURL(path.join(assets, 'ui.mjs')))
    const root = documentValue.createElement('div')
    cleanup = mountRecommender(root, { locale: 'en', endpoint: '/fixture/catalogue', orderUrl: '/en/order' })
    const form = findElements(root, (node) => node.tagName === 'FORM')[0]
    const submit = findElements(root, (node) => node.tagName === 'BUTTON' && node.type === 'submit')[0]
    const dataInput = findElements(root, (node) => node.tagName === 'INPUT' && node.name === 'dataGB')[0]
    form.dispatchEvent({ type: 'submit', preventDefault() { this.defaultPrevented = true } })
    assert.equal(submit.disabled, true)
    assert.equal(fetchOptions.signal.aborted, false)

    dataInput.value = '1'
    dataInput.dispatchEvent({ type: 'input' })
    assert.equal(fetchOptions.signal.aborted, true)
    assert.equal(submit.disabled, false)
    assert.equal(textOf(root).includes('Loading plans'), false)

    resolveFetch(responseFor(catalogue([plan()])))
    await nextTick()
    assert.equal(findElements(root, (node) => node.tagName === 'ARTICLE' &&
      node.className.split(/\s+/).includes('plan-recommender-result')).length, 0)
  } finally {
    cleanup()
    restore()
  }
})

test('public recommender treats hotspot and roaming as optional and uses 10GB phone steps', async () => {
  const documentValue = new FakeDocument()
  const windowValue = fakeWindow()
  const restore = installBrowserGlobals(documentValue, windowValue, () => Promise.resolve(responseFor(catalogue([plan()])))
  )
  let cleanup = () => {}
  try {
    const { mountRecommender } = await import(pathToFileURL(path.join(assets, 'ui.mjs')))
    const root = documentValue.createElement('div')
    cleanup = mountRecommender(root, { locale: 'en', endpoint: '/fixture/catalogue', orderUrl: '/en/order' })
    const form = findElements(root, (node) => node.tagName === 'FORM')[0]
    const dataInput = findElements(root, (node) => node.tagName === 'INPUT' && node.name === 'dataGB')[0]
    const hotspotInput = findElements(root, (node) => node.tagName === 'INPUT' && node.name === 'hotspotGB')[0]
    const roamingInput = findElements(root, (node) => node.tagName === 'INPUT' && node.name === 'roamingGB')[0]
    const budgetInput = findElements(root, (node) => node.tagName === 'INPUT' && node.name === 'budget')[0]
    const daysInput = findElements(root, (node) => node.tagName === 'INPUT' && node.name === 'minValidityDays')[0]
    assert.equal(dataInput.step, '10')
    assert.equal(dataInput.max, '1000')
    assert.equal(hotspotInput.step, '10')
    assert.equal(hotspotInput.max, '1000')
    assert.equal(hotspotInput.value, '')
    assert.equal(roamingInput.step, '1')
    assert.equal(roamingInput.max, '100')
    assert.equal(roamingInput.value, '')
    assert.equal(hotspotInput.required, false)
    assert.equal(roamingInput.required, false)
    assert.equal(budgetInput.step, '1')
    assert.equal(budgetInput.max, '1000')
    assert.equal(daysInput.step, '1')
    assert.equal(daysInput.max, '366')

    dataInput.value = '50'
    form.dispatchEvent({ type: 'submit', preventDefault() { this.defaultPrevented = true } })
    await nextTick()
    assert.doesNotMatch(textOf(root), /Enter valid non-negative numbers/)
    assert.match(textOf(root), /Hotspot not requested/)
    assert.match(textOf(root), /Roaming not requested/)
  } finally {
    cleanup()
    restore()
  }
})

test('public recommender shows the closest available plan and explains each shortfall', async () => {
  const documentValue = new FakeDocument()
  const windowValue = fakeWindow()
  const restore = installBrowserGlobals(documentValue, windowValue, () => Promise.resolve(responseFor(catalogue([
    plan({ id: 'limited', name: 'Limited', dataGB: 100 }),
  ]))))
  let cleanup = () => {}
  try {
    const { mountRecommender } = await import(pathToFileURL(path.join(assets, 'ui.mjs')))
    const root = documentValue.createElement('div')
    cleanup = mountRecommender(root, { locale: 'en', endpoint: '/fixture/catalogue', orderUrl: '/en/order' })
    const form = findElements(root, (node) => node.tagName === 'FORM')[0]
    const dataInput = findElements(root, (node) => node.tagName === 'INPUT' && node.name === 'dataGB')[0]
    dataInput.value = '1000'
    form.dispatchEvent({ type: 'submit', preventDefault() { this.defaultPrevented = true } })
    await nextTick()
    assert.match(textOf(root), /Closest available plan/)
    assert.match(textOf(root), /Limited/)
    assert.match(textOf(root), /Phone data is short by 900 GB/)
    assert.match(textOf(root), /Choose closest plan/)
  } finally {
    cleanup()
    restore()
  }
})

test('selection hides with no plan query, reports invalid IDs after loading, and keeps a valid plan on locale change', async () => {
  const documentValue = new FakeDocument()
  const windowValue = fakeWindow()
  let fetchCount = 0
  let resolveFetch
  const restore = installBrowserGlobals(documentValue, windowValue, () => {
    fetchCount += 1
    if (windowValue.location.search.includes('missing')) {
      return new Promise((resolve) => { resolveFetch = resolve })
    }
    return Promise.resolve(responseFor(catalogue([plan()])))
  })
  let cleanup = () => {}
  try {
    const { mountSelection } = await import(pathToFileURL(path.join(assets, 'ui.mjs')))
    const noQueryRoot = documentValue.createElement('div')
    cleanup = mountSelection(noQueryRoot, { locale: 'en', endpoint: '/fixture/catalogue' })
    const noQuerySection = noQueryRoot.children[0]
    assert.equal(noQuerySection.hidden, true)
    assert.equal(fetchCount, 0)
    cleanup()

    windowValue.location.search = '?plan=missing'
    const invalidRoot = documentValue.createElement('div')
    cleanup = mountSelection(invalidRoot, { locale: 'en', endpoint: '/fixture/catalogue' })
    const invalidSection = invalidRoot.children[0]
    assert.equal(invalidSection.hidden, false)
    assert.match(textOf(invalidRoot), /Loading plans/)
    assert.doesNotMatch(textOf(invalidRoot), /unavailable or no longer offered/)
    resolveFetch(responseFor(catalogue([plan()])))
    await nextTick()
    assert.match(textOf(invalidRoot), /unavailable or no longer offered/)
    cleanup()

    windowValue.location.search = '?plan=standard'
    const validRoot = documentValue.createElement('div')
    cleanup = mountSelection(validRoot, { locale: 'en', endpoint: '/fixture/catalogue' })
    await nextTick()
    assert.match(textOf(validRoot), /Your selected mobile plan/)
    assert.match(textOf(validRoot), /Standard/)
    const requestsBeforeLocaleChange = fetchCount
    windowValue.dispatchEvent({ type: 'languageChanged', detail: { locale: 'zh' } })
    assert.match(textOf(validRoot), /你选择的手机配套/)
    assert.match(textOf(validRoot), /Standard/)
    assert.equal(fetchCount, requestsBeforeLocaleChange)
  } finally {
    cleanup()
    restore()
  }
})

test('one-time order entries show official pass details without depending on the monthly recommender', async () => {
  const documentValue = new FakeDocument()
  const windowValue = fakeWindow()
  const restore = installBrowserGlobals(documentValue, windowValue, () => { throw new Error('monthly catalogue offline') })
  let cleanup = () => {}
  try {
    const { mountSelection } = await import(pathToFileURL(path.join(assets, 'ui.mjs')))
    for (const [id, price, data, days] of [['EZ365D', '240.00', '240', '365'], ['ezday', '3.00', '5', '1'], ['EZWEEK', '7.00', '10', '7']]) {
      windowValue.location.search = `?plan=${id}`
      const root = documentValue.createElement('div')
      cleanup = mountSelection(root, { locale: 'en', endpoint: '/fixture/catalogue' })
      await nextTick()
      assert.match(textOf(root), new RegExp(id.toUpperCase()))
      assert.match(textOf(root), new RegExp(`RM ${price} / ${days} days`))
      assert.match(textOf(root), new RegExp(`${data} GB`))
      assert.match(textOf(root), /30 minutes/)
      assert.doesNotMatch(textOf(root), /unavailable|0 GB hotspot/)
      windowValue.dispatchEvent({ type: 'languageChanged', detail: { locale: 'zh' } })
      assert.match(textOf(root), /30 分钟/)
      assert.match(textOf(root), /不会自动开通配套或收取配套费用/)
      cleanup()
    }
  } finally { cleanup(); restore() }
})

test('admin save disables every control, ignores edits during save, and clears saved status on edit', async () => {
  const documentValue = new FakeDocument()
  const windowValue = fakeWindow()
  const inputCatalogue = catalogue([
    plan({ id: 'ez15', name: 'EZ15', price: 15, dataGB: 30, hotspotGB: 30, hotspotMode: 'shared', validityDays: 15 }),
    plan({ id: 'ez35', name: 'EZ35', price: 35, dataGB: 200, hotspotGB: 100 }),
  ])
  let resolvePost
  const calls = []
  const restore = installBrowserGlobals(documentValue, windowValue, (_url, options = {}) => {
    calls.push({ options })
    if (options.method === 'POST') return new Promise((resolve) => { resolvePost = resolve })
    return Promise.resolve(responseFor(inputCatalogue, { csrf_token: 'fixture-csrf' }))
  })
  let cleanup = () => {}
  try {
    const { mountAdmin } = await import(pathToFileURL(path.join(assets, 'ui.mjs')))
    const root = documentValue.createElement('div')
    cleanup = mountAdmin(root, { endpoint: '/fixture/admin' })
    await nextTick()
    const editor = findElements(root, (node) => node.tagName === 'FIELDSET')[0]
    const controls = () => findElements(editor, (node) => ['INPUT', 'SELECT', 'BUTTON'].includes(node.tagName))
    const dataInputs = () => findElements(editor, (node) => node.tagName === 'INPUT' && node.name === 'dataGB')
    const removeButtons = () => findElements(editor, (node) => node.tagName === 'BUTTON' && textOf(node) === 'Remove')
    assert.deepEqual(dataInputs().map((input) => input.value), ['30', '200'])
    assert.ok(controls().every((control) => control.disabled === false))

    const form = findElements(root, (node) => node.tagName === 'FORM')[0]
    form.dispatchEvent({ type: 'submit', preventDefault() { this.defaultPrevented = true } })
    assert.equal(calls.length, 2)
    assert.equal(typeof resolvePost, 'function')
    assert.ok(controls().every((control) => control.disabled === true))
    assert.equal(removeButtons().length, 2)

    dataInputs()[0].value = '999'
    dataInputs()[0].dispatchEvent({ type: 'input' })
    removeButtons()[0].dispatchEvent({ type: 'click' })
    assert.equal(removeButtons().length, 2)
    assert.ok(controls().every((control) => control.disabled === true))

    resolvePost(responseFor(inputCatalogue, { csrf_token: 'fixture-csrf' }))
    await nextTick()
    assert.ok(controls().every((control) => control.disabled === false))
    assert.deepEqual(dataInputs().map((input) => input.value), ['30', '200'])
    assert.match(textOf(root), /Plan catalogue saved/)

    dataInputs()[0].value = '31'
    dataInputs()[0].dispatchEvent({ type: 'input' })
    assert.doesNotMatch(textOf(root), /Plan catalogue saved/)
  } finally {
    cleanup()
    restore()
  }
})

test('both repositories ship identical recommendation rules, UI, copy and default data', (context) => {
  const sibling = path.join(path.dirname(root), isNode ? 'eastel-website_php/recommender' : 'eastel-website_nodejs/public/recommender')
  if (!fs.existsSync(sibling)) {
    context.skip('sibling repository unavailable; cross-repository parity NOT RUN')
    return
  }
  for (const name of ['engine.mjs', 'engine.d.mts', 'ui.mjs', 'ui.d.mts', 'copy.mjs', 'widget.css', 'catalogue.json', 'loader.mjs']) {
    assert.deepEqual(fs.readFileSync(path.join(assets, name)), fs.readFileSync(path.join(sibling, name)),
      `${name} differs between PHP and Node.js`)
  }
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../components/providers/theme-provider.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

function mount(stored, prefersDark = false) {
  const providerType = Symbol('ThemeContext.Provider')
  const fragmentType = Symbol('Fragment')
  const states = []
  const effects = []
  const attributes = new Map()
  const storage = new Map(stored ? [['eastel-theme', stored]] : [])
  let cursor = 0
  const module = { exports: {} }
  const jsx = (type, props) => ({ type, props })
  vm.runInNewContext(compiled, {
    module, exports: module.exports, setTimeout,
    window: { matchMedia: () => ({ matches: prefersDark }) },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: { setAttribute: (key, value) => attributes.set(key, value) }, getElementById: () => null },
    require(specifier) {
      if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: fragmentType }
      if (specifier === 'react') return {
        createContext: value => ({ Provider: providerType, value }),
        useContext: context => context.value,
        useState(initial) {
          const index = cursor++
          if (!(index in states)) states[index] = initial
          return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        },
        useEffect: callback => { effects.push(callback) },
        useCallback: callback => callback,
      }
      throw new Error(`Unexpected import: ${specifier}`)
    },
  }, { filename: 'ThemeProvider.fixture.js' })
  const render = child => {
    cursor = 0
    return module.exports.ThemeProvider({ children: child })
  }
  return { providerType, render, attributes, storage, runInitialEffects: () => effects.splice(0).forEach(callback => callback()) }
}

test('theme initialization retains the provider and exact checkout child identity', () => {
  // React preserves descendant state when ancestor/child types and keys stay
  // stable. The former Fragment→Provider replacement failed this contract and
  // destroyed OrderForm's in-flight private draft after its URL was consumed.
  for (const stored of ['light', 'dark']) {
    const fixture = mount(stored)
    const checkoutState = { consumedDraft: true, pendingDetails: Promise.resolve('checkout details') }
    const checkout = { type: Symbol('OrderForm'), key: 'checkout', props: { state: checkoutState } }
    const before = fixture.render(checkout)
    assert.equal(before.type, fixture.providerType, 'First render must already provide the theme context')
    assert.equal(before.props.value.theme, 'dark', 'Initial theme must match server-rendered fallback')
    fixture.runInitialEffects()
    const after = fixture.render(checkout)
    assert.equal(after.type, before.type, 'Loading the stored theme must not replace the wrapper')
    assert.equal(after.props.children, before.props.children, 'Checkout must retain its position and identity')
    assert.equal(after.props.children.props.state, checkoutState, 'In-flight checkout state must remain attached to the same child')
    assert.equal(after.props.value.theme, stored)
    assert.equal(fixture.attributes.get('data-theme'), stored)
  }
})

test('system preference and theme toggles keep the provider tree stable', () => {
  for (const prefersDark of [true, false]) {
    const fixture = mount(null, prefersDark)
    const child = { type: Symbol('Child'), props: {} }
    const before = fixture.render(child)
    fixture.runInitialEffects()
    let after = fixture.render(child)
    assert.equal(after.type, before.type)
    assert.equal(after.props.value.theme, prefersDark ? 'dark' : 'light')
    after.props.value.toggleThemeWithWave(20, 30)
    after = fixture.render(child)
    assert.equal(after.type, before.type)
    assert.equal(after.props.children, child)
    assert.equal(after.props.value.theme, prefersDark ? 'light' : 'dark')
    assert.equal(fixture.storage.get('eastel-theme'), after.props.value.theme)
    assert.equal(fixture.attributes.get('data-theme'), after.props.value.theme)
  }
})

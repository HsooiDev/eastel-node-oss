// Offline contract tests: actual helper, route, page and widget. No real
// provider, credentials, customer database, email or production writes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

function load(file, deps, globals = {}) {
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(source, {
    module, exports: module.exports, URL, URLSearchParams, AbortSignal, Response, Request, Headers,
    console: { error() {} }, require(id) {
      if (!Object.hasOwn(deps, id)) throw new Error(`Unexpected dependency: ${id}`)
      return deps[id]
    }, ...globals,
  }, { filename: file })
  return module.exports
}
const expected = { hostname: 'staging.example.test', action: 'reset_password' }
function verifier(options = {}) {
  const calls = []
  const timeouts = []
  const { verifyTurnstile } = load('lib/turnstile.ts', {}, {
    process: { env: { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'synthetic-secret', ...options.env } },
    AbortSignal: { timeout(ms) { timeouts.push(ms); return AbortSignal.timeout(ms) } },
    fetch: async (...args) => {
      calls.push(args)
      if (options.reply) return options.reply(...args)
      return Response.json({ success: true, ...expected, ...options.result })
    },
  })
  return { verifyTurnstile, calls, timeouts }
}
test('Siteverify uses canonical endpoint, bounded timeout, secret form and fixed response metadata', async () => {
  const f = verifier()
  assert.equal(await f.verifyTurnstile('synthetic-token', '203.0.113.30', expected), true)
  const [url, options] = f.calls[0]
  assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
  assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error')
  assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded')
  const form = new URLSearchParams(options.body)
  assert.equal(form.get('secret'), 'synthetic-secret'); assert.equal(form.get('response'), 'synthetic-token')
  assert.equal(form.get('remoteip'), '203.0.113.30'); assert.deepEqual(f.timeouts, [10000])
  assert.ok(options.signal instanceof AbortSignal)
})
test('Siteverify rejects wrong or missing hostname/action and non-boolean success', async () => {
  for (const result of [{ hostname: 'evil.invalid' }, { hostname: undefined }, { action: 'login' }, { action: undefined }, { success: 'true' }, { success: false }]) {
    assert.equal(await verifier({ result }).verifyTurnstile('fixture', undefined, expected), false)
  }
  // Existing callers keep their two-argument metadata contract.
  assert.equal(await verifier({ result: { action: undefined } }).verifyTurnstile('fixture'), true)
})
test('invalid token types and oversized tokens fail before any external request', async () => {
  const f = verifier()
  for (const token of [undefined, null, {}, 7, '', '  ', 'a'.repeat(2049)]) {
    assert.equal(await f.verifyTurnstile(token, undefined, expected), false)
  }
  assert.equal(await f.verifyTurnstile('valid', undefined, { hostname: '', action: 'reset_password' }), false)
  assert.equal(f.calls.length, 0)
  assert.equal(await f.verifyTurnstile('a'.repeat(2048), undefined, expected), true)
})
test('provider errors, non-2xx, invalid JSON, null body and abort all fail closed', async () => {
  for (const reply of [
    async () => { throw new Error('synthetic network/redirect failure') },
    async () => { throw new DOMException('synthetic timeout', 'TimeoutError') },
    async () => new Response('unavailable', { status: 503 }),
    async () => new Response('not-json'), async () => Response.json(null),
  ]) assert.equal(await verifier({ reply }).verifyTurnstile('fixture', undefined, expected), false)
})
test('production requires a secret even on loopback; explicit development bypass remains', async () => {
  const production = verifier({ env: { TURNSTILE_SECRET_KEY: '' } })
  assert.equal(await production.verifyTurnstile('fixture', '127.0.0.1', expected), false)
  assert.equal(production.calls.length, 0)
  const dev = verifier({ env: { NODE_ENV: 'development' } })
  assert.equal(await dev.verifyTurnstile('', '127.0.0.1', expected), true)
  assert.equal(dev.calls.length, 0)
})

function routeHarness({ allowed = true, valid = true, provider = {}, origin = 'https://staging.example.test' } = {}) {
  const verifierFixture = verifier({ ...provider, result: { hostname: new URL(origin).hostname, ...provider.result } })
  let hashes = 0, connections = 0, validations = 0, lookups = 0
  const api = load('app/api/auth/reset/route.ts', {
    '@/lib/db': { __esModule: true, default: { query: async () => { lookups++; return [[{ id: 1, reset_expires: new Date(Date.now() + 60000) }]] }, getConnection: async () => {
      connections++
      return { beginTransaction: async () => {}, query: async () => [[{ id: 1, reset_expires: new Date(Date.now() + 60000) }]], execute: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }
    } } },
    '@/lib/auth': { hashPassword: async () => { hashes++; return 'synthetic-hash' }, hashPasswordResetToken: value => value },
    '@/lib/rate-limit': { checkRateLimit: () => ({ allowed }) },
    '@/lib/turnstile': verifierFixture,
    '@/lib/site': { SITE_URL: origin },
    '@/lib/validation': { resetSchema: {}, validate: (_, body) => { validations++; return valid ? { success: true, data: body } : { success: false } } },
    '../_helpers': { getClientIp: () => '203.0.113.30', success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) },
  })
  return { ...verifierFixture, get hashes() { return hashes }, get connections() { return connections }, get validations() { return validations }, get lookups() { return lookups },
    submit(body = {}) { return api.POST(new Request('https://evil.invalid/api/auth/reset', { method: 'POST', headers: { host: 'evil.invalid', 'x-forwarded-host': 'evil.invalid' }, body: JSON.stringify({ token: 'synthetic-reset-token', password: 'SyntheticPass123!', ...body }) })) },
  }
}
test('reset rate/validation reject before Siteverify, hashing and connections', async () => {
  for (const options of [{ allowed: false }, { valid: false }]) {
    const f = routeHarness(options)
    assert.equal((await f.submit()).status, options.allowed === false ? 429 : 400)
    assert.equal(f.calls.length, 0); assert.equal(f.hashes, 0); assert.equal(f.connections, 0); assert.equal(f.lookups, 0)
    if (options.allowed === false) assert.equal(f.validations, 0)
  }
})
test('missing, malformed or rejected reset CAPTCHA cannot hash or open the database', async () => {
  for (const turnstileToken of [undefined, {}, 'a'.repeat(2049), 'synthetic']) {
    const f = routeHarness({ provider: { result: { success: false } } })
    assert.equal((await f.submit({ turnstileToken })).status, 400)
    assert.equal(f.hashes, 0); assert.equal(f.connections, 0); assert.equal(f.lookups, 0)
  }
})
test('reset expects configured hostname and reset action, ignoring forged Host headers', async () => {
  for (const origin of ['https://staging.example.test', 'https://eastel.site']) {
    for (const result of [{ hostname: 'evil.invalid' }, { action: 'login' }, { hostname: new URL(origin).hostname === 'staging.example.test' ? 'eastel.site' : 'staging.example.test' }]) {
      const f = routeHarness({ provider: { result }, origin })
      assert.equal((await f.submit({ turnstileToken: 'synthetic' })).status, 400)
      assert.equal(f.hashes, 0); assert.equal(f.connections, 0); assert.equal(f.lookups, 0)
    }
    const f = routeHarness({ origin })
    assert.equal((await f.submit({ turnstileToken: 'synthetic' })).status, 200)
    assert.equal(f.hashes, 1); assert.equal(f.connections, 1)
  }
})
test('provider rejects a replay before any second reset database transaction', async () => {
  let used = false
  const f = routeHarness({ provider: { reply: async () => {
    const reply = Response.json({ success: !used, ...expected }); used = true; return reply
  } } })
  assert.equal((await f.submit({ turnstileToken: 'single-use-fixture' })).status, 200)
  assert.equal((await f.submit({ turnstileToken: 'single-use-fixture' })).status, 400)
  assert.equal(f.connections, 1); assert.equal(f.hashes, 1)
})

const jsx = (type, props) => ({ type, props })
const descendants = tree => {
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(descendants)]
}
function reactHarness() {
  const hooks = [], pending = []
  let cursor = 0
  const react = {
    useState(initial) {
      const index = cursor++
      if (!hooks[index]) {
        const hook = { value: initial }
        hook.set = value => { hook.value = typeof value === 'function' ? value(hook.value) : value }
        hooks[index] = hook
      }
      return [hooks[index].value, hooks[index].set]
    },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial } },
    useEffect(fn, deps) {
      const index = cursor++, previous = hooks[index]
      const changed = !previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))
      hooks[index] = { deps, fn, cleanup: previous?.cleanup }
      if (changed) pending.push(index)
    },
  }
  return { react, render(fn) { cursor = 0; const tree = fn(); for (const index of pending.splice(0)) { hooks[index].cleanup?.(); hooks[index].cleanup = hooks[index].fn() }; return tree },
    unmount() { for (const hook of hooks) hook.cleanup?.() } }
}
function pageHarness(reply, locale = 'zh', token = 'reset-fixture') {
  const h = reactHarness(), requests = [], pushes = []
  const Button = () => null, PasswordField = () => null, TurnstileWidget = () => null
  const Page = load('app/[locale]/account/(auth)/reset/page.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useSearchParams: () => new URLSearchParams(token ? { token } : {}), useParams: () => ({ locale }), useRouter: () => ({ push: value => pushes.push(value) }) },
    'next/link': { __esModule: true, default: () => null },
    '@/components/ui/button': { Button }, '@/components/ui/password-field': { PasswordField }, '@/components/ui/auth-shell': { AuthShell: () => null },
    '@/components/turnstile-widget': { TurnstileWidget }, '@/hooks/useTranslation': { useTranslation: () => ({ t: (_, fallback) => fallback }) },
  }, { fetch: async (url, options) => { requests.push({ url, options }); return reply() } }).default
  let tree
  const render = () => { tree = h.render(Page) }
  const find = predicate => descendants(tree).find(predicate)
  render()
  return { requests, pushes, render,
    get widget() { return find(n => n.type === TurnstileWidget)?.props },
    get button() { return find(n => n.type === Button)?.props },
    get text() { return descendants(tree).flatMap(n => [n.props?.children].flat(Infinity).filter(value => typeof value === 'string')).join(' ') },
    password(value, confirm = value) { find(n => n.type === PasswordField && n.props.id === 'pw').props.onChange(value); find(n => n.type === PasswordField && n.props.id === 'pwc').props.onChange(confirm); render() },
    authorize(value) { this.widget.onToken(value); render() },
    async submit() { await find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); render() },
  }
}
test('reset form requires CAPTCHA, passes reset action, and keeps unused token on client validation errors', async () => {
  const f = pageHarness(async () => Response.json({ status: 'success' }))
  assert.equal(f.widget.action, 'reset_password'); assert.equal(f.button.disabled, true)
  f.password('ValidPassword123!'); await f.submit()
  assert.equal(f.requests.length, 0); assert.match(f.text, /security check/)
  f.authorize('not-consumed'); f.password('short'); await f.submit()
  assert.equal(f.requests.length, 0); assert.equal(f.widget.resetKey, 0); assert.equal(f.button.disabled, false)
  f.password('ValidPassword123!', 'different'); await f.submit(); assert.equal(f.requests.length, 0)
})
test('each completed reset attempt clears token, refreshes its widget, and permits retry with new token', async () => {
  for (const reply of [async () => Response.json({ status: 'error', message: 'Expired reset link' }), async () => { throw new Error('offline') }, async () => new Response('bad json')]) {
    const f = pageHarness(reply)
    f.password('ValidPassword123!'); f.authorize('first-token'); await f.submit()
    assert.equal(f.requests.length, 1); assert.equal(f.button.loading, false); assert.equal(f.button.disabled, true)
    assert.equal(f.widget.resetKey, 1); assert.equal(f.pushes.length, 0)
    await f.submit(); assert.equal(f.requests.length, 1)
    f.authorize('fresh-token'); await f.submit()
    assert.equal(f.requests.length, 2); assert.equal(f.widget.resetKey, 2)
    const body = JSON.parse(f.requests[1].options.body)
    assert.equal(body.turnstileToken, 'fresh-token'); assert.equal(body.password, 'ValidPassword123!'); assert.equal(body.token, 'reset-fixture')
    assert.equal(f.requests[1].url, '/api/auth/reset')
  }
})
test('successful reset returns to localized login and invalid links have no submit form', async () => {
  for (const locale of ['en', 'ms', 'zh']) {
    const f = pageHarness(async () => Response.json({ status: 'success' }), locale)
    f.password('ValidPassword123!'); f.authorize('synthetic'); await f.submit()
    assert.deepEqual(f.pushes, [`/${locale}/account/login`]); assert.equal(f.widget.resetKey, 1)
  }
  const invalid = pageHarness(() => { throw new Error('Must not request') }, 'en', '')
  assert.equal(invalid.button, undefined); assert.equal(invalid.widget, undefined)
})

function widgetHarness({ siteKey = 'synthetic-public-key', mode = 'production', loaded = true } = {}) {
  const h = reactHarness(), tokens = [], renders = [], resets = [], removals = [], listeners = new Set()
  const script = { addEventListener(_, callback) { listeners.add(callback) }, removeEventListener(_, callback) { listeners.delete(callback) } }
  const window = { turnstile: loaded ? {
    render(container, options) { renders.push({ container, options }); return 'own-widget' },
    reset(id) { resets.push(id) }, remove(id) { removals.push(id) },
  } : undefined }
  const Widget = load('components/turnstile-widget.tsx', { react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx } }, {
    process: { env: { NODE_ENV: mode, NEXT_PUBLIC_TURNSTILE_SITE_KEY: siteKey } }, window,
    document: { querySelector: () => script },
  }).TurnstileWidget
  const onToken = value => tokens.push(value)
  const render = (resetKey = 0) => h.render(() => {
    const tree = Widget({ onToken, action: 'reset_password', resetKey })
    tree.props.ref.current = { fixture: 'container' }; return tree
  })
  render()
  return { tokens, renders, resets, removals, listeners, window, render, unmount: h.unmount }
}
test('widget sends reset action, clears expired tokens, and resets only its own ID after attempts', () => {
  const f = widgetHarness()
  assert.equal(f.renders.length, 1); assert.equal(f.renders[0].options.action, 'reset_password')
  const options = f.renders[0].options
  options.callback('valid'); options['expired-callback'](); options['error-callback']()
  assert.deepEqual(f.tokens, ['valid', '', ''])
  f.render(1); assert.deepEqual(f.resets, ['own-widget']); assert.equal(f.tokens.at(-1), '')
  f.render(1); assert.equal(f.resets.length, 1); assert.equal(f.renders.length, 1)
  f.unmount(); assert.deepEqual(f.removals, ['own-widget'])
})
test('missing production key never enables submit; development placeholder refresh still works', () => {
  for (const mode of ['production', 'development']) {
    const f = widgetHarness({ siteKey: '', mode })
    f.render(1)
    assert.deepEqual(f.tokens, mode === 'production' ? ['', ''] : ['dev-placeholder', 'dev-placeholder'])
    assert.equal(f.renders.length, 0); assert.equal(f.resets.length, 0)
  }
})
test('unmount removes pending script listener and late load cannot create an orphan widget', () => {
  const f = widgetHarness({ loaded: false })
  assert.equal(f.listeners.size, 1)
  const callback = [...f.listeners][0]
  f.unmount(); assert.equal(f.listeners.size, 0)
  f.window.turnstile = { render() { throw new Error('orphan render') } }
  assert.doesNotThrow(callback)
})

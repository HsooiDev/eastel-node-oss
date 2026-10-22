// Source route/forms and CAPTCHA/IP/quota helpers; synthetic DB/provider/session.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(source, { module, exports: module.exports, require(id) {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('@/') || id.startsWith('.')) throw new Error(`Unmocked dependency: ${id}`)
    return require(id)
  }, URL, URLSearchParams, Request, Response, Headers, Date, Buffer, AbortSignal, process,
  console: { error() {} }, setTimeout() { throw new Error('Login must not hold a honeypot timer') }, ...globals }, { filename: file })
  return module.exports
}
function fixture({ origin = 'https://staging.example.test', captcha = 'valid', active = true, correct = true, count = 0, brokenDb = false } = {}) {
  const calls = { provider: 0, providerIps: [], queries: [], attempts: [], sessions: [], cookies: [], audit: [], verifies: 0 }
  const ip = load('lib/client-ip.ts')
  const limiter = load('lib/rate-limit.ts', {}, { setInterval: () => ({ unref() {} }) })
  const verifier = load('lib/turnstile.ts', {}, {
    process: { env: { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'synthetic-secret' } },
    fetch: async (_, options) => {
      calls.provider++
      calls.providerIps.push(new URLSearchParams(options.body).get('remoteip'))
      if (captcha === 'network') throw new Error('offline')
      return Response.json({ success: captcha !== 'reject', hostname: captcha === 'host' ? 'evil.invalid' : captcha === 'cross-host' ? (new URL(origin).hostname === 'staging.example.test' ? 'eastel.site' : 'staging.example.test') : new URL(origin).hostname,
        action: captcha === 'action' ? 'login' : 'admin_login' })
    },
  })
  const db = {
    async query(sql, params) {
      calls.queries.push({ sql, params })
      if (brokenDb) throw new Error('unavailable')
      assert.ok(!sql.includes('`success`'))
      if (sql.includes('COUNT(*)')) {
        if (sql.includes('ip_attempts')) return [[{ ip_attempts: 0 }], []]
        assert.match(sql, /`attempt_type` IN \('WRONG_PASSWORD', 'LOCKED_OUT'\)/)
        assert.match(sql, /INTERVAL 5 MINUTE/)
        return [count === null ? [] : [{ email_attempts: count }], []]
      }
      assert.match(sql, /FROM `admin_users`.*`is_active` = 1/)
      return [active ? [{ id: 7, name: 'Synthetic Admin', email: 'admin@example.invalid', password_hash: 'synthetic-hash' }] : [], []]
    },
    async execute(sql, params) { assert.ok(!sql.includes('`success`')); calls.attempts.push(params); return [{ affectedRows: 1 }, []] },
  }
  const route = load('app/api/admin/login/route.ts', {
    '@/lib/admin-login-attempts': load('lib/admin-login-attempts.ts', {
      '@/lib/database-lock': { withDatabaseLocks: async (_keys, operation) => operation(db) },
    }),
    '@/lib/db': { __esModule: true, default: db }, '@/lib/client-ip': ip, '@/lib/site': { SITE_URL: origin },
    '@/lib/auth': { verifyPassword: async () => { calls.verifies++; return correct } },
    '@/lib/session': { createSession: async (...args) => { calls.sessions.push(args); return 'synthetic-session' } },
    '@/lib/cookies': { setSessionCookie: async value => { calls.cookies.push(value) } },
    '@/lib/turnstile': verifier, '@/lib/rate-limit': limiter,
    '@/lib/db-helpers': { formatDate: () => '2026-10-17 00:00:00' }, '@/lib/validation': load('lib/validation.ts'),
    '@/lib/audit': { logAdminAction: async (...args) => { calls.audit.push(args) } },
    '../_helpers': { success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) },
  })
  return { calls, submit(body = {}, headers = { 'x-forwarded-for': '127.0.0.1, 203.0.113.99' }) {
    return route.POST(new Request('https://evil.invalid/api/admin/login', { method: 'POST', headers: { host: 'evil.invalid', 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ email: 'admin@example.invalid', password: 'SyntheticPass123!', turnstileToken: 'synthetic-token', ...body }) }))
  } }
}
test('admin CAPTCHA enforces configured staging/production host and distinct action before DB/auth', async () => {
  for (const origin of ['https://staging.example.test', 'https://eastel.site']) {
    for (const captcha of ['reject', 'host', 'cross-host', 'action', 'network']) {
      const f = fixture({ origin, captcha })
      assert.equal((await f.submit()).status, 400)
      assert.equal(f.calls.provider, 1); assert.equal(f.calls.queries.length + f.calls.verifies + f.calls.attempts.length + f.calls.sessions.length + f.calls.cookies.length, 0)
    }
    const f = fixture({ origin }); const response = await f.submit()
    assert.equal(response.status, 200); assert.equal((await response.json()).status, 'success')
    assert.deepEqual(f.calls.providerIps, ['203.0.113.99'])
    assert.equal(f.calls.sessions[0][1], '203.0.113.99'); assert.equal(f.calls.sessions[0][3], 'admin')
    assert.equal(f.calls.attempts[0][0], '203.0.113.99'); assert.equal(f.calls.attempts[0][2], 'SUCCESS')
    assert.equal(f.calls.audit[0].at(-1), '203.0.113.99'); assert.deepEqual(f.calls.cookies, ['synthetic-session'])
  }
})
test('spoofed leftmost IP cannot rotate the admin quota; eleventh attempt skips CAPTCHA/DB', async () => {
  const f = fixture({ captcha: 'reject' })
  for (let i = 0; i < 10; i++) assert.equal((await f.submit({}, { 'x-forwarded-for': `198.51.100.${i}, 203.0.113.99` })).status, 400)
  assert.equal((await f.submit({}, { 'x-forwarded-for': '192.0.2.8, 203.0.113.99' })).status, 429)
  assert.equal(f.calls.provider, 10); assert.equal(f.calls.queries.length, 0)
})
test('missing/invalid proxy identity shares unknown quota instead of becoming localhost', async () => {
  const f = fixture()
  for (let i = 0; i < 10; i++) assert.equal((await f.submit({ _hp: 'bot' }, i % 2 ? {} : { 'x-forwarded-for': '127.0.0.1, invalid' })).status, 400)
  assert.equal((await f.submit({}, {})).status, 429)
  assert.equal(f.calls.provider + f.calls.queries.length, 0)
})
test('both honeypot aliases reject immediately and consume quota without provider/DB/session', async () => {
  for (const field of ['_hp', 'hp_field']) {
    const f = fixture()
    for (let i = 0; i < 10; i++) assert.equal((await f.submit({ [field]: i % 2 ? 'bot' : { malformed: true } })).status, 400)
    assert.equal((await f.submit({ [field]: 'bot' })).status, 429)
    assert.equal(f.calls.provider + f.calls.queries.length + f.calls.sessions.length, 0)
  }
})
test('invalid CAPTCHA tokens never reach provider or account work', async () => {
  for (const turnstileToken of [undefined, '', {}, 'a'.repeat(2049)]) {
    const f = fixture(); assert.equal((await f.submit({ turnstileToken })).status, 400)
    assert.equal(f.calls.provider + f.calls.queries.length + f.calls.sessions.length, 0)
  }
})
test('inactive/wrong-password/locked accounts reject without sessions or success audit', async () => {
  for (const [options, marker, checks] of [[{ active: false }, 'WRONG_PASSWORD', 0], [{ correct: false }, 'WRONG_PASSWORD', 1], [{ count: '5' }, 'LOCKED_OUT', 0]]) {
    const f = fixture(options); assert.equal((await f.submit()).status, 400)
    assert.equal(f.calls.attempts[0][2], marker); assert.equal(f.calls.verifies, checks)
    assert.equal(f.calls.sessions.length + f.calls.cookies.length + f.calls.audit.length, 0)
  }
})
test('DB failures and malformed lock counts fail closed before password/session', async () => {
  for (const options of [{ brokenDb: true }, ...[null, -1, 'invalid', 0.5, Number.MAX_SAFE_INTEGER + 1].map(count => ({ count }))]) {
    const f = fixture(options); assert.equal((await f.submit()).status, 503)
    assert.equal(f.calls.verifies + f.calls.attempts.length + f.calls.sessions.length + f.calls.cookies.length, 0)
  }
})

const jsx = (type, props) => ({ type, props })
const descendants = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(descendants)]
function pageFixture(reply) {
  const hooks = [], requests = [], pushes = []; let cursor = 0, tree
  const react = { useState(initial) { const i = cursor++; if (!hooks[i]) { const hook = { value: initial }; hook.set = next => { hook.value = typeof next === 'function' ? next(hook.value) : next }; hooks[i] = hook }; return [hooks[i].value, hooks[i].set] } }
  const Button = () => null, Input = () => null, TurnstileWidget = () => null
  const Page = load('app/(admin-auth)/hs/login/page.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/navigation': { useRouter: () => ({ push: value => pushes.push(value) }) },
    '@/components/ui/button': { Button }, '@/components/ui/input': { Input }, '@/components/turnstile-widget': { TurnstileWidget },
  }, { fetch: async (url, options) => { requests.push({ url, options }); return reply() } }).default
  const render = () => { cursor = 0; tree = Page() }; render()
  const find = predicate => descendants(tree).find(predicate)
  find(node => node.type === Input).props.onChange({ target: { value: 'admin@example.invalid' } }); render()
  find(node => node.props.id === 'admin-password').props.onChange({ target: { value: 'SyntheticPass123!' } }); render()
  return { requests, pushes,
    get widget() { return find(node => node.type === TurnstileWidget).props },
    get button() { return find(node => node.type === Button).props },
    authorize(token) { this.widget.onToken(token); render() },
    async submit() { await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); render() },
  }
}
test('admin form requires fresh CAPTCHA after HTTP/network/JSON/envelope failures and preserves credentials', async () => {
  for (const reply of [async () => Response.json({ status: 'error', message: 'Wrong password' }), async () => { throw new Error('offline') }, async () => new Response('invalid'), async () => Response.json({}), async () => Response.json(null), async () => Response.json({ status: 'success' }, { status: 500 }), async () => Response.json({ status: 'error', message: {} })]) {
    const f = pageFixture(reply); assert.equal(f.widget.action, 'admin_login')
    await f.submit(); assert.equal(f.requests.length, 0)
    f.authorize('first'); await f.submit(); assert.equal(f.requests.length, 1)
    assert.equal(f.widget.resetKey, 1); assert.equal(f.button.disabled, true); assert.equal(f.button.loading, false); assert.equal(f.pushes.length, 0)
    await f.submit(); assert.equal(f.requests.length, 1)
    f.authorize('fresh'); await f.submit(); assert.equal(f.requests.length, 2); assert.equal(f.widget.resetKey, 2)
    assert.deepEqual(JSON.parse(f.requests[1].options.body), { email: 'admin@example.invalid', password: 'SyntheticPass123!', turnstileToken: 'fresh' })
  }
})
test('admin form routes to dashboard only on explicit HTTP+status success', async () => {
  const f = pageFixture(async () => Response.json({ status: 'success', admin: { id: 7 } }))
  f.authorize('fresh'); await f.submit(); assert.deepEqual(f.pushes, ['/hs/dashboard'])
  assert.equal(f.widget.resetKey, 1); assert.equal(f.button.disabled, true)
})

// Offline customer auth entry tests. Provider, cookies, sessions and mail are
// synthetic; source handlers/forms, validation, Argon2 and SQLite SQL are real.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
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
  }, URL, URLSearchParams, Request, Response, Headers, Date, Buffer, AbortSignal, process, console: { error() {} }, ...globals }, { filename: file })
  return module.exports
}
const auth = load('lib/auth.ts', { jose: {} })
const validation = load('lib/validation.ts')
const safeRedirect = load('lib/safe-redirect.ts')
const password = 'SyntheticEntryPass123!'
const passwordHash = await auth.hashPassword(password)
const actions = { login: 'login', register: 'register', forgot: 'forgot_password' }
const helpers = { success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) }
function fixture({ kind, origin = 'https://staging.example.test', captcha = 'valid', allowed = true } = {}) {
  const sql = new DatabaseSync(':memory:')
  sql.exec('CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, phone TEXT, password_hash TEXT, is_temp_pass INTEGER, email_verified INTEGER, reset_token TEXT, reset_expires TEXT)')
  sql.prepare('INSERT INTO customers VALUES (1,?,?,?,?,0,1,NULL,NULL)').run('Existing Customer', 'fixture@example.invalid', '0123456789', passwordHash)
  const calls = { reads: 0, writes: 0, hashes: 0, verifies: 0, captcha: [], provider: 0, sessions: [], cookies: [], verification: [], reset: [], vouchers: [] }
  const db = {
    async query(query, params = []) { calls.reads++; return [sql.prepare(query).all(...params), []] },
    async execute(query, params = []) { calls.writes++; const result = sql.prepare(query).run(...params.map(value => value instanceof Date ? value.toISOString() : value)); return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []] },
  }
  const verifier = load('lib/turnstile.ts', {}, {
    process: { env: { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'synthetic-secret' } },
    fetch: async (_, options) => {
      calls.provider++
      if (captcha === 'network') throw new Error('synthetic network failure')
      const token = new URLSearchParams(options.body).get('response')
      return Response.json({ success: captcha !== 'reject', hostname: captcha === 'host' ? 'evil.invalid' : captcha === 'cross-host' ? (new URL(origin).hostname === 'staging.example.test' ? 'eastel.site' : 'staging.example.test') : new URL(origin).hostname,
        action: captcha === 'action' ? 'unrelated_action' : token })
    },
  })
  const route = load(`app/api/auth/${kind}/route.ts`, {
    '@/lib/db': { __esModule: true, default: db }, '@/lib/site': { SITE_URL: origin }, '@/lib/validation': validation,
    // The dedicated admission suite exercises the persistent guard and locks.
    '@/lib/customer-login-attempts': { withCustomerLoginAttempt: async (_identity, operation) => operation(db) },
    '@/lib/auth': { ...auth, hashPassword: async value => { calls.hashes++; return auth.hashPassword(value) }, verifyPassword: async (...args) => { calls.verifies++; return auth.verifyPassword(...args) } },
    '@/lib/turnstile': { verifyTurnstile: async (...args) => { calls.captcha.push(args); return verifier.verifyTurnstile(...args) } },
    '@/lib/rate-limit': { checkRateLimit: (key, limit, duration) => { assert.equal(key, `${kind}:203.0.113.99`); assert.equal(limit, kind === 'login' ? 10 : 5); assert.equal(duration, 900000); return { allowed } } },
    '@/lib/session': { createSession: async (...args) => { calls.sessions.push(args); return 'synthetic-session' } },
    '@/lib/cookies': { setSessionCookie: async value => { calls.cookies.push(value) } },
    '@/lib/vouchers': { voucherIssueWelcome: async id => { calls.vouchers.push(id) } },
    '@/lib/account-verification': { issueAccountVerification: async (...args) => { calls.verification.push(args); return { token: 'a'.repeat(64), sent: true } } },
    '@/lib/email': { sendPasswordReset: async (...args) => { calls.reset.push(args); return true } },
    '../_helpers': { ...helpers, getClientIp: () => '203.0.113.99' },
  })
  const body = kind === 'register' ? { name: 'New Customer', email: 'new@example.invalid', phone: '0123456789', password } : kind === 'login' ? { email: 'fixture@example.invalid', password } : { email: 'fixture@example.invalid' }
  return { sql, calls, close: () => sql.close(), body,
    submit(overrides = {}) { return route.POST(new Request(`https://evil.invalid/api/auth/${kind}`, { method: 'POST', headers: { host: 'evil.invalid', 'x-forwarded-host': 'evil.invalid' }, body: JSON.stringify({ ...body, turnstileToken: actions[kind], ...overrides }) })) },
  }
}
for (const kind of Object.keys(actions)) {
  test(`${kind}: blocked CAPTCHA/domain/action cannot reach account/password/session/mail work`, async () => {
    for (const captcha of ['reject', 'host', 'cross-host', 'action', 'network', 'missing', 'object', 'oversized']) {
      const f = fixture({ kind, captcha })
      try {
        const overrides = captcha === 'missing' ? { turnstileToken: undefined } : captcha === 'object' ? { turnstileToken: {} } : captcha === 'oversized' ? { turnstileToken: 'a'.repeat(2049) } : {}
        assert.equal((await f.submit(overrides)).status, 400)
        assert.equal(f.calls.reads + f.calls.writes + f.calls.hashes + f.calls.verifies + f.calls.sessions.length + f.calls.cookies.length + f.calls.reset.length + f.calls.verification.length, 0)
      } finally { f.close() }
    }
  })
  test(`${kind}: correct action accepts only the configured host for staging and production`, async () => {
    for (const origin of ['https://staging.example.test', 'https://eastel.site']) {
      const f = fixture({ kind, origin })
      try {
        assert.equal((await f.submit()).status, 200)
        assert.equal(f.calls.captcha[0][2].action, actions[kind]); assert.equal(f.calls.captcha[0][2].hostname, new URL(origin).hostname)
      } finally { f.close() }
    }
  })
  test(`${kind}: quota rejection stays before provider and account work`, async () => {
    const f = fixture({ kind, allowed: false })
    try { assert.equal((await f.submit()).status, 429); assert.equal(f.calls.captcha.length + f.calls.reads + f.calls.writes + f.calls.hashes + f.calls.verifies, 0) }
    finally { f.close() }
  })
}
test('register rejects blank names without creating an account, voucher, session or verification', async () => {
  const f = fixture({ kind: 'register' })
  try { assert.equal((await f.submit({ name: ' \t\n ' })).status, 400); assert.equal(f.calls.writes + f.calls.hashes + f.calls.vouchers.length + f.calls.sessions.length + f.calls.verification.length, 0) }
  finally { f.close() }
})
test('forgot keeps unknown and known email responses identical and stores only a digest', async () => {
  const f = fixture({ kind: 'forgot' })
  try {
    const unknown = await f.submit({ email: 'unknown@example.invalid' }), known = await f.submit({ lang: 'zh' })
    assert.equal(unknown.status, 200); assert.equal(known.status, 200); assert.deepEqual(await unknown.json(), await known.json())
    assert.equal(f.calls.reset.length, 1); const raw = f.calls.reset[0][1]
    assert.equal(f.sql.prepare('SELECT reset_token FROM customers WHERE id=1').get().reset_token, createHash('sha256').update(raw).digest('hex'))
    assert.equal(f.calls.reset[0][2], 'zh'); assert.equal(f.calls.sessions.length, 0)
  } finally { f.close() }
})
test('login preserves verified/temporary-password flags, rejects wrong passwords and creates a password-bound session', async () => {
  const f = fixture({ kind: 'login' })
  try {
    assert.equal((await f.submit({ password: 'Incorrect123!' })).status, 400); assert.equal(f.calls.cookies.length, 0)
    f.sql.exec('UPDATE customers SET is_temp_pass=1,email_verified=0 WHERE id=1')
    const response = await f.submit(); const data = await response.json()
    assert.equal(data.requiresPasswordChange, true); assert.equal(data.requiresEmailVerification, true)
    assert.equal(f.calls.sessions[0][3], 'customer'); assert.equal(f.calls.sessions[0][4], passwordHash); assert.equal(f.calls.cookies[0], 'synthetic-session')
  } finally { f.close() }
})

const jsx = (type, props) => ({ type, props })
const descendants = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(descendants)]
function pageFixture(kind, { locale = 'zh', reply = async () => Response.json({ status: 'error', message: 'Synthetic failure' }), redirect = null, translations = true } = {}) {
  const hooks = [], requests = [], pushes = []
  let cursor = 0, tree
  const react = {
    useState(value) { const index = cursor++; if (!hooks[index]) { const hook = { value: typeof value === 'function' ? value() : value }; hook.set = next => { hook.value = typeof next === 'function' ? next(hook.value) : next }; hooks[index] = hook }; return [hooks[index].value, hooks[index].set] },
    useRef(value) { const index = cursor++; return hooks[index] ??= { current: value } },
  }
  const Button = () => null, Input = () => null, PasswordField = () => null, TurnstileWidget = () => null
  const tr = translations ? JSON.parse(fs.readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), 'utf8')) : {}
  const Page = load(`app/[locale]/account/(auth)/${kind}/page.tsx`, {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { __esModule: true, default: () => null },
    'next/navigation': { useParams: () => ({ locale }), useRouter: () => ({ push: value => pushes.push(value) }), useSearchParams: () => new URLSearchParams({ ...(redirect ? { redirect } : {}), ...(kind === 'verify-email' ? { token: 'b'.repeat(64) } : {}) }) },
    'lucide-react': { Eye: () => null, EyeOff: () => null, Mail: () => null },
    '@/components/ui/button': { Button }, '@/components/ui/input': { Input }, '@/components/ui/password-field': { PasswordField }, '@/components/ui/auth-shell': { AuthShell: () => null },
    '@/components/turnstile-widget': { TurnstileWidget }, '@/lib/safe-redirect': safeRedirect,
    '@/hooks/useTranslation': { useTranslation: () => ({ t: (key, fallback) => tr[key] ?? fallback }) },
  }, { fetch: async (url, options) => { requests.push({ url, options }); return reply(url, options) } }).default
  const render = () => { cursor = 0; tree = Page() }
  const find = predicate => descendants(tree).find(predicate)
  render()
  return { requests, pushes, render,
    get widget() { return find(node => node.type === TurnstileWidget)?.props },
    get button() { return find(node => node.type === Button)?.props },
    get formPresent() { return !!find(node => node.type === 'form') },
    get shell() { return tree.props },
    get text() { return descendants(tree).flatMap(node => [node.props?.children].flat(Infinity).filter(value => typeof value === 'string')).join(' ') },
    async resend() { const button = descendants({ props: { children: tree.props.footer } }).find(node => node.type === 'button'); await button.props.onClick(); render() },
    code(value) { for (let i = 0; i < value.length; i++) { descendants(tree).filter(node => node.type === 'input' && node.props.inputMode === 'numeric')[i].props.onChange({ target: { value: value[i] } }); render() } },
    field(field, value) {
      let node
      if (['password', 'confirm'].includes(field)) node = find(node => node.props?.id === field)
      else node = find(node => node.type === Input && (field === 'email' ? node.props.type === 'email' : field === 'phone' ? node.props.type === 'tel' : node.props.autoComplete === 'name'))
      node.props.onChange(node.type === PasswordField ? value : { target: { value } }); render()
    },
    fill() { this.field('email', kind === 'register' ? 'new@example.invalid' : 'fixture@example.invalid'); if (kind !== 'forgot') this.field('password', password); if (kind === 'register') { this.field('name', 'New Customer'); this.field('phone', '0123456789'); this.field('confirm', password) } },
    authorize(token = actions[kind]) { this.widget.onToken(token); render() },
    async submit() { await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); render() },
  }
}
for (const kind of Object.keys(actions)) {
  test(`${kind} form requires a token and resets it after server/network/JSON/invalid-envelope failures`, async () => {
    for (const reply of [async () => Response.json({ status: 'error', message: 'Synthetic failure' }), async () => { throw new Error('offline') }, async () => new Response('invalid json'), async () => Response.json({}), async () => Response.json({ status: 'success' }, { status: 500 })]) {
      const f = pageFixture(kind, { reply }); f.fill()
      assert.equal(f.widget.action, actions[kind]); assert.equal(f.button.disabled, true)
      await f.submit(); assert.equal(f.requests.length, 0)
      f.authorize('first'); await f.submit(); assert.equal(f.requests.length, 1); assert.equal(f.widget.resetKey, 1); assert.equal(f.button.disabled, true); assert.equal(f.button.loading, false); assert.equal(f.pushes.length, 0)
      await f.submit(); assert.equal(f.requests.length, 1)
      f.authorize('fresh'); await f.submit(); assert.equal(f.requests.length, 2); assert.equal(f.widget.resetKey, 2)
      const body = JSON.parse(f.requests[1].options.body); assert.equal(body.turnstileToken, 'fresh'); assert.equal(body.email, kind === 'register' ? 'new@example.invalid' : 'fixture@example.invalid')
    }
  })
}
for (const kind of ['register', 'forgot']) {
  test(`${kind} page sends its locale through the actual handler to the synthetic mail handoff`, async () => {
    for (const locale of ['en', 'ms', 'zh']) {
      const backend = fixture({ kind })
      try {
        const f = pageFixture(kind, { locale, reply: async (_, options) => backend.submit(JSON.parse(options.body)) })
        f.fill(); f.authorize(); await f.submit()
        assert.equal(JSON.parse(f.requests[0].options.body).lang, locale)
        assert.equal((kind === 'register' ? backend.calls.verification : backend.calls.reset)[0][kind === 'register' ? 1 : 2], locale)
        if (kind === 'register') { assert.equal(backend.calls.vouchers.length, 1); assert.match(f.pushes[0], new RegExp(`^/${locale}/account/verify-email\\?token=`)) }
        else { assert.equal(f.formPresent, false); assert.equal(f.shell.description, JSON.parse(fs.readFileSync(new URL(`../locales/${locale}.json`, import.meta.url))).authResetSentInstructions) }
      } finally { backend.close() }
    }
  })
}
test('register client mismatch leaves an unused CAPTCHA intact', async () => {
  const f = pageFixture('register'); f.fill(); f.authorize(); f.field('confirm', 'Mismatch123!'); await f.submit()
  assert.equal(f.requests.length, 0); assert.equal(f.widget.resetKey, 0); assert.equal(f.button.disabled, false)
})
test('login keeps local redirects and verification/password-change routing in all languages', async () => {
  for (const locale of ['en', 'ms', 'zh']) {
    for (const [result, redirect, expected] of [
      [{ emailVerified: true }, '/hs/orders?filter=mine', '/hs/orders?filter=mine'],
      [{ emailVerified: true }, 'https://evil.invalid/', `/${locale}/account/orders`],
      [{ emailVerified: false }, null, `/${locale}/account/verify-email`],
      [{ emailVerified: true, requiresPasswordChange: true }, null, `/${locale}/account/password`],
    ]) {
      const f = pageFixture('login', { locale, redirect, reply: async () => Response.json({ status: 'success', ...result }) }); f.fill(); f.authorize(); await f.submit()
      assert.deepEqual(f.pushes, [expected]); assert.equal(f.widget.resetKey, 1)
    }
  }
})
test('forgot accepted-request copy stays conditional, translated and free of internal fallback notes', async () => {
  for (const locale of ['en', 'ms', 'zh']) {
    const tr = JSON.parse(fs.readFileSync(new URL(`../locales/${locale}.json`, import.meta.url)))
    assert.ok(tr.authResetRequestedFor); assert.ok(!tr.authSentInstructionsTo)
    for (const translations of [true, false]) {
      const f = pageFixture('forgot', { locale, translations, reply: async () => Response.json({ status: 'success' }) }); f.fill(); f.authorize(); await f.submit()
      assert.equal(f.formPresent, false); assert.ok(!f.shell.description.includes('[x]')); assert.ok(!f.shell.description.includes('forgot/page.tsx')); assert.ok(!f.text.includes('We sent reset instructions'))
    }
  }
})

function resendFixture({ authenticated = true, verified = false, allowed = true, sent = true } = {}) {
  const calls = []
  const route = load('app/api/auth/resend-code/route.ts', {
    '@/lib/rate-limit': { checkRateLimit: () => ({ allowed }) },
    '@/lib/account-verification': { issueAccountVerification: async (...args) => { calls.push(args); return { token: 'c'.repeat(64), sent } } },
    '../_helpers': { ...helpers, requireSession: async () => authenticated ? { customerId: 1, email: 'owner@example.invalid', emailVerified: verified } : null },
  })
  return { calls, post: body => route.POST(new Request('https://fixture.invalid/api/auth/resend-code', { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })) }
}
test('verification resend carries each locale, rotates the form proof and preserves session email ownership', async () => {
  for (const locale of ['en', 'ms', 'zh']) {
    const backend = resendFixture()
    const f = pageFixture('verify-email', { locale, reply: async (url, options) => url.endsWith('resend-code') ? backend.post(JSON.parse(options.body)) : Response.json({ status: 'success', emailVerified: true }) })
    await f.resend()
    assert.equal(backend.calls[0][0], 'owner@example.invalid'); assert.equal(backend.calls[0][1], locale)
    assert.equal(JSON.parse(f.requests[0].options.body).lang, locale)
    f.code('123456'); await f.submit()
    assert.equal(JSON.parse(f.requests[1].options.body).token, 'c'.repeat(64)); assert.deepEqual(f.pushes, [`/${locale}/account/orders`])
  }
})
test('verification only navigates after HTTP success and an explicitly verified result', async () => {
  for (const reply of [async () => Response.json({ status: 'success', emailVerified: true }, { status: 500 }), async () => Response.json({ status: 'success', emailVerified: false }), async () => Response.json({}), async () => new Response('bad json'), async () => { throw new Error('offline') }]) {
    const f = pageFixture('verify-email', { reply }); f.code('123456'); await f.submit()
    assert.equal(f.pushes.length, 0); assert.equal(f.button.loading, false)
  }
})
test('resend preserves old empty POST/default locale, rejects unauthenticated/limited work, and reports delivery failure', async () => {
  for (const body of [undefined, { lang: 'invalid', email: 'attacker@example.invalid' }]) { const f = resendFixture(); assert.equal((await f.post(body)).status, 200); assert.deepEqual(f.calls[0], ['owner@example.invalid', 'en']) }
  for (const [options, status] of [[{ authenticated: false }, 401], [{ allowed: false }, 429], [{ sent: false }, 502]]) {
    const f = resendFixture(options); assert.equal((await f.post({ lang: 'zh' })).status, status)
    if (!options.sent) assert.equal(f.calls.length, options.sent === false ? 1 : 0)
  }
})
test('already-verified resend returns to the safe destination without claiming a new email', async () => {
  const backend = resendFixture({ verified: true })
  const f = pageFixture('verify-email', { redirect: 'https://evil.invalid', reply: async (_, options) => backend.post(JSON.parse(options.body)) })
  await f.resend(); assert.equal(backend.calls.length, 0); assert.deepEqual(f.pushes, ['/zh/account/orders'])
})
test('verification and resend cannot overlap and successful resend clears stale digits', async () => {
  let finishResend
  const resend = pageFixture('verify-email', { reply: () => new Promise(resolve => { finishResend = resolve }) })
  resend.code('123456')
  const pendingResend = resend.resend(); resend.render()
  assert.equal(resend.button.disabled, true); await resend.submit(); assert.equal(resend.requests.length, 1)
  finishResend(Response.json({ status: 'success', verificationToken: 'c'.repeat(64) })); await pendingResend
  await resend.submit(); assert.equal(resend.requests.length, 1, 'Old digits must be cleared after resend')

  let finishVerify
  const verify = pageFixture('verify-email', { reply: () => new Promise(resolve => { finishVerify = resolve }) })
  verify.code('123456')
  const pendingVerify = verify.submit(); verify.render()
  await verify.resend(); assert.equal(verify.requests.length, 1)
  finishVerify(Response.json({ status: 'success', emailVerified: true })); await pendingVerify
  assert.deepEqual(verify.pushes, ['/zh/account/orders'])
})

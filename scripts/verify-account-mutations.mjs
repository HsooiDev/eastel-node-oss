// Actual local handlers/forms with synthetic SQL, cookies and Siteverify only.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(source, { module, exports: module.exports, require(id) {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('@/') || id.startsWith('.')) throw new Error(`Unmocked dependency: ${id}`)
    return require(id)
  }, URL, URLSearchParams, Response, Request, Headers, AbortSignal, Buffer,
  console: { error() {} }, process, ...globals }, { filename: file })
  return module.exports
}
const validation = load('lib/validation.ts')
const auth = load('lib/auth.ts', { jose: {} })
const originalHash = await auth.hashPassword('PreviousPassword123!')
const helper = { success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) }
function fixture({ authenticated = true, captcha = 'valid', origin = 'https://staging.example.test', noReviews = false, failReview = false, failSessionDelete = false, race = false } = {}) {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, address TEXT, postcode TEXT, state TEXT, password_hash TEXT, is_temp_pass INTEGER);
    CREATE TABLE reviews (id INTEGER PRIMARY KEY, customer_id INTEGER, display_name TEXT, display_mode TEXT, status TEXT, rating INTEGER DEFAULT 5, review_text TEXT DEFAULT 'Fixture review', created_at TEXT DEFAULT '2026-10-16', categories TEXT DEFAULT '[]');
    CREATE TABLE sessions (id TEXT, customer_id INTEGER, role TEXT);`)
  sql.prepare('INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(1, 'Old Name', 'fixture@example.invalid', '0123456789', 'Old Street', '50000', 'Kuala Lumpur', originalHash, 1)
  sql.prepare('INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(2, 'Other Customer', 'other@example.invalid', '', '', '', '', originalHash, 0)
  for (const [id, owner, mode, status] of [[1, 1, 'public', 'approved'], [2, 1, 'private', 'approved'], [3, 2, 'public', 'approved'], [4, 1, 'public', 'rejected']]) {
    sql.prepare('INSERT INTO reviews(id,customer_id,display_name,display_mode,status) VALUES (?,?,?,?,?)').run(id, owner, mode === 'private' ? '' : 'Old Display', mode, status)
  }
  sql.exec("INSERT INTO sessions VALUES ('customer-one',1,'customer'),('customer-two',1,'customer'),('admin',1,'admin'),('other',2,'customer')")
  if (noReviews) sql.exec('DROP TABLE reviews')
  const calls = { query: 0, write: 0, connection: 0, hash: 0, verify: 0, captcha: [], cookieClear: 0 }
  const db = {
    async query(query, params = []) { calls.query++; return [sql.prepare(query).all(...params), []] },
    async execute(query, params = []) {
      calls.write++
      if (failReview && query.includes('UPDATE reviews')) throw Object.assign(new Error('synthetic permission failure'), { code: 'ER_TABLEACCESS_DENIED_ERROR' })
      if (failSessionDelete && query.includes('DELETE FROM sessions')) throw new Error('synthetic session write failure')
      try { const row = sql.prepare(query).run(...params); return [{ affectedRows: Number(row.changes) }, []] }
      catch (error) { if (error.message.includes('no such table: reviews')) error.code = 'ER_NO_SUCH_TABLE'; throw error }
    },
    async getConnection() {
      calls.connection++
      if (race) sql.prepare('UPDATE customers SET password_hash=? WHERE id=1').run('concurrent-reset-hash')
      return { ...db, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => { if (sql.isTransaction) sql.exec('ROLLBACK') }, release() {} }
    },
  }
  const verifier = load('lib/turnstile.ts', {}, {
    process: { env: { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'synthetic-only-secret' } },
    fetch: async (_, options) => {
      const token = new URLSearchParams(options.body).get('response')
      const result = { success: captcha !== 'reject', hostname: new URL(origin).hostname, action: token }
      if (captcha === 'host') result.hostname = 'evil.invalid'
      if (captcha === 'cross-host') result.hostname = new URL(origin).hostname === 'staging.example.test' ? 'eastel.site' : 'staging.example.test'
      if (captcha === 'action') result.action = 'login'
      if (captcha === 'network') throw new Error('synthetic provider failure')
      return Response.json(result)
    },
  })
  const deps = {
    '@/lib/db': { __esModule: true, default: db }, '@/lib/validation': validation,
    '@/lib/site': { SITE_URL: origin },
    '@/lib/turnstile': { verifyTurnstile: async (...args) => { calls.captcha.push(args); return verifier.verifyTurnstile(...args) } },
    '@/lib/auth': { hashPassword: async value => { calls.hash++; return auth.hashPassword(value) }, verifyPassword: async (...args) => { calls.verify++; return auth.verifyPassword(...args) } },
    '@/lib/cookies': { clearSessionCookie: async () => { calls.cookieClear++ } },
    '../_helpers': { ...helper, requireSession: async () => authenticated ? { customerId: 1 } : null, getClientIp: () => '203.0.113.90' },
  }
  return { sql, calls, close: () => sql.close(),
    async submit(kind, body = {}) {
      const route = load(`app/api/auth/update-${kind}/route.ts`, deps)
      const defaults = kind === 'profile' ? { name: 'New Name', phone: '0123456780', address: 'New Street', postcode: '50001', state: 'Selangor' } : { currentPassword: 'PreviousPassword123!', newPassword: 'NewPassword123!' }
      return route.POST(new Request(`https://evil.invalid/api/auth/update-${kind}`, { method: 'POST', headers: { host: 'evil.invalid', 'x-forwarded-host': 'evil.invalid' }, body: JSON.stringify({ ...defaults, turnstileToken: `update_${kind}`, ...body }) }))
    },
    async publicReviews() {
      const route = load('app/api/reviews/public/route.ts', { '@/lib/db': { __esModule: true, default: db }, '@/app/api/auth/_helpers': helper, '@/lib/db-helpers': load('lib/db-helpers.ts') })
      return (await (await route.GET({ nextUrl: new URL('https://fixture.invalid/api/reviews/public') })).json()).reviews
    },
    async approve(reviewId, authorized = true) {
      const route = load('app/api/admin/reviews/route.ts', {
        '@/lib/db': { __esModule: true, default: db }, '@/lib/validation': validation,
        '@/lib/db-helpers': load('lib/db-helpers.ts'),
        '../_helpers': { ...helper, requireAdminCsrf: async () => authorized ? { customerId: 7 } : null },
        '@/lib/audit': { logAdminAction: async () => {} }, '@/lib/review-upload-path': {},
      })
      return route.POST(new Request('https://fixture.invalid/api/admin/reviews', { method: 'POST', body: JSON.stringify({ reviewId, action: 'approve' }) }))
    },
  }
}
for (const kind of ['profile', 'password']) {
  test(`${kind}: authentication rejects before parsing/CAPTCHA or account operations`, async () => {
    const f = fixture({ authenticated: false })
    try { assert.equal((await f.submit(kind)).status, 401); assert.equal(f.calls.captcha.length, 0); assert.equal(f.calls.query + f.calls.write + f.calls.connection + f.calls.hash, 0) }
    finally { f.close() }
  })
  test(`${kind}: missing, malformed and rejected CAPTCHA stop account reads/writes and password work`, async () => {
    for (const captcha of ['reject', 'host', 'cross-host', 'action', 'network', 'missing', 'object']) {
      const f = fixture({ captcha })
      try {
        const body = captcha === 'missing' ? { turnstileToken: undefined } : captcha === 'object' ? { turnstileToken: {} } : {}
        assert.equal((await f.submit(kind, body)).status, 400)
        assert.equal(f.calls.query + f.calls.write + f.calls.connection + f.calls.hash + f.calls.verify, 0)
      } finally { f.close() }
    }
  })
  test(`${kind}: configured action/hostname work in both modes and never follow request Host`, async () => {
    for (const origin of ['https://staging.example.test', 'https://eastel.site']) {
      const f = fixture({ origin })
      try {
        assert.equal((await f.submit(kind)).status, 200)
        assert.equal(f.calls.captcha.length, 1)
        assert.equal(f.calls.captcha[0][2].action, `update_${kind}`)
        assert.equal(f.calls.captcha[0][2].hostname, new URL(origin).hostname)
      } finally { f.close() }
    }
  })
}
test('profile: whitespace-only name is rejected before CAPTCHA and database writes', async () => {
  const f = fixture()
  try { assert.equal((await f.submit('profile', { name: ' \t\n ' })).status, 400); assert.equal(f.calls.captcha.length, 0); assert.equal(f.calls.write + f.calls.connection, 0) }
  finally { f.close() }
})
test('profile: save atomically renames own public reviews and returns them to approval', async () => {
  const f = fixture()
  try {
    assert.equal((await f.publicReviews()).length, 3)
    assert.equal((await f.submit('profile', { name: '  New Name  ', email: 'attacker@example.invalid', customerId: 2 })).status, 200)
    const customer = f.sql.prepare('SELECT * FROM customers WHERE id=1').get()
    assert.equal(customer.name, 'New Name'); assert.equal(customer.phone, '0123456780'); assert.equal(customer.address, 'New Street')
    assert.equal(customer.email, 'fixture@example.invalid'); assert.equal(customer.password_hash, originalHash)
    for (const id of [1, 4]) { const r = f.sql.prepare('SELECT * FROM reviews WHERE id=?').get(id); assert.equal(r.display_name, 'New Name'); assert.equal(r.status, 'pending') }
    const privateReview = f.sql.prepare('SELECT * FROM reviews WHERE id=2').get()
    assert.equal(privateReview.display_name, ''); assert.equal(privateReview.status, 'approved')
    assert.equal(f.sql.prepare('SELECT display_name FROM reviews WHERE id=3').get().display_name, 'Old Display')
    const visible = await f.publicReviews()
    assert.equal(visible.length, 2); assert.equal(visible.find(row => row.id === 2).customer_name, 'Anonymous Customer')
    assert.ok(!visible.some(row => [1, 4].includes(row.id)))
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 4)
    assert.equal((await f.approve(1, false)).status, 401)
    assert.ok(!(await f.publicReviews()).some(row => row.id === 1))
    assert.equal((await f.approve(1)).status, 200)
    assert.equal((await f.publicReviews()).find(row => row.id === 1).customer_name, 'New Name')
  } finally { f.close() }
})
test('profile: review display limit preserves complete Unicode characters', async () => {
  const f = fixture(), name = '顾客😀'.repeat(16)
  try { assert.equal((await f.submit('profile', { name })).status, 200); const display = f.sql.prepare('SELECT display_name FROM reviews WHERE id=1').get().display_name; assert.equal(display, Array.from(name).slice(0, 40).join('')); assert.equal(Array.from(display).length, 40) }
  finally { f.close() }
})
test('profile: moderation failure rolls back customer edits; only missing legacy reviews table is optional', async () => {
  const f = fixture({ failReview: true })
  try { assert.equal((await f.submit('profile')).status, 500); assert.equal(f.sql.prepare('SELECT name,phone FROM customers WHERE id=1').get().name, 'Old Name'); assert.equal(f.sql.prepare('SELECT phone FROM customers WHERE id=1').get().phone, '0123456789'); assert.equal(f.sql.prepare('SELECT status FROM reviews WHERE id=1').get().status, 'approved') }
  finally { f.close() }
  const legacy = fixture({ noReviews: true })
  try { assert.equal((await legacy.submit('profile')).status, 200); assert.equal(legacy.sql.prepare('SELECT name FROM customers WHERE id=1').get().name, 'New Name') }
  finally { legacy.close() }
})
test('password: wrong current password is inert; successful change uses real Argon2 and revokes only customer sessions', async () => {
  const f = fixture()
  try {
    assert.equal((await f.submit('password', { currentPassword: 'Incorrect123!' })).status, 400)
    assert.equal(f.calls.hash + f.calls.write + f.calls.cookieClear, 0)
    const response = await f.submit('password'); assert.equal(response.status, 200); assert.equal((await response.json()).reauthenticate, true)
    const row = f.sql.prepare('SELECT * FROM customers WHERE id=1').get()
    assert.equal(await auth.verifyPassword('NewPassword123!', row.password_hash), true)
    assert.equal(await auth.verifyPassword('PreviousPassword123!', row.password_hash), false)
    assert.equal(row.is_temp_pass, 0); assert.equal(f.calls.cookieClear, 1)
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM sessions WHERE customer_id=1 AND role='customer'").get().n, 0)
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 2)
  } finally { f.close() }
})
test('password: concurrent credential change and post-update failure retain CAS and rollback boundaries', async () => {
  const race = fixture({ race: true })
  try { assert.equal((await race.submit('password')).status, 409); assert.equal(race.sql.prepare('SELECT password_hash FROM customers WHERE id=1').get().password_hash, 'concurrent-reset-hash'); assert.equal(race.calls.cookieClear, 0); assert.equal(race.sql.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 4) }
  finally { race.close() }
  const rollback = fixture({ failSessionDelete: true })
  try { assert.equal((await rollback.submit('password')).status, 500); assert.equal(rollback.sql.prepare('SELECT password_hash FROM customers WHERE id=1').get().password_hash, originalHash); assert.equal(rollback.calls.cookieClear, 0); assert.equal(rollback.sql.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 4) }
  finally { rollback.close() }
})

const jsx = (type, props) => ({ type, props })
const descendants = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(descendants)]
function pageFixture(kind, reply = async () => Response.json({ status: 'error', message: 'Synthetic failure' }), locale = 'zh', initialLoad) {
  const hooks = [], requests = [], effects = [], redirects = []
  let cursor = 0, tree
  let loadReply = initialLoad ?? (async () => Response.json({ status: 'success', customer: { name: 'Fixture Name', phone: '0123456789', address: 'Fixture Street', postcode: '50000', state: 'Kuala Lumpur' } }))
  const react = {
    useState(value) { const index = cursor++; if (!hooks[index]) { const hook = { value }; hook.set = next => { hook.value = typeof next === 'function' ? next(hook.value) : next }; hooks[index] = hook }; return [hooks[index].value, hooks[index].set] },
    useEffect(fn, deps) { const index = cursor++, previous = hooks[index]; const changed = !previous || deps.some((value, i) => !Object.is(value, previous.deps[i])); hooks[index] = { deps, cleanup: previous?.cleanup }; if (changed) effects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = fn() }) },
  }
  const Button = () => null, PasswordField = () => null, TurnstileWidget = () => null
  const Page = load(`app/[locale]/account/(protected)/${kind}/page.tsx`, {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useParams: () => ({ locale }), useRouter: () => ({ replace: path => redirects.push(path) }) },
    '@/hooks/useTranslation': { useTranslation: () => ({ t: (_, fallback) => fallback }) },
    '@/components/ui/button': { Button }, '@/components/ui/password-field': { PasswordField }, '@/components/ui/account-card': { AccountCard: () => null },
    '@/components/turnstile-widget': { TurnstileWidget },
  }, { fetch: async (url, options) => {
    if (!options) return loadReply()
    requests.push({ url, options }); return reply()
  } }).default
  const render = () => { cursor = 0; tree = Page(); for (const effect of effects.splice(0)) effect() }
  const find = predicate => descendants(tree).find(predicate)
  render()
  return { requests, redirects, render,
    setLoadReply(value) { loadReply = value },
    unmount() { for (const hook of hooks) hook.cleanup?.() },
    get formPresent() { return !!find(node => node.type === 'form') },
    retry() { find(node => node.type === Button && node.props.type === 'button').props.onClick(); render() },
    async ready() { await new Promise(resolve => setImmediate(resolve)); render() },
    get widget() { return find(node => node.type === TurnstileWidget)?.props },
    get button() { return find(node => node.type === Button)?.props },
    get text() { return descendants(tree).flatMap(node => [node.props?.children].flat(Infinity).filter(value => typeof value === 'string')).join(' ') },
    change(id, value) { const field = find(node => node.props?.id === id); field.props.onChange(field.type === PasswordField ? value : { target: { value } }); render() },
    authorize() { this.widget.onToken(`update_${kind}`); render() },
    async submit() { await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); render() },
  }
}
for (const kind of ['profile', 'password']) {
  test(`${kind} page: token gate, correct action, consumed-token refresh and retry preserve form fields`, async () => {
    for (const reply of [async () => Response.json({ status: 'error', message: 'Synthetic failure' }), async () => { throw new Error('offline') }, async () => new Response('invalid json')]) {
      const f = pageFixture(kind, reply); await f.ready()
      if (kind === 'password') { f.change('cur', 'PreviousPassword123!'); f.change('new', 'NewPassword123!'); f.change('cnf', 'NewPassword123!') }
      else f.change('name', 'Updated Name')
      assert.equal(f.button.disabled, true); assert.equal(f.widget.action, `update_${kind}`)
      await f.submit(); assert.equal(f.requests.length, 0)
      f.authorize(); await f.submit()
      assert.equal(f.requests.length, 1); assert.equal(f.widget.resetKey, 1); assert.equal(f.button.disabled, true); assert.equal(f.button.loading, false)
      await f.submit(); assert.equal(f.requests.length, 1)
      f.authorize(); await f.submit(); assert.equal(f.requests.length, 2); assert.equal(f.widget.resetKey, 2)
      const body = JSON.parse(f.requests[1].options.body)
      assert.equal(body.turnstileToken, `update_${kind}`)
      assert.equal(kind === 'profile' ? body.name : body.newPassword, kind === 'profile' ? 'Updated Name' : 'NewPassword123!')
    }
  })
}
test('profile page explains reapproval in all locales; success refreshes CAPTCHA without signing out', async () => {
  for (const locale of ['en', 'ms', 'zh']) {
    const tr = JSON.parse(fs.readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), 'utf8'))
    assert.equal(typeof tr.profReviewReapproval, 'string'); assert.ok(tr.profReviewReapproval.length > 10)
    const f = pageFixture('profile', async () => Response.json({ status: 'success' }), locale); await f.ready()
    assert.match(f.text, /public reviews/)
    f.authorize(); await f.submit(); assert.equal(f.requests.length, 1); assert.equal(f.widget.resetKey, 1); assert.equal(f.redirects.length, 0)
  }
})
test('password page keeps unused CAPTCHA on invalid client input and redirects to localized login after success', async () => {
  for (const locale of ['en', 'ms', 'zh']) {
    const f = pageFixture('password', async () => Response.json({ status: 'success', reauthenticate: true }), locale)
    f.authorize(); f.change('new', 'short'); f.change('cnf', 'short'); await f.submit()
    assert.equal(f.requests.length, 0); assert.equal(f.widget.resetKey, 0)
    f.change('cur', 'PreviousPassword123!'); f.change('new', 'NewPassword123!'); f.change('cnf', 'Mismatch123!'); await f.submit(); assert.equal(f.requests.length, 0)
    f.change('cnf', 'NewPassword123!'); await f.submit()
    assert.deepEqual(f.redirects, [`/${locale}/account/login`]); assert.equal(f.widget.resetKey, 1)
  }
})
test('profile load failure offers retry without exposing an empty editable form', async () => {
  for (const initialLoad of [async () => { throw new Error('offline') }, async () => new Response('invalid json'), async () => Response.json({ status: 'error' }, { status: 401 }), async () => Response.json({ status: 'success' })]) {
    const f = pageFixture('profile', undefined, 'zh', initialLoad)
    await f.ready(); assert.match(f.text, /Failed to load profile/); assert.equal(f.formPresent, false); assert.equal(f.widget, undefined)
    f.setLoadReply(async () => Response.json({ status: 'success', customer: { name: 'Recovered Name', phone: '0123456789' } }))
    f.retry(); assert.equal(f.formPresent, false); await f.ready()
    assert.equal(f.formPresent, true); assert.equal(f.widget.action, 'update_profile')
    f.authorize(); await f.submit(); assert.equal(JSON.parse(f.requests[0].options.body).name, 'Recovered Name')
  }
})
test('unmounted profile load cannot replace the later rendered state', async () => {
  let resolveLoad
  const f = pageFixture('profile', undefined, 'en', () => new Promise(resolve => { resolveLoad = resolve }))
  f.unmount()
  resolveLoad(Response.json({ status: 'success', customer: { name: 'Late result' } }))
  await f.ready()
  assert.equal(f.formPresent, false); assert.equal(f.widget, undefined); assert.match(f.text, /Loading/)
})

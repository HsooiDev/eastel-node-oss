// Actual routes, response helpers, gateway/client source and page actions.
// All SQL is private SQLite and all provider fetches are intercepted; no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url), baseline = process.argv.includes('--baseline')
const base = '286e6612485122841e999836b0a762e29d83e476'
const changed = new Set(['app/api/admin/orders/regenerate-payment/route.ts', 'app/api/payment/callback/route.ts'])
function source(file) {
  return baseline && changed.has(file)
    ? execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' })
    : fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
}
function functionSource(file, name) {
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  function walk(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node.getText(ast))
    ts.forEachChild(node, walk)
  }
  walk(ast); assert.equal(found.length, 1, name + ' source must be unambiguous')
  return found[0]
}
function evaluate(text, file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(js, { module, exports: module.exports, require(id) {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('.') || id.startsWith('@/')) throw Error('Unmocked dependency: ' + id)
    return require(id)
  }, Request, Response, Headers, URL, URLSearchParams, AbortSignal, Date, console: { error() {} }, ...globals }, { filename: file })
  return module.exports
}
const load = (file, deps, globals) => evaluate(source(file), file, deps, globals)
const buildPaymentMessage = evaluate(functionSource('lib/whatsapp/ai.ts', 'buildPaymentMessage'), 'payment-message.ts').buildPaymentMessage
function fixture(options = {}) {
  const sql = new DatabaseSync(':memory:')
  sql.exec('CREATE TABLE orders(id INTEGER PRIMARY KEY,order_ref TEXT,full_name TEXT,phone TEXT,email TEXT,total_amount TEXT,lang TEXT,payment_status TEXT,source TEXT,bill_code TEXT,updated_at TEXT,order_status TEXT,toyyibpay_ref TEXT); CREATE TABLE customer_vouchers(id INTEGER PRIMARY KEY,order_id INTEGER,status TEXT,redeemed_amount TEXT,redeemed_at TEXT)')
  const original = { id: 1, order_ref: 'SYNTHETIC-OLD', full_name: 'Synthetic Customer', phone: '60123456789', email: 'customer@example.invalid', total_amount: '49.50', lang: 'zh', payment_status: 'failed', source: 'whatsapp', bill_code: 'OldBill1234', updated_at: '2026-10-18 00:00:00', order_status: 'pending', toyyibpay_ref: null, ...options.row }
  sql.prepare('INSERT INTO orders(' + Object.keys(original).join(',') + ') VALUES(' + Object.keys(original).map(() => '?').join(',') + ')').run(...Object.values(original))
  if (options.missing) sql.exec('DELETE FROM orders')
  sql.exec("INSERT INTO customer_vouchers VALUES(1,1,'redeemed','5','2026-10-18')")
  const calls = { bills: [], wa: [], writes: 0, audits: [], email: [], telegram: [], verifies: [] }
  const db = {
    async query(statement, params) {
      if (options.readFails) throw Error('Synthetic read failure')
      const result = sql.prepare(statement).all(...params)
      if (options.afterRead) await options.afterRead(sql, statement, params)
      return [result, []]
    },
    async execute(statement, params) {
      if (options.writeFails) throw Error('Synthetic write failure')
      if (options.beforeWrite) await options.beforeWrite(sql, statement, params)
      calls.writes++
      const normalized = statement.replace(/AS BINARY\)/g, 'AS BLOB)').replaceAll('<=>', 'IS')
      const result = sql.prepare(normalized).run(...params)
      if (options.writeCommitsThenThrows) throw Error('Synthetic lost write acknowledgement')
      return [{ affectedRows: Number(result.changes) }, []]
    },
  }
  const origin = options.origin || 'https://staging.example.test'
  const env = { TOYYIBPAY_SECRET_KEY: 'synthetic-secret', TOYYIBPAY_CATEGORY_CODE: 'synthetic-category', TOYYIBPAY_BASE_URL: 'https://gateway.example.invalid',
    WHATSAPP_PHONE_NUMBER_ID: 'synthetic-phone-id', WHATSAPP_ACCESS_TOKEN: 'synthetic-token', WHATSAPP_APP_SECRET: 'synthetic-app-secret' }
  const gateway = load('lib/toyyibpay.ts', { '@/lib/site': { SITE_URL: origin } }, { process: { env }, fetch: async (url, init) => {
    assert.equal(url, 'https://gateway.example.invalid/index.php/api/createBill')
    assert.ok(init.signal instanceof AbortSignal, 'bill creation must have a bounded abort signal')
    calls.bills.push(Object.fromEntries(new URLSearchParams(init.body)))
    if (options.createFails) return Response.json({ error: 'Synthetic rejection' }, { status: 502 })
    const newCode = options.uniqueBills ? 'NewBill' + calls.bills.length : 'NewBill1234'
    if (options.beforeBillResponse) await options.beforeBillResponse(sql, calls.bills.length)
    return Response.json([{ BillCode: newCode }])
  } })
  const wa = load('lib/whatsapp/client.ts', {}, { process: { env }, fetch: async (url, init) => {
    assert.ok(url.startsWith('https://graph.facebook.com/v22.0/synthetic-phone-id/messages?'))
    calls.wa.push(JSON.parse(init.body))
    if (options.sendThrows) throw Error('Synthetic network failure')
    if (options.sendFails) return Response.json({ error: { message: 'Synthetic rejection' } }, { status: 503 })
    return Response.json(options.noMessageId ? {} : { messages: [{ id: 'synthetic-message-id' }] })
  } })
  const helpers = load('app/api/admin/_helpers.ts', {
    '@/lib/cookies': { getSessionCookie: async () => 'synthetic-session' },
    '@/lib/session': { validateAdminSession: async () => options.unauthorized ? null : { customerId: 91 } },
    '@/lib/security': { validateCsrfToken: () => true }, '@/lib/site': { SITE_URL: origin },
  })
  const deps = { '@/lib/db': { __esModule: true, default: db }, '../../_helpers': helpers,
    '@/lib/db-helpers': { formatDate: () => '2026-10-18 01:00:00' }, '@/lib/toyyibpay': gateway,
    '@/lib/whatsapp/client': wa, '@/lib/whatsapp/ai': { buildPaymentMessage }, '@/lib/site': { SITE_URL: origin },
    '@/lib/audit': { logAdminAction: async (...args) => calls.audits.push(args) } }
  const regen = load('app/api/admin/orders/regenerate-payment/route.ts', deps, { process: { env } })
  const resend = load('app/api/admin/orders/resend-payment/route.ts', deps, { process: { env } })
  const transitions = load('lib/payment-status.ts', { '@/lib/db': { __esModule: true, default: db }, '@/lib/db-helpers': { formatDate: () => '2026-10-18 01:00:00' } })
  const callback = load('app/api/payment/callback/route.ts', {
    '@/lib/db': { __esModule: true, default: db }, '@/lib/db-helpers': { formatDate: () => '2026-10-18 01:00:00' },
    '@/lib/toyyibpay': { getBillTransactions: async code => { calls.verifies.push(code); return [{ billpaymentStatus: options.callbackStatus ?? 1, billpaymentid: 'synthetic-transaction', billpaymentInvoiceNo: 'synthetic-invoice' }] } },
    '@/lib/payment-status': transitions, '@/lib/email': { sendOrderConfirmedOnce: async code => calls.email.push(code) },
    '@/lib/telegram/notifications': { notifyTelegramOrderPaid: async code => calls.telegram.push(['paid', code]), notifyTelegramOrderFailed: async code => calls.telegram.push(['failed', code]) },
    '@/lib/whatsapp/client': wa,
  })
  return { calls, original, origin, row: () => sql.prepare('SELECT * FROM orders WHERE id=1').get(), voucher: () => sql.prepare('SELECT * FROM customer_vouchers WHERE id=1').get(), close: () => sql.close(),
    callback(code = original.bill_code) { return callback.POST(new Request(origin + '/api/payment/callback', { method: 'POST', body: new URLSearchParams({ billcode: code, status_id: '1' }) })) },
    async submit(kind = 'regen', body = { orderId: 1 }) {
      return (kind === 'regen' ? regen : resend).POST(new Request(origin + '/api/admin/orders/' + (kind === 'regen' ? 'regenerate' : 'resend') + '-payment', {
        method: 'POST', headers: { origin: options.badOrigin ? 'https://untrusted.invalid' : origin, host: new URL(origin).host, 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
    } }
}
const page = 'app/hs/orders/page.tsx'
function client(f, options = {}) {
  const calls = { posts: [], toasts: [], copied: [], refresh: 0, timers: [] }
  let loading = { unrelated: true }
  const text = ['getCsrfToken', 'adminPost', 'resendPayLink', 'regenPayLink'].map(name => functionSource(page, name)).join('\n') + '\nmodule.exports={resendPayLink,regenPayLink};'
  const actions = evaluate(text, 'payment-actions.ts', {}, {
    document: { cookie: 'csrf_token=synthetic-csrf' }, confirm: () => options.confirm !== false,
    navigator: options.noClipboard ? {} : { clipboard: { writeText: async value => { calls.copied.push(value); if (options.clipboardFails) throw Error('Denied') } } },
    setActionLoading: update => { loading = update(loading) },
    showToast: (message, ok = true) => calls.toasts.push({ message, ok }),
    fetchOrders: async () => { calls.refresh++ },
    setTimeout: callback => { calls.timers.push(callback); return 1 },
    fetch: async (path, init) => {
      calls.posts.push({ path, headers: init.headers, body: JSON.parse(init.body) })
      if (options.networkFails) throw Error('Synthetic network failure')
      if (options.invalidJson) return new Response('not-json', { status: 502 })
      if (options.payload) return Response.json(options.payload)
      return f.submit(path.includes('regenerate') ? 'regen' : 'resend', JSON.parse(init.body))
    },
  })
  return { ...actions, calls, loading: () => loading, flush: () => calls.timers.splice(0).forEach(callback => callback()) }
}

test('regeneration returns success with saved bill and localized message across both origins', async () => {
  for (const origin of ['https://staging.example.test', 'https://eastel.site']) for (const lang of ['en', 'ms', 'zh']) {
    const f = fixture({ origin, row: { lang } })
    try {
      const response = await f.submit(), result = await response.json()
      assert.equal(response.status, 200); assert.equal(result.status, 'success')
      assert.equal(result.pay_url, 'https://gateway.example.invalid/NewBill1234')
      assert.equal(result.bill_code, f.row().bill_code); assert.equal(result.order_ref, f.row().order_ref)
      assert.equal(f.row().payment_status, 'pending'); assert.equal(f.calls.writes, 1); assert.equal(f.calls.audits.length, 1)
      assert.equal(f.calls.bills.length, 1); assert.equal(f.calls.bills[0].billAmount, '4950')
      assert.equal(f.calls.bills[0].billReturnUrl, origin + '/payment/success')
      assert.equal(f.calls.bills[0].billCallbackUrl, origin + '/api/payment/callback')
      assert.equal(f.calls.wa.length, 1); assert.equal(f.calls.wa[0].to, f.original.phone)
      assert.equal(f.calls.wa[0].text.body, buildPaymentMessage(lang, result.pay_url, result.order_ref, 49.5))
    } finally { f.close() }
  }
})
test('WA rejection, missing message id and network failure preserve saved bill with warning and manual link', async () => {
  for (const failure of ['sendFails', 'noMessageId', 'sendThrows']) {
    const f = fixture({ [failure]: true })
    try {
      const response = await f.submit(), data = await response.json()
      assert.equal(response.status, 200); assert.equal(data.status, 'warning')
      assert.equal(f.row().bill_code, 'NewBill1234'); assert.equal(data.pay_url, 'https://gateway.example.invalid/NewBill1234')
      assert.equal(f.calls.bills.length, 1); assert.equal(f.calls.audits.length, 1)
    } finally { f.close() }
  }
})
test('gateway rejection never updates, audits or sends', async () => {
  const f = fixture({ createFails: true })
  try {
    const response = await f.submit(); assert.equal((await response.json()).status, 'error')
    assert.equal(f.row().bill_code, f.original.bill_code); assert.equal(f.calls.writes + f.calls.wa.length + f.calls.audits.length, 0)
  } finally { f.close() }
})
test('both routes retain admin and origin checks before provider or writes', async () => {
  for (const policy of ['unauthorized', 'badOrigin']) for (const kind of ['regen', 'resend']) {
    const f = fixture({ [policy]: true })
    try { assert.equal((await f.submit(kind)).status, 401); assert.equal(f.calls.bills.length + f.calls.wa.length + f.calls.writes + f.calls.audits.length, 0) } finally { f.close() }
  }
})
test('missing, non-WA, paid and phoneless orders cannot create or send payment links', async () => {
  for (const options of [{ missing: true }, { row: { source: 'website' } }, { row: { payment_status: 'paid' } }, { row: { phone: '' } }]) for (const kind of ['regen', 'resend']) {
    const f = fixture(options)
    try { assert.equal((await f.submit(kind)).status, 400); assert.equal(f.calls.bills.length + f.calls.wa.length + f.calls.writes, 0) } finally { f.close() }
  }
})
test('database read/write failures never report success or send a new link', async () => {
  for (const failure of ['readFails', 'writeFails']) {
    const f = fixture({ [failure]: true })
    try {
      const response = await f.submit(); assert.equal(response.status, 500); assert.equal((await response.json()).status, 'error')
      assert.equal(f.row().bill_code, f.original.bill_code); assert.equal(f.calls.wa.length + f.calls.audits.length, 0)
    } finally { f.close() }
  }
})
test('resend uses existing bill, no create/write, and reports send failure honestly', async () => {
  for (const sendFails of [false, true]) {
    const f = fixture({ sendFails })
    try {
      const response = await f.submit('resend'), data = await response.json()
      assert.equal(data.status, sendFails ? 'error' : 'success'); assert.equal(f.calls.bills.length + f.calls.writes, 0)
      assert.ok(f.calls.wa[0].text.body.includes('https://gateway.example.invalid/OldBill1234'))
      assert.equal(f.calls.audits.length, sendFails ? 0 : 1)
    } finally { f.close() }
  }
})
test('actual page regeneration accepts route success, copies new link and refreshes', async () => {
  const f = fixture(), c = client(f)
  try {
    await c.regenPayLink(f.original); c.flush()
    assert.equal(c.calls.toasts.length, 1); assert.equal(c.calls.toasts[0].ok, true)
    assert.deepEqual(c.calls.copied, ['https://gateway.example.invalid/NewBill1234'])
    assert.equal(c.calls.refresh, 1); assert.equal(c.loading()['regen-1'], false); assert.equal(c.loading().unrelated, true)
    assert.equal(c.calls.posts[0].headers['x-csrf-token'], 'synthetic-csrf')
  } finally { f.close() }
})
test('page warning keeps failed-send message, copies saved link and refreshes without extra bill', async () => {
  const f = fixture({ sendFails: true }), c = client(f)
  try {
    await c.regenPayLink(f.original); c.flush()
    assert.equal(c.calls.toasts[0].ok, false); assert.match(c.calls.toasts[0].message, /WhatsApp send failed/)
    assert.equal(c.calls.copied.length, 1); assert.equal(c.calls.refresh, 1); assert.equal(f.calls.bills.length, 1)
    assert.equal(c.loading()['regen-1'], false)
  } finally { f.close() }
})
test('cancelled confirmation does not submit, set loading, copy or refresh', async () => {
  const f = fixture(), c = client(f, { confirm: false })
  try {
    await c.regenPayLink(f.original); c.flush()
    assert.equal(c.calls.posts.length + c.calls.toasts.length + c.calls.copied.length + c.calls.refresh, 0)
    assert.equal(c.loading()['regen-1'], undefined)
  } finally { f.close() }
})
test('network and malformed JSON failures always clear both buttons and show an actionable error', async () => {
  for (const failure of ['networkFails', 'invalidJson']) for (const action of ['resendPayLink', 'regenPayLink']) {
    const f = fixture(), c = client(f, { [failure]: true })
    try {
      await c[action](f.original); c.flush()
      assert.equal(c.calls.toasts.length, 1); assert.equal(c.calls.toasts[0].ok, false)
      assert.equal(c.loading()[action === 'regenPayLink' ? 'regen-1' : 'resend-1'], false)
      assert.equal(c.loading().unrelated, true); assert.equal(c.calls.copied.length + c.calls.refresh, 0)
      if (action === 'regenPayLink') assert.match(c.calls.toasts[0].message, /refresh/i)
    } finally { f.close() }
  }
})
test('page server errors preserve message and clear loading without copying or refreshing', async () => {
  for (const action of ['resendPayLink', 'regenPayLink']) {
    const f = fixture(), c = client(f, { payload: { status: 'error', message: 'Order is already paid.' } })
    try {
      await c[action](f.original); c.flush()
      assert.equal(c.calls.toasts[0].ok, false); assert.equal(c.calls.toasts[0].message, 'Order is already paid.')
      assert.equal(c.loading()[action === 'regenPayLink' ? 'regen-1' : 'resend-1'], false)
      assert.equal(c.calls.copied.length + c.calls.refresh, 0)
    } finally { f.close() }
  }
})
test('page successful resend reaches existing link without creating a bill', async () => {
  const f = fixture(), c = client(f)
  try {
    await c.resendPayLink(f.original)
    assert.equal(c.calls.toasts[0].ok, true); assert.equal(c.loading()['resend-1'], false)
    assert.equal(f.calls.bills.length + f.calls.writes, 0); assert.equal(f.calls.wa.length, 1)
  } finally { f.close() }
})
test('clipboard denial or missing API does not convert a created bill into a failed action', async () => {
  for (const options of [{ clipboardFails: true }, { noClipboard: true }]) {
    const f = fixture(), c = client(f, options)
    try {
      await c.regenPayLink(f.original); await Promise.resolve(); c.flush()
      assert.equal(c.calls.toasts.length, 1); assert.equal(c.calls.toasts[0].ok, true)
      assert.equal(c.calls.refresh, 1); assert.equal(c.loading()['regen-1'], false); assert.equal(f.calls.bills.length, 1)
    } finally { f.close() }
  }
})

function pause() {
  let reached, resume
  const entered = new Promise(resolve => { reached = resolve })
  const released = new Promise(resolve => { resume = resolve })
  return { entered, resume, async stop() { reached(); await released } }
}
function assertDetached(data) {
  assert.equal(data.status, 'error'); assert.match(data.message, /created|changed|refresh/i)
  assert.equal(data.pay_url, undefined); assert.equal(data.bill_code, undefined)
}
test('paid callbacks winning during bill creation cannot be reset by the stale regeneration', { timeout: 10000 }, async () => {
  for (const payment_status of ['pending', 'failed']) {
    const gate = pause(), f = fixture({ row: { payment_status }, beforeBillResponse: () => gate.stop() })
    let pending
    try {
      pending = f.submit(); await gate.entered
      assert.equal((await f.callback()).status, 200)
      assert.equal(f.row().payment_status, 'paid'); assert.equal(f.row().order_status, 'processing')
      const settled = { ...f.row() }, sent = f.calls.wa.length
      gate.resume(); const response = await pending, data = await response.json()
      assert.equal(response.status, 409); assertDetached(data); assert.deepEqual({ ...f.row() }, settled)
      assert.equal(f.calls.wa.length, sent); assert.equal(f.calls.audits.length, 0)
      assert.equal(f.calls.bills.length, 1); assert.equal(f.calls.email.length, 1)
      assert.equal(f.calls.telegram.length, 1)
    } finally { gate.resume(); if (pending) await pending; f.close() }
  }
})
test('competing regenerations attach only the winner and never send the losing bill', { timeout: 10000 }, async () => {
  const gate = pause(), f = fixture({ uniqueBills: true, beforeBillResponse: (_sql, index) => index === 1 ? gate.stop() : undefined })
  let pending
  try {
    pending = f.submit(); await gate.entered
    const winner = await f.submit(), accepted = await winner.json()
    assert.equal(winner.status, 200); assert.equal(accepted.status, 'success')
    gate.resume(); const loser = await pending
    assert.equal(loser.status, 409); assertDetached(await loser.json())
    assert.equal(f.calls.bills.length, 2); assert.equal(f.calls.wa.length, 1); assert.equal(f.calls.audits.length, 1)
    assert.equal(f.row().bill_code, 'NewBill2'); assert.equal(f.row().order_ref, accepted.order_ref)
    assert.ok(f.calls.wa[0].text.body.includes('/NewBill2')); assert.ok(!f.calls.wa[0].text.body.includes('/NewBill1'))
  } finally { gate.resume(); if (pending) await pending; f.close() }
})
test('bill snapshot rejects concurrent changes of reference, bill, amount, source, recipient or language', async () => {
  for (const [field, value] of [['order_ref', 'synthetic-old'], ['bill_code', 'oldbill1234'], ['total_amount', '59.50'], ['source', 'website'], ['phone', '60111111111'], ['full_name', 'Different Customer'], ['email', 'different@example.invalid'], ['lang', 'en']]) {
    const f = fixture({ beforeBillResponse: sql => sql.prepare('UPDATE orders SET ' + field + '=? WHERE id=1').run(value) })
    try {
      const response = await f.submit(); assert.equal(response.status, 409); assertDetached(await response.json())
      assert.equal(f.row()[field], value); assert.equal(f.row().payment_status, 'failed')
      assert.equal(f.calls.wa.length + f.calls.audits.length, 0); assert.equal(f.calls.bills.length, 1)
    } finally { f.close() }
  }
})
test('null bill/contact snapshot values remain eligible when unchanged', async () => {
  const f = fixture({ row: { bill_code: null, full_name: null, email: null, lang: null } })
  try {
    const response = await f.submit(); assert.equal(response.status, 200); assert.equal((await response.json()).status, 'success')
    assert.equal(f.row().bill_code, 'NewBill1234'); assert.equal(f.calls.wa.length, 1)
  } finally { f.close() }
})
test('old failed callback read before regeneration cannot cancel the replacement bill or release its voucher', { timeout: 10000 }, async () => {
  const gate = pause()
  const f = fixture({ row: { payment_status: 'pending' }, callbackStatus: 3,
    beforeWrite: (_sql, statement) => statement.includes('SET payment_status = ?') ? gate.stop() : undefined })
  let pending
  try {
    pending = f.callback(); await gate.entered
    const regen = await f.submit(); assert.equal(regen.status, 200); assert.equal((await regen.json()).status, 'success')
    const saved = { ...f.row() }, sent = f.calls.wa.length
    gate.resume(); const callback = await pending
    assert.equal(callback.status, 200); assert.equal(await callback.text(), 'OK - Already processed')
    assert.deepEqual({ ...f.row() }, saved); assert.equal(f.voucher().status, 'redeemed')
    assert.equal(f.calls.wa.length, sent); assert.equal(f.calls.telegram.length + f.calls.email.length, 0)
  } finally { gate.resume(); if (pending) await pending; f.close() }
})
test('failed callback exact bill guard rejects byte-distinct replacement codes', { timeout: 10000 }, async () => {
  const gate = pause(), f = fixture({ row: { payment_status: 'pending' }, callbackStatus: 3,
    beforeWrite: (sql, statement) => { if (statement.includes('SET payment_status = ?')) { sql.prepare('UPDATE orders SET bill_code=? WHERE id=1').run('oldbill1234'); return gate.stop() } } })
  let pending
  try {
    pending = f.callback(); await gate.entered; gate.resume()
    const response = await pending; assert.equal(response.status, 200); assert.equal(await response.text(), 'OK - Already processed')
    assert.equal(f.row().payment_status, 'pending'); assert.equal(f.row().bill_code, 'oldbill1234')
    assert.equal(f.voucher().status, 'redeemed'); assert.equal(f.calls.wa.length + f.calls.telegram.length, 0)
  } finally { gate.resume(); if (pending) await pending; f.close() }
})
test('failed callback keeps the payable bill voucher reserved, notifies once and never demotes paid', async () => {
  for (const payment_status of ['pending', 'paid']) {
    const f = fixture({ row: { payment_status }, callbackStatus: 3 })
    try {
      assert.equal((await f.callback()).status, 200); assert.equal((await f.callback()).status, 200)
      assert.equal(f.row().payment_status, payment_status === 'paid' ? 'paid' : 'failed')
      assert.equal(f.voucher().status, 'redeemed')
      assert.equal(f.calls.telegram.length, payment_status === 'paid' ? 0 : 1)
      assert.equal(f.calls.wa.length, payment_status === 'paid' ? 0 : 1)
    } finally { f.close() }
  }
})
test('database saving failure after creation reports ambiguous outcome without sending or returning a bill link', async () => {
  for (const failure of ['writeFails', 'writeCommitsThenThrows']) {
    const f = fixture({ [failure]: true })
    try {
      const response = await f.submit(), data = await response.json()
      assert.equal(response.status, 500); assertDetached(data); assert.match(data.message, /created|saving|confirm/i)
      assert.equal(f.calls.bills.length, 1); assert.equal(f.row().bill_code, failure === 'writeFails' ? 'OldBill1234' : 'NewBill1234')
      assert.equal(f.calls.wa.length + f.calls.audits.length, 0)
    } finally { f.close() }
  }
})
test('actual page shows conflict, clears loading and does not copy a detached provider bill', async () => {
  const f = fixture({ beforeBillResponse: sql => sql.exec("UPDATE orders SET payment_status='paid' WHERE id=1") }), c = client(f)
  try {
    await c.regenPayLink(f.original); c.flush()
    assert.equal(c.calls.toasts.length, 1); assert.equal(c.calls.toasts[0].ok, false)
    assert.match(c.calls.toasts[0].message, /refresh/i); assert.equal(c.loading()['regen-1'], false)
    assert.equal(c.calls.copied.length + c.calls.refresh + f.calls.wa.length + f.calls.audits.length, 0)
  } finally { f.close() }
})

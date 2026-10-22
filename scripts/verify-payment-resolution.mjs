// Real payment routes/transition source, private SQLite and intercepted provider IO.
// The static landing page uses actual React SSR; no real DB, SMTP or provider.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url), baseline = process.argv.includes('--baseline') || process.argv.includes('--security-baseline')
const base = process.argv.includes('--security-baseline') ? 'f8b1accee36d1a1e0fa2aa9e734875c0676292c5' : '7fee806be56ca9ddd6d6fd3766634bc5f4f882df'
const files = new Set(['app/api/payment/check-payment/route.ts', 'app/api/payment/return/route.ts', 'app/payment/success/page.tsx'])
function source(file) {
  return baseline && files.has(file) ? execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' })
    : fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
}
function evaluate(text, file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  vm.runInNewContext(js, { module, exports: module.exports, require(id) {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('@/') || id.startsWith('.')) throw Error('Unmocked dependency: ' + id)
    return require(id)
  }, Request, Response, Headers, URL, URLSearchParams, AbortSignal, Date, console: { error() {} }, ...globals }, { filename: file })
  return module.exports
}
const load = (file, deps, globals) => evaluate(source(file), file, deps, globals)
function fixture(options = {}) {
  const sql = new DatabaseSync(':memory:')
  sql.exec('CREATE TABLE orders(id INTEGER PRIMARY KEY,order_ref TEXT,bill_code TEXT,payment_status TEXT,order_status TEXT,toyyibpay_ref TEXT,updated_at TEXT,customer_id INTEGER,full_name TEXT,phone TEXT,zone TEXT,total_amount TEXT,delivery_fee TEXT,delivery_address TEXT,lang TEXT); CREATE TABLE customer_vouchers(id INTEGER PRIMARY KEY,order_id INTEGER,status TEXT,redeemed_amount TEXT,redeemed_at TEXT); CREATE TABLE settings(setting_key TEXT,setting_value TEXT)')
  const row = { id: 1, order_ref: 'SYNTHETIC & <ORDER>', bill_code: 'OldBill1234', payment_status: 'pending', order_status: 'pending', toyyibpay_ref: null, updated_at: '2026-10-18', customer_id: 8, full_name: 'Synthetic Customer', phone: '60123456789', zone: 'WM', total_amount: '25', delivery_fee: '5', delivery_address: 'Synthetic address', lang: 'ms', ...options.row }
  sql.prepare('INSERT INTO orders(' + Object.keys(row).join(',') + ') VALUES(' + Object.keys(row).map(() => '?').join(',') + ')').run(...Object.values(row))
  if (options.missing) sql.exec('DELETE FROM orders')
  sql.exec("INSERT INTO customer_vouchers VALUES(1,1,'redeemed','5','2026-10-18')")
  const calls = { provider: [], email: [], telegram: [], writes: [], reads: 0 }
  if (options.legacyTelegram) sql.exec("INSERT INTO settings VALUES('telegram_bot_enabled','true'),('telegram_admin_chat_id','synthetic-chat')")
  const db = {
    async query(statement, params = []) {
      calls.reads++
      if (options.finalReadFails && calls.provider.length) throw Error('Synthetic final read failure')
      if (options.readFails) throw Error('Synthetic read failure')
      return [sql.prepare(statement).all(...params), []]
    },
    async execute(statement, params) {
      if (options.beforeWrite) await options.beforeWrite(sql, statement, params)
      if (options.writeFails) throw Error('Synthetic write failure')
      calls.writes.push({ statement, params })
      let normalized = statement.replace(/"(failed|cancelled|pending)"/g, "'$1'")
      if (/UPDATE customer_vouchers cv/.test(statement)) normalized = "UPDATE customer_vouchers SET status='active',order_id=NULL,redeemed_amount=NULL,redeemed_at=NULL WHERE order_id IN(SELECT id FROM orders WHERE bill_code=?) AND status='redeemed'"
      const result = sql.prepare(normalized).run(...params)
      if (options.afterWrite) await options.afterWrite(sql, statement, params)
      return [{ affectedRows: Number(result.changes) }, []]
    },
  }
  const origin = options.origin || 'https://staging.example.test'
  const env = { TOYYIBPAY_SECRET_KEY: 'synthetic-secret', TOYYIBPAY_CATEGORY_CODE: 'synthetic-category', TOYYIBPAY_BASE_URL: 'https://gateway.example.invalid' }
  const fetch = async (url, init) => {
    assert.equal(url, env.TOYYIBPAY_BASE_URL + '/index.php/api/getBillTransactions')
    assert.equal(new URLSearchParams(init.body).get('billCode'), 'OldBill1234')
    calls.provider.push(url)
    if (options.duringProvider) await options.duringProvider(sql)
    if (options.providerFails) throw Error('Synthetic provider failure')
    const statuses = options.statuses ?? [1]
    return Response.json(statuses.map((status, i) => ({ billpaymentStatus: status, billpaymentid: String(9 - i), billpaymentInvoiceNo: 'synthetic-invoice' })))
  }
  const globals = { process: { env }, fetch, setTimeout: callback => { callback(); return 1 } }
  const gateway = load('lib/toyyibpay.ts', { '@/lib/site': { SITE_URL: origin } }, globals)
  const transition = load('lib/payment-status.ts', { '@/lib/db': { __esModule: true, default: db }, '@/lib/db-helpers': { formatDate: () => '2026-10-18 02:00:00' } })
  const deps = { '@/lib/i18n': { isValidLocale: locale => ['en', 'ms', 'zh'].includes(locale) }, '@/lib/db': { __esModule: true, default: db }, '@/lib/site': { SITE_URL: origin },
    '@/lib/security': load('lib/security.ts'),
    '@/app/api/auth/_helpers': { error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) },
    '@/lib/toyyibpay': gateway, '@/lib/payment-status': transition, '@/lib/db-helpers': { formatDate: () => '2026-10-18 02:00:00' },
    '@/lib/email': { sendOrderConfirmedOnce: async code => calls.email.push(code) },
    '@/lib/telegram/notifications': { notifyTelegramOrderPaid: async code => calls.telegram.push(code) },
    '@/lib/telegram/client': { sendMessage: async (...args) => calls.telegram.push(args) },
  }
  const check = load('app/api/payment/check-payment/route.ts', deps, globals)
  const returned = load('app/api/payment/return/route.ts', deps, globals)
  return { calls, row, origin, close: () => sql.close(), current: () => sql.prepare('SELECT * FROM orders WHERE id=1').get(),
    voucher: () => sql.prepare('SELECT * FROM customer_vouchers WHERE id=1').get(),
    tryReuseVoucher: () => Number(sql.prepare("UPDATE customer_vouchers SET order_id=2 WHERE id=1 AND status='active'").run().changes),
    submit(kind, queryStatus = 1, bill = 'OldBill1234') {
      if (kind === 'check') return check.POST(new Request(origin + '/api/payment/check-payment', { method: 'POST', body: JSON.stringify({ bill_code: bill }) }))
      const url = new URL(origin + '/api/payment/return'); url.searchParams.set('billcode', bill); url.searchParams.set('status_id', String(queryStatus))
      return returned.GET({ nextUrl: url })
    } }
}
async function result(f, kind, hint = 1) {
  const response = await f.submit(kind, hint)
  return kind === 'check' ? { response, data: await response.json() } : { response, url: new URL(response.headers.get('location')) }
}
function assertPaid(r, kind, ref) {
  if (kind === 'check') { assert.equal(r.data.status, 'ok'); assert.equal(r.data.paid, true); assert.equal(r.data.pay_url, null) }
  else { assert.equal(r.url.searchParams.get('payment'), 'success'); assert.equal(r.url.searchParams.get('order_ref'), ref) }
}
function assertUnconfirmed(r, kind) {
  if (kind === 'check') { assert.equal(r.data.status, 'error'); assert.equal(r.data.paid, undefined); assert.equal(r.data.pay_url, undefined) }
  else { assert.equal(r.url.searchParams.get('status'), 'processing'); assert.equal(r.url.searchParams.get('payment'), null) }
}
test('normal persisted payment and failed-to-paid retry report paid across both origins', async () => {
  for (const kind of ['check', 'return']) for (const payment_status of ['pending', 'failed']) for (const origin of ['https://staging.example.test', 'https://eastel.site']) {
    const f = fixture({ origin, row: { payment_status } })
    try {
      const r = await result(f, kind); assertPaid(r, kind, f.row.order_ref)
      assert.equal(f.current().payment_status, 'paid'); assert.equal(f.calls.email.length, 1); assert.equal(f.calls.provider.length, 1)
      assert.equal(f.voucher().status, 'redeemed')
    } finally { f.close() }
  }
})
test('already paid record takes fast path without querying provider or notifying again', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ row: { payment_status: 'paid' } })
    try { assertPaid(await result(f, kind), kind, f.row.order_ref); assert.equal(f.calls.provider.length + f.calls.email.length + f.calls.telegram.length, 0) } finally { f.close() }
  }
})
test('replacement bill during provider success never reports this order paid', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ duringProvider: sql => sql.exec("UPDATE orders SET bill_code='Replacement1234' WHERE id=1") })
    try {
      const r = await result(f, kind); assertUnconfirmed(r, kind)
      if (kind === 'check') assert.equal(r.response.status, 409)
      assert.equal(f.current().payment_status, 'pending'); assert.equal(f.calls.email.length + f.calls.telegram.length, 0)
    } finally { f.close() }
  }
})
test('failed paid writes cannot become a success response or redirect', async () => {
  for (const kind of ['check', 'return']) for (const payment_status of ['pending', 'failed']) {
    const f = fixture({ row: { payment_status }, writeFails: true })
    try { assertUnconfirmed(await result(f, kind), kind); assert.equal(f.current().payment_status, payment_status); assert.equal(f.calls.email.length + f.calls.telegram.length, 0) } finally { f.close() }
  }
})
test('another writer winning paid returns current paid record without duplicate notices', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ duringProvider: sql => sql.exec("UPDATE orders SET payment_status='paid' WHERE id=1") })
    try { assertPaid(await result(f, kind), kind, f.row.order_ref); assert.equal(f.calls.email.length + f.calls.telegram.length, 0) } finally { f.close() }
  }
})
test('paid DB result wins over an older failed provider response without voucher release', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ statuses: [3], duringProvider: sql => sql.exec("UPDATE orders SET payment_status='paid' WHERE id=1") })
    try {
      assertPaid(await result(f, kind), kind, f.row.order_ref)
      assert.equal(f.voucher().status, 'redeemed'); assert.equal(f.calls.email.length + f.calls.telegram.length, 0)
    } finally { f.close() }
  }
})
test('pending provider response still rereads a concurrent committed payment', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ statuses: [2], duringProvider: sql => sql.exec("UPDATE orders SET payment_status='paid' WHERE id=1") })
    try { assertPaid(await result(f, kind), kind, f.row.order_ref); assert.equal(f.calls.email.length + f.calls.telegram.length, 0) } finally { f.close() }
  }
})
test('normal committed failure retains voucher until original payable bill is resolved', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ statuses: [3] })
    try {
      const r = await result(f, kind)
      if (kind === 'check') { assert.equal(r.data.paid, false); assert.equal(r.data.failed, true); assert.equal(r.data.pay_url, 'https://gateway.example.invalid/OldBill1234') }
      else assert.equal(r.url.searchParams.get('payment'), 'failed')
      assert.equal(f.current().payment_status, 'failed'); assert.equal(f.voucher().status, 'redeemed')
      assert.equal(f.voucher().order_id, 1); assert.equal(f.tryReuseVoucher(), 0)
      assert.equal(f.calls.email.length, 0)
    } finally { f.close() }
  }
})

test('legacy return notification renders malicious markup literally and preserves trusted formatting', async () => {
  for (const full_name of ['<a href="https://example.invalid">Pay elsewhere</a>', 'Customer < & unmatched']) {
    const f = fixture({ legacyTelegram: true, row: { full_name, phone: '<phone>', zone: '<zone>' } })
    try {
      assertPaid(await result(f, 'return'), 'return', f.row.order_ref)
      assert.equal(f.calls.telegram.length, 1)
      const [chat, html, mode] = f.calls.telegram[0]
      assert.equal(chat, 'synthetic-chat'); assert.equal(mode, 'HTML')
      assert.ok(html.includes('<b>New Payment Received!</b>'))
      assert.ok(html.includes('&lt;')); assert.ok(!html.includes('<a href='))
      assert.ok(!html.includes('<phone>')); assert.ok(!html.includes('<zone>'))
    } finally { f.close() }
  }
})
test('failed failure write cannot falsely present a confirmed failure', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ statuses: [3], writeFails: true })
    try { assertUnconfirmed(await result(f, kind), kind); assert.equal(f.current().payment_status, 'pending'); assert.equal(f.voucher().status, 'redeemed') } finally { f.close() }
  }
})
test('provider and final-read errors produce no definitive result or retry URL', async () => {
  for (const kind of ['check', 'return']) for (const failure of ['providerFails', 'finalReadFails']) {
    const f = fixture({ [failure]: true })
    try { assertUnconfirmed(await result(f, kind), kind) } finally { f.close() }
  }
})
test('untrusted failed return hint cannot override paid or pending database state', async () => {
  for (const payment_status of ['paid', 'pending']) {
    const f = fixture({ row: { payment_status }, statuses: [] })
    try {
      const r = await result(f, 'return', 3)
      if (payment_status === 'paid') assertPaid(r, 'return', f.row.order_ref)
      else assertUnconfirmed(r, 'return')
      assert.equal(f.current().payment_status, payment_status)
    } finally { f.close() }
  }
})
test('deleted record after a winning write is never shown as an attached paid order', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ afterWrite: sql => sql.exec('DELETE FROM orders WHERE id=1') })
    try { assertUnconfirmed(await result(f, kind), kind); assert.equal(f.current(), undefined) } finally { f.close() }
  }
})
test('unresolved existing bill keeps pending result and existing payment URL', async () => {
  const f = fixture({ statuses: [2] })
  try {
    const r = await result(f, 'check')
    assert.equal(r.data.status, 'ok'); assert.equal(r.data.paid, false); assert.equal(r.data.failed, false)
    assert.equal(r.data.pay_url, 'https://gateway.example.invalid/OldBill1234'); assert.equal(f.current().payment_status, 'pending')
  } finally { f.close() }
})
test('invalid check and empty return preserve guarded response without provider calls', async () => {
  const f = fixture()
  try {
    assert.equal((await f.submit('check', 1, '../invalid')).status, 400)
    const response = await f.submit('return', 1, '')
    assert.equal(new URL(response.headers.get('location')).searchParams.get('payment'), 'error')
    assert.equal(f.calls.provider.length + f.calls.email.length + f.calls.writes.length, 0)
  } finally { f.close() }
})
test('Pay Now consumer reloads error/paid responses without navigating to an unconfirmed payment URL', async () => {
  const file = 'app/[locale]/account/(protected)/orders/PayNowButton.tsx', ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handle
  function walk(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'handleClick') handle = node.getText(ast); ts.forEachChild(node, walk) }
  walk(ast); assert.ok(handle)
  for (const data of [{ status: 'error', message: 'Refresh orders.' }, { status: 'ok', paid: true, pay_url: null }]) {
    let reload = 0
    const location = { href: '', reload: () => { reload++ } }
    const api = evaluate(handle + '\nmodule.exports={handleClick};', file, {}, { busy: false, setBusy() {}, billCode: 'OldBill1234', fetch: async () => Response.json(data), window: { location } })
    await api.handleClick(); assert.equal(location.href, ''); assert.equal(reload, 1)
  }
})
test('static WhatsApp landing is neutral and never claims payment or message delivery', () => {
  const file = 'app/payment/success/page.tsx'
  const page = load(file, { 'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) } })
  const html = renderToStaticMarkup(React.createElement(page.default))
  assert.equal(page.metadata.title, 'Payment Status — Eastel Mobile')
  assert.ok(html.includes('Check Your Payment Status')); assert.ok(html.includes('before paying again'))
  assert.ok(html.includes('sebelum membayar semula')); assert.ok(html.includes('避免重复付款'))
  for (const claim of ['Payment Received', 'confirmation to your WhatsApp', 'Pengesahan pesanan telah dihantar', '订单确认已发送']) assert.ok(!html.includes(claim))
  assert.ok(html.includes('https://wa.me/601175999733')); assert.ok(html.includes('href="/ms"'))
})

test('lost write acknowledgement never implies rollback and return may confirm the saved paid record', async () => {
  for (const kind of ['check', 'return']) {
    const f = fixture({ afterWrite: () => { throw Error('Synthetic lost acknowledgement') } })
    try {
      const r = await result(f, kind)
      if (kind === 'check') assertUnconfirmed(r, kind)
      else assertPaid(r, kind, f.row.order_ref)
      assert.equal(f.current().payment_status, 'paid')
      assert.equal(f.calls.email.length + f.calls.telegram.length, 0)
    } finally { f.close() }
  }
})

test('a successful transaction takes priority over failed or pending retry attempts', async () => {
  for (const kind of ['check', 'return']) for (const statuses of [[3, 1], [2, 1], [4, 3, 1]]) {
    const f = fixture({ statuses })
    try {
      assertPaid(await result(f, kind), kind, f.row.order_ref)
      assert.equal(f.current().payment_status, 'paid'); assert.equal(f.calls.email.length, 1)
      assert.equal(f.voucher().status, 'redeemed')
    } finally { f.close() }
  }
})


test('browser return preserves stored order language for paid, failed and unresolved results', async () => {
  for (const lang of ['en', 'ms', 'zh', '../outside', null]) for (const statuses of [[1], [3], [2]]) {
    const f = fixture({ row: { lang }, statuses })
    try {
      const r = await result(f, 'return')
      assert.equal(r.url.pathname, '/' + (['en', 'ms', 'zh'].includes(lang) ? lang : 'ms') + '/account/orders')
      assert.equal(r.url.origin, f.origin)
    } finally { f.close() }
  }
})

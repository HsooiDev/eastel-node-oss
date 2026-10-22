// Execute customer server pages against an isolated SQLite fixture. No external services.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import * as engine from '../public/recommender/engine.mjs'

const require = createRequire(import.meta.url)
const sqlDb = new DatabaseSync(':memory:')
sqlDb.exec(`CREATE TABLE orders (
  id INTEGER PRIMARY KEY, customer_id INTEGER, order_ref TEXT, full_name TEXT,
  email TEXT, phone TEXT, delivery_address TEXT, postcode TEXT, state TEXT,
  sim_fee NUMERIC, plan_fee NUMERIC, plan_snapshot TEXT, plan_fulfilled_at TEXT,
  delivery_fee NUMERIC, voucher_code TEXT, voucher_discount NUMERIC,
  total_amount NUMERIC, payment_status TEXT, order_status TEXT, courier_name TEXT,
  tracking_number TEXT, bill_code TEXT, created_at TEXT
)`)
const storedPlan = { version: 1, currency: 'MYR', plan: { id: 'ez50', name: 'EZ50 saved terms', price: 50, dataGB: 500, hotspotGB: 500, hotspotMode: 'shared', roamingGB: 3, validityDays: 30, status: 'available' } }
const insert = sqlDb.prepare(`INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const addOrder = (id, customerId, planFee, planSnapshot, payment = 'pending', fulfilled = null) => insert.run(id, customerId, `VIEW-${id}`, 'Fixture Customer', 'buyer@example.invalid', '60123456789', 'Fixture address', '50000', 'Kuala Lumpur', 10, planFee, planSnapshot, fulfilled, 5, 'TEST4', 4, 11 + planFee, payment, 'processing', 'Fixture Courier', null, 'fixturebill' + id, '2026-10-13 00:00:00')
addOrder(1, 1, 50, JSON.stringify(storedPlan))
addOrder(2, 2, 50, JSON.stringify(storedPlan), 'paid')
addOrder(3, 1, 0, null, 'paid')
addOrder(4, 1, 50, '{corrupt')
addOrder(5, 1, 50, JSON.stringify(storedPlan), 'paid', '2026-10-13 01:00:00')
addOrder(6, 1, 0, '{corrupt')

let sessionAvailable = true
let queryCount = 0
const stubComponent = tag => ({ children, className, ...props }) => createElement(tag, { className, ...props }, children)
const shared = {
  '@/lib/db': { __esModule: true, default: { query: async (sql, args = []) => { queryCount++; return [sqlDb.prepare(sql).all(...args), []] } } },
  '@/lib/cookies': { getSessionCookie: async () => sessionAvailable ? 'fixture-session' : null },
  '@/lib/session': { validateSession: async () => ({ customerId: 1, emailVerified: true }) },
  '@/lib/i18n': { isValidLocale: locale => ['en', 'ms', 'zh'].includes(locale), t: (_translations, _key, fallback) => fallback },
  '@/lib/i18n-server': { getTranslations: async () => ({}) },
  '@/lib/site': { SITE_URL: 'https://fixture.invalid' },
  '@/components/seo-head': { buildMetadata: value => value },
  '@/components/ui/account-card': { AccountCard: stubComponent('section') },
  '@/components/ui/badge': { Badge: ({ children }) => createElement('span', {}, children) },
  '@/components/orders/print-invoice': { PrintInvoice: ({ label }) => createElement('button', {}, label) },
  './PayNowButton': { __esModule: true, default: ({ billCode }) => createElement('button', { 'data-bill': billCode }, 'Pay Now') },
  'next/link': { __esModule: true, default: stubComponent('a') },
  'next/navigation': {
    useRouter: () => ({ refresh() { throw new Error('SSR must not refresh') } }),
    notFound: () => { throw new Error('fixture:notFound') },
    redirect: location => { throw new Error(`fixture:redirect:${location}`) },
  },
  '@/public/recommender/engine.mjs': engine,
}

function load(file) {
  const output = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, require: id => shared[id] ?? require(id), console, Date, Number }, { filename: file })
  return module.exports
}
shared['@/lib/order-plan'] = load('lib/order-plan-snapshot.ts')
shared['./PaymentReturnNotice'] = load('app/[locale]/account/(protected)/orders/PaymentReturnNotice.tsx')
const invoice = load('app/[locale]/account/(protected)/orders/[id]/invoice/page.tsx')
const orderPage = load('app/[locale]/account/(protected)/orders/page.tsx')
const thankYou = load('app/[locale]/thankyou/page.tsx')
const renderInvoice = async (id, locale = 'en') => renderToStaticMarkup(await invoice.default({ params: Promise.resolve({ id: String(id), locale }) }))

test('invoice ownership prevents guessing another customer order', async () => {
  await assert.rejects(renderInvoice(2), /fixture:notFound/)
  await assert.rejects(renderInvoice('1 OR 1=1'), /fixture:notFound/)
  await assert.rejects(renderInvoice('999999999999999999999'), /fixture:notFound/)
})

test('signed-out invoice access stops before reading any order', async () => {
  sessionAvailable = false
  const before = queryCount
  try {
    await assert.rejects(renderInvoice(1), /fixture:redirect:\/en\/account\/login/)
    assert.equal(queryCount, before)
  } finally { sessionAvailable = true }
})

test('unpaid invoice includes immutable plan terms and itemized collected amounts', async () => {
  const html = await renderInvoice(1)
  for (const value of ['EZ50 saved terms', '500GB', '30', 'Shared hotspot', '3GB', 'RM 10.00', 'RM 50.00', 'RM 5.00', 'RM 4.00', 'RM 61.00', 'Unpaid', 'not a paid receipt', 'Awaiting activation']) assert.ok(html.includes(value), value)
  assert.ok(!html.includes('Payment Successful'))
  assert.equal(invoice.dynamic, 'force-dynamic')
  assert.equal(invoice.revalidate, 0)
  assert.equal(invoice.fetchCache, 'force-no-store')
  assert.equal(invoice.metadata.robots.index, false)
})

test('legacy SIM-only orders show no invented plan fee or activation promise', async () => {
  const html = await renderInvoice(3)
  assert.ok(html.includes('SIM card only; no plan purchased'))
  assert.ok(!html.includes('EZ50'))
  assert.ok(!html.includes('Plan activation status'))
  assert.ok(html.includes('Paid'))
  assert.ok(!html.includes('not a paid receipt'))
})

test('corrupt paid plan details preserve the fee without claiming SIM only', async () => {
  const html = await renderInvoice(4)
  assert.ok(html.includes('Saved plan details are unavailable'))
  assert.ok(html.includes('RM 50.00'))
  assert.ok(!html.includes('SIM card only; no plan purchased'))
  const zeroFeeHtml = await renderInvoice(6)
  assert.ok(zeroFeeHtml.includes('Saved plan details are unavailable'))
  assert.ok(!zeroFeeHtml.includes('SIM card only; no plan purchased'))
})

test('recorded activation and localized customer invoices use stored order values', async () => {
  assert.ok((await renderInvoice(5)).includes('Activated'))
  const chinese = await renderInvoice(1, 'zh')
  for (const label of ['未付款', '已购买配套', '待代购开通', '不是已付款收据']) assert.ok(chinese.includes(label), label)
  assert.ok((await renderInvoice(1, 'ms')).includes('Belum dibayar'))
})

test('customer order cards link invoices and preserve saved plan terms', async () => {
  const html = renderToStaticMarkup(await orderPage.default({ params: Promise.resolve({ locale: 'en' }) }))
  assert.ok(html.includes('/en/account/orders/1/invoice'))
  assert.ok(html.includes('EZ50 saved terms'))
  assert.ok(html.includes('Saved plan details are unavailable'))
  assert.ok(!html.includes('VIEW-2'))
})

test('failed orders expose the original payable bill in all locales; paid orders offer no retry', async () => {
  sqlDb.exec("UPDATE orders SET payment_status='failed' WHERE id=1")
  try {
    for (const locale of ['en', 'ms', 'zh']) {
      const html = renderToStaticMarkup(await orderPage.default({ params: Promise.resolve({ locale }) }))
      assert.ok(html.includes('data-bill="fixturebill1"'))
      assert.ok(!html.includes('data-bill="fixturebill3"'))
      assert.ok(!html.includes('data-bill="fixturebill2"'))
    }
  } finally { sqlDb.exec("UPDATE orders SET payment_status='pending' WHERE id=1") }
})

test('thankyou uses authenticated saved plan and total rather than URL payment claims', async () => {
  const html = renderToStaticMarkup(await thankYou.default({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ ref: 'VIEW-1', status: 'paid' }) }))
  assert.ok(html.includes('EZ50 saved terms'))
  assert.ok(html.includes('RM 50.00'))
  assert.ok(html.includes('Order Received'))
  assert.ok(!html.includes('Payment Successful'))
  assert.ok(html.includes('/en/account/orders/1/invoice'))
})


const renderOrders = async (locale, query = {}) => renderToStaticMarkup(await orderPage.default({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(query) }))
test('processing return renders localized status and treats hints as untrusted', async () => {
  for (const [locale, title] of [['en','Confirming your payment'],['ms','Mengesahkan pembayaran'],['zh','正在确认付款']]) {
    const html = await renderOrders(locale, { status: 'processing', bill: 'fixturebill1', hint: '1', payment: 'success' })
    assert.ok(html.includes(title)); assert.ok(html.includes('0/20'))
    assert.ok(html.includes('role="status"')); assert.ok(!html.includes('Payment confirmed'))
  }
})
test('URL success cannot confirm an unpaid, unknown or another customer order', async () => {
  for (const query of [{ payment:'success', order_ref:'VIEW-1' },{ payment:'success', order_ref:'VIEW-2' },{ payment:'success', order_ref:'<script>forged</script>' },{ status:'processing', bill:'unknown' },{ status:'processing', bill:['fixturebill','unknown'] }]) {
    const html = await renderOrders('en',query)
    assert.ok(html.includes('Payment status could not be confirmed'))
    assert.ok(!html.includes('Payment confirmed')); assert.ok(!html.includes('VIEW-2')); assert.ok(!html.includes('<script>forged'))
    assert.ok(!html.match(/<section role="status"[\s\S]*?<\/section>/)?.[0].includes('0/20'))
  }
})
test('only owned saved paid state confirms payment, even against a forged failure hint', async () => {
  for (const payment of ['success','failed']) {
    const html=await renderOrders('en',{payment,order_ref:'VIEW-3'})
    assert.ok(html.includes('Payment confirmed')); assert.ok(html.includes('recorded as paid'))
    assert.ok(!html.match(/<section role="status"[\s\S]*?<\/section>/)?.[0].includes('0/20')); assert.ok(!html.includes('confirmation email has been sent'))
  }
})
test('processing return with old failed DB stays unconfirmed, explicit failed return uses saved state', async () => {
  sqlDb.exec("UPDATE orders SET payment_status='failed' WHERE id=1")
  try {
    const processing=await renderOrders('en',{status:'processing',bill:'fixturebill1',hint:'1'})
    assert.ok(processing.includes('Confirming your payment')); assert.ok(!processing.includes('The order record shows an unsuccessful payment'))
    const failed=await renderOrders('en',{payment:'failed',bill:'fixturebill1'})
    assert.ok(failed.includes('Payment unsuccessful')); assert.ok(failed.includes('contact us before paying again'))
    assert.ok(!failed.includes('No charges'))
  } finally { sqlDb.exec("UPDATE orders SET payment_status='pending' WHERE id=1") }
})
test('ordinary orders page has no return notice and signed-out return cannot read orders', async () => {
  assert.ok(!(await renderOrders('en')).includes('role="status"'))
  sessionAvailable=false; const before=queryCount
  try { await assert.rejects(renderOrders('zh',{status:'processing',bill:'fixturebill1'}),/fixture:redirect:\/zh\/account\/login/); assert.equal(queryCount,before) }
  finally { sessionAvailable=true }
})

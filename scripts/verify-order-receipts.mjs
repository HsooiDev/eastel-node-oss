import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as engine from '../public/recommender/engine.mjs'

const require = createRequire(import.meta.url)
function load(file, deps) {
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => deps[name] ?? require(name),
    process: { env: { SMTP_FROM: 'noreply@example.invalid', ADMIN_EMAIL: 'admin@example.invalid' } }, console,
  }, { filename: file })
  return module.exports
}
const site = { SITE_URL: 'https://eastel.example.invalid' }
const security = load('lib/security.ts', {})
const snapshots = load('lib/order-plan-snapshot.ts', { '@/public/recommender/engine.mjs': engine })
const templates = load('lib/email-templates.ts', { '@/lib/site': site, '@/lib/security': security })
const snapshot = { version: 1, currency: 'MYR', plan: {
  id: 'ez35', name: 'EZ35', price: 35, dataGB: 200, hotspotGB: 100,
  hotspotMode: 'separate', roamingGB: 0, validityDays: 30, status: 'available',
} }
const order = { orderRef: 'FIXTURE-123', customerName: 'Fixture', productName: 'Eastel SIM', quantity: 1,
  unitPrice: 12.5, deliveryFee: 5, totalAmount: 52.5, shippingAddress: 'Fixture address', planSnapshot: snapshot, planFee: 35,
}

test('customer emails itemize purchased plan, SIM, shipping and payment state in all locales', () => {
  for (const locale of ['en', 'ms', 'zh']) {
    const html = templates.orderConfirmationTemplate({ ...order, paymentStatus: 'pending' }, locale)
    for (const item of ['EZ35', 'RM 12.50', 'RM 5.00', 'RM 35.00', 'RM 52.50', '200 GB', '30 days']) assert.ok(html.includes(item))
    assert.ok(html.includes('/account/orders'))
    assert.ok(html.includes({ en: 'Payment pending', ms: 'Menunggu bayaran', zh: '待付款' }[locale]))
    assert.ok(!html.includes({ en: '>Paid<', ms: '>Telah dibayar<', zh: '>已付款<' }[locale]))
  }
})

test('SIM-only receipts never fabricate a plan and discounts do not erase item prices', () => {
  const html = templates.orderConfirmationTemplate({ ...order, planSnapshot: null, planFee: 0, totalAmount: 14.5, voucherDiscount: 3, paymentStatus: 'paid' }, 'en')
  assert.ok(html.includes('SIM only — no plan purchased'))
  assert.ok(!html.includes('EZ35'))
  for (const item of ['RM 12.50', 'RM 5.00', 'RM 14.50', '− RM 3.00', '>Paid<']) assert.ok(html.includes(item))
})

test('saved plan names and contact values are escaped in email HTML', () => {
  const html = templates.orderConfirmationTemplate({ ...order, customerName: '<img src=x>', shippingAddress: '<script>fixture</script>', planSnapshot: { ...snapshot, plan: { ...snapshot.plan, name: '<b>EZ35</b>' } } }, 'en')
  assert.ok(html.includes('&lt;b&gt;EZ35&lt;'))
  assert.ok(!html.includes('<b>EZ35</b>'))
  assert.ok(!html.includes('<img src=x>'))
  assert.ok(!html.includes('<script>fixture</script>'))
})

test('paid notification reads recorded SIM/plan amounts and includes manual purchase in admin email', async () => {
  const sent = []
  const row = { order_ref: 'FIXTURE-123', full_name: 'Fixture', phone: '60123456789', delivery_address: 'Fixture address', postcode: '50000', zone: 'WM',
    sim_fee: '12.50', delivery_fee: '5.00', plan_fee: '35.00', total_amount: '49.50', voucher_discount: '3.00',
    plan_snapshot: JSON.stringify(snapshot), plan_fulfilled_at: null, lang: 'en', customer_email: 'buyer@example.invalid',
  }
  const db = {
    execute: async sql => { assert.match(sql, /payment_status = 'paid'/); return [{ affectedRows: 1 }] },
    query: async sql => { assert.match(sql, /o\.sim_fee/); assert.match(sql, /o\.plan_snapshot/); return [[row]] },
  }
  const email = load('lib/email.ts', {
    nodemailer: { createTransport: () => ({ sendMail: async message => { sent.push(message) } }) },
    '@/lib/db': { default: db, ...db }, './email-templates': templates,
    '@/lib/site': site, '@/lib/order-plan': snapshots, '@/lib/security': security,
  })
  assert.equal(await email.sendOrderConfirmedOnce('fixture-bill'), true)
  assert.equal(sent.length, 2)
  assert.ok(sent[0].html.includes('RM 12.50'))
  assert.ok(sent[0].html.includes('RM 35.00'))
  assert.ok(sent[0].html.includes('RM 49.50'))
  assert.ok(sent[1].html.includes('Plan         : EZ35'))
  assert.ok(sent[1].html.includes('Pending manual purchase after customer SIM registration'))
})

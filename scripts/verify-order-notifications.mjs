// Real route/helper/template SQL and in-memory MIME. MariaDB comparisons are
// modeled with SQLite BLOB IS; no real database, SMTP, WhatsApp or provider calls.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import ts from 'typescript'
import nodemailer from 'nodemailer'

const require = createRequire(import.meta.url), baseline = process.argv.includes('--baseline')
const oldFiles = new Set(['app/api/admin/orders/route.ts', 'lib/email.ts', 'lib/email-templates.ts'])
function load(file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const source = baseline && oldFiles.has(file) ? execFileSync('git', ['show', '9dbde3fb3e3d1603c314af5faf5650fe388d6923:' + file], { encoding: 'utf8' }) : fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(output, { module, exports: module.exports, require(id) {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('@/') || id.startsWith('.')) throw new Error('Unmocked dependency: ' + id)
    return require(id)
  }, Request, Response, Headers, URL, Date, Buffer, process: { env: { SMTP_HOST: 'smtp.example.invalid', SMTP_FROM: 'noreply@example.invalid', ADMIN_EMAIL: 'admin@example.invalid' } }, console: { error() {} }, ...globals }, { filename: file })
  return module.exports
}
const security = load('lib/security.ts'), validation = load('lib/validation.ts')
function fixture(options = {}) {
  const sql = new DatabaseSync(':memory:')
  sql.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY,order_ref TEXT,full_name TEXT,email TEXT,phone TEXT,source TEXT,lang TEXT,order_status TEXT,tracking_number TEXT,courier_name TEXT,courier_id INTEGER,updated_at TEXT,payment_status TEXT,email_sent INTEGER,customer_id INTEGER,sim_fee TEXT,delivery_fee TEXT,total_amount TEXT,delivery_address TEXT,postcode TEXT,zone TEXT,plan_snapshot TEXT,plan_fee TEXT,plan_fulfilled_at TEXT,voucher_discount TEXT,toyyibpay_ref TEXT,bill_code TEXT); CREATE TABLE couriers (id INTEGER PRIMARY KEY,name TEXT); CREATE TABLE customers (id INTEGER PRIMARY KEY,email TEXT)')
  sql.prepare('INSERT INTO couriers VALUES(1,?)').run('Fixture Carrier')
  const row = { id: 1, order_ref: 'SYNTHETIC-001', full_name: 'Synthetic Customer', email: 'customer@example.invalid', phone: '60123456789', source: 'website', lang: 'zh', order_status: 'pending', tracking_number: null, courier_name: 'Fixture Courier', courier_id: 1, updated_at: '2026-10-18 00:00:00', payment_status: 'paid', email_sent: 0, customer_id: null, sim_fee: '10', delivery_fee: '5', total_amount: '15', delivery_address: 'Synthetic address', postcode: '50000', zone: 'WM', plan_snapshot: null, plan_fee: '0', plan_fulfilled_at: null, voucher_discount: '0', toyyibpay_ref: 'SYNTHETIC-TXN', bill_code: 'synthetic-bill', ...options.row }
  sql.prepare('INSERT INTO orders(' + Object.keys(row).join(',') + ') VALUES(' + Object.keys(row).map(() => '?').join(',') + ')').run(...Object.values(row))
  const calls = { writes: 0, audits: 0, attempts: [], accepted: [], wa: [], errors: [], statements: [] }
  const db = {
    async query(statement, params = []) {
      calls.statements.push({ statement, params })
      if (options.readFails) throw new Error('Synthetic read failure')
      return [sql.prepare(statement).all(...params), []]
    },
    async execute(statement, params = []) {
      calls.statements.push({ statement, params })
      if (options.writeFails) throw new Error('Synthetic write failure')
      if (statement.includes('UPDATE '+String.fromCharCode(96)+'orders')) {
        if (options.beforeUpdate) await options.beforeUpdate(sql)
        calls.writes++
      }
      const normalized = statement.replace(/AS BINARY\)/g, 'AS BLOB)').replaceAll('<=>', 'IS')
      const result = sql.prepare(normalized).run(...params)
      return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []]
    },
  }
  const site = { SITE_URL: options.origin || 'https://staging.example.test' }
  const templates = load('lib/email-templates.ts', { '@/lib/security': security, '@/lib/site': site })
  const local = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  const email = load('lib/email.ts', {
    '@/lib/security': security, '@/lib/site': site, '@/lib/db': { __esModule: true, default: db }, './email-templates': templates,
    '@/lib/order-plan': { getOrderPlanSnapshot: () => null },
    nodemailer: { __esModule: true, default: { createTransport: () => ({ async sendMail(message) {
      calls.attempts.push(message)
      if (options.mailFails === true || options.mailFails === message.to) throw new Error('Synthetic transport rejection')
      const result = await local.sendMail(message); assert.ok(Buffer.isBuffer(result.message)); assert.match(result.message.toString(), /MIME-Version: 1\.0/)
      calls.accepted.push(message); return result
    } }) } },
  }, { console: { error: (...args) => calls.errors.push(args.map(String).join(' ')) } })
  const helpers = { requireAdmin: async () => options.authorized === false ? null : { customerId: 7 },
    requireAdminCsrf: async () => options.authorized === false || options.csrf === false ? null : { customerId: 7 },
    success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) }
  const route = load('app/api/admin/orders/route.ts', {
    '@/lib/db': { __esModule: true, default: db }, '@/lib/email': email, '@/lib/validation': validation, '../_helpers': helpers,
    '@/lib/db-helpers': { formatDate: () => '2026-10-18 00:00:01' }, '@/lib/order-plan': { getOrderPlanSnapshot: () => null },
    '@/lib/admin-order-filters': {}, '@/lib/audit': { logAdminAction: async () => { calls.audits++ } },
    '@/lib/queries/settings': { getSettingOrDefault: async () => options.proactive ? '1' : '0' },
    '@/lib/whatsapp/client': { sendText: async (...args) => { calls.wa.push(args); return true } },
  }, { console: { error: (...args) => calls.errors.push(args.map(String).join(' ')) } })
  return { sql, calls, email, templates, site,
    submit(body) { return route.POST(new Request(site.SITE_URL + '/api/admin/orders', { method: 'POST', body: JSON.stringify({ orderId: 1, ...body }) })) },
    row: () => sql.prepare('SELECT * FROM orders WHERE id=1').get(),
    close: () => sql.close(),
  }
}
const statusCopy = {
  en: { pending: 'Pending', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', subject: 'Order Update' },
  ms: { pending: 'Menunggu', processing: 'Diproses', shipped: 'Dihantar', delivered: 'Dihantar', cancelled: 'Dibatalkan', subject: 'Kemaskini Pesanan' },
  zh: { pending: '待处理', processing: '处理中', shipped: '已发货', delivered: '已送达', cancelled: '已取消', subject: '订单更新' },
}
const href = (html, url) => html.includes('href="' + url + '"') || html.includes('href="' + security.escapeHtml(url) + '"')
test('real status transitions send one localized previous/new-status mail and retain order language', async () => {
  for (const lang of Object.keys(statusCopy)) for (const next of ['pending', 'processing', 'delivered', 'cancelled']) {
    const before = next === 'pending' ? 'processing' : 'pending', f = fixture({ row: { lang, order_status: before } })
    try {
      assert.equal((await f.submit({ orderStatus: next })).status, 200); assert.equal(f.row().order_status, next)
      assert.equal(f.calls.accepted.length, 1); const message = f.calls.accepted[0]
      assert.ok(message.subject.startsWith(statusCopy[lang].subject)); assert.ok(!message.html.includes('Anchor Communications')); assert.ok(message.html.includes(statusCopy[lang][before])); assert.ok(message.html.includes(statusCopy[lang][next]))
      assert.ok(href(message.html, f.site.SITE_URL + '/' + lang + '/account/orders')); assert.equal(f.calls.wa.length, 0)
    } finally { f.close() }
  }
})
test('shipped with tracking sends only the localized shipping mail', async () => {
  const f = fixture({ row: { lang: 'ms' } })
  try { assert.equal((await f.submit({ orderStatus: 'shipped', trackingNumber: 'SYNTHETIC-TRACK' })).status, 200); assert.equal(f.calls.accepted.length, 1); assert.ok(f.calls.accepted[0].subject.startsWith('Penghantaran Disahkan')); assert.ok(href(f.calls.accepted[0].html, f.site.SITE_URL + '/ms/account/orders')) }
  finally { f.close() }
})
test('shipped without tracking sends status mail without a fabricated tracking link', async () => {
  const f = fixture()
  try { assert.equal((await f.submit({ orderStatus: 'shipped' })).status, 200); assert.equal(f.calls.accepted.length, 1); assert.ok(f.calls.accepted[0].subject.startsWith('订单更新')); assert.ok(!f.calls.accepted[0].html.includes('easytrack')) }
  finally { f.close() }
})
test('unchanged saves are successful no-ops without a second write/audit/email', async () => {
  const f = fixture({ row: { order_status: 'shipped', tracking_number: 'SYNTHETIC-TRACK' } })
  try { for (let i = 0; i < 2; i++) assert.equal((await f.submit({ orderStatus: 'shipped', trackingNumber: 'SYNTHETIC-TRACK', courierName: 'Fixture Courier' })).status, 200); assert.equal(f.calls.writes + f.calls.audits + f.calls.attempts.length + f.calls.wa.length, 0) }
  finally { f.close() }
})
test('tracking-only edit on shipped order notifies once and preserves blank-courier behavior', async () => {
  const f = fixture({ row: { order_status: 'shipped' } })
  try { assert.equal((await f.submit({ trackingNumber: 'SYNTHETIC-NEW', courierName: '' })).status, 200); assert.equal(f.calls.accepted.length, 1); assert.equal(f.row().courier_name, 'Fixture Courier'); assert.equal((await f.submit({ trackingNumber: 'SYNTHETIC-NEW' })).status, 200); assert.equal(f.calls.accepted.length, 1) }
  finally { f.close() }
})
test('orders without email still save, and failed transport does not roll back the saved order', async () => {
  for (const options of [{ row: { email: null } }, { mailFails: true }]) {
    const f = fixture(options)
    try { const response = await f.submit({ orderStatus: 'delivered' }); assert.equal(response.status, 200); assert.equal(f.row().order_status, 'delivered'); assert.equal(f.calls.accepted.length, 0) }
    finally { f.close() }
  }
})
test('authorization/CSRF/validation/missing-order failures have no update or notification', async () => {
  for (const [options, body, code] of [[{ authorized: false }, { orderStatus: 'delivered' }, 401], [{ csrf: false }, { orderStatus: 'delivered' }, 401], [{}, { orderStatus: 'invalid' }, 400], [{}, { orderId: 999, orderStatus: 'delivered' }, 400]]) {
    const f = fixture(options)
    try { assert.equal((await f.submit(body)).status, code); assert.equal(f.calls.writes + f.calls.attempts.length + f.calls.audits, 0) }
    finally { f.close() }
  }
})
test('read/write failures do not change the order or start notifications', async () => {
  for (const options of [{ readFails: true }, { writeFails: true }]) {
    const f = fixture(options)
    try { assert.equal((await f.submit({ orderStatus: 'delivered' })).status, 500); assert.equal(f.row().order_status, 'pending'); assert.equal(f.calls.attempts.length, 0) }
    finally { f.close() }
  }
})
test('two stale concurrent status writes yield one success, one409, and one notification', async () => {
  let reached, resume, first, writes = 0
  const ready = new Promise(resolve => { reached = resolve }), paused = new Promise(resolve => { resume = resolve })
  const f = fixture({ beforeUpdate: async () => { if (writes++ === 0) { reached(); await paused } } })
  try {
    first = f.submit({ orderStatus: 'processing' }); await ready
    const second = await f.submit({ orderStatus: 'processing' }); assert.equal(second.status, 200)
    resume(); assert.equal((await first).status, 409); assert.equal(f.calls.accepted.length, 1); assert.equal(f.row().order_status, 'processing')
  } finally { resume?.(); await first; f.close() }
})
test('byte-distinct concurrent tracking/courier edits are preserved and return409', async () => {
  for (const field of ['courier_name', 'tracking_number']) {
    const f = fixture({ row: { [field]: 'UPPER' }, beforeUpdate: async sql => { sql.prepare('UPDATE orders SET ' + field + '=? WHERE id=1').run('upper') } })
    try { assert.equal((await f.submit({ orderStatus: 'delivered' })).status, 409); assert.equal(f.row()[field], 'upper'); assert.equal(f.row().order_status, 'pending'); assert.equal(f.calls.accepted.length, 0) }
    finally { f.close() }
  }
})
test('WhatsApp stays behind the existing opt-in/source/phone/tracking gates and no-op saves do not resend', async () => {
  for (const proactive of [false, true]) {
    const f = fixture({ proactive, row: { source: 'whatsapp', lang: 'ms' } })
    try { assert.equal((await f.submit({ orderStatus: 'shipped', trackingNumber: 'SYNTHETIC-WA' })).status, 200); assert.equal(f.calls.wa.length, proactive ? 1 : 0); if (proactive) assert.ok(f.calls.wa[0][1].includes('Pesanan')); await f.submit({ orderStatus: 'shipped', trackingNumber: 'SYNTHETIC-WA' }); assert.equal(f.calls.wa.length, proactive ? 1 : 0) }
    finally { f.close() }
  }
})
test('status template escapes dynamic fields and binds links to either configured origin', async () => {
  for (const origin of ['https://staging.example.test', 'https://eastel.site']) {
    const f = fixture({ origin })
    try {
      assert.equal(await f.email.sendOrderStatusChanged('customer@example.invalid', { orderRef: '<b>REF</b>', customerName: '<img src=x>', oldStatus: '<script>old</script>', newStatus: 'delivered' }, '__proto__'), true)
      const message = f.calls.accepted[0]; assert.ok(!message.html.includes('<img src=x>')); assert.ok(!message.html.includes('<script>old</script>')); assert.ok(!message.html.includes('<b>REF</b>')); assert.ok(message.html.includes('&lt;img')); assert.ok(href(message.html, origin + '/en/account/orders'))
    } finally { f.close() }
  }
})
test('paid customer mail failure returnsfalse, preserves claim, and never automatically retries', async () => {
  const f = fixture({ mailFails: 'customer@example.invalid' })
  try { assert.equal(await f.email.sendOrderConfirmedOnce('synthetic-bill'), false); assert.equal(f.row().email_sent, 1); assert.equal(f.calls.attempts.length, 2); assert.equal(f.calls.accepted[0].to, 'admin@example.invalid'); assert.equal(await f.email.sendOrderConfirmedOnce('synthetic-bill'), false); assert.equal(f.calls.attempts.length, 2) }
  finally { f.close() }
})
test('paid customer success and admin-only/failed-admin cases retain customer-result semantics', async () => {
  for (const [options, expected, accepted] of [[{ mailFails: 'admin@example.invalid' }, true, 1], [{ row: { email: null } }, false, 1], [{ row: { payment_status: 'pending' } }, false, 0]]) {
    const f = fixture(options)
    try { assert.equal(await f.email.sendOrderConfirmedOnce('synthetic-bill'), expected); assert.equal(f.calls.accepted.length, accepted); if (options.row?.payment_status === 'pending') assert.equal(f.row().email_sent, 0) }
    finally { f.close() }
  }
})
test('concurrent paid notifications keep the existing single atomic claim', async () => {
  const f = fixture()
  try { const result = await Promise.all([f.email.sendOrderConfirmedOnce('synthetic-bill'), f.email.sendOrderConfirmedOnce('synthetic-bill')]); assert.deepEqual(result.sort(), [false, true]); assert.equal(f.calls.attempts.length, 2); assert.equal(f.row().email_sent, 1) }
  finally { f.close() }
})

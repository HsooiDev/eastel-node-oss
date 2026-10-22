// Offline route execution against the PHP column layout. SQLite supplies real
// relational writes/reads/constraints; this is not MariaDB or production proof.
// Payment, mail, CAPTCHA and notifications are explicitly mocked. No network.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { hashPassword, verifyPassword } from '../lib/auth.ts'
import bcrypt from 'bcryptjs'
import { execFileSync } from 'node:child_process'
import * as planEngine from '../public/recommender/engine.mjs'

const require = createRequire(import.meta.url)
const reviewStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eastel-review-cleanup-'))
const reviewPersistentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eastel-review-persistent-'))
process.on('exit', () => fs.rmSync(reviewStorageRoot, { recursive: true, force: true }))
process.on('exit', () => fs.rmSync(reviewPersistentRoot, { recursive: true, force: true }))
const sqlDb = new DatabaseSync(':memory:')
sqlDb.function('NOW', () => '2026-10-08 12:00:00')
sqlDb.function('DATE_FORMAT', (date, format) => {
  const value = (date instanceof Date ? date.toISOString() : String(date)).replace('T', ' ').replace(/Z$/, '')
  if (format === '%Y-%m') return value.slice(0, 7)
  if (format === '%Y-%m-%d %H:%i') return value.slice(0, 16)
  return value.slice(0, 10)
})
sqlDb.function('YEARWEEK', date => Number(String(date).slice(0, 4)) * 100 + 40)
const phpSchema = JSON.parse(fs.readFileSync(new URL('./fixtures/php-core-schema.json', import.meta.url)))
const additions = {
  customers: ['address TEXT', 'postcode TEXT', 'state TEXT'],
  products: ['weight_g INTEGER DEFAULT 0', 'stock INTEGER DEFAULT -1', 'image_url TEXT'],
  couriers: ['tracking_url TEXT'],
  orders: ["source TEXT DEFAULT 'website'", 'reminder_sent_at TEXT', 'plan_snapshot TEXT', 'plan_fee NUMERIC NOT NULL DEFAULT 0', 'plan_fulfilled_at TEXT', 'plan_fulfilled_by INTEGER'],
}
for (const [table, lines] of Object.entries(phpSchema)) {
  const columns = lines.map(line => {
    const [, name, type] = line.match(/^`([^`]+)`\s+(\w+)/)
    if (name === 'id') return 'id INTEGER PRIMARY KEY AUTOINCREMENT'
    const dataType = /int/i.test(type) ? 'INTEGER' : /decimal|float|double/i.test(type) ? 'NUMERIC' : 'TEXT'
    const defaultValue = line.match(/\bDEFAULT\s+('(?:[^']|'')*'|NULL|[\d.-]+|current_timestamp\(\))/i)?.[1]
    return `\`${name}\` ${dataType}${/NOT NULL/i.test(line) ? ' NOT NULL' : ''}${defaultValue ? ` DEFAULT ${/current_timestamp/i.test(defaultValue) ? 'CURRENT_TIMESTAMP' : defaultValue}` : ''}`
  })
  sqlDb.exec(`CREATE TABLE ${table} (${[...columns, ...(additions[table] ?? [])].join(', ')})`)
}
sqlDb.exec(`CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ip_address TEXT, email TEXT,
  password_tried TEXT, attempt_type TEXT, attempted_at TEXT
)`)
sqlDb.exec(`CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT
)`)
sqlDb.exec(`CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, action TEXT,
  target_table TEXT, target_id INTEGER, old_value TEXT, new_value TEXT,
  ip_address TEXT, created_at TEXT
)`)
sqlDb.exec('CREATE UNIQUE INDEX customer_email ON customers(email)')
sqlDb.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, customer_id INTEGER, role TEXT)')
sqlDb.exec('CREATE UNIQUE INDEX setting_key_unique ON settings(setting_key)')
let failPhoto = false, failPlanAudit = false, failOrderInsert = false
let beforeCheckoutTransaction = async () => {}
const db = {
  async query(sql, params = []) {
    sql = sql.replace(/\s+FOR UPDATE\b/gi, '').replace(/DATE_SUB\(CURDATE\(\), INTERVAL (\d+) (DAY|WEEK|MONTH)\)/gi, (_, n, unit) => `date('now', '-${unit === 'WEEK' ? Number(n) * 7 : n} ${unit === 'MONTH' ? 'months' : 'days'}')`)
    return [sqlDb.prepare(sql).all(...params), []]
  },
  async execute(sql, params = []) {
    if (failOrderInsert && /INSERT INTO orders/.test(sql)) throw new Error('fixture order write failed')
    if (failPhoto && /INSERT INTO review_photos/.test(sql)) throw new Error('fixture photo write failed')
    if (failPlanAudit && /INSERT INTO admin_audit_log/.test(sql)) throw new Error('fixture plan audit write failed')
    sql = sql.replace(/"(pending|failed|paid|cancelled)"/g, "'$1'").replace(/AS BINARY\)/g, "AS BLOB)").replaceAll("<=>", "IS")
    if (/ON DUPLICATE KEY UPDATE/.test(sql)) sql = sql.replace(/ON DUPLICATE KEY UPDATE[\s\S]*$/, 'ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at')
    const result = sqlDb.prepare(sql).run(...params)
    return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }, []]
  },
  async getConnection() { await beforeCheckoutTransaction(); return {
    ...db, beginTransaction: async () => sqlDb.exec('BEGIN'),
    commit: async () => sqlDb.exec('COMMIT'), rollback: async () => sqlDb.exec('ROLLBACK'), release() {},
  } },
}
const fixtureErrors = []
function load(relative, deps = {}) {
  const source = process.argv.includes('--security-baseline') && relative === 'app/api/orders/create/route.ts'
    ? execFileSync('git', ['show', 'f8b1acc:' + relative], { encoding: 'utf8' })
    : fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, {
    module, exports: module.exports, require: id => deps[id] ?? shared[id] ?? require(id),
    URL, Request, Response, Headers, Date, Buffer, console: { ...console, error: (...args) => fixtureErrors.push(args.map(String).join(' ')) },
    process: { env: { NODE_ENV: 'test', REVIEW_UPLOAD_DIR: reviewPersistentRoot }, cwd: () => reviewStorageRoot },
  }, { filename: relative })
  return module.exports
}
let authenticated = true, adminAuthorized = true, csrfValid = true, customerSession = { customerId: 1, name: 'Private Fixture Name', email: 'customer@example.invalid', emailVerified: true }, captcha = true
const shared = {
  '@/lib/db': { __esModule: true, default: db, ...db },
  '@/lib/audit': { logAdminAction: async () => {} },
  'next/server': { NextResponse: Response },
  '@/lib/cookies': { getSessionCookie: async () => authenticated ? 'fixture' : null },
  '@/lib/session': { validateAdminSession: async () => authenticated && adminAuthorized ? { customerId: 7, isAdmin: true } : null },
  '@/lib/security': { validateCsrfToken: () => csrfValid, escapeHtml: value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;') },
  '@/lib/site': { SITE_URL: 'https://fixture.invalid' },
  '@/lib/auth': { hashPassword, verifyPassword },
  // Admission is exercised independently with real locks/SQL in its own suite.
  '@/lib/customer-login-attempts': { withCustomerLoginAttempt: async (_identity, operation) => operation(db) },
  '@/lib/email': { sendShippingNotification: async () => true, sendOrderStatusChanged: async () => true, sendEmail: async () => true, sendOrderConfirmation: async () => true },
  '@/lib/turnstile': { verifyTurnstile: async () => captcha },
  '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true }) },
  '@/lib/reviews-data': { PUBLIC_REVIEWS: [] },
  '@/lib/vouchers': { voucherIssueWelcome: async () => null },
  '@/lib/migrate': { ensureOrderPlanColumns: async () => {} },
  '@/public/recommender/engine.mjs': planEngine,
  '@/public/recommender/catalogue.json': JSON.parse(fs.readFileSync(new URL('../public/recommender/catalogue.json', import.meta.url))),
}
shared['@/lib/validation'] = load('lib/validation.ts')
shared['@/lib/marketing-share-path'] = load('lib/marketing-share-path.ts')
shared['@/lib/review-upload-path'] = load('lib/review-upload-path.ts')
shared['@/lib/db-helpers'] = load('lib/db-helpers.ts')
shared['@/lib/admin-order-filters'] = load('lib/admin-order-filters.ts')
shared['@/lib/admin-report-filters'] = load('lib/admin-report-filters.ts')
shared['@/lib/plan-recommender-key'] = load('lib/plan-recommender-key.ts')
shared['@/lib/csv'] = load('lib/csv.ts')
shared['@/lib/queries/settings'] = load('lib/queries/settings.ts')
shared['@/lib/plan-recommender'] = load('lib/plan-recommender.ts')
shared['@/lib/order-plan-snapshot'] = load('lib/order-plan-snapshot.ts')
shared['@/lib/order-plan'] = load('lib/order-plan.ts')
const adminHelpers = load('app/api/admin/_helpers.ts')
shared['@/app/api/admin/_helpers'] = adminHelpers
shared['@/app/api/auth/_helpers'] = {
  ...adminHelpers, requireSession: async () => customerSession, getClientIp: () => '127.0.0.1',
}
for (const path of ['../_helpers', '../../_helpers']) shared[path] = adminHelpers
function request(path, method = 'GET', body, origin = 'https://fixture.invalid') {
  const req = new Request(`https://fixture.invalid${path}`, {
    method, headers: { 'content-type': 'application/json', host: 'fixture.invalid', origin },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  req.nextUrl = new URL(req.url)
  return req
}
async function invoke(route, method, body, path = '/api/test', expected = 200, origin) {
  const response = await route[method](request(path, method, body, origin))
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  return data
}
const product = load('app/api/admin/products/route.ts')
const courier = load('app/api/admin/couriers/route.ts')
const zone = load('app/api/admin/zones/route.ts')
const productId = (await invoke(product, 'POST', { name: 'Fixture SIM', price: 10, description: 'Keep description', sort_order: 7, stock: 15, weight_g: 42, image_url: '/uploads/fixture.png' })).productId
await invoke(product, 'PUT', { id: productId, is_active: 0 })
let stored = sqlDb.prepare('SELECT * FROM products WHERE id = ?').get(productId)
assert.equal(stored.price, 10); assert.equal(stored.sort_order, 7); assert.equal(stored.stock, 15)
assert.equal(stored.description, 'Keep description'); assert.equal(stored.weight_g, 42); assert.equal(stored.image_url, '/uploads/fixture.png')
await invoke(product, 'PUT', { id: productId, name: 'Renamed SIM', price: 12, is_active: 1 })
await invoke(product, 'POST', { name: ' ', price: 10 }, '/api/test', 400)
await invoke(product, 'POST', { name: 'Invalid', price: -1 }, '/api/test', 400)
await invoke(product, 'PUT', { id: productId, is_active: 0 }, '/api/test', 401, 'https://untrusted.invalid')
const courierId = (await invoke(courier, 'POST', { name: 'Fixture Courier', wm_fee: 4, em_fee: 8, labuan_fee: 10, sort_order: 8, tracking_url: 'https://fixture.invalid/track' })).courierId
await invoke(courier, 'PUT', { id: courierId, is_active: 0 })
stored = sqlDb.prepare('SELECT * FROM couriers WHERE id = ?').get(courierId)
assert.deepEqual([stored.wm_fee, stored.em_fee, stored.labuan_fee, stored.sort_order, stored.tracking_url], [4, 8, 10, 8, 'https://fixture.invalid/track'])
await invoke(courier, 'PUT', { id: courierId, name: 'Edited Courier', is_active: 1 })
await invoke(courier, 'POST', { name: 'Missing fees' }, '/api/test', 400)
const zoneId = (await invoke(zone, 'POST', { postcode_start: 1000, postcode_end: 1999, zone: 'WM' })).zoneId
for (const body of [
  { postcode_start: 1999, postcode_end: 2100, zone: 'EM' },
  { postcode_start: 1500, postcode_end: 1600, zone: 'Labuan' },
]) await invoke(zone, 'POST', body, '/api/test', 409)
for (const body of [
  { postcode_start: 100, postcode_end: 99, zone: 'WM' },
  { postcode_start: 1.5, postcode_end: 99, zone: 'WM' },
  { postcode_start: 1, postcode_end: 100000, zone: 'WM' },
  { postcode_start: 1, postcode_end: 99, zone: 'other' },
]) await invoke(zone, 'POST', body, '/api/test', 400)
await invoke(zone, 'PUT', { id: zoneId, description: 'Updated range' })
await invoke(zone, 'PUT', { id: zoneId, postcode_end: 999 }, '/api/test', 400)
sqlDb.exec("UPDATE postcode_zones SET description = NULL")
await invoke(zone, 'PUT', { id: zoneId, zone: 'WM' })
assert.equal((await invoke(load('app/api/orders/zone/route.ts'), 'GET', undefined, '/api/orders/zone?postcode=01001')).zone, 'WM')
await invoke(load('app/api/orders/zone/route.ts'), 'GET', undefined, '/api/orders/zone?postcode=00001', 400)
const settings = load('app/api/admin/settings/route.ts')
await invoke(settings, 'POST', { settings: { fixture_delivery_fee: '4', fixture_label: 'offline only' } })
assert.equal((await invoke(settings, 'GET')).settings.fixture_delivery_fee, '4')
await invoke(settings, 'POST', { settings: { fixture_delivery_fee: '8' } })
assert.equal((await invoke(settings, 'GET')).settings.fixture_delivery_fee, '8')
await invoke(settings, 'POST', { settings: { fixture_delivery_fee: '-1' } }, '/api/test', 400)
await invoke(settings, 'POST', { settings: { plan_recommender_catalogue_v1: '{}' } }, '/api/test', 400)

await db.execute('INSERT INTO customers (id, name, email, phone, password_hash, is_temp_pass, email_verified) VALUES (?, ?, ?, ?, ?, 0, 1)', [1, customerSession.name, customerSession.email, '0123456789', 'fixture'])
await db.execute('INSERT INTO customers (id, name, email, phone, password_hash, is_temp_pass, email_verified) VALUES (?, ?, ?, ?, ?, 0, 1)', [2, 'Other Customer', 'other@example.invalid', '0123456788', 'fixture'])
const localPassword = 'LocalFixtureOnly!7'
await db.execute('UPDATE customers SET password_hash = ? WHERE id = 1', [(await bcrypt.hash(localPassword, 4)).replace('$2b$', '$2y$')])
let customerCookie = null
shared['@/lib/session'].createSession = async id => { assert.equal(id, 1); return 'synthetic-customer-session' }
shared['@/lib/cookies'].setSessionCookie = async value => { customerCookie = value }
const login = load('app/api/auth/login/route.ts', { '../_helpers': shared['@/app/api/auth/_helpers'] })
await invoke(login, 'POST', { email: customerSession.email, password: localPassword, turnstileToken: 'mocked' })
assert.equal(customerCookie, 'synthetic-customer-session'); customerCookie = null
await invoke(login, 'POST', { email: customerSession.email, password: 'wrong-password', turnstileToken: 'mocked' }, '/api/test', 400)
assert.equal(customerCookie, null)
await invoke(load('app/api/auth/profile/route.ts', { '../_helpers': shared['@/app/api/auth/_helpers'] }), 'GET')
shared['@/lib/vouchers'] = load('lib/vouchers.ts', { './db': { __esModule: true, default: db }, crypto: { __esModule: true, default: require('node:crypto') } })
const adminVouchers = load('app/api/admin/vouchers/route.ts')
const campaign = await invoke(adminVouchers, 'POST', { action: 'save_campaign', name: 'Offline campaign', discount_type: 'fixed', discount_value: 3, min_spend: 0, validity_days: 30, is_active: true })
await invoke(adminVouchers, 'POST', { action: 'save_campaign', id: campaign.id, name: 'Edited campaign', discount_type: 'fixed', discount_value: 4, min_spend: 0, validity_days: 30, is_active: true })
assert.equal((await invoke(adminVouchers, 'GET', undefined, '/api/vouchers?action=list_campaigns')).campaigns[0].discount_value, 4)
const issued = await invoke(adminVouchers, 'POST', { action: 'issue_to_email', campaign_id: campaign.id, email: customerSession.email })
assert.equal((await shared['@/lib/vouchers'].voucherValidate(issued.code, 1, 16)).discount, 4)
assert.equal((await shared['@/lib/vouchers'].voucherValidate(issued.code, 2, 16)).ok, false)
assert.equal((await invoke(load('app/api/vouchers/route.ts'), 'GET', undefined, '/api/vouchers?action=my_active')).vouchers.length, 1)
const insertOrder = async (id, cust, status, payment, fee, total, options = {}) => db.execute(`INSERT INTO orders
 (id, customer_id, order_ref, full_name, email, phone, courier_id, courier_name, sim_fee, delivery_fee, total_amount,
  payment_status, order_status, bill_code, delivery_address, postcode, state, zone, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
 [id, cust, options.orderRef ?? `FIXTURE-${id}`, options.fullName ?? 'Fixture Customer', options.email ?? 'customer@example.invalid', options.phone ?? '0123456789', options.courierId ?? courierId, options.courierName ?? 'Edited Courier', fee, options.deliveryFee ?? 4, total,
 payment, status, options.billCode ?? `fixturebill${id}`, options.address ?? 'Fictional address', options.postcode ?? '01001', options.state ?? 'Kedah', options.zone ?? 'WM', options.createdAt ?? '2026-10-08 00:00:00', options.updatedAt ?? '2026-10-08 00:00:00'])
await insertOrder(1, 1, 'delivered', 'paid', 8, 9)
await insertOrder(2, 1, 'processing', 'paid', 11, 15)
await insertOrder(3, 1, 'pending', 'pending', 12, 16)
await insertOrder(4, 2, 'delivered', 'paid', 9, 13)
await insertOrder(5, 1, 'delivered', 'paid', 8, 12)
await invoke(courier, 'DELETE', undefined, `/api/test?id=${courierId}`, 409)
const adminOrders = load('app/api/admin/orders/route.ts')
const listed = await invoke(adminOrders, 'GET', undefined, '/api/admin/orders?search=FIXTURE-1')
assert.equal(listed.orders.length, 1); assert.equal(listed.orders[0].unit_price, 8); assert.equal(listed.orders[0].quantity, 1)
await invoke(adminOrders, 'POST', { orderId: 2, orderStatus: 'delivered', trackingNumber: 'LOCAL-ONLY' })
assert.equal(sqlDb.prepare('SELECT tracking_number FROM orders WHERE id = 2').get().tracking_number, 'LOCAL-ONLY')
const ownOrders = await invoke(load('app/api/orders/my/route.ts'), 'GET')
assert.equal(ownOrders.orders.length, 4); assert.ok(ownOrders.orders.every(order => order.product_id === null && order.quantity === 1))
const customerDetail = await load('app/api/admin/customers/[id]/route.ts').GET(request('/api/test'), { params: Promise.resolve({ id: '1' }) })
assert.equal(customerDetail.status, 200); const detail = await customerDetail.json()
assert.equal(detail.customer.password_hash, undefined); assert.equal(detail.orders.length, 4)
const reports = await invoke(load('app/api/admin/reports/route.ts'), 'GET', undefined, '/api/reports?startDate=2026-10-08&endDate=2026-10-08')
assert.equal(Number(reports.summary.total_revenue), 49); assert.equal(reports.summary.total_orders, 4)
assert.equal(reports.topProducts[0].product_id, null); assert.equal(reports.topProducts[0].total_qty, 4); assert.equal(Number(reports.topProducts[0].total_revenue), 36)
const productReports = await invoke(load('app/api/admin/reports/products/route.ts'), 'GET')
assert.equal(productReports.bestSellers[0].total_qty_sold, 4)
assert.equal(Number(productReports.bestSellers[0].total_revenue), 36)
assert.equal(Number(productReports.revenuePerProduct[0].avg_unit_price), 9)
for (const type of ['orders', 'customers', 'reviews']) {
  const response = await load('app/api/admin/reports/export/route.ts').GET(request(`/api/export?type=${type}`))
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/csv/)
  const csv = await response.text(); assert.ok(csv.includes('customer_name') || csv.includes('order_count'))
}

await invoke(adminOrders, 'GET', undefined, '/api/admin/orders?startDate=2026-02-30', 400)
const todayUtc = new Date().toISOString().slice(0, 10)
const tomorrowUtc = new Date(Date.UTC(Number(todayUtc.slice(0, 4)), Number(todayUtc.slice(5, 7)) - 1, Number(todayUtc.slice(8, 10)) + 1)).toISOString().slice(0, 10)
await db.execute('UPDATE orders SET created_at = ?, updated_at = ? WHERE id BETWEEN 1 AND 5', ['2026-08-08 10:00:00', '2026-08-08 10:00:00'])
await insertOrder(130, 9000, 'shipped', 'paid', 40, 45, { orderRef: 'WA-GUEST-130', email: 'guest@example.invalid', courierName: 'Guest Courier', deliveryFee: 5, zone: 'EM', createdAt: `${todayUtc} 23:59:59` })
await insertOrder(131, 9000, 'shipped', 'paid', 60, 64, { orderRef: 'WA-GUEST-131', email: 'guest@example.invalid', courierName: 'Guest Courier', deliveryFee: 4, zone: 'EM', createdAt: `${tomorrowUtc} 00:00:00` })
await insertOrder(132, 9000, 'pending', 'pending', 30, 34, { orderRef: 'WA-PENDING-132', email: 'pending@example.invalid', courierName: 'Pending Courier', deliveryFee: 4, createdAt: `${todayUtc} 12:00:00` })
await insertOrder(133, 9000, 'shipped', 'paid', 50, 58, { orderRef: 'WA-REPORT-133', email: 'report@example.invalid', courierName: 'Reports Fixture Courier', deliveryFee: 6, zone: 'Labuan', createdAt: `${todayUtc} 08:00:00` })
for (let index = 1; index <= 24; index++) {
  await insertOrder(200 + index, 9000, 'processing', 'paid', 3, 7, {
    orderRef: `EXPORT-BATCH-${index}`, email: `batch-${index}@fixture.invalid`, createdAt: '2026-09-15 12:00:00',
  })
}
await insertOrder(250, 9000, 'processing', 'pending', 3, 7, {
  orderRef: 'CSV-INJECTION-250', fullName: '\tHidden, "Name"\r\nSecond line', email: 'csv@fixture.invalid', createdAt: '2026-09-16 10:00:00',
})
const filteredGuest = await invoke(adminOrders, 'GET', undefined, `/api/admin/orders?status=shipped&paymentStatus=paid&source=website&startDate=${todayUtc}&endDate=${todayUtc}&search=guest%40example.invalid`)
assert.equal(filteredGuest.orders.length, 1); assert.equal(filteredGuest.orders[0].order_ref, 'WA-GUEST-130')
assert.equal(filteredGuest.pagination.total, 1); assert.equal(filteredGuest.summary.total_orders, 1)
assert.equal(filteredGuest.summary.paid_orders, 1); assert.equal(Number(filteredGuest.summary.paid_revenue), 45)
assert.equal(Number(filteredGuest.summary.today_revenue), 45, 'today revenue uses the active filters and date parameters in the right order')
const batchPage = await invoke(adminOrders, 'GET', undefined, '/api/admin/orders?search=EXPORT-BATCH&page=2&perPage=20')
assert.equal(batchPage.orders.length, 4); assert.equal(batchPage.pagination.total, 24)
const batchCsvResponse = await adminOrders.GET(request('/api/admin/orders?format=csv&search=EXPORT-BATCH'))
assert.equal(batchCsvResponse.status, 200)
const batchCsv = await batchCsvResponse.text()
assert.equal(batchCsv.split('\r\n').length, 25, 'CSV export includes all 24 matches, not only the current page')
assert.ok(batchCsv.includes('EXPORT-BATCH-24'))
const injectionCsvResponse = await adminOrders.GET(request('/api/admin/orders?format=csv&search=CSV-INJECTION'))
const injectionCsv = await injectionCsvResponse.text()
assert.ok(injectionCsv.includes('"\'\tHidden, ""Name""\r\nSecond line"'), 'CSV text safely quotes commas, double quotes, leading tab, and CRLF')
assert.ok(injectionCsv.includes(',3.00,"SIM only","",0.00,'), 'SIM and plan order amounts remain unquoted numeric cells')
assert.ok(injectionCsv.includes(',4.00,"",0.00,7.00,'), 'delivery, voucher discount and total remain numeric cells')
assert.match(injectionCsv, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/, 'order CSV dates stay in ISO-like SQL format')
const beforeCourierEdit = sqlDb.prepare('SELECT sim_fee, delivery_fee, total_amount FROM orders WHERE id = 130').get()
await invoke(adminOrders, 'POST', { orderId: 130, trackingNumber: 'LOCAL-TRACK-130', courierName: 'Reassigned Courier' })
const afterCourierEdit = sqlDb.prepare('SELECT sim_fee, delivery_fee, total_amount, courier_name, tracking_number FROM orders WHERE id = 130').get()
assert.deepEqual([afterCourierEdit.sim_fee, afterCourierEdit.delivery_fee, afterCourierEdit.total_amount], [beforeCourierEdit.sim_fee, beforeCourierEdit.delivery_fee, beforeCourierEdit.total_amount])
assert.equal(afterCourierEdit.courier_name, 'Reassigned Courier'); assert.equal(afterCourierEdit.tracking_number, 'LOCAL-TRACK-130')
await invoke(adminOrders, 'POST', { orderId: 132, orderStatus: 'pending', trackingNumber: '', courierName: 'Pending Courier' })
assert.equal(sqlDb.prepare('SELECT order_status FROM orders WHERE id = 132').get().order_status, 'pending')
const adminReportRoute = load('app/api/admin/reports/route.ts')
authenticated = false
await invoke(adminReportRoute, 'GET', undefined, '/api/reports?view=orders&format=csv', 401)
authenticated = true
const reportRange = `startDate=${todayUtc}&endDate=${todayUtc}`
const overviewReport = await invoke(adminReportRoute, 'GET', undefined, `/api/reports?view=overview&${reportRange}`)
assert.equal(Number(overviewReport.summary.total_orders), 3)
const ordersReport = await invoke(adminReportRoute, 'GET', undefined, `/api/reports?view=orders&${reportRange}`)
assert.equal(ordersReport.ordersByMonth.length, 1); assert.equal(Number(ordersReport.ordersByMonth[0].total_orders), 3)
assert.equal(Number(ordersReport.ordersByMonth[0].paid_orders), 2); assert.equal(Number(ordersReport.ordersByMonth[0].revenue), 103)
const revenueReport = await invoke(adminReportRoute, 'GET', undefined, `/api/reports?view=revenue&${reportRange}`)
assert.equal(Number(revenueReport.summary.total_revenue), 103)
assert.equal(Number(revenueReport.summary.sim_fee_revenue), 90); assert.equal(Number(revenueReport.summary.delivery_fee_revenue), 11)
const courierReport = await invoke(adminReportRoute, 'GET', undefined, `/api/reports?view=couriers&${reportRange}`)
assert.equal(Number(courierReport.rows.find(row => row.label === 'Reports Fixture Courier').avg_delivery_fee), 6)
const zoneReport = await invoke(adminReportRoute, 'GET', undefined, `/api/reports?view=zones&${reportRange}`)
assert.equal(Number(zoneReport.rows.find(row => row.label === 'Labuan').paid_revenue), 58)
for (const view of ['overview', 'orders']) {
  const allCsvResponse = await adminReportRoute.GET(request(`/api/reports?view=${view}&format=csv`))
  assert.equal(allCsvResponse.status, 200)
  assert.match(allCsvResponse.headers.get('content-type'), /text\/csv/)
  const allCsv = await allCsvResponse.text()
  assert.ok(allCsv.includes('EXPORT-BATCH-24'), `${view} CSV includes data beyond a page of orders`)
  assert.match(allCsv, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/, `${view} CSV date projection is stable`)
  assert.ok(allCsv.split('\r\n').length > 20)
  const dateCsvResponse = await adminReportRoute.GET(request(`/api/reports?view=${view}&format=csv&${reportRange}`))
  const dateCsv = await dateCsvResponse.text()
  assert.equal(dateCsv.split('\r\n').length, 4, `${view} CSV uses the inclusive selected date range`)
  assert.ok(dateCsv.includes('WA-GUEST-130'))
  assert.ok(!dateCsv.includes('WA-GUEST-131'), 'next-day order is outside the selected date range')
}
await invoke(adminReportRoute, 'GET', undefined, '/api/reports?view=reviews&startDate=2026-02-30', 400)

await db.execute('INSERT INTO reviews (order_id, customer_id, rating, review_text, display_mode, display_name, status) VALUES (1, 1, 5, ?, ?, ?, ?)', ['Private approved review', 'private', 'Do not expose this name', 'approved'])
await db.execute('INSERT INTO review_photos (review_id, file_path, sort_order) VALUES (1, ?, 2), (1, ?, 1)', ['/uploads/reviews/later.jpg', '/uploads/reviews/first.jpg'])
const publicReviews = load('app/api/reviews/public/route.ts')
assert.equal((await invoke(publicReviews, 'GET')).reviews[0].customer_name, 'Anonymous Customer')
const single = await load('app/api/reviews/[id]/route.ts').GET(request('/api/reviews/1'), { params: Promise.resolve({ id: '1' }) })
const reviewDetail = (await single.json()).review
assert.equal(reviewDetail.customer_name, 'Anonymous Customer'); assert.equal(reviewDetail.photos[0].url, '/uploads/reviews/first.jpg')
const submit = load('app/api/reviews/submit/route.ts')
const reviewBody = { order_id: 2, rating: 4, comment: 'This is a local fixture review.', display_mode: 'private', photo_url: '/uploads/fixture.jpg', turnstileToken: 'mocked' }
await invoke(submit, 'POST', { ...reviewBody, order_id: 3 }, '/api/test', 400)
await invoke(submit, 'POST', { ...reviewBody, order_id: 4 }, '/api/test', 400)
await invoke(submit, 'POST', { ...reviewBody, comment: 'short' }, '/api/test', 400)
captcha = false; await invoke(submit, 'POST', reviewBody, '/api/test', 400); captcha = true
const submitted = await invoke(submit, 'POST', reviewBody)
stored = sqlDb.prepare('SELECT * FROM reviews WHERE id = ?').get(submitted.review_id)
assert.equal(stored.review_text, reviewBody.comment); assert.equal(stored.status, 'pending'); assert.equal(stored.display_name, '')
await invoke(submit, 'POST', reviewBody, '/api/test', 400)
assert.equal((await invoke(publicReviews, 'GET')).reviews.length, 1)
const adminReviews = load('app/api/admin/reviews/route.ts')
assert.equal((await invoke(adminReviews, 'GET')).reviews.length, 2)
await invoke(adminReviews, 'POST', { reviewId: submitted.review_id, action: 'approve' }, '/api/test', 401, 'https://untrusted.invalid')
await invoke(adminReviews, 'POST', { reviewId: submitted.review_id, action: 'approve' })
assert.equal((await invoke(publicReviews, 'GET')).reviews.length, 2)
await invoke(adminReviews, 'POST', { reviewId: submitted.review_id, action: 'reject' })
assert.equal((await invoke(publicReviews, 'GET')).reviews.length, 1)
await invoke(adminReviews, 'POST', { reviewId: submitted.review_id, action: 'set_pending' })
assert.equal(sqlDb.prepare('SELECT status FROM reviews WHERE id = ?').get(submitted.review_id).status, 'pending')
await invoke(adminReviews, 'POST', { reviewId: submitted.review_id, action: 'approve' })
await invoke(adminReviews, 'POST', { reviewId: submitted.review_id, action: 'reject' })
await invoke(adminReviews, 'POST', { reviewId: submitted.review_id, action: 'set_pending' })
await invoke(adminReviews, 'POST', { reviewId: submitted.review_id, action: 'reject' })
await invoke(adminReviews, 'POST', { reviewId: 999999, action: 'set_pending' }, '/api/test', 404)
await invoke(adminReviews, 'POST', { reviewId: 999999, action: 'delete' }, '/api/test', 404)
await db.execute('INSERT INTO review_photos (review_id, file_path, sort_order) VALUES (1, ?, 3), (1, ?, 4), (1, ?, 5), (1, ?, 6)', [
  'uploads/reviews/legacy-no-leading.jpg', '/uploads/173522-abcd1234.webp', '/uploads/../outside.jpg', 'https://fixture.invalid/remote.jpg',
])
const filteredReviews = await invoke(adminReviews, 'GET', undefined, '/api/admin/reviews?status=approved&rating=5&search=FIXTURE-1')
{
  const data = filteredReviews
  assert.equal(data.pagination.total, 1, 'review count search joins customers/orders used by the list query')
  assert.equal(data.reviews[0].order_ref, 'FIXTURE-1')
  assert.equal(data.reviews[0].photos[0].url, '/uploads/reviews/first.jpg')
  const urls = data.reviews[0].photos.map(photo => photo.url)
  assert.ok(urls.includes('/uploads/reviews/legacy-no-leading.jpg'))
  assert.ok(urls.includes('/uploads/173522-abcd1234.webp'))
  assert.ok(!urls.some(url => url.includes('outside') || url.includes('fixture.invalid')))
}
await invoke(adminReviews, 'GET', undefined, '/api/admin/reviews?status=invalid', 400)
await invoke(adminReviews, 'GET', undefined, '/api/admin/reviews?rating=9', 400)
await invoke(adminReviews, 'GET', undefined, '/api/admin/reviews?search=FIXTURE', 200).then(data => {
  assert.ok(data.reviews.every(review => review.photos.every(photo => photo.url.startsWith('/uploads/'))))
})
await db.execute('UPDATE reviews SET created_at = ? WHERE id IN (1, ?)', [`${todayUtc} 12:00:00`, submitted.review_id])
const reviewReport = await invoke(adminReportRoute, 'GET', undefined, `/api/reports?view=reviews&${reportRange}`)
assert.equal(Number(reviewReport.summary.total_reviews), 2)
assert.equal(Number(reviewReport.summary.approved_reviews), 1)
assert.equal(Number(reviewReport.summary.rejected_reviews), 1)
assert.equal(Number(reviewReport.summary.pending_reviews), 0)
assert.equal(Number(reviewReport.summary.approved_average_rating), 5)
assert.equal(Number(reviewReport.ratingDistribution.find(row => row.rating === 5).count), 1)
for (let index = 1; index <= 22; index++) {
  await insertOrder(500 + index, 1, 'delivered', 'paid', 5, 9, { orderRef: `REVIEW-EXPORT-ORDER-${index}`, createdAt: `${todayUtc} 13:00:00` })
  await db.execute('INSERT INTO reviews (order_id, customer_id, rating, review_text, display_mode, display_name, status, created_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?)', [
    500 + index, index % 5 + 1, index === 1 ? '=1+1' : `Review export fixture ${index}`,
    'private', 'Do not disclose review export name', index === 22 ? 'pending' : 'approved', `${todayUtc} 14:00:00`,
  ])
}
await insertOrder(600, 1, 'delivered', 'paid', 5, 9, { orderRef: 'REVIEW-EXPORT-NEXT-DAY', createdAt: `${tomorrowUtc} 00:00:00` })
await db.execute('INSERT INTO reviews (order_id, customer_id, rating, review_text, display_mode, display_name, status, created_at) VALUES (600, 1, 5, ?, ?, ?, ?, ?)', [
  'Next day review fixture', 'private', 'Next Day Private Name', 'approved', `${tomorrowUtc} 00:00:00`,
])
const reviewCsvResponse = await adminReportRoute.GET(request(`/api/reports?view=reviews&format=csv&${reportRange}`))
assert.equal(reviewCsvResponse.status, 200)
const reviewCsv = await reviewCsvResponse.text()
assert.equal(reviewCsv.split('\r\n').length, 25, 'review CSV exports every matching review, not only the recent 20')
assert.ok(reviewCsv.includes('Anonymous'))
assert.ok(!reviewCsv.includes('Do not disclose review export name'))
assert.ok(reviewCsv.includes("'=1+1"), 'CSV review comments are formula-safe')
assert.match(reviewCsv, /\d{4}-\d{2}-\d{2}/, 'review CSV dates stay in yyyy-mm-dd form')
assert.ok(!reviewCsv.includes('REVIEW-EXPORT-NEXT-DAY'))

await invoke(load('app/api/reviews/my/route.ts'), 'GET')
failPhoto = true
await invoke(submit, 'POST', { ...reviewBody, order_id: 5 }, '/api/test', 500)
failPhoto = false
assert.equal(sqlDb.prepare('SELECT COUNT(*) AS count FROM reviews WHERE order_id = 5').get().count, 0)

await db.execute('INSERT INTO login_attempts (ip_address, email, password_tried, attempt_type, attempted_at) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)', [
  '203.0.113.10', 'private@example.invalid', 'must-not-leak', 'WRONG_PASSWORD', '2026-10-08 10:00:00',
  '198.51.100.20', 'honeypot@example.invalid', 'another-secret', 'HONEYPOT', '2026-10-08 11:00:00',
])
await db.execute('INSERT INTO admin_users (id, name) VALUES (7, ?)', ['Fixture Admin'])
await db.execute('INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, old_value, new_value, ip_address, created_at) VALUES (7, ?, ?, ?, ?, ?, ?, ?)', [
  'update_customer', 'customers', 1, 'old-private-data', 'new-private-data', '203.0.113.10', '2026-10-08 12:00:00',
])
const security = load('app/api/admin/security/route.ts')
const securityList = await invoke(security, 'GET', undefined, '/api/admin/security?attempt_type=WRONG_PASSWORD&ip=203.0.113')
assert.equal(securityList.pagination.total, 1)
assert.equal(securityList.attempts[0].ip_address, '203.0.113.10')
assert.equal(securityList.attempts[0].password_tried, undefined, 'raw attempted passwords are never serialized')
await invoke(security, 'GET', undefined, '/api/admin/security?attempt_type=PASSWORD', 400)
const audit = await invoke(security, 'GET', undefined, '/api/admin/security?action=audit')
assert.equal(audit.entries[0].new_value, 'new-private-data')

let revokedLogout = ''
let logoutCookieCleared = false
shared['@/lib/session'] = {
  ...shared['@/lib/session'],
  revokeSession: async sessionId => { revokedLogout = sessionId },
}
shared['@/lib/cookies'] = {
  ...shared['@/lib/cookies'],
  getSessionCookie: async () => 'fixture-admin-session',
  clearSessionCookie: async () => { logoutCookieCleared = true },
}
const logout = load('app/api/auth/logout/route.ts')
await invoke(logout, 'POST', undefined, '/api/auth/logout')
assert.equal(revokedLogout, 'fixture-admin-session')
assert.equal(logoutCookieCleared, true, 'sign out revokes the session and clears its cookie')

authenticated = false
await invoke(adminReviews, 'GET', undefined, '/api/admin/reviews', 401)
await invoke(security, 'GET', undefined, '/api/admin/security', 401)
authenticated = true

let bills = 0
let beforeBillResponse = async () => {}
const billInputs = []
shared['@/lib/toyyibpay'] = { createBill: async input => {
  billInputs.push(input)
  await beforeBillResponse()
  return { billCode: `offlinebill${++bills}`, paymentUrl: 'https://fixture.invalid/mock-payment' }
} }
const checkout = load('app/api/orders/create/route.ts')
const checkoutBody = { full_name: 'Fictional Buyer', email: 'customer@example.invalid', phone: '0123456789', address_line1: 'Fictional Street', postcode: '01001', city: 'Fictional City', state: 'Kedah', courier_id: courierId, lang: 'en', turnstileToken: 'mocked' }
customerSession.emailVerified = false
await invoke(checkout, 'POST', checkoutBody, '/api/test', 403)
assert.equal(bills, 0, 'unverified sessions cannot create payment bills')
await invoke(load('app/api/orders/my/route.ts'), 'GET', undefined, '/api/orders/my', 403)
customerSession.emailVerified = true
for (const invalid of [{ address_line1: 'x'.repeat(256) }, { address_line2: 'x'.repeat(256) }, { alt_phone: '1'.repeat(21) }, { alt_phone: {} }, { address_line2: 1 }]) {
  const priorBills = bills;
  await invoke(checkout, 'POST', { ...checkoutBody, ...invalid }, '/api/test', 400);
  assert.equal(bills, priorBills, 'invalid input must be rejected before bill creation');
}
await invoke(checkout, 'POST', { ...checkoutBody, address_line1: 'x'.repeat(255), address_line2: 'y'.repeat(255), alt_phone: '1'.repeat(20) })
await invoke(checkout, 'POST', checkoutBody)
stored = sqlDb.prepare('SELECT * FROM orders WHERE bill_code = ?').get(`offlinebill${bills}`)
assert.equal(stored.email, checkoutBody.email); assert.equal(stored.sim_fee, 12); assert.equal(stored.order_status, 'pending')
assert.equal(stored.customer_id, 1); assert.equal(stored.city, checkoutBody.city); assert.ok(stored.delivery_address.includes('01001'))
assert.equal(stored.plan_snapshot, null); assert.equal(stored.plan_fee, 0)
assert.equal(stored.total_amount, 16); assert.equal(billInputs.at(-1).billAmount, 1600, 'SIM-only checkout retains the original bill amount')
const simOnlyOrderId = stored.id
assert.equal(sqlDb.prepare('SELECT stock FROM products WHERE id = ?').get(productId).stock, 15)
await invoke(checkout, 'POST', { ...checkoutBody, voucher_code: issued.code })
stored = sqlDb.prepare('SELECT * FROM orders WHERE bill_code = ?').get(`offlinebill${bills}`)
assert.equal(stored.total_amount, 12); assert.equal(stored.voucher_discount, 4)
assert.equal(sqlDb.prepare('SELECT status FROM customer_vouchers WHERE code = ?').get(issued.code).status, 'redeemed')
await invoke(checkout, 'POST', { ...checkoutBody, voucher_code: issued.code }, '/api/test', 400)
customerSession = null
await invoke(checkout, 'POST', checkoutBody, '/api/test', 400)
const guestEmail = 'guest@example.invalid'
await db.execute('INSERT INTO email_verifications (email, code, token, verified, expires_at) VALUES (?, ?, ?, 1, ?)', [guestEmail, 'fixture', 'fixture-token', '2099-01-01 00:00:00'])
await invoke(checkout, 'POST', { ...checkoutBody, email: guestEmail, email_verify_token: 'fixture-token' })
const guest = sqlDb.prepare('SELECT * FROM customers WHERE email = ?').get(guestEmail)
assert.equal(guest.is_temp_pass, 1); assert.equal(guest.email_verified, 1); assert.ok(guest.password_hash.startsWith('$argon2id$'))
assert.equal(sqlDb.prepare('SELECT customer_id FROM orders WHERE bill_code = ?').get(`offlinebill${bills}`).customer_id, guest.id)
await invoke(checkout, 'POST', { ...checkoutBody, email: guestEmail, email_verify_token: 'fixture-token', guest_override: true }, '/api/test', 400)
await db.execute('INSERT INTO email_verifications (email, code, token, verified, expires_at) VALUES (?, ?, ?, 1, ?)', [guestEmail, 'fixture', 'fresh-fixture-token', '2099-01-01 00:00:00'])
await invoke(checkout, 'POST', { ...checkoutBody, email: guestEmail, email_verify_token: 'fresh-fixture-token', guest_override: true })
assert.equal(sqlDb.prepare('SELECT COUNT(*) AS n FROM customers WHERE email = ?').get(guestEmail).n, 1)
assert.equal(sqlDb.prepare('SELECT password_hash FROM customers WHERE id = ?').get(guest.id).password_hash, guest.password_hash, 'verified guest accounts retain their credentials')

// A pre-registration password and every pre-claim customer session must lose
// authority when the real mailbox owner proves ownership at guest checkout.
const preclaimEmail = 'preclaimed@example.invalid', attackerPassword = 'SyntheticAttackerOnly!9'
const attackerHash = await hashPassword(attackerPassword)
const [preclaim] = await db.execute('INSERT INTO customers (name, email, phone, password_hash, is_temp_pass, email_verified, reset_token, reset_expires) VALUES (?, ?, ?, ?, 0, 0, ?, ?)', ['Preclaim', preclaimEmail, '0123456788', attackerHash, 'untrusted-reset', '2099-01-01'])
await db.execute("INSERT INTO sessions VALUES ('attacker-session', ?, 'customer')", [preclaim.insertId])
await db.execute("INSERT INTO sessions VALUES ('separate-admin-session', ?, 'admin')", [preclaim.insertId])
await db.execute('INSERT INTO email_verifications (email, code, token, verified, expires_at) VALUES (?, ?, ?, 1, ?)', [preclaimEmail, 'fixture', 'mailbox-owner-proof', '2099-01-01 00:00:00'])
await invoke(checkout, 'POST', { ...checkoutBody, email: preclaimEmail, email_verify_token: 'mailbox-owner-proof', guest_override: true })
const reclaimed = sqlDb.prepare('SELECT * FROM customers WHERE id = ?').get(preclaim.insertId)
assert.equal(await verifyPassword(attackerPassword, reclaimed.password_hash), false)
assert.equal(reclaimed.email_verified, 1); assert.equal(reclaimed.is_temp_pass, 1)
assert.equal(reclaimed.reset_token, null); assert.equal(reclaimed.reset_expires, null)
assert.equal(reclaimed.name, checkoutBody.full_name)
assert.equal(sqlDb.prepare("SELECT COUNT(*) AS n FROM sessions WHERE customer_id = ? AND role='customer'").get(reclaimed.id).n, 0)
assert.equal(sqlDb.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id='separate-admin-session'").get().n, 1)
assert.equal(sqlDb.prepare('SELECT COUNT(*) AS n FROM email_verifications WHERE token = ?').get('mailbox-owner-proof').n, 0)

// A proof expiring after the cheap preflight cannot transfer an account.
await db.execute('UPDATE customers SET password_hash = ?, email_verified = 0 WHERE id = ?', [attackerHash, reclaimed.id])
await db.execute("INSERT INTO sessions VALUES ('rollback-customer-session', ?, 'customer')", [reclaimed.id])
await db.execute('INSERT INTO email_verifications (email, code, token, verified, expires_at) VALUES (?, ?, ?, 1, ?)', [preclaimEmail, 'fixture', 'late-expiry-proof', '2099-01-01 00:00:00'])
const beforeRejectedOrders = sqlDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n
const beforeExpiredProofBills = bills
beforeCheckoutTransaction = async () => { await db.execute('UPDATE email_verifications SET expires_at = ? WHERE token = ?', ['2000-01-01', 'late-expiry-proof']) }
await invoke(checkout, 'POST', { ...checkoutBody, email: preclaimEmail, email_verify_token: 'late-expiry-proof', guest_override: true }, '/api/test', 400)
beforeCheckoutTransaction = async () => {}
assert.equal(bills, beforeExpiredProofBills, 'proof rejected under lock cannot create an orphan bill')
assert.equal(sqlDb.prepare('SELECT email_verified FROM customers WHERE id = ?').get(reclaimed.id).email_verified, 0)
assert.equal(sqlDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n, beforeRejectedOrders)

// A failed order insert must restore the password, session and mailbox proof.
await db.execute('INSERT INTO email_verifications (email, code, token, verified, expires_at) VALUES (?, ?, ?, 1, ?)', [preclaimEmail, 'fixture', 'rollback-proof', '2099-01-01 00:00:00'])
failOrderInsert = true
await invoke(checkout, 'POST', { ...checkoutBody, email: preclaimEmail, email_verify_token: 'rollback-proof', guest_override: true }, '/api/test', 500)
failOrderInsert = false
assert.equal(sqlDb.prepare('SELECT password_hash FROM customers WHERE id = ?').get(reclaimed.id).password_hash, attackerHash)
assert.equal(sqlDb.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id='rollback-customer-session'").get().n, 1)
assert.equal(sqlDb.prepare("SELECT COUNT(*) AS n FROM email_verifications WHERE token='rollback-proof'").get().n, 1)
assert.equal(sqlDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n, beforeRejectedOrders)

// Gateway failure restores the same proof/account transaction for a real retry.
beforeBillResponse = async () => {
  assert.equal(sqlDb.prepare("SELECT COUNT(*) AS n FROM email_verifications WHERE token='rollback-proof'").get().n, 0, 'proof must already be consumed before gateway work')
  throw new Error('fixture gateway failed')
}
await invoke(checkout, 'POST', { ...checkoutBody, email: preclaimEmail, email_verify_token: 'rollback-proof', guest_override: true }, '/api/test', 502)
beforeBillResponse = async () => {}
assert.equal(sqlDb.prepare("SELECT COUNT(*) AS n FROM email_verifications WHERE token='rollback-proof'").get().n, 1)
assert.equal(sqlDb.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id='rollback-customer-session'").get().n, 1)
await invoke(checkout, 'POST', { ...checkoutBody, email: preclaimEmail, email_verify_token: 'rollback-proof', guest_override: true })

// Optional plans are real purchases: use the DB-backed live catalogue, actual
// checkout handler and relational writes, while the payment gateway is mocked.
customerSession = { customerId: 1, name: 'Private Fixture Name', email: 'customer@example.invalid', emailVerified: true }
const purchasedPlan = {
  id: 'fixture-monthly', name: 'Fixture Monthly', price: 35, dataGB: 200,
  hotspotGB: 100, hotspotMode: 'separate', roamingGB: 2, validityDays: 30, status: 'available',
}
const orderCatalogue = { version: 1, plans: [
  purchasedPlan,
  { ...purchasedPlan, id: 'fixture-inactive', status: 'inactive' },
  { ...purchasedPlan, id: 'fixture-coming', status: 'coming_soon' },
] }
await shared['@/lib/plan-recommender'].savePlanCatalogue(orderCatalogue)
const orderPlan = shared['@/lib/order-plan']
for (const empty of [undefined, null, '']) {
  const selection = await orderPlan.resolveOrderPlanSelection(empty)
  assert.equal(selection.snapshot, null); assert.equal(selection.fee, 0)
}
const selected = await orderPlan.resolveOrderPlanSelection(purchasedPlan.id)
assert.equal(selected.fee, 35); assert.ok(Object.isFrozen(selected.snapshot)); assert.ok(Object.isFrozen(selected.snapshot.plan))
assert.throws(() => { selected.snapshot.plan.price = 0 }, TypeError)
for (const malformed of [null, '{', {}, [], { version: 2, currency: 'MYR', plan: purchasedPlan },
  { version: 1, currency: 'USD', plan: purchasedPlan },
  { version: 1, currency: 'MYR', plan: { ...purchasedPlan, price: Infinity } },
  { version: 1, currency: 'MYR', plan: { ...purchasedPlan, price: 35.001 } },
  { version: 1, currency: 'MYR', plan: { ...purchasedPlan, status: 'inactive' } },
  { version: 1, currency: 'MYR', plan: purchasedPlan, extra: true },
]) assert.equal(orderPlan.getOrderPlanSnapshot(malformed), null)

const planCheckout = await invoke(checkout, 'POST', {
  ...checkoutBody, plan_id: purchasedPlan.id, plan_price_cents: 3500,
  plan_name: 'Untrusted client name', plan_fee: 0.01,
  plan_snapshot: { plan: { ...purchasedPlan, price: 0.01 } },
})
const savedPlanOrder = sqlDb.prepare('SELECT * FROM orders WHERE bill_code = ?').get(`offlinebill${bills}`)
const savedSnapshotText = savedPlanOrder.plan_snapshot
const savedSnapshot = JSON.parse(savedSnapshotText)
assert.deepEqual(savedSnapshot, { version: 1, currency: 'MYR', plan: purchasedPlan })
assert.equal(savedPlanOrder.plan_fee, 35); assert.equal(savedPlanOrder.sim_fee, 12)
assert.equal(savedPlanOrder.delivery_fee, 4); assert.equal(savedPlanOrder.total_amount, 51)
assert.equal(savedPlanOrder.payment_status, 'pending'); assert.equal(savedPlanOrder.plan_fulfilled_at, null)
assert.equal(billInputs.at(-1).billAmount, 5100, 'gateway collects SIM, delivery and the full purchased plan fee')
assert.ok(billInputs.at(-1).billDescription.includes(purchasedPlan.name))
assert.equal(planCheckout.total_amount, '51.00'); assert.equal(planCheckout.plan_fee, '35.00')
assert.deepEqual(planCheckout.plan_snapshot, savedSnapshot)

const planGuestEmail = 'plan-guest@fixture.invalid'
await db.execute('INSERT INTO email_verifications (email, code, token, verified, expires_at) VALUES (?, ?, ?, 1, ?)', [planGuestEmail, 'fixture', 'plan-guest-token', '2099-01-01 00:00:00'])
customerSession = null
await invoke(checkout, 'POST', { ...checkoutBody, email: planGuestEmail, email_verify_token: 'plan-guest-token', plan_id: purchasedPlan.id })
const planGuestOrder = sqlDb.prepare('SELECT * FROM orders WHERE bill_code = ?').get(`offlinebill${bills}`)
const planGuestCustomer = sqlDb.prepare('SELECT * FROM customers WHERE email = ?').get(planGuestEmail)
assert.equal(planGuestOrder.customer_id, planGuestCustomer.id); assert.equal(planGuestOrder.plan_fee, 35)
assert.deepEqual(JSON.parse(planGuestOrder.plan_snapshot), savedSnapshot)
assert.equal(planGuestOrder.total_amount, 51); assert.equal(billInputs.at(-1).billAmount, 5100)
customerSession = { customerId: 1, name: 'Private Fixture Name', email: 'customer@example.invalid', emailVerified: true }

const priorInvalidBills = bills
const priorInvalidOrders = sqlDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n
const priorInvalidCustomers = sqlDb.prepare('SELECT COUNT(*) AS n FROM customers').get().n
for (const plan_id of [{}, [], 42, true, 'bad id', 'FIXTURE-MONTHLY']) {
  await invoke(checkout, 'POST', { ...checkoutBody, plan_id }, '/api/orders/create', 400)
}
for (const plan_id of ['missing-plan', 'fixture-inactive', 'fixture-coming']) {
  await invoke(checkout, 'POST', { ...checkoutBody, plan_id }, '/api/orders/create', 409)
}
for (const plan_price_cents of [-1, 3500.5, '3500', {}, true, Number.MAX_SAFE_INTEGER + 1]) {
  await invoke(checkout, 'POST', { ...checkoutBody, plan_id: purchasedPlan.id, plan_price_cents }, '/api/orders/create', 400)
}
await invoke(checkout, 'POST', { ...checkoutBody, plan_id: purchasedPlan.id, plan_price_cents: 1 }, '/api/orders/create', 409)
const infinitePriceRequest = request('/api/orders/create', 'POST', checkoutBody)
const rawInfinitePriceRequest = new Request(infinitePriceRequest.url, {
  method: 'POST', headers: infinitePriceRequest.headers,
  body: `${JSON.stringify({ ...checkoutBody, plan_id: purchasedPlan.id }).slice(0, -1)},"plan_price_cents":1e309}`,
})
assert.equal((await checkout.POST(rawInfinitePriceRequest)).status, 400, 'nonfinite JSON numbers cannot confirm plan prices')
customerSession = null
await invoke(checkout, 'POST', { ...checkoutBody, email: 'not-created@fixture.invalid', plan_id: 'fixture-inactive' }, '/api/orders/create', 409)
customerSession = { customerId: 1, name: 'Private Fixture Name', email: 'customer@example.invalid', emailVerified: true }
assert.equal(bills, priorInvalidBills); assert.equal(sqlDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n, priorInvalidOrders)
assert.equal(sqlDb.prepare('SELECT COUNT(*) AS n FROM customers').get().n, priorInvalidCustomers, 'invalid choices never create guest accounts or payment bills')

// Discounts cannot consume the funds collected for the later App purchase.
const fullSimCampaign = await invoke(adminVouchers, 'POST', { action: 'save_campaign', name: 'SIM-only discount base', discount_type: 'fixed', discount_value: 100, min_spend: 0, validity_days: 30, is_active: true })
const fullSimVoucher = await invoke(adminVouchers, 'POST', { action: 'issue_to_email', campaign_id: fullSimCampaign.id, email: checkoutBody.email })
await invoke(checkout, 'POST', { ...checkoutBody, plan_id: purchasedPlan.id, voucher_code: fullSimVoucher.code })
const discountedPlanOrder = sqlDb.prepare('SELECT * FROM orders WHERE bill_code = ?').get(`offlinebill${bills}`)
assert.equal(discountedPlanOrder.voucher_discount, 15); assert.equal(discountedPlanOrder.plan_fee, 35)
assert.equal(discountedPlanOrder.total_amount, 36); assert.equal(billInputs.at(-1).billAmount, 3600, 'existing RM1 SIM payable floor is preserved in addition to the full plan fee')
const minimumCampaign = await invoke(adminVouchers, 'POST', { action: 'save_campaign', name: 'Plan does not meet SIM voucher minimum', discount_type: 'fixed', discount_value: 5, min_spend: 40, validity_days: 30, is_active: true })
const minimumVoucher = await invoke(adminVouchers, 'POST', { action: 'issue_to_email', campaign_id: minimumCampaign.id, email: checkoutBody.email })
const beforeMinimumBill = bills
await invoke(checkout, 'POST', { ...checkoutBody, plan_id: purchasedPlan.id, voucher_code: minimumVoucher.code }, '/api/orders/create', 400)
assert.equal(bills, beforeMinimumBill, 'plan money does not count toward a SIM voucher minimum spend')
assert.equal(sqlDb.prepare('SELECT status FROM customer_vouchers WHERE code = ?').get(minimumVoucher.code).status, 'active')

// Later price/name/quota changes must not rewrite existing orders or invoices.
const changedPlan = { ...purchasedPlan, name: 'Changed Monthly', price: 45, dataGB: 300, validityDays: 28 }
await shared['@/lib/plan-recommender'].savePlanCatalogue({ ...orderCatalogue, plans: [changedPlan, ...orderCatalogue.plans.slice(1)] })
assert.equal(sqlDb.prepare('SELECT plan_snapshot FROM orders WHERE id = ?').get(savedPlanOrder.id).plan_snapshot, savedSnapshotText)
assert.equal(orderPlan.getOrderPlanSnapshot(savedSnapshotText).plan.price, 35)
const beforeChangedBill = bills
await invoke(checkout, 'POST', { ...checkoutBody, plan_id: purchasedPlan.id, plan_price_cents: 3500 }, '/api/orders/create', 409)
assert.equal(bills, beforeChangedBill)
await invoke(checkout, 'POST', { ...checkoutBody, plan_id: purchasedPlan.id })
const repricedOrder = sqlDb.prepare('SELECT * FROM orders WHERE bill_code = ?').get(`offlinebill${bills}`)
assert.equal(repricedOrder.plan_fee, 45); assert.equal(repricedOrder.total_amount, 61); assert.equal(billInputs.at(-1).billAmount, 6100)
assert.equal(JSON.parse(repricedOrder.plan_snapshot).plan.name, changedPlan.name)
await shared['@/lib/plan-recommender'].savePlanCatalogue({ version: 1, plans: [{ ...changedPlan, status: 'inactive' }] })
assert.equal(orderPlan.getOrderPlanSnapshot(savedSnapshotText).plan.name, purchasedPlan.name, 'a later disabled plan remains readable on an existing order')

const planAdminList = await invoke(adminOrders, 'GET', undefined, `/api/admin/orders?search=${savedPlanOrder.order_ref}`)
assert.equal(planAdminList.orders.length, 1)
assert.equal(planAdminList.orders[0].plan_snapshot, savedSnapshotText); assert.equal(Number(planAdminList.orders[0].plan_fee), 35)
assert.equal(Number(planAdminList.orders[0].total_amount), 51)
const planCustomerList = await invoke(load('app/api/orders/my/route.ts'), 'GET', undefined, '/api/orders/my?per_page=50')
const ownPlanOrder = planCustomerList.orders.find(order => order.id === savedPlanOrder.id)
assert.equal(ownPlanOrder.plan_snapshot, savedSnapshotText); assert.equal(Number(ownPlanOrder.plan_fee), 35)
assert.equal(Number(ownPlanOrder.sim_fee) + Number(ownPlanOrder.delivery_fee) + Number(ownPlanOrder.plan_fee) - Number(ownPlanOrder.voucher_discount), Number(ownPlanOrder.total_amount))
customerSession = { customerId: 2, name: 'Other Customer', email: 'other@example.invalid', emailVerified: true }
assert.ok(!(await invoke(load('app/api/orders/my/route.ts'), 'GET')).orders.some(order => order.id === savedPlanOrder.id), 'customers cannot read another customer plan purchase')
customerSession = null
await invoke(load('app/api/orders/my/route.ts'), 'GET', undefined, '/api/orders/my', 401)
customerSession = { customerId: 1, name: 'Private Fixture Name', email: 'customer@example.invalid', emailVerified: true }
const planCsv = await (await adminOrders.GET(request(`/api/admin/orders?format=csv&search=${savedPlanOrder.order_ref}`))).text()
assert.ok(planCsv.includes('"Purchased Plan"') && planCsv.includes('"Plan Fee"') && planCsv.includes('"Plan Activated By"'))
assert.ok(planCsv.includes(`"${purchasedPlan.name}","${purchasedPlan.id}",35.00,"200","100","separate","2","30","Awaiting activation"`))
assert.ok(!planCsv.includes(changedPlan.name), 'exports use the paid-for snapshot rather than today\'s catalogue')

const catalogueKey = shared['@/lib/plan-recommender-key'].PLAN_RECOMMENDER_SETTING_KEY
const storedCatalogue = sqlDb.prepare('SELECT setting_value FROM settings WHERE setting_key = ?').get(catalogueKey).setting_value
await db.execute('UPDATE settings SET setting_value = ? WHERE setting_key = ?', ['{}', catalogueKey])
const beforeCorruptCatalogueBill = bills
await invoke(checkout, 'POST', { ...checkoutBody, plan_id: purchasedPlan.id }, '/api/orders/create', 503)
assert.equal(bills, beforeCorruptCatalogueBill, 'corrupt live catalogues fail before payment creation')
await invoke(checkout, 'POST', checkoutBody)
const unaffectedSimOrder = sqlDb.prepare('SELECT * FROM orders WHERE bill_code = ?').get(`offlinebill${bills}`)
assert.equal(unaffectedSimOrder.plan_snapshot, null); assert.equal(unaffectedSimOrder.plan_fee, 0)
assert.equal(unaffectedSimOrder.total_amount, 16); assert.equal(billInputs.at(-1).billAmount, 1600, 'SIM-only purchases do not depend on the optional plan catalogue')
await db.execute('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [storedCatalogue, catalogueKey])

const fulfillPlan = load('app/api/admin/orders/fulfill-plan/route.ts')
const billsBeforeFulfillment = bills
authenticated = false
await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan', 401)
await invoke(adminOrders, 'GET', undefined, '/api/admin/orders?format=csv', 401)
authenticated = true
adminAuthorized = false
await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan', 401)
await invoke(adminOrders, 'GET', undefined, '/api/admin/orders', 401)
adminAuthorized = true
await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan', 401, 'https://untrusted.invalid')
for (const order_id of [0, -1, 1.5, {}, [], '1x', '01', Number.MAX_SAFE_INTEGER, '2147483648']) {
  await invoke(fulfillPlan, 'POST', { order_id }, '/api/admin/orders/fulfill-plan', 400)
}
await invoke(fulfillPlan, 'POST', { order_id: 999999 }, '/api/admin/orders/fulfill-plan', 404)
await invoke(fulfillPlan, 'POST', { order_id: simOnlyOrderId }, '/api/admin/orders/fulfill-plan', 409)
await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan', 409)
await db.execute("UPDATE orders SET payment_status = 'paid', order_status = 'cancelled' WHERE id = ?", [savedPlanOrder.id])
await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan', 409)
await db.execute("UPDATE orders SET payment_status = 'paid', order_status = 'processing' WHERE id = ?", [savedPlanOrder.id])
await db.execute('UPDATE orders SET plan_fee = ? WHERE id = ?', [34.99, savedPlanOrder.id])
await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan', 409)
await db.execute('UPDATE orders SET plan_fee = ?, plan_snapshot = ? WHERE id = ?', [35, '{}', savedPlanOrder.id])
await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan', 409)
await db.execute('UPDATE orders SET plan_snapshot = ? WHERE id = ?', [savedSnapshotText, savedPlanOrder.id])
assert.equal(sqlDb.prepare('SELECT plan_fulfilled_at FROM orders WHERE id = ?').get(savedPlanOrder.id).plan_fulfilled_at, null)
failPlanAudit = true
await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan', 500)
failPlanAudit = false
assert.equal(sqlDb.prepare('SELECT plan_fulfilled_at FROM orders WHERE id = ?').get(savedPlanOrder.id).plan_fulfilled_at, null, 'audit failure rolls back the fulfillment record')
assert.equal(sqlDb.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'fulfill_order_plan' AND target_id = ?").get(savedPlanOrder.id).n, 0)
const fulfillment = await invoke(fulfillPlan, 'POST', { order_id: savedPlanOrder.id }, '/api/admin/orders/fulfill-plan')
assert.equal(fulfillment.already_fulfilled, false); assert.equal(fulfillment.plan_fulfilled_by, 7)
assert.ok(fulfillment.plan_fulfilled_at)
const duplicateFulfillment = await invoke(fulfillPlan, 'POST', { order_id: String(savedPlanOrder.id) }, '/api/admin/orders/fulfill-plan')
assert.equal(duplicateFulfillment.already_fulfilled, true); assert.equal(duplicateFulfillment.plan_fulfilled_at, fulfillment.plan_fulfilled_at)
const fulfillmentAudit = sqlDb.prepare("SELECT * FROM admin_audit_log WHERE action = 'fulfill_order_plan' AND target_id = ?").all(savedPlanOrder.id)
assert.equal(fulfillmentAudit.length, 1); assert.equal(fulfillmentAudit[0].admin_id, 7)
assert.equal(JSON.parse(fulfillmentAudit[0].new_value).plan_id, purchasedPlan.id)
assert.equal(JSON.parse(fulfillmentAudit[0].new_value).plan_fee, 35)
const fulfilledCustomerOrder = (await invoke(load('app/api/orders/my/route.ts'), 'GET', undefined, '/api/orders/my?per_page=50')).orders.find(order => order.id === savedPlanOrder.id)
assert.equal(fulfilledCustomerOrder.plan_fulfilled_at, fulfillment.plan_fulfilled_at)
const fulfilledAdminOrder = (await invoke(adminOrders, 'GET', undefined, `/api/admin/orders?search=${savedPlanOrder.order_ref}`)).orders[0]
assert.equal(fulfilledAdminOrder.plan_fulfilled_by, 7)
const fulfilledCsv = await (await adminOrders.GET(request(`/api/admin/orders?format=csv&search=${savedPlanOrder.order_ref}`))).text()
assert.ok(fulfilledCsv.includes('"Activated"'))
assert.equal(sqlDb.prepare('SELECT plan_snapshot FROM orders WHERE id = ?').get(savedPlanOrder.id).plan_snapshot, savedSnapshotText)
assert.equal(bills, billsBeforeFulfillment, 'recording manual fulfillment never creates another payment bill')

const payment = load('lib/payment-status.ts')
assert.equal(await payment.transitionOrderToPaid('fixturebill3', 'offline-txn'), 'pending')
assert.equal(await payment.transitionOrderToPaid('fixturebill3', 'offline-txn'), 'none')
sqlDb.exec("UPDATE orders SET payment_status = 'failed', order_status = 'cancelled' WHERE id = 3")
assert.equal(await payment.transitionOrderToPaid('fixturebill3', 'retry-txn'), 'failed')
assert.equal(await payment.transitionOrderToPaid('fixturebill3', 'retry-txn'), 'none')

// Eligible orders must remain discoverable behind more than a page of newer
// undelivered orders, and already reviewed orders must not be offered again.
customerSession = { customerId: 1, name: 'Private Fixture Name', email: 'customer@example.invalid', emailVerified: true }
for (let id = 100; id < 125; id++) await insertOrder(id, 1, 'pending', 'pending', 12, 16)
const eligible = await invoke(load('app/api/orders/my/route.ts'), 'GET', undefined, '/api/orders/my?reviewable=1&per_page=20')
assert.deepEqual(eligible.orders.map(order => order.id), [5])
for (let id = 400; id < 425; id++) await insertOrder(id, 1, 'delivered', 'paid', 12, 16)
const eligibleFirst = await invoke(load('app/api/orders/my/route.ts'), 'GET', undefined, '/api/orders/my?reviewable=1&per_page=20&page=1')
const eligibleNext = await invoke(load('app/api/orders/my/route.ts'), 'GET', undefined, '/api/orders/my?reviewable=1&per_page=20&page=2')
assert.equal(eligibleFirst.meta.total_pages, 2)
assert.equal(new Set([...eligibleFirst.orders, ...eligibleNext.orders].map(order => order.id)).size, 26)
assert.ok(eligibleNext.orders.some(order => order.id === 5))

// Review deletion cleans only safe local uploads after the DB transaction.
const uploads = path.join(reviewStorageRoot, 'public', 'uploads')
const legacyReviewDir = path.join(uploads, 'reviews', '123')
fs.mkdirSync(legacyReviewDir, { recursive: true })
fs.writeFileSync(path.join(legacyReviewDir, 'first.jpg'), 'local fixture')
fs.mkdirSync(uploads, { recursive: true })
fs.writeFileSync(path.join(uploads, 'node-upload.png'), 'local fixture')
fs.mkdirSync(path.join(reviewPersistentRoot, 'reviews', '123'), { recursive: true })
fs.writeFileSync(path.join(reviewPersistentRoot, 'reviews', '123', 'first.jpg'), 'persistent fixture')
fs.writeFileSync(path.join(reviewPersistentRoot, 'node-upload.png'), 'persistent fixture')
fs.writeFileSync(path.join(reviewStorageRoot, 'public', 'outside.jpg'), 'must survive')
await db.execute('INSERT INTO review_photos (review_id, file_path) VALUES (1, ?), (1, ?), (1, ?), (1, ?), (1, ?)', [
  '/uploads/reviews/123/first.jpg', '/uploads/node-upload.png', 'uploads/../outside.jpg',
  'https://fixture.invalid/photo.jpg', '/absolute/outside.jpg',
])
const deleteReview = await invoke(adminReviews, 'POST', { reviewId: 1, action: 'delete' })
assert.equal(deleteReview.cleanupWarning, false)
assert.equal(sqlDb.prepare('SELECT COUNT(*) AS n FROM reviews WHERE id = 1').get().n, 0)
assert.equal(sqlDb.prepare('SELECT COUNT(*) AS n FROM review_photos WHERE review_id = 1').get().n, 0)
assert.equal(fs.existsSync(path.join(legacyReviewDir, 'first.jpg')), false)
assert.equal(fs.existsSync(path.join(uploads, 'node-upload.png')), false)
assert.equal(fs.existsSync(path.join(reviewPersistentRoot, 'reviews', '123', 'first.jpg')), false)
assert.equal(fs.existsSync(path.join(reviewPersistentRoot, 'node-upload.png')), false)
assert.equal(fs.existsSync(path.join(reviewStorageRoot, 'public', 'outside.jpg')), true)
await invoke(adminReviews, 'POST', { reviewId: 1, action: 'delete' }, '/api/test', 404)

const unusedCourier = (await invoke(courier, 'POST', { name: 'Disposable', wm_fee: 0, em_fee: 0, labuan_fee: 0 })).courierId
await invoke(courier, 'DELETE', undefined, `/api/test?id=${unusedCourier}`)
await invoke(product, 'DELETE', undefined, `/api/test?id=${productId}`)
await invoke(zone, 'DELETE', undefined, `/api/test?id=${zoneId}`)
authenticated = false; await invoke(product, 'GET', undefined, '/api/test', 401)
assert.ok(fixtureErrors.every(error => /fixture photo write failed|fixture plan audit write failed|fixture order write failed|fixture gateway failed|Invalid plan catalogue/.test(error)), fixtureErrors.join('\n'))
sqlDb.close()
console.log('PASS: offline PHP-shaped SQL execution, legacy customer login/profile, catalogue CRUD and partial updates, zone lookup/validation/overlap, settings/vouchers, filtered orders and full CSV, report aggregates/authorized full CSV, review moderation/privacy and attachment cleanup, security projection, sign-out revocation, SIM-only/optional-plan checkout with gateway amount verification, immutable live-catalogue plan snapshots and customer/admin/CSV projections, plan pricing guards and voucher base, authorized atomic/idempotent manual fulfillment, guest checkout, payment retry and duplicate transitions. CAPTCHA, gateway and delivery services mocked; MariaDB/live writes NOT RUN.')

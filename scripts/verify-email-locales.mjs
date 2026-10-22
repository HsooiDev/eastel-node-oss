// Source mail helpers/templates with real in-memory Nodemailer MIME transport.
// No SMTP, database, account, payment or provider operations.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import ts from 'typescript'
import nodemailer from 'nodemailer'

const require = createRequire(import.meta.url)
const baseline = process.argv.includes('--baseline')
const oldFiles = new Set(['lib/email.ts', 'lib/email-templates.ts'])
function load(file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const source = baseline && oldFiles.has(file)
    ? execFileSync('git', ['show', '35d06d65f7199777c85b2b5eab3a4a858ed5088a:' + file], { encoding: 'utf8' })
    : fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(output, { module, exports: module.exports, require(id) {
    if (Object.hasOwn(deps, id)) return deps[id]
    if (id.startsWith('@/') || id.startsWith('.')) throw new Error('Unmocked dependency: ' + id)
    return require(id)
  }, URL, Date, Buffer, console: { error() {} }, ...globals }, { filename: file })
  return module.exports
}
const security = load('lib/security.ts')
const token = 'b'.repeat(64), recipient = 'fixture@example.invalid'
const copy = {
  en: { button: 'Verify Email', footer: '*This e-mail was sent from a notification-only address that cannot accept incoming e-mails. Please do not reply to this message.', verify: 'Your Eastel Verification Code', reset: 'Reset Your Eastel Password', shipping: 'Your Order Has Shipped', order: 'Order Confirmed', abandoned: 'Complete Your Order' },
  ms: { button: 'Sahkan E-mel', footer: '*E-mel ini dihantar daripada alamat pemberitahuan sahaja yang tidak dapat menerima e-mel masuk. Sila jangan balas mesej ini.', verify: 'Kod Pengesahan Eastel Anda', reset: 'Set Semula Kata Laluan Eastel', shipping: 'Penghantaran Disahkan', order: 'Pesanan Disahkan', abandoned: 'Pesanan Belum Selesai' },
  zh: { button: '验证邮箱', footer: '*此电子邮件是从仅用于通知的地址发送的，无法接收来信。请勿回复此邮件。', verify: '您的 Eastel 验证码', reset: '重置您的 Eastel 密码', shipping: '已发货', order: '订单已确认', abandoned: '订单尚未完成付款' },
}
function fixture({ origin = 'https://staging.example.test', from = 'noreply@example.invalid', fail = false } = {}) {
  const sent = [], mime = []
  const local = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  const templates = load('lib/email-templates.ts', { '@/lib/security': security, '@/lib/site': { SITE_URL: origin } })
  const email = load('lib/email.ts', {
    '@/lib/security': security, '@/lib/site': { SITE_URL: origin }, './email-templates': templates,
    '@/lib/order-plan': { getOrderPlanSnapshot() { throw new Error('Unexpected order snapshot work') } },
    '@/lib/db': { __esModule: true, default: { query() { throw new Error('Unexpected DB read') }, execute() { throw new Error('Unexpected DB write') } } },
    nodemailer: { __esModule: true, default: { createTransport(options) {
      assert.equal(options.host, 'smtp.example.invalid')
      return { async sendMail(message) {
        if (fail) throw new Error('Synthetic transport failure')
        const result = await local.sendMail(message)
        assert.ok(Buffer.isBuffer(result.message)); assert.match(result.message.toString(), /MIME-Version: 1\.0/)
        assert.match(result.message.toString(), /multipart\/alternative/)
        sent.push(message); mime.push(result.message); return result
      } }
    } } },
  }, { process: { env: { SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_USER: from, SMTP_PASS: 'synthetic-only', SMTP_FROM: from } } })
  return { email, templates, sent, mime, origin,
    async send(kind, locale) {
      const order = { orderRef: 'SYNTHETIC-001', customerName: 'Synthetic Customer', trackingNumber: 'SYNTHETIC-TRACK', courierName: 'Synthetic Courier', totalAmount: 12.34, payUrl: origin + '/order', productName: 'SIM', quantity: 1, unitPrice: 10, deliveryFee: 2.34, shippingAddress: 'Synthetic address' }
      if (kind === 'verify') return email.sendVerificationCode(recipient, '001234', locale, token)
      if (kind === 'reset') return email.sendPasswordReset(recipient, token, locale)
      if (kind === 'shipping') return email.sendShippingNotification(recipient, order, locale)
      if (kind === 'order') return email.sendOrderConfirmation(recipient, order, locale)
      return email.sendAbandonedReminder(recipient, order, locale)
    },
  }
}
const occurrences = (text, value) => text.split(value).length - 1
const hasHref = (html, url) => html.includes('href="' + url + '"') || html.includes('href="' + security.escapeHtml(url) + '"')
function localized(message, kind, locale) {
  assert.ok(message.subject.startsWith(copy[locale][kind]))
  assert.equal(message.to, recipient)
  assert.ok(message.html.includes(copy[locale].footer))
  assert.ok(message.text.includes(copy[locale].footer))
  assert.equal(occurrences(message.html, copy[locale].footer), 1)
  for (const other of Object.keys(copy).filter(value => value !== locale)) assert.ok(!message.html.includes(copy[other].footer))
}
test('verification mail keeps localized button/code/proof link for both configured origins', async () => {
  for (const origin of ['https://staging.example.test', 'https://eastel.site']) for (const locale of Object.keys(copy)) {
    const f = fixture({ origin }); assert.equal(await f.send('verify', locale), true)
    const message = f.sent[0]; localized(message, 'verify', locale)
    assert.ok(message.html.includes('>' + copy[locale].button + '</a>'))
    assert.ok(message.html.includes(security.escapeHtml(origin + '/' + locale + '/account/verify-email?token=' + token)))
    assert.ok(message.html.includes('001234')); assert.equal(f.mime.length, 1)
  }
})
for (const kind of ['reset', 'abandoned', 'shipping', 'order']) test(kind + ' passes the locale through to HTML/plain-text notice without duplication', async () => {
  for (const origin of ['https://staging.example.test', 'https://eastel.site']) for (const locale of Object.keys(copy)) {
    const f = fixture({ origin }); assert.equal(await f.send(kind, locale), true)
    const message = f.sent[0]; localized(message, kind, locale)
    if (kind === 'reset') assert.ok(message.html.includes(security.escapeHtml(origin + '/' + locale + '/account/reset?token=' + token)))
    if (kind === 'shipping' || kind === 'order') {
      assert.ok(hasHref(message.html, origin + '/' + locale + '/account/orders'))
      if (locale !== 'en') assert.ok(!hasHref(message.html, origin + '/en/account/orders'))
    }
  }
})
test('noreply sender recognition is case insensitive, support sender keeps its existing content', async () => {
  for (const from of ['noreply@example.invalid', 'NOREPLY@example.invalid', 'NoReply@example.invalid', 'support@example.invalid']) {
    const f = fixture({ from }); assert.equal(await f.email.sendEmail(recipient, 'Local fixture', '<body><p>Local fixture</p></body>', 'zh'), true)
    assert.equal(f.sent[0].html.includes(copy.zh.footer), !from.startsWith('support'))
    if (!from.startsWith('support')) assert.ok(f.sent[0].html.indexOf(copy.zh.footer) < f.sent[0].html.indexOf('</body>'))
  }
})
test('code-only OTP verification stays usable without a fabricated proof link', async () => {
  const f = fixture(); assert.equal(await f.email.sendVerificationCode(recipient, '001234', 'ms'), true)
  localized(f.sent[0], 'verify', 'ms'); assert.ok(f.sent[0].html.includes('001234')); assert.ok(!f.sent[0].html.includes('/account/verify-email?token='))
})
test('unsupported/inherited locale keys safely fall back to English copy and routes', async () => {
  for (const locale of ['de', '../../unexpected', '__proto__', 'constructor']) for (const kind of ['verify', 'reset', 'shipping', 'order', 'abandoned']) {
    const f = fixture(); assert.equal(await f.send(kind, locale), true); const message = f.sent[0]
    localized(message, kind, 'en'); assert.ok(!message.html.includes('undefined'))
    if (kind === 'verify') assert.ok(message.html.includes(security.escapeHtml(f.origin + '/en/account/verify-email?token=' + token)))
    if (kind === 'reset') assert.ok(message.html.includes(security.escapeHtml(f.origin + '/en/account/reset?token=' + token)))
    if (kind === 'shipping' || kind === 'order') assert.ok(hasHref(message.html, f.origin + '/en/account/orders'))
  }
})
test('an existing localized notice is not appended a second time', async () => {
  for (const locale of Object.keys(copy)) {
    const f = fixture(); const html = '<body><p>Local</p><div>' + copy[locale].footer + '</div></body>'
    assert.equal(await f.email.sendEmail(recipient, 'Local fixture', html, locale), true)
    assert.equal(f.sent[0].html, html)
  }
})
test('transport failure reports false without a fabricated successful message', async () => {
  for (const kind of ['verify', 'reset', 'shipping', 'order', 'abandoned']) {
    const f = fixture({ fail: true }); assert.equal(await f.send(kind, 'zh'), false); assert.equal(f.sent.length + f.mime.length, 0)
  }
})

// Exercise the built server without a database, gateway or delivery credentials.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const reservation = net.createServer()
await new Promise((resolve, reject) => {
  reservation.once('error', reject)
  reservation.listen(0, '127.0.0.1', resolve)
})
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['.next/standalone/server.js'], {
  cwd: root,
  env: {
    ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
    // Override any inherited configuration; these requests must not reach services.
    DB_HOST: '', DB_USER: '', DB_PASS: '', DB_NAME: '', JWT_SECRET: '',
    TURNSTILE_SECRET_KEY: '', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
    WHATSAPP_VERIFY_TOKEN: 'cutover-synthetic-token', WHATSAPP_APP_SECRET: 'cutover-synthetic-secret',
    WHATSAPP_ACCESS_TOKEN: 'cutover-synthetic-access', WHATSAPP_PHONE_NUMBER_ID: '000000000000', TELEGRAM_BOT_TOKEN: '',
    TOYYIBPAY_SECRET_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
  },
  stdio: 'ignore',
})
let exited = false
let startError
server.once('exit', () => { exited = true })
server.once('error', error => { startError = error })
const request = (path, options = {}) => fetch(base + path, {
  ...options, redirect: 'manual', signal: AbortSignal.timeout(5000),
})
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (startError) throw startError
    if (exited) throw new Error('Built server exited before routing verification')
    try {
      const response = await request('/api/health/live')
      if (response.status === 200) { ready = true; break }
    } catch { /* Server may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, 'Built server did not become live')

  const post = {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'billcode=invalid%21&status_id=1',
  }
  for (const path of ['/api/payment/callback', '/api/payment.php?action=callback', '/api/whatsapp-payment-callback.php']) {
    const response = await request(path, post)
    assert.equal(response.status, 400, `${path} must preserve the POST handler`)
    assert.equal(await response.text(), 'Invalid billcode')
  }
  // A valid-shaped body takes a different branch from a missing/lost body.
  // Blank gateway credentials throw before fetch, and unverifiable status exits
  // before order reads/writes or notification side effects.
  for (const path of ['/api/payment/callback', '/api/payment.php?action=callback', '/api/whatsapp-payment-callback.php']) {
    const response = await request(path, { ...post, body: 'billcode=fixtureA1&status_id=1' });
    assert.equal(response.status, 200, path + ' must preserve POST body');
    assert.equal(await response.text(), 'OK - Pending or Unverifiable');
  }
  for (const action of ['', '?action=create', '?action=callback-extra']) {
    assert.equal((await request('/api/payment.php' + action, post)).status, 404,
      'Only the exact legacy callback action may be rewritten')
  }

  for (const query of ['', '?billcode=fixtureA1&status_id=3']) {
    const current = await request('/api/payment/return' + query)
    const legacy = await request('/api/payment_return.php' + query)
    assert.equal(current.status, 302)
    assert.equal(legacy.status, current.status)
    assert.equal(legacy.headers.get('location'), current.headers.get('location'))
    const location = new URL(legacy.headers.get('location'))
    assert.equal(location.pathname, '/ms/account/orders')
    if (query) {
      // An untrusted failure hint cannot confirm failure without DB/provider proof.
      assert.equal(location.searchParams.get('payment'), null)
      assert.equal(location.searchParams.get('status'), 'processing')
      assert.equal(location.searchParams.get('bill'), 'fixtureA1')
      assert.equal(location.searchParams.get('hint'), null)
    } else {
      assert.equal(location.searchParams.get('payment'), 'error')
    }
  }
  // Provider verification must preserve query parameters without redirects.
  for (const route of ['/api/whatsapp/webhook', '/api/whatsapp.php']) {
    const verified = await request(route + '?hub.mode=subscribe&hub.verify_token=cutover-synthetic-token&hub.challenge=synthetic-challenge');
    assert.equal(verified.status, 200);
    assert.equal(await verified.text(), 'synthetic-challenge');
    assert.equal((await request(route + '?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=synthetic-challenge')).status, 403);
    const rejected = await request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' }, body: '{}' });
    assert.equal(rejected.status, 403);
    assert.equal(await rejected.text(), 'Invalid signature');
  }
  // Telegram only implements POST; GET is safe and cannot query DB or deliver.
  assert.equal((await request('/api/telegram/webhook')).status, 405);
  assert.equal((await request('/api/telegram.php')).status, 405);
  for (const path of ['/api/whatsapp-other.php', '/api/telegram-other.php', '/api/whatsapp-payment-callback-other.php']) {
    assert.equal((await request(path, post)).status, 404, 'Unknown legacy paths must remain 404');
  }
  const admin = await request('/hs/index.php')
  assert.equal(admin.status, 308)
  assert.equal(new URL(admin.headers.get('location'), base).pathname, '/hs/login')

  console.log('PASS: built-server legacy callback POST, exact action matching, return query/redirect admin login and existing provider webhook routing. No database, gateway or delivery used.')
} finally {
  if (!exited && server.pid) {
    const stopped = new Promise(resolve => server.once('exit', resolve))
    server.kill()
    await stopped
  }
}

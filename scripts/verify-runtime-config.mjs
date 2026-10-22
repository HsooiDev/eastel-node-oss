import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { CORE_RUNTIME_KEYS, RELEASE_RUNTIME_KEYS, validateRuntimeConfig } from '../lib/runtime-config.ts'
const valid = Object.fromEntries(RELEASE_RUNTIME_KEYS.map(key => [key, 'synthetic-fixture-only']))
Object.assign(valid, {
  DB_HOST: '127.0.0.1', JWT_SECRET: 'synthetic-fixture-secret-32-bytes-long',
  NEXT_PUBLIC_SITE_URL: 'https://eastel.site', NEXT_PUBLIC_BASE_URL: 'https://eastel.site',
  TOYYIBPAY_BASE_URL: 'https://toyyibpay.com', NEXT_PUBLIC_TOYYIBPAY_BASE_URL: 'https://toyyibpay.com', SMTP_PORT: '587',
  MARKETING_POSTER_DIR: path.join(os.tmpdir(), 'eastel-persistent-poster-fixture'),
  MARKETING_SHARE_DIR: path.join(os.tmpdir(), 'eastel-persistent-share-fixture'),
  REVIEW_UPLOAD_DIR: path.join(os.tmpdir(), 'eastel-persistent-review-fixture'),
  WHATSAPP_MEDIA_DIR: path.join(os.tmpdir(), 'eastel-persistent-wa-fixture'),
})
let passed = 0
function test(name, fn) { fn(); passed++; console.log('PASS:', name) }
test('valid core', () => assert.deepEqual(validateRuntimeConfig(valid), { missing: [], invalid: [] }))
test('valid production release', () => assert.deepEqual(validateRuntimeConfig(valid, 'release', 'https://eastel.site'), { missing: [], invalid: [] }))
for (const key of RELEASE_RUNTIME_KEYS) test('missing ' + key, () => {
  const env = { ...valid }; delete env[key]
  assert.ok(validateRuntimeConfig(env, 'release').missing.includes(key))
})
test('core readiness checks CAPTCHA fields', () => assert.ok(CORE_RUNTIME_KEYS.includes('TURNSTILE_SECRET_KEY')))
test('blank JWT', () => assert.ok(validateRuntimeConfig({ ...valid, JWT_SECRET: '  ' }).missing.includes('JWT_SECRET')))
test('weak JWT', () => assert.ok(validateRuntimeConfig({ ...valid, JWT_SECRET: 'short' }).invalid.includes('JWT_SECRET')))
test('placeholder', () => assert.ok(validateRuntimeConfig({ ...valid, DB_PASS: 'CHANGE_ME' }).invalid.includes('DB_PASS')))
for (const site of ['http://eastel.site', 'https://user:pass@eastel.site', 'https://eastel.site/path', 'https://eastel.site?query=1']) {
  test('invalid site URL', () => assert.ok(validateRuntimeConfig({ ...valid, NEXT_PUBLIC_SITE_URL: site }, 'release').invalid.includes('NEXT_PUBLIC_SITE_URL')))
}
test('wrong cutover domain', () => assert.ok(validateRuntimeConfig(valid, 'release', 'https://staging.example.test').invalid.includes('NEXT_PUBLIC_SITE_URL')))
test('different public payment host', () => assert.ok(validateRuntimeConfig({ ...valid, NEXT_PUBLIC_TOYYIBPAY_BASE_URL: 'https://dev.toyyibpay.com' }, 'release').invalid.includes('NEXT_PUBLIC_TOYYIBPAY_BASE_URL')))
test('sandbox payment at production cutover', () => assert.ok(validateRuntimeConfig({ ...valid, TOYYIBPAY_BASE_URL: 'https://dev.toyyibpay.com', NEXT_PUBLIC_TOYYIBPAY_BASE_URL: 'https://dev.toyyibpay.com' }, 'release', 'https://eastel.site').invalid.includes('TOYYIBPAY_BASE_URL')))
test('Hostinger uses local IPv4 DB host', () => assert.ok(validateRuntimeConfig({ ...valid, DB_HOST: 'localhost' }, 'release').invalid.includes('DB_HOST')))
test('invalid SMTP port', () => assert.ok(validateRuntimeConfig({ ...valid, SMTP_PORT: '0' }, 'release').invalid.includes('SMTP_PORT')))
test('diagnostics never contain credential values', () => {
  const env = { ...valid, JWT_SECRET: 'private-short-fixture' }
  const output = JSON.stringify(validateRuntimeConfig(env, 'release'))
  assert.ok(!output.includes(env.JWT_SECRET)); assert.ok(!output.includes(env.DB_PASS))
})
for (const [name, directory, expected] of [
  ['external persistent share path', path.join(os.tmpdir(), 'eastel-persistent-share-fixture'), 0],
  ['missing persistent share path', '', 1],
  ['relative share path', 'storage/marketing-shares', 1],
  ['in-release share path', path.join(process.cwd(), 'storage'), 1],
]) test('release CLI: ' + name, () => {
  const result = spawnSync(process.execPath, ['scripts/check-runtime-config.mjs'], {
    env: { ...process.env, ...valid, NODE_ENV: 'production', MARKETING_SHARE_DIR: directory }, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(result.status, expected)
})
for (const [name, directory, expected] of [
  ['external poster path', path.join(os.tmpdir(), 'eastel-persistent-poster-fixture'), 0],
  ['missing poster path', '', 1],
  ['relative poster path', 'storage/posters', 1],
  ['in-release poster path', path.join(process.cwd(), 'storage'), 1],
]) test('release CLI: ' + name, () => {
  const result = spawnSync(process.execPath, ['scripts/check-runtime-config.mjs'], {
    env: { ...process.env, ...valid, NODE_ENV: 'production', MARKETING_POSTER_DIR: directory }, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(result.status, expected)
})
for (const [name, directory, expected] of [
  ['external review path', path.join(os.tmpdir(), 'eastel-persistent-review-fixture'), 0],
  ['missing review path', '', 1],
  ['relative review path', 'public/uploads', 1],
  ['in-release review path', path.join(process.cwd(), 'public', 'uploads'), 1],
]) test('release CLI: ' + name, () => {
  const result = spawnSync(process.execPath, ['scripts/check-runtime-config.mjs'], {
    env: { ...process.env, ...valid, NODE_ENV: 'production', REVIEW_UPLOAD_DIR: directory }, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(result.status, expected)
})
for (const [name, directory, expected] of [
  ['external private WA path', path.join(os.tmpdir(), 'eastel-persistent-wa-fixture'), 0],
  ['missing WA path', '', 1],
  ['relative WA path', 'storage/whatsapp-media', 1],
  ['in-release WA path', path.join(process.cwd(), 'storage', 'wa'), 1],
  ['public WA path', path.join(os.tmpdir(), 'public_html', 'media', 'wa'), 1],
  ['shared public image path', valid.REVIEW_UPLOAD_DIR, 1],
]) test('release CLI: ' + name, () => {
  const result = spawnSync(process.execPath, ['scripts/check-runtime-config.mjs'], {
    env: { ...process.env, ...valid, NODE_ENV: 'production', WHATSAPP_MEDIA_DIR: directory }, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(result.status, expected)
})
console.log('Runtime configuration checks passed: ' + passed)

// Real handlers/storage/client with temporary files and mocked DB/Meta. No services.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), ts = require('typescript')
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'eastel-wa-media-'))
assert.equal(path.dirname(scratch), path.resolve(os.tmpdir()))
let cwd = path.join(scratch, 'release-a', '.next', 'standalone')
const env = { NODE_ENV: 'production', WHATSAPP_MEDIA_DIR: path.join(scratch, 'private-wa'),
  WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_ACCESS_TOKEN: 'synthetic-token', WHATSAPP_APP_SECRET: 'synthetic-secret' }
let admin = true, validSignature = true, failLog = false, failWrite = false, busyLock = false, missingMediaColumn = false
let network = [], logs = [], replies = 0, scenario = {}, locks = []
const fixture = Buffer.from('synthetic-wa-attachment')
const queues = new Map(), cache = new Map()
const db = {
  execute: async (sql, params) => {
    if (sql.includes('INSERT INTO whatsapp_logs')) {
      if (failLog) throw new Error('synthetic DB failure')
      if (missingMediaColumn && sql.includes('media_path')) throw new Error('synthetic missing media_path column')
      logs.push({ sql, params })
    }
    return [{ affectedRows: 1, insertId: 7 }]
  },
  query: async () => [[{ cfg_value: '["60000000000"]' }]], // Human takeover; no replies.
}
async function fakeFetch(input, options) {
  const url = new URL(String(input)); network.push({ url, options })
  assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal)
  assert.equal(options.headers.Authorization, 'Bearer synthetic-token')
  if (url.hostname === 'graph.facebook.com') {
    assert.equal(url.searchParams.get('phone_number_id'), '123456')
    if (scenario.lookupStatus) return new Response('failed', { status: scenario.lookupStatus })
    return Response.json({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/fixture',
      mime_type: scenario.mime || 'image/jpeg', file_size: fixture.length,
      sha256: createHash('sha256').update(fixture).digest('hex'), ...scenario.metadata })
  }
  assert.equal(url.hostname, 'lookaside.fbsbx.com')
  if (scenario.onDownload) await scenario.onDownload()
  if (scenario.throwDownload) throw new Error('synthetic network failure')
  return new Response(scenario.body || fixture, { status: scenario.downloadStatus || 200, headers: scenario.headers })
}
const fileSystem = { ...fs, open: async (...args) => {
  const handle = await fs.open(...args)
  if (failWrite && String(args[0]).endsWith('.tmp')) {
    const write = handle.writeFile.bind(handle)
    handle.writeFile = async () => { await write('partial'); throw new Error('synthetic disk failure') }
  }
  return handle
} }
const stubs = {
  '@/lib/db': { __esModule: true, default: db },
  '@/lib/database-lock': { withDatabaseLock: async (key, fn) => {
    if (busyLock) throw new Error('Operation is busy or its lock is unavailable.')
    locks.push(key)
    const work = (queues.get(key) || Promise.resolve()).then(() => fn({}))
    queues.set(key, work.catch(() => {})); return work
  } },
  '@/app/api/admin/_helpers': { requireAdmin: async () => admin ? { id: 7 } : null },
  '@/lib/whatsapp/ai': { processIncoming: async () => { replies++; return {} } },
}
async function load(file) {
  if (cache.has(file)) return cache.get(file)
  const source = await fs.readFile(new URL('../' + file, import.meta.url), 'utf8'), deps = {}
  for (const [, name] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (Object.hasOwn(stubs, name)) deps[name] = stubs[name]
    else if (name.startsWith('@/')) deps[name] = await load(name.slice(2) + '.ts')
  }
  const module = { exports: {} }, math = Object.create(Math); math.random = () => 0.5
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(output, { module, exports: module.exports, process: { env, cwd: () => cwd }, Buffer,
    Response, Request, Headers, URL, AbortSignal, ReadableStream, Intl, Math: math, fetch: fakeFetch,
    console: { error() {}, log() {} },
    require: name => name === 'node:fs/promises' ? fileSystem : name === 'next/server' ? { NextResponse: Response }
      : deps[name] || require(name),
  }, { filename: file })
  cache.set(file, module.exports); return module.exports
}
const client = await load('lib/whatsapp/client.ts')
const storage = await load('lib/whatsapp/media-storage.ts')
const paths = await load('lib/marketing-share-path.ts')
const mediaRoute = await load('app/api/media/route.ts')
// Keep real client download but mock unrelated signature/reply/provider boundaries.
stubs['@/lib/whatsapp/client'] = { ...client, verifyWebhook: () => validSignature,
  sendText: async () => { replies++; return 'synthetic-outgoing' }, markRead: async () => {} }
const webhook = await load('app/api/whatsapp/webhook/route.ts')
const phone = '60000000000'
const request = (stored, range) => {
  const req = new Request(`https://fixture.invalid/api/media?path=${encodeURIComponent(stored)}`, { headers: range ? { range } : {} })
  req.nextUrl = new URL(req.url); return req
}
const read = (stored, range) => mediaRoute.GET(request(stored, range))
const post = (id, type = 'image') => webhook.POST(new Request('https://fixture.invalid/api/whatsapp/webhook', {
  method: 'POST', headers: { 'x-hub-signature-256': 'synthetic' }, body: JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ id, from: phone, type, [type]: { id: '12345', caption: 'synthetic' } }], contacts: [],
  } }] }] }),
}))
async function sparse(file, size) { await fs.mkdir(path.dirname(file), { recursive: true }); const h = await fs.open(file, 'w'); await h.truncate(size); await h.close() }
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log('PASS:', name) }
try {
  await fs.mkdir(env.WHATSAPP_MEDIA_DIR)
  await test('production root excludes missing, relative, release, public/build and shared-image roots', () => {
    for (const value of ['', 'storage/wa', path.parse(cwd).root, cwd, path.join(scratch, 'public_html', 'wa'), path.join(scratch, 'hbuilds', 'wa')]) {
      assert.throws(() => paths.getWhatsAppMediaDirectory({ NODE_ENV: 'production', WHATSAPP_MEDIA_DIR: value }, cwd))
    }
    assert.throws(() => paths.getWhatsAppMediaDirectory({ NODE_ENV: 'production', WHATSAPP_MEDIA_DIR: scratch, REVIEW_UPLOAD_DIR: path.join(scratch, 'reviews') }, cwd))
  })
  await test('download uses scoped metadata lookup, bounded body, checksum, timeout and safe origin', async () => {
    const data = await client.downloadMedia('12345'); assert.deepEqual(data.data, fixture)
    assert.equal(network.length, 2); assert.equal(data.fileSize, fixture.length)
    assert.equal(client.getMediaType('audio/ogg; codecs=opus').extension, 'ogg')
    assert.equal(client.getMediaType('text/html'), null)
    assert.equal(client.getMediaType('constructor'), null)
    assert.equal(client.getMediaTypeFromFilename('legacy.toString').mime, 'application/octet-stream')
  })
  await test('invalid ids and metadata reject before credentialed download', async () => {
    let before = network.length; await assert.rejects(client.downloadMedia('../settings')); assert.equal(network.length, before)
    for (const metadata of [{ file_size: 101 * 1024 * 1024 }, { mime_type: 'text/html' }, { url: 'https://evil.invalid/file' }, { url: 'https://lookaside.fbsbx.com.evil.invalid/file' }, { url: 'http://lookaside.fbsbx.com/file' }, { url: 'https://u:p@lookaside.fbsbx.com/file' }]) {
      scenario = { metadata }; before = network.length; await assert.rejects(client.downloadMedia('12345')); assert.equal(network.length, before + 1)
    }
    scenario = {}
  })
  await test('download rejects oversized declared/streamed bodies, checksum and truncation', async () => {
    for (const state of [{ headers: { 'content-length': String(6 * 1024 * 1024) } }, { body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); controller.close() } }) }, { metadata: { sha256: '0'.repeat(64) } }, { body: Buffer.from('truncated') }, { lookupStatus: 500 }, { downloadStatus: 500 }]) {
      scenario = state; await assert.rejects(client.downloadMedia('12345'))
    }
    scenario = {}
  })
  let stored
  await test('write is private, complete and compatible with old media/wa relative URLs', async () => {
    stored = await storage.storeWhatsAppMedia(phone, 'wamid-fixture-one', '12345')
    assert.match(stored, /^media\/wa\/\d{4}-\d{2}\/60000000000\/[a-f0-9]{64}\.jpg$/)
    assert.deepEqual(await fs.readFile(path.join(env.WHATSAPP_MEDIA_DIR, storage.normalizeWhatsAppMediaPath(stored))), fixture)
    assert.equal((await fs.readdir(path.dirname(path.join(env.WHATSAPP_MEDIA_DIR, storage.normalizeWhatsAppMediaPath(stored))))).filter(name => name.endsWith('.tmp')).length, 0)
    await assert.rejects(fs.stat(path.join(cwd, 'public', 'media')), { code: 'ENOENT' })
  })
  await test('repeat and concurrent duplicate deliveries reuse bytes without another download', async () => {
    const before = network.length
    const values = await Promise.all([storage.storeWhatsAppMedia(phone, 'wamid-fixture-one', '12345'), storage.storeWhatsAppMedia(phone, 'wamid-fixture-one', '12345')])
    assert.deepEqual(values, [stored, stored]); assert.equal(network.length, before)
    const results = await Promise.all([storage.storeWhatsAppMedia(phone, 'wamid-new-race', '12345'), storage.storeWhatsAppMedia(phone, 'wamid-new-race', '12345')])
    assert.equal(results[0], results[1]); assert.equal(network.length, before + 2)
  })
  await test('release B reads release A bytes through the same authenticated URL', async () => {
    cwd = path.join(scratch, 'release-b', '.next', 'standalone')
    cache.delete('app/api/media/route.ts'); const fresh = await load('app/api/media/route.ts')
    const response = await fresh.GET(request(stored))
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture)
    assert.equal(response.headers.get('content-type'), 'image/jpeg'); assert.match(response.headers.get('cache-control'), /private, no-store/)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  })
  await test('PHP legacy nested paths and uppercase MIME work; persistent copy takes precedence', async () => {
    const legacy = 'media/wa/2026-01/60000000000/old-photo.JPG'
    const old = path.join(cwd, 'public', legacy); await fs.mkdir(path.dirname(old), { recursive: true }); await fs.writeFile(old, 'old-copy')
    assert.equal(await (await read(legacy)).text(), 'old-copy')
    const target = path.join(env.WHATSAPP_MEDIA_DIR, storage.normalizeWhatsAppMediaPath(legacy)); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, 'private-copy')
    const response = await read(legacy); assert.equal(await response.text(), 'private-copy'); assert.equal(response.headers.get('content-type'), 'image/jpeg')
  })
  await test('audio/video seeking supports bounded, open and suffix ranges; invalid ranges are 416', async () => {
    for (const [range, expected] of [['bytes=1-4', fixture.subarray(1, 5)], ['bytes=2-', fixture.subarray(2)], ['bytes=-3', fixture.subarray(-3)]]) {
      const response = await read(stored, range); assert.equal(response.status, 206); assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected)
    }
    for (const range of ['bytes=9999-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4']) {
      const response = await read(stored, range); assert.equal(response.status, 416); assert.equal(response.headers.get('content-range'), `bytes */${fixture.length}`)
    }
  })
  await test('anonymous/customer boundary, path traversal and absolute paths are rejected', async () => {
    admin = false; assert.equal((await read(stored)).status, 401); admin = true
    for (const value of ['../.env.local', 'media/wa/2026-01/60000000000/../secret.txt', 'media/wa/2026-01/60000000000/.probe.tmp', '/etc/passwd', 'https://fixture.invalid/file', 'media\\wa\\file.jpg']) assert.equal((await read(value)).status, 403)
    assert.equal((await read('media/wa/2026-01/60000000000/missing.jpg')).status, 404)
  })
  await test('documents download as attachments and legacy audio MIME is preserved', async () => {
    for (const [extension, mime] of [['txt', 'text/plain'], ['m4a', 'audio/mp4'], ['amr', 'audio/amr'], ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']]) {
      const relative = `2026-01/${phone}/legacy.${extension}`; await fs.writeFile(path.join(env.WHATSAPP_MEDIA_DIR, relative), fixture)
      const response = await read('media/wa/' + relative); assert.equal(response.headers.get('content-type'), mime)
      if (extension === 'txt' || extension === 'pptx') assert.match(response.headers.get('content-disposition'), /^attachment;/)
    }
  })
  await test('missing hosted config fails without a provider request', async () => {
    const root = env.WHATSAPP_MEDIA_DIR, before = network.length; delete env.WHATSAPP_MEDIA_DIR
    await assert.rejects(storage.storeWhatsAppMedia(phone, 'missing-config', '12345')); assert.equal(network.length, before)
    assert.equal((await read(stored)).status, 503); env.WHATSAPP_MEDIA_DIR = root
  })
  await test('root and child junctions are never read or written', async () => {
    const root = env.WHATSAPP_MEDIA_DIR, outside = path.join(scratch, 'outside'), linked = path.join(scratch, 'junction')
    await fs.mkdir(outside); await fs.symlink(outside, linked, 'junction'); env.WHATSAPP_MEDIA_DIR = linked
    await assert.rejects(storage.storeWhatsAppMedia(phone, 'linked-root', '12345')); assert.equal((await read(stored)).status, 503)
    env.WHATSAPP_MEDIA_DIR = root
    const child = path.join(root, '2025-01'); await fs.symlink(outside, child, 'junction')
    const before = network.length; await assert.rejects(storage.storeWhatsAppMedia(phone, 'linked-child', '12345')); assert.equal(network.length, before)
    assert.equal((await read('media/wa/2025-01/60000000000/file.jpg')).status, 503); await fs.unlink(child)
  })
  await test('total/phone quotas stop downloads without deleting old attachments', async () => {
    for (const [id, size] of [['60000000001', storage.MAX_WHATSAPP_STORAGE_BYTES], [phone, storage.MAX_WHATSAPP_PHONE_BYTES]]) {
      const marker = path.join(env.WHATSAPP_MEDIA_DIR, '2024-01', id, 'quota.bin'); await sparse(marker, size)
      const before = network.length; await assert.rejects(storage.storeWhatsAppMedia(phone, 'quota-' + id, '12345')); assert.equal(network.length, before)
      assert.equal((await fs.stat(marker)).size, size); await fs.unlink(marker)
    }
  })
  await test('quota is checked again after download to prevent concurrent over-admission', async () => {
    const marker = path.join(env.WHATSAPP_MEDIA_DIR, '2024-01', '60000000001', 'race-quota.bin')
    scenario = { onDownload: () => sparse(marker, storage.MAX_WHATSAPP_STORAGE_BYTES) }
    await assert.rejects(storage.storeWhatsAppMedia(phone, 'race-quota', '12345')); await fs.unlink(marker); scenario = {}
  })
  await test('failed partial write is never published and retry creates complete bytes', async () => {
    failWrite = true; await assert.rejects(storage.storeWhatsAppMedia(phone, 'disk-failure', '12345')); failWrite = false
    const value = await storage.storeWhatsAppMedia(phone, 'disk-failure', '12345')
    assert.deepEqual(Buffer.from(await (await read(value)).arrayBuffer()), fixture)
  })
  await test('webhook stores each supported attachment and logs its durable path during human takeover', async () => {
    for (const type of ['image', 'audio', 'voice', 'video', 'document', 'sticker']) {
      const response = await post('wamid-webhook-' + type, type); assert.equal(response.status, 200)
      const log = logs.at(-1); assert.match(log.sql, /media_path/); assert.match(log.params[6], /^media\/wa\//)
    }
    assert.equal(replies, 0)
  })
  await test('invalid webhook signature blocks every DB/provider operation', async () => {
    const before = [logs.length, network.length]; validSignature = false
    assert.equal((await post('wamid-invalid')).status, 403); validSignature = true
    assert.deepEqual([logs.length, network.length], before)
  })
  await test('download/lock failure returns retryable 503 without logging a fake path or replying', async () => {
    const before = logs.length; scenario = { throwDownload: true }
    assert.equal((await post('wamid-download-failure')).status, 503); scenario = {}
    busyLock = true; assert.equal((await post('wamid-busy')).status, 503); busyLock = false
    assert.equal(logs.length, before); assert.equal(replies, 0)
  })
  await test('DB failure after file save is retryable and retry reuses the file without download', async () => {
    failLog = true; assert.equal((await post('wamid-log-failure')).status, 503); failLog = false
    const before = network.length; assert.equal((await post('wamid-log-failure')).status, 200); assert.equal(network.length, before)
  })
  await test('an old/new incomplete schema does not break non-media text logs', async () => {
    missingMediaColumn = true
    const response = await post('wamid-text-no-media-column', 'text')
    assert.equal(response.status, 200); assert.ok(!logs.at(-1).sql.includes('media_path'))
    assert.equal((await post('wamid-attachment-no-media-column')).status, 503)
    missingMediaColumn = false
  })
  await test('ten concurrent messages with the actual DB lock never exhaust a ten-connection pool', async () => {
    const heldLocks = new Set(), waiters = []
    let borrowed = 0, queued = 0, completed = 0
    db.getConnection = async () => {
      if (borrowed >= 10) { queued++; await new Promise(resolve => waiters.push(resolve)) }
      borrowed++
      return {
        query: async (sql, [key]) => {
          if (sql.includes('GET_LOCK')) {
            const acquired = heldLocks.has(key) ? 0 : 1
            if (acquired) heldLocks.add(key)
            return [[{ acquired }]]
          }
          assert.match(sql, /RELEASE_LOCK/); heldLocks.delete(key); return [[{ released: 1 }]]
        },
        release: () => { borrowed--; waiters.shift()?.() },
        destroy: () => { borrowed--; waiters.shift()?.() },
      }
    }
    delete stubs['@/lib/database-lock']; cache.delete('lib/database-lock.ts'); cache.delete('lib/whatsapp/media-storage.ts')
    const actualLockStorage = await load('lib/whatsapp/media-storage.ts')
    await Promise.race([
      Promise.allSettled(Array.from({ length: 10 }, (_, index) => actualLockStorage.storeWhatsAppMedia(phone, `pool-fixture-${index}`, '12345'))).then(() => { completed = 10 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Media storage exhausted its DB pool')), 2000)),
    ])
    assert.equal(completed, 10); assert.equal(borrowed, 0); assert.equal(queued, 0); assert.equal(heldLocks.size, 0)
  })
  assert.ok(locks.includes('whatsapp-media-storage'))
  console.log(`WhatsApp media checks passed: ${passed}; synthetic FS/DB/Meta only; no Cron or real media`)
} finally { await fs.rm(scratch, { recursive: true, force: true }) }

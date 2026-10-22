// Actual storage/route modules with temporary files and a serialized mock DB lock. No services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'eastel-review-storage-'));
let cwd = path.join(scratch, 'release-a', '.next', 'standalone');
const env = { NODE_ENV: 'production', REVIEW_UPLOAD_DIR: path.join(scratch, 'persistent') };
let queue = Promise.resolve(), locks = 0;
const cache = new Map();
async function load(file) {
  if (cache.has(file)) return cache.get(file);
  const source = await fs.readFile(new URL('../' + file, import.meta.url), 'utf8');
  const deps = {};
  for (const [, name] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (name.startsWith('@/')) deps[name] = await load(name.slice(2) + '.ts');
    else if (name.startsWith('.')) deps[name] = await load(path.posix.join(path.posix.dirname(file), name) + '.ts');
  }
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, process: { env, cwd: () => cwd }, Buffer, console,
    require: name => name === '@/lib/database-lock' ? {
      withDatabaseLock: async (key, fn) => {
        assert.equal(key, 'review-upload-storage'); locks++;
        const work = queue.then(fn); queue = work.catch(() => {}); return work;
      },
    } : name === 'next/server' ? { NextResponse: Response } : deps[name] ?? require(name),
    Response, Request, Headers, File, FormData, setTimeout, clearTimeout,
  }, { filename: file });
  cache.set(file, module.exports); return module.exports;
}
// Avoid loading real DB lock dependencies at all.
cache.set('lib/database-lock.ts', {});
const storage = await load('lib/upload-storage.ts'), paths = await load('lib/review-upload-path.ts');
const resolver = await load('lib/marketing-share-path.ts');
const route = await load('app/api/review-images/[...segments]/route.ts');
const bytes = Buffer.from('review-fixture');
const read = segments => route.GET(null, { params: Promise.resolve({ segments }) });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS:', name); }
async function sparse(file, length) { await fs.mkdir(path.dirname(file), { recursive: true }); const handle = await fs.open(file, 'w'); await handle.truncate(length); await handle.close(); }
try {
  await test('hosted review root rejects missing/relative/root/release paths', () => {
    for (const value of ['', 'public/uploads', path.parse(cwd).root, cwd, path.join(scratch, 'release-a', 'uploads')]) {
      assert.throws(() => resolver.getReviewUploadDirectory({ NODE_ENV: 'production', REVIEW_UPLOAD_DIR: value }, cwd));
    }
    assert.equal(resolver.getReviewUploadDirectory({ NODE_ENV: 'development' }, cwd), path.join(cwd, 'public', 'uploads'));
  });
  let filename;
  await test('upload uses external storage and keeps existing owner filename/DB-lock contract', async () => {
    filename = await storage.storeReviewImage('c7', '.jpg', bytes);
    assert.match(filename, /^c7_\d+_[a-f0-9]{16}\.jpg$/);
    assert.deepEqual(await fs.readFile(path.join(env.REVIEW_UPLOAD_DIR, filename)), bytes);
    await assert.rejects(fs.stat(path.join(cwd, 'public', 'uploads')), { code: 'ENOENT' });
    assert.equal(locks, 1);
  });
  await test('newly loaded release B reads exact upload from release A through the unchanged URL path', async () => {
    cwd = path.join(scratch, 'release-b', '.next', 'standalone');
    cache.delete('app/api/review-images/[...segments]/route.ts');
    cache.delete('lib/review-upload-path.ts');
    const freshRoute = await load('app/api/review-images/[...segments]/route.ts');
    assert.notEqual(freshRoute, route);
    const response = await freshRoute.GET(null, { params: Promise.resolve({ segments: [filename] }) });
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
  await test('PHP nested paths work; persistent copy wins over current-release legacy copy', async () => {
    const relative = path.join('reviews', '123', 'first.JPG');
    for (const root of paths.getReviewUploadRoots()) { await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await fs.writeFile(path.join(root, relative), root === env.REVIEW_UPLOAD_DIR ? 'persistent' : 'legacy'); }
    const response = await read(['reviews', '123', 'first.JPG']);
    assert.equal(response.status, 200); assert.equal(await response.text(), 'persistent');
    assert.equal(paths.normalizeReviewPhotoPath('uploads/reviews/123/first.JPG').url, '/uploads/reviews/123/first.JPG');
  });
  await test('admin cleanup removes both copies, keeps roots and prevents fallback resurrection', async () => {
    assert.equal(await paths.removeReviewPhotoFiles(['uploads/reviews/123/first.JPG']), 0);
    assert.equal((await read(['reviews', '123', 'first.JPG'])).status, 404);
    for (const root of paths.getReviewUploadRoots()) assert.ok((await fs.stat(root)).isDirectory());
    assert.equal(await paths.removeReviewPhotoFiles(['uploads/reviews/123/first.JPG']), 0);
  });
  await test('reader rejects traversal, separators, non-raster and external URLs', async () => {
    for (const parts of [['..', 'outside.jpg'], ['reviews/123', 'first.jpg'], ['..\\outside.jpg'], ['secret.txt'], ['image.svg'], ['.hidden.png']]) assert.equal((await read(parts)).status, 404);
    assert.equal(await paths.readReviewPhoto('https://fixture.invalid/image.jpg'), null);
  });
  await test('missing production config rejects upload before any file is written', async () => {
    const previous = env.REVIEW_UPLOAD_DIR; delete env.REVIEW_UPLOAD_DIR;
    await assert.rejects(storage.storeReviewImage('c7', '.jpg', bytes));
    assert.equal((await read([filename])).status, 503); env.REVIEW_UPLOAD_DIR = previous;
  });
  await test('legacy bytes count toward the same total quota without deleting existing data', async () => {
    const file = path.join(cwd, 'public', 'uploads', 'legacy-cap.jpg'); await sparse(file, storage.MAX_UPLOAD_TOTAL_BYTES);
    await assert.rejects(storage.storeReviewImage('c8', '.png', bytes));
    assert.equal((await fs.stat(file)).size, storage.MAX_UPLOAD_TOTAL_BYTES); await fs.unlink(file);
  });
  await test('owner quota includes legacy nested files and concurrent admission stays serialized', async () => {
    const marker = path.join(cwd, 'public', 'uploads', 'reviews', 'c9_marker.jpg');
    await sparse(marker, storage.MAX_UPLOAD_ACCOUNT_BYTES - 1);
    const results = await Promise.allSettled([storage.storeReviewImage('c9', '.png', Buffer.from('x')), storage.storeReviewImage('c9', '.png', Buffer.from('y'))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    await fs.unlink(marker);
  });
  await test('linked upload root is rejected for upload/read and reports cleanup failure', async () => {
    const previous = env.REVIEW_UPLOAD_DIR, outside = path.join(scratch, 'outside'), linked = path.join(scratch, 'linked');
    await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'safe.jpg'), bytes); await fs.symlink(outside, linked, 'junction');
    env.REVIEW_UPLOAD_DIR = linked;
    await assert.rejects(storage.storeReviewImage('c1', '.jpg', bytes));
    assert.equal((await read(['safe.jpg'])).status, 503);
    assert.ok(await paths.removeReviewPhotoFiles(['uploads/safe.jpg']) > 0);
    assert.deepEqual(await fs.readFile(path.join(outside, 'safe.jpg')), bytes); env.REVIEW_UPLOAD_DIR = previous;
  });
  await test('development same-root compatibility is counted once', async () => {
    env.NODE_ENV = 'development'; delete env.REVIEW_UPLOAD_DIR;
    const marker = path.join(cwd, 'public', 'uploads', 'half-quota.jpg'); await sparse(marker, storage.MAX_UPLOAD_TOTAL_BYTES / 2 + 1);
    assert.equal(paths.getReviewUploadRoots().length, 1);
    assert.ok(await storage.storeReviewImage('c3', '.jpg', bytes)); await fs.unlink(marker);
  });
  console.log(`Review persistence checks passed: ${passed}`);
} finally { await fs.rm(scratch, { recursive: true, force: true }); }

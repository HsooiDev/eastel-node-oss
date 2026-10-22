// Real route handlers and local filesystem; no database, provider or server access.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'eastel-posters-'));
const posterDir = path.join(scratch, 'persistent', 'posters');
let cwd = path.join(scratch, 'release-a', '.next', 'standalone');
const env = { NODE_ENV: 'production', MARKETING_POSTER_DIR: posterDir, REVIEW_UPLOAD_DIR: path.join(scratch, 'persistent', 'reviews') };
let authenticated = false;
let aiCalls = 0;
const bytes = Buffer.from('synthetic-image-fixture');
class NextResponse extends Response {
  static json(body, init) { return Response.json(body, init); }
}
const helpers = {
  requireAdmin: async () => authenticated ? { id: 1 } : null,
  requireAdminCsrf: async () => authenticated ? { id: 1 } : null,
  success: data => Response.json({ status: 'success', ...data }),
  error: (message, status = 400) => Response.json({ status: 'error', message }, { status }),
};
async function load(file, injected = {}) {
  const source = await fs.readFile(new URL('../' + file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, Buffer, Response,
    process: { env, cwd: () => cwd }, console: { error() {} },
    require: name => Object.hasOwn(injected, name) ? injected[name] : require(name),
  }, { filename: file });
  return module.exports;
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS:', name); }
try {
  const paths = await load('lib/marketing-share-path.ts');
  const reviews = await load('lib/review-upload-path.ts', { '@/lib/marketing-share-path': paths });
  const assetAliases = await load('lib/legacy-assets.ts');
  const gallery = await load('lib/marketing-gallery.ts', { './marketing-share-path': paths, './review-upload-path': reviews, './legacy-assets': assetAliases });
  const deps = { '../_helpers': helpers, '../../_helpers': helpers,
    '@/lib/marketing-share-path': paths, '@/lib/marketing-gallery': gallery, 'next/server': { NextResponse } };
  const posters = await load('app/api/admin/posters/route.ts', deps);
  const reader = await load('app/api/admin/posters/[filename]/route.ts', deps);
  const galleryReader = await load('app/api/admin/marketing-images/[source]/[filename]/route.ts', {
    ...deps, '@/app/api/admin/_helpers': helpers,
  });
  const ai = await load('app/api/admin/marketing-ai/route.ts', {
    ...deps,
    '@/lib/ai/gemini': { generateImage: async () => { aiCalls++; return [bytes.toString('base64')]; } },
    '@/lib/db': { execute: async () => [] }, '@/lib/db-helpers': { formatDate: () => '2026-10-16 00:00:00' },
  });
  const upload = () => {
    const form = new FormData(); form.set('file', new File([bytes], 'fixture.png', { type: 'image/png' }));
    return new Request('http://localhost/api/admin/posters', { method: 'POST', body: form });
  };
  const generate = () => ai.POST(new Request('http://localhost/api/admin/marketing-ai', {
    method: 'POST', body: JSON.stringify({ type: 'image', prompt: 'synthetic' }),
  }));
  let uploaded;
  await test('unauthenticated poster routes do not create storage', async () => {
    assert.equal((await posters.GET()).status, 401);
    assert.equal((await posters.POST(upload())).status, 401);
    assert.equal((await reader.GET(null, { params: Promise.resolve({ filename: 'fixture.png' }) })).status, 401);
    assert.equal((await galleryReader.GET(null, { params: Promise.resolve({ source: 'site', filename: 'fixture.png' }) })).status, 401);
    assert.equal((await generate()).status, 401);
    assert.equal(aiCalls, 0);
    await assert.rejects(fs.stat(posterDir), { code: 'ENOENT' });
  });
  authenticated = true;
  await test('upload writes only to configured persistent poster storage', async () => {
    const response = await posters.POST(upload()); assert.equal(response.status, 200);
    uploaded = await response.json();
    assert.deepEqual(await fs.readFile(path.join(posterDir, uploaded.filename)), bytes);
    await assert.rejects(fs.stat(path.join(cwd, 'storage')), { code: 'ENOENT' });
  });
  cwd = path.join(scratch, 'release-b', '.next', 'standalone');
  await test('existing handlers list and read release A poster after cwd changes to release B', async () => {
    const listed = await (await posters.GET()).json();
    assert.ok(listed.images.some(image => image.filename === uploaded.filename && image.url === uploaded.url));
    const response = await reader.GET(null, { params: Promise.resolve({ filename: uploaded.filename }) });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  });
  await test('AI and uploads use the same persistent library', async () => {
    const response = await generate(); assert.equal(response.status, 200);
    const created = await response.json();
    assert.deepEqual(await fs.readFile(path.join(posterDir, created.filename)), bytes);
    assert.equal(aiCalls, 1);
  });
  const sources = {
    poster: posterDir, site: path.join(cwd, 'public', 'images'),
    review: path.join(cwd, 'public', 'uploads'),
    'legacy-review': path.join(cwd, 'public', 'uploads', 'reviews'),
  };
  async function fixture(source, filename, seconds) {
    await fs.mkdir(sources[source], { recursive: true });
    const file = path.join(sources[source], filename);
    await fs.writeFile(file, Buffer.from(source + ':' + filename));
    await fs.utimes(file, seconds, seconds);
  }
  const baseTime = Math.floor(Date.now() / 1000) + 60;
  await test('gallery merges posters/site/current reviews/PHP reviews and sorts newest first', async () => {
    let index = 0;
    for (const source of Object.keys(sources)) await fixture(source, 'same.png', baseTime + index++);
    const response = await posters.GET(); assert.equal(response.status, 200);
    const listed = (await response.json()).images;
    assert.equal(listed.filter(image => image.filename === 'same.png').length, 4);
    assert.deepEqual(listed.slice(0, 4).map(image => image.url), [
      '/api/admin/marketing-images/legacy-review/same.png', '/api/admin/marketing-images/review/same.png',
      '/api/admin/marketing-images/site/same.png', '/api/admin/posters/same.png',
    ]);
  });
  await test('gallery permits site SVG and rasters, excludes other extensions and nonfiles', async () => {
    await fixture('site', 'brand.svg', baseTime + 4);
    await fixture('review', 'not-review.svg', baseTime + 5);
    await fixture('site', 'clip.mp4', baseTime + 6);
    await fixture('site', '.hidden.png', baseTime + 7);
    await fs.mkdir(path.join(sources.site, 'directory.png'));
    const listed = (await (await posters.GET()).json()).images;
    assert.ok(listed.some(image => image.filename === 'brand.svg'));
    for (const name of ['not-review.svg', 'clip.mp4', '.hidden.png', 'directory.png']) {
      assert.ok(!listed.some(image => image.filename === name));
    }
  });
  await test('fixed-source reader loads runtime images, encodes special filenames and preserves exact bytes', async () => {
    await fixture('review', 'sale & 你好.png', baseTime + 8);
    const listed = (await (await posters.GET()).json()).images;
    const special = listed.find(image => image.filename === 'sale & 你好.png');
    assert.ok(special.url.endsWith(encodeURIComponent(special.filename)));
    for (const image of listed.filter(item => item.url.startsWith('/api/admin/marketing-images/'))) {
      const parts = new URL(image.url, 'http://localhost').pathname.split('/');
      const source = parts.at(-2), filename = decodeURIComponent(parts.at(-1));
      const response = await galleryReader.GET(null, { params: Promise.resolve({ source, filename }) });
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(path.join(sources[source], filename)));
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(response.headers.get('Content-Type'), filename.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    }
  });
  await test('gallery reader rejects unknown sources, traversal, unsupported extensions and directories', async () => {
    for (const [source, filename] of [
      ['../../', 'same.png'], ['poster', 'same.png'], ['site', '../same.png'], ['site', '..\\same.png'],
      ['site', '/same.png'], ['site', 'clip.mp4'], ['site', '.hidden.png'], ['site', 'directory.png'],
      ['review', 'not-review.svg'], ['site', 'missing.png'],
    ]) assert.equal((await galleryReader.GET(null, { params: Promise.resolve({ source, filename }) })).status, 404);
  });
  await test('site gallery resolves legacy AVIF/SVG names with the canonical MIME', async () => {
    const root = path.join(cwd, 'public', 'images'); await fs.mkdir(root, { recursive: true });
    for (const [filename, original, type] of [
      ['asp-licence.avif', 'ASP-Licence.jpg', 'image/avif'],
      ['eastel-logo-white.svg', 'Eastel-logo-white-100x100.png', 'image/svg+xml'],
      ['eastel-logo-dark.svg', 'eastel-logo-dark1.svg', 'image/svg+xml'],
    ]) {
      await fs.writeFile(path.join(root, filename), bytes);
      const response = await galleryReader.GET(null, { params: Promise.resolve({ source: 'site', filename: original }) });
      assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), type);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      await fs.unlink(path.join(root, filename));
    }
  });
  await test('review gallery uses persistent files across releases and deduplicates legacy copies', async () => {
    await fs.mkdir(env.REVIEW_UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(env.REVIEW_UPLOAD_DIR, 'same.png'), 'persistent-review');
    const listed = (await (await posters.GET()).json()).images;
    assert.equal(listed.filter(image => image.url === '/api/admin/marketing-images/review/same.png').length, 1);
    const original = cwd; cwd = path.join(scratch, 'release-gallery-c');
    const afterRelease = (await (await posters.GET()).json()).images;
    assert.ok(afterRelease.some(image => image.url === '/api/admin/marketing-images/review/same.png'));
    const response = await galleryReader.GET(null, { params: Promise.resolve({ source: 'review', filename: 'same.png' }) });
    assert.equal(response.status, 200); assert.equal(await response.text(), 'persistent-review');
    cwd = original;
  });
  await test('case-insensitive raster discovery retains the correct poster response MIME', async () => {
    for (const [filename, type] of [['UPPER.JPG', 'image/jpeg'], ['UPPER.WEBP', 'image/webp']]) {
      await fixture('poster', filename, baseTime + 9);
      const listed = (await (await posters.GET()).json()).images;
      assert.ok(listed.some(image => image.filename === filename));
      const response = await reader.GET(null, { params: Promise.resolve({ filename }) });
      assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), type);
    }
  });
  await test('gallery missing optional sources is read-only and preserves poster results', async () => {
    const original = cwd;
    cwd = path.join(scratch, 'release-no-assets');
    const listed = (await (await posters.GET()).json()).images;
    assert.ok(listed.some(image => image.url.startsWith('/api/admin/posters/')));
    assert.ok(listed.every(image => image.url.startsWith('/api/admin/posters/') || image.url.startsWith('/api/admin/marketing-images/review/')));
    await assert.rejects(fs.stat(cwd), { code: 'ENOENT' });
    cwd = original;
  });
  await test('gallery rejects a linked source directory instead of reading its target', async () => {
    const original = cwd;
    cwd = path.join(scratch, 'release-linked-assets');
    const outside = path.join(scratch, 'outside-gallery');
    await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'private.png'), bytes);
    await fs.mkdir(path.join(cwd, 'public'), { recursive: true });
    await fs.symlink(outside, path.join(cwd, 'public', 'images'), 'junction');
    const listed = (await (await posters.GET()).json()).images;
    assert.ok(!listed.some(image => image.filename === 'private.png'));
    assert.equal((await galleryReader.GET(null, { params: Promise.resolve({ source: 'site', filename: 'private.png' }) })).status, 404);
    cwd = original;
  });
  await test('gallery globally caps the newest images at fifty with deterministic equal-time ordering', async () => {
    for (let i = 0; i < 60; i++) await fixture(Object.keys(sources)[i % 4], `bulk-${i}.jpg`, baseTime + 100 + i);
    const first = (await (await posters.GET()).json()).images;
    assert.equal(first.length, 50);
    assert.equal(first[0].filename, 'bulk-59.jpg'); assert.equal(first.at(-1).filename, 'bulk-10.jpg');
    await fixture('site', 'tie-b.png', baseTime + 200);
    await fixture('review', 'tie-a.png', baseTime + 200);
    const second = (await (await posters.GET()).json()).images;
    const repeated = (await (await posters.GET()).json()).images;
    assert.deepEqual(second, repeated);
    assert.deepEqual(second.slice(0, 2).map(image => image.url), [...second.slice(0, 2).map(image => image.url)].sort((a, b) => a.localeCompare(b)));
  });
  await test('missing production storage fails before invoking image provider', async () => {
    delete env.MARKETING_POSTER_DIR;
    assert.notEqual((await generate()).status, 200);
    assert.equal(aiCalls, 1);
    assert.equal((await posters.GET()).status, 500);
    assert.equal((await posters.POST(upload())).status, 500);
  });
  await test('existing file instead of storage fails before invoking image provider', async () => {
    env.MARKETING_POSTER_DIR = path.join(scratch, 'not-a-directory');
    await fs.writeFile(env.MARKETING_POSTER_DIR, bytes);
    assert.notEqual((await generate()).status, 200);
    assert.equal(aiCalls, 1);
    assert.equal((await posters.POST(upload())).status, 500);
    assert.deepEqual(await fs.readFile(env.MARKETING_POSTER_DIR), bytes);
  });
  await test('poster resolver rejects relative/root/release/standalone-parent paths', () => {
    for (const configured of ['relative', path.parse(cwd).root, cwd, path.join(scratch, 'release-b', 'storage')]) {
      assert.throws(() => paths.getMarketingPosterDirectory({ NODE_ENV: 'production', MARKETING_POSTER_DIR: configured }, cwd));
    }
    assert.equal(paths.getMarketingPosterDirectory({ NODE_ENV: 'development' }, cwd), path.join(cwd, 'storage', 'posters'));
  });
  console.log(`Poster persistence checks passed: ${passed}`);
} finally { await fs.rm(scratch, { recursive: true, force: true }); }

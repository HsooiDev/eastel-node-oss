// Exercise a built application with every service credential explicitly empty.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, unlink, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const buildArg = process.argv.find(arg => arg.startsWith('--build-dir='));
const buildDir = path.resolve(fileURLToPath(root), buildArg?.slice('--build-dir='.length) || '.next');
const built = JSON.parse(readFileSync(path.join(buildDir, 'required-server-files.json'), 'utf8')).config.env;
const mode = built.SITE_ENV;
assert.ok(['staging', 'production'].includes(mode));
const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' };
for (const match of readFileSync(new URL('.env.example', root), 'utf8').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) env[match[1]] = '';
Object.assign(env, built, { NEXT_PUBLIC_BASE_URL: built.NEXT_PUBLIC_SITE_URL });
const reviewFixture = await mkdtemp(path.join(os.tmpdir(), 'eastel-built-review-'));
env.REVIEW_UPLOAD_DIR = reviewFixture;
const imageName = `c7_${randomUUID().replaceAll('-', '')}.png`;
const legacyImage = path.join(buildDir, 'standalone', 'public', 'uploads', imageName);
await mkdir(path.dirname(legacyImage), { recursive: true });
await writeFile(legacyImage, 'legacy-public-copy', { flag: 'wx' });
await writeFile(path.join(reviewFixture, imageName), 'persistent-copy');
const waRelative = `media/wa/2026-01/60000000000/${randomUUID()}.jpg`;
const waStaticCanary = path.join(buildDir, 'standalone', 'public', waRelative);
await mkdir(path.dirname(waStaticCanary), { recursive: true });
await writeFile(waStaticCanary, 'private-wa-static-canary', { flag: 'wx' });
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const server = spawn(process.execPath, [path.join(buildDir, 'standalone/server.js')], { cwd: root, env: { ...env, PORT: String(port), HOSTNAME: '127.0.0.1' }, stdio: 'ignore' });
let exited = false;
let startError;
server.once('exit', () => { exited = true; });
server.once('error', error => { startError = error; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (startError) throw startError;
    if (exited) throw new Error('SEO fixture server exited');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health/live`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { ready = true; break; }
    } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'SEO fixture server did not become live');
  const legacyAssets = JSON.parse(readFileSync(new URL('scripts/fixtures/legacy-assets.json', root), 'utf8')).assets;
  for (const asset of legacyAssets) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`http://127.0.0.1:${port}${asset.url}?legacy=1`, {
        method, redirect: 'manual', headers: { Host: new URL(built.NEXT_PUBLIC_SITE_URL).host },
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200, `${method} ${asset.url}`);
      assert.equal(response.headers.get('content-type')?.split(';')[0], asset.contentType, asset.url);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', asset.url);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (method === 'GET') {
        assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.url);
      } else assert.equal(bytes.length, 0, `HEAD body: ${asset.url}`);
    }
  }
  console.log(`PASS: ${legacyAssets.length * 2} built legacy asset GET/HEAD contracts, exact bytes/MIME with query strings and no redirects`);
  const getReview = filename => fetch(`http://127.0.0.1:${port}/uploads/${filename}`, {
    headers: { Host: new URL(built.NEXT_PUBLIC_SITE_URL).host }, signal: AbortSignal.timeout(5000),
  });
  const image = await getReview(imageName);
  assert.equal(image.status, 200); assert.equal(await image.text(), 'persistent-copy', 'rewrite must precede a same-named public file');
  assert.equal(image.headers.get('content-type'), 'image/png'); assert.match(image.headers.get('cache-control'), /no-store/i);
  const runtimeName = `c8_${randomUUID().replaceAll('-', '')}.jpg`;
  await writeFile(path.join(reviewFixture, runtimeName), 'runtime-copy');
  assert.equal(await (await getReview(runtimeName)).text(), 'runtime-copy');
  await unlink(path.join(reviewFixture, imageName)); await unlink(legacyImage);
  assert.equal((await getReview(imageName)).status, 404);
  assert.equal((await getReview('unsupported.svg')).status, 404);
  console.log('PASS: built /uploads rewrite prefers persistent storage, serves runtime uploads and rejects deleted/unsupported files');
  for (const route of [`/api/media?path=${encodeURIComponent(waRelative)}`, `/api/media.php?path=${encodeURIComponent(waRelative)}`, `/${waRelative}`]) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method, headers: { Host: new URL(built.NEXT_PUBLIC_SITE_URL).host }, signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 401, `Private WA route must reject anonymous requests before static files: ${route}`);
      assert.ok(!(await response.text()).includes('private-wa-static-canary'));
      assert.match(response.headers.get('cache-control'), /no-store/i);
    }
  }
  console.log('PASS: built WA API/PHP alias/direct public paths reject anonymous GET/HEAD even with a same-named public file');
  for (const route of ['/api/admin/posters', '/api/admin/posters/fixture.png', '/api/admin/marketing-images/site/fixture.png']) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      headers: { Host: new URL(built.NEXT_PUBLIC_SITE_URL).host }, signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 401, `Anonymous gallery request must fail before reading files: ${route}`);
    assert.match(response.headers.get('cache-control') || '', /no-store/i);
  }
  console.log('PASS: 3 built admin gallery routes reject anonymous GET without service credentials');
  const checker = spawn(process.execPath, ['scripts/verify-seo-html.mjs', `--base-url=http://127.0.0.1:${port}`, `--mode=${mode}`, `--host=${new URL(built.NEXT_PUBLIC_SITE_URL).host}`], { cwd: root, env, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { checker.once('exit', resolve); checker.once('error', reject); });
  assert.equal(code, 0, 'Built SEO HTTP regression failed');
} finally {
  if (!exited) {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await stopped;
  }
  await rm(reviewFixture, { recursive: true, force: true });
  await rm(legacyImage, { force: true });
  await rm(waStaticCanary, { force: true });
}

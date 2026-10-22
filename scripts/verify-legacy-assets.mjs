// Fixed public PHP URL contracts; no service credentials or PHP checkout required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('scripts/fixtures/legacy-assets.json', root), 'utf8'));
const output = ts.transpileModule(readFileSync(new URL('lib/legacy-assets.ts', root), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports });
const { getLegacyAssetRewrites, resolveLegacyAssetFilename } = module.exports;
const aliases = getLegacyAssetRewrites();
assert.equal(aliases.length, 3);
assert.equal(new Set(aliases.map(alias => alias.source.toLowerCase())).size, aliases.length);
for (const asset of fixture.assets) {
  const bytes = readFileSync(new URL(asset.file, root));
  assert.equal(bytes.length, asset.bytes, asset.url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.url);
  assert.equal(resolveLegacyAssetFilename(asset.url.slice('/images/'.length)), asset.file.slice('public/images/'.length), asset.url);
  if (!asset.repair) assert.equal(asset.sha256, asset.phpSha256, asset.url);
  else assert.equal(asset.contentType, 'image/svg+xml');
  if (asset.contentType === 'image/avif') assert.equal(bytes.subarray(4, 12).toString(), 'ftypavif');
  if (asset.contentType === 'image/png') assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  if (asset.contentType === 'image/jpeg') assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff');
  if (asset.contentType === 'image/svg+xml') assert.match(bytes.toString('utf8'), /<svg\b/);
}
for (const alias of aliases) {
  assert.match(alias.source, /^\/images\/[A-Za-z0-9_.-]+$/);
  assert.match(alias.destination, /^\/images\/[a-z0-9_.-]+$/);
  assert.ok(!aliases.some(other => other.source.toLowerCase() === alias.destination.toLowerCase()), 'No rewrite chain/loop');
}
for (const value of ['unknown.jpg', '../ASP-Licence.jpg', 'ASP-Licence.jpg.exe', 'https://example.test/a.jpg']) {
  assert.equal(resolveLegacyAssetFilename(value), value, 'Unknown inputs must not be broadened into aliases');
}
// The optional staging template otherwise serves /images from disk before Next.
const nginx = readFileSync(new URL('nginx.conf', root), 'utf8');
const proxy = nginx.match(/location ~\* (\^\/images\/\S+)\s*\{([^}]+)\}/);
assert.ok(proxy, 'Legacy aliases must reach Next in the staging template');
assert.match(proxy[2], /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
const matcher = new RegExp(proxy[1], 'i');
for (const alias of aliases) assert.ok(matcher.test(alias.source), alias.source);
assert.ok(matcher.test('/images/asp-licence.jpg'));
for (const url of ['/images/unknown.png', '/images/ASP-Licence.jpg.exe', '/images/nested/ASP-Licence.jpg']) assert.ok(!matcher.test(url));
console.log(`PASS: ${fixture.assets.length} PHP image/video URL contracts, exact bytes or explicit corrupt-SVG repairs, MIME signatures and bounded aliases.`);

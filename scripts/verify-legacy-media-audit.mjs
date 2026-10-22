import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rmdir, symlink, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditLegacyMedia } from './audit-legacy-media.mjs';

const scratch = await mkdtemp(path.join(tmpdir(), 'eastel-media-audit-'));
const source = path.join(scratch, 'source'), restored = path.join(scratch, 'restored');
const relative = '2026-10/60000000001/synthetic.jpg';
const ref = `media/wa/${relative}`;
let passed = 0;
async function test(name, check) { await check(); passed++; console.log(`PASS: ${name}`); }
async function put(root, name, body = 'synthetic-media') {
  const filename = path.join(root, name); await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, body);
}
async function run(root, references, extra = {}) { return auditLegacyMedia({ root, references, ...extra }); }
try {
  await put(source, relative); await put(restored, relative);
  await writeFile(path.join(source, '.htaccess'), 'deny');
  const before = await stat(path.join(source, relative));
  await test('exact copied bytes and references match without exposing private paths', async () => {
    const result = await run(source, [{ media_path: ref }], { compareRoot: restored });
    assert.equal(result.status, 'PASS'); assert.equal(result.references.matchedPaths, 1);
    assert.equal(result.source.fingerprint, result.copy.fingerprint);
    assert.ok(!JSON.stringify(result).includes('60000000001'));
    assert.ok(!JSON.stringify(result).includes('synthetic.jpg'));
    assert.ok(!JSON.stringify(result).includes(scratch));
    assert.equal(result.source.files, 1);
  });
  await test('29 duplicate references to six real files do not imply 23 missing files', async () => {
    for (let i = 1; i < 6; i++) await put(source, `2026-10/60000000001/other-${i}.jpg`);
    const refs = Array.from({ length: 29 }, (_, i) => i % 6 ? `media/wa/2026-10/60000000001/other-${i % 6}.jpg` : ref);
    const result = await run(source, refs);
    assert.equal(result.status, 'PASS'); assert.equal(result.references.uniquePaths, 6);
    assert.equal(result.references.duplicateRows, 23); assert.equal(result.references.missingPaths, 0);
    for (let i = 1; i < 6; i++) await rm(path.join(source, `2026-10/60000000001/other-${i}.jpg`));
  });
  await test('missing unique paths and affected rows are counted separately', async () => {
    const missing = 'media/wa/2026-10/60000000001/missing.jpg';
    const result = await run(source, [ref, missing, missing, null, '']);
    assert.equal(result.status, 'FAIL'); assert.equal(result.references.missingPaths, 1);
    assert.equal(result.references.missingRows, 2); assert.equal(result.references.emptyRows, 2);
  });
  await test('unreferenced files require review and are never removed', async () => {
    const result = await run(source, []);
    assert.equal(result.status, 'REVIEW'); assert.equal(result.unreferencedFiles, 1);
    assert.equal(await readFile(path.join(source, relative), 'utf8'), 'synthetic-media');
  });
  await test('leading slash is compatible; traversal, URL, invalid month and non-string refs fail', async () => {
    assert.equal((await run(source, ['/' + ref])).status, 'PASS');
    for (const value of ['../' + ref, 'https://example.invalid/' + ref, ref.replace('2026-10', '2026-13'), ref.replace('/synthetic.jpg', '/../synthetic.jpg'), 17, {}, []]) {
      const result = await run(source, [value]); assert.equal(result.status, 'FAIL'); assert.equal(result.references.invalidRows, 1);
    }
  });
  await test('copy comparison detects same-size changed bytes, missing and extra files', async () => {
    await put(restored, relative, 'SYNTHETIC-MEDIA');
    assert.equal((await run(source, [ref], { compareRoot: restored })).copy.differentFiles, 1);
    await rm(path.join(restored, relative));
    assert.equal((await run(source, [ref], { compareRoot: restored })).copy.missingFiles, 1);
    await put(restored, relative); await put(restored, '2026-10/60000000001/extra.jpg');
    const result = await run(source, [ref], { compareRoot: restored });
    assert.equal(result.status, 'FAIL'); assert.equal(result.copy.extraFiles, 1);
    await rm(path.join(restored, '2026-10/60000000001/extra.jpg'));
  });
  await test('junctions and linked roots are rejected without reading their target', async () => {
    const outside = path.join(scratch, 'outside'); await put(outside, 'private.jpg', 'canary-never-read');
    const linked = path.join(source, '2026-11'); await symlink(outside, linked, 'junction');
    const result = await run(source, [ref]); assert.equal(result.status, 'FAIL'); assert.equal(result.source.invalidEntries, 1);
    await assert.rejects(run(linked, []));
    await rm(linked);
  });
  await test('unsupported directory layouts are not traversed', async () => {
    await put(source, 'private/secrets.txt', 'canary');
    const result = await run(source, [ref]); assert.equal(result.status, 'FAIL'); assert.equal(result.source.files, 1);
    await rm(path.join(source, 'private', 'secrets.txt')); await rmdir(path.join(source, 'private'));
  });
  await test('entry, per-file and total-byte caps fail without claiming a complete inventory', async () => {
    for (const limits of [{ entries: 1 }, { fileBytes: 2 }, { totalBytes: 2 }]) {
      const result = await run(source, [ref], { limits }); assert.equal(result.status, 'FAIL'); assert.equal(result.source.complete, false);
    }
    await assert.rejects(run(source, [ref], { limits: { entries: 10_001 } }));
  });
  await test('CLI reports aggregates and sanitized errors without filesystem mutations', async () => {
    const filename = path.join(scratch, 'references.json'); await writeFile(filename, JSON.stringify([ref]));
    const cli = args => spawnSync(process.execPath, ['scripts/audit-legacy-media.mjs', ...args], { encoding: 'utf8', timeout: 15_000 });
    const success = cli([`--root=${source}`, `--references=${filename}`, `--compare-root=${restored}`]);
    assert.equal(success.status, 0, success.stderr); assert.equal(JSON.parse(success.stdout).status, 'PASS');
    const missing = cli([`--root=${path.join(scratch, 'PRIVATE-MISSING')}`, `--references=${filename}`]);
    assert.equal(missing.status, 2); assert.equal(JSON.parse(missing.stdout).status, 'NOT_VERIFIED');
    assert.ok(!missing.stdout.includes('PRIVATE-MISSING')); assert.ok(!missing.stdout.includes(scratch));
    const invalid = cli([`--root=${source}`, `--references=${filename}`, '--unknown=1']); assert.equal(invalid.status, 2);
    const after = await stat(path.join(source, relative));
    assert.equal(after.mtimeMs, before.mtimeMs); assert.equal(after.size, before.size);
    assert.equal(await readFile(path.join(source, '.htaccess'), 'utf8'), 'deny');
  });
  console.log(`Legacy media audit checks passed: ${passed}; synthetic files only, no DB/provider/Cron.`);
} finally {
  // scratch is an independently created temp root; never remove a user-supplied root.
  const resolved = path.resolve(scratch);
  assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(resolved, { recursive: true, force: true });
}

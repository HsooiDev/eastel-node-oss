// Read-only, offline reconciliation. Never loads .env, connects to DB or writes files.
import { constants } from 'node:fs';
import { lstat, open, opendir, realpath, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PATH_RE = /^\/?media\/wa\/(\d{4}-(?:0[1-9]|1[0-2])\/\d{5,20}\/[A-Za-z0-9_-]{1,220}\.[A-Za-z0-9]{1,10})$/;
const LIMITS = { entries: 10_000, fileBytes: 100 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024 };

async function checkedRoot(root) {
  if (!root || !path.isAbsolute(root)) throw new Error('An absolute media root is required.');
  // Refuse ancestor links too; never silently traverse a junction to another tree.
  let cursor = path.resolve(root);
  while (true) {
    const stat = await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe media root.');
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return realpath(root);
}

async function inventory(root, limits) {
  root = await checkedRoot(root);
  const files = new Map();
  const summary = { files: 0, bytes: 0, invalidEntries: 0, unreadableEntries: 0, oversizedFiles: 0, changedFiles: 0, complete: true };
  let entries = 0, bytesRead = 0;
  async function visit(directory, segments = []) {
    // Do not materialize an unbounded directory; sort only the bounded final set.
    const stream = await opendir(directory);
    for await (const entry of stream) {
      if (++entries > limits.entries) { summary.complete = false; return; }
      const names = [...segments, entry.name];
      const file = path.join(directory, entry.name);
      let info;
      try { info = await lstat(file); }
      catch { summary.unreadableEntries++; continue; }
      if (info.isSymbolicLink()) { summary.invalidEntries++; continue; }
      if (names.length === 1 && entry.name === '.htaccess' && info.isFile()) continue;
      if (info.isDirectory()) {
        const valid = names.length === 1 ? /^\d{4}-(?:0[1-9]|1[0-2])$/.test(entry.name)
          : names.length === 2 && /^\d{5,20}$/.test(entry.name);
        if (!valid) { summary.invalidEntries++; continue; }
        try { await visit(file, names); }
        catch { summary.unreadableEntries++; }
        if (!summary.complete) return;
        continue;
      }
      const relative = names.join('/');
      if (!info.isFile() || !PATH_RE.test(`media/wa/${relative}`) || names.length !== 3) {
        summary.invalidEntries++; continue;
      }
      if (info.size > limits.fileBytes) { summary.oversizedFiles++; continue; }
      if (summary.bytes + info.size > limits.totalBytes) { summary.complete = false; return; }
      let handle;
      try {
        // Resolve containment again before open, and prevent a final symlink on POSIX.
        const actual = path.relative(root, await realpath(file));
        if (!actual || actual === '..' || actual.startsWith(`..${path.sep}`) || path.isAbsolute(actual)) throw new Error('Unsafe path.');
        handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        const before = await handle.stat();
        if (!before.isFile() || before.ino !== info.ino || before.dev !== info.dev || before.size !== info.size || before.mtimeMs !== info.mtimeMs) {
          summary.changedFiles++; continue;
        }
        const hash = createHash('sha256');
        let bytes = 0;
        // Bound reads even if another process appends to the file during the audit.
        for await (const chunk of handle.createReadStream({ autoClose: false })) {
          bytes += chunk.length; bytesRead += chunk.length;
          if (bytesRead > limits.totalBytes) { summary.complete = false; return; }
          if (bytes > limits.fileBytes) throw new Error('File changed during read.');
          hash.update(chunk);
        }
        const after = await handle.stat();
        if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
          summary.changedFiles++; continue;
        }
        files.set(relative, { bytes, sha256: hash.digest('hex') });
        summary.files++; summary.bytes += bytes;
      } catch { summary.unreadableEntries++; }
      finally { await handle?.close(); }
    }
  }
  await visit(root);
  const hash = createHash('sha256');
  for (const [name, item] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    hash.update(JSON.stringify([name, item.bytes, item.sha256]) + '\n');
  }
  summary.fingerprint = hash.digest('hex');
  summary.complete &&= !summary.invalidEntries && !summary.unreadableEntries && !summary.oversizedFiles && !summary.changedFiles;
  return { files, summary };
}

/** Accept exported media_path values only; return aggregates, never contact/file names. */
export async function auditLegacyMedia({ root, references, compareRoot, limits: customLimits = {} }) {
  const limits = { ...LIMITS, ...customLimits };
  for (const key of Object.keys(LIMITS)) if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > LIMITS[key]) throw new Error('Invalid inventory limit.');
  if (!Array.isArray(references) || references.length > 100_000) throw new Error('Expected a bounded JSON array of media paths.');
  const counts = new Map();
  const refs = { rows: references.length, emptyRows: 0, validRows: 0, uniquePaths: 0, duplicateRows: 0, invalidRows: 0, matchedPaths: 0, missingPaths: 0, missingRows: 0 };
  for (const row of references) {
    const value = typeof row === 'object' && row !== null && !Array.isArray(row) ? row.media_path : row;
    if (value === null || value === '') { refs.emptyRows++; continue; }
    const match = typeof value === 'string' && PATH_RE.exec(value);
    if (!match) { refs.invalidRows++; continue; }
    counts.set(match[1], (counts.get(match[1]) || 0) + 1); refs.validRows++;
  }
  refs.uniquePaths = counts.size; refs.duplicateRows = refs.validRows - counts.size;
  const source = await inventory(root, limits);
  for (const [name, rows] of counts) {
    if (source.files.has(name)) refs.matchedPaths++;
    else { refs.missingPaths++; refs.missingRows += rows; }
  }
  const unreferencedFiles = [...source.files.keys()].filter(name => !counts.has(name)).length;
  let copy;
  if (compareRoot) {
    const target = await inventory(compareRoot, limits);
    let missingFiles = 0, differentFiles = 0;
    for (const [name, item] of source.files) {
      const other = target.files.get(name);
      if (!other) missingFiles++;
      else if (item.sha256 !== other.sha256 || item.bytes !== other.bytes) differentFiles++;
    }
    const extraFiles = [...target.files.keys()].filter(name => !source.files.has(name)).length;
    copy = { ...target.summary, missingFiles, differentFiles, extraFiles };
  }
  const failed = !source.summary.complete || refs.invalidRows || refs.missingPaths
    || (copy && (!copy.complete || copy.missingFiles || copy.differentFiles || copy.extraFiles));
  return { status: failed ? 'FAIL' : unreferencedFiles ? 'REVIEW' : 'PASS', source: source.summary, references: refs, unreferencedFiles, ...(copy ? { copy } : {}) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).includes('--help')) {
    console.log('Read-only offline audit: node scripts/audit-legacy-media.mjs --root=<absolute media/wa contents directory> --references=<private JSON export> [--compare-root=<absolute restored copy>]\nOutputs aggregate counts and fingerprints only. Does not connect to DB, copy, delete, change permissions, load .env or schedule Cron. Exit 0=PASS, 1=FAIL/REVIEW, 2=unable to audit.');
  } else {
    try {
      const args = new Map();
      for (const arg of process.argv.slice(2)) {
        const match = /^--(root|references|compare-root)=(.+)$/.exec(arg);
        if (!match || args.has(match[1])) throw new Error('Invalid arguments.');
        args.set(match[1], match[2]);
      }
      const refFile = args.get('references');
      if (!refFile) throw new Error('A private JSON export is required.');
      const info = await lstat(refFile);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 10 * 1024 * 1024) throw new Error('Unsafe reference file.');
      const references = JSON.parse(await readFile(refFile, 'utf8'));
      const result = await auditLegacyMedia({ root: args.get('root'), references, compareRoot: args.get('compare-root') });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === 'PASS' ? 0 : 1;
    } catch {
      // Filesystem errors contain private paths. Never echo them into CI/chat logs.
      console.log(JSON.stringify({ status: 'NOT_VERIFIED', error: 'Unable to audit. Check arguments, private export format, root safety and local read permissions.' }));
      process.exitCode = 2;
    }
  }
}

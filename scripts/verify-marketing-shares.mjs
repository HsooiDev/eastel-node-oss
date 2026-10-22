import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const require = createRequire(import.meta.url);
const ts = require("typescript");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "eastel-marketing-share-"));
const shareDir = path.join(scratch, "persistent", "marketing-shares");
let releaseCwd = path.join(scratch, "release-a", ".next", "standalone");
let authenticated = false;
let forcedUuid = "123e4567-e89b-42d3-a456-426614174000";
let quotaMarkerSize = null;
let lockQueue = Promise.resolve();

async function loadTs(relativePath, injected = {}) {
  const sourcePath = path.join(root, relativePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  const nativeFs = await import("node:fs/promises");
  const context = {
    module,
    exports: module.exports,
    Buffer,
    process: { cwd: () => releaseCwd, env: { NODE_ENV: "production", MARKETING_SHARE_DIR: shareDir } },
    console: { error() {}, log() {}, warn() {} },
    setTimeout,
    clearTimeout,
    Request,
    Response,
    Headers,
    FormData,
    File,
    Uint8Array,
    URL,
    URLSearchParams,
    Error,
    crypto: globalThis.crypto,
    require(specifier) {
      if (Object.hasOwn(injected, specifier)) return injected[specifier];
      return require(specifier);
    },
  };
  vm.runInNewContext(output, context, { filename: sourcePath });
  return module.exports;
}

class PreviewNextResponse extends Response {
  static json(value, init) {
    return Response.json(value, init);
  }
}

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
  pngChunk("IDAT", (await import("node:zlib")).deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
  pngChunk("IEND", Buffer.alloc(0)),
]);
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGhAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Ak//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Ak//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Ak//Z",
  "base64",
);

const model = await loadTs("lib/marketing-editor-model.ts");
const actualFs = await import("node:fs/promises");
const fsForStorage = new Proxy(actualFs, {
  get(target, property, receiver) {
    if (property === "stat") return async (filePath, ...args) => {
      if (quotaMarkerSize !== null && path.basename(String(filePath)) === "quota-marker") return { size: quotaMarkerSize };
      return target.stat(filePath, ...args);
    };
    return Reflect.get(target, property, receiver);
  },
});
const databaseLock = {
  async withDatabaseLock(_key, operation) {
    const before = lockQueue;
    let release;
    lockQueue = new Promise((resolve) => { release = resolve; });
    await before;
    try { return await operation({}); }
    finally { release(); }
  },
};
const sharePath = await loadTs("lib/marketing-share-path.ts");
const reviewPath = await loadTs("lib/review-upload-path.ts", { "@/lib/marketing-share-path": sharePath });
const uploadStorage = await loadTs("lib/upload-storage.ts", { "@/lib/database-lock": databaseLock, "@/lib/review-upload-path": reviewPath });
const storage = await loadTs("lib/marketing-share-storage.ts", {
  "node:crypto": { ...await import("node:crypto"), randomUUID: () => forcedUuid },
  "node:fs/promises": fsForStorage,
  "node:path": path,
  "@/lib/database-lock": databaseLock,
  "@/lib/marketing-share-path": sharePath,
});
const helpers = await loadTs("app/api/admin/_helpers.ts", {
  "next/server": { NextResponse: PreviewNextResponse },
  "@/lib/cookies": { getSessionCookie: async () => authenticated ? "fixture-admin-session" : null },
  "@/lib/session": { validateAdminSession: async (token) => authenticated && token === "fixture-admin-session" ? { customerId: 7, isAdmin: true } : null },
  "@/lib/security": { validateCsrfToken: async () => true },
  "@/lib/site": { SITE_URL: "http://localhost" },
});
const uploadApi = await loadTs("app/api/admin/marketing-shares/route.ts", {
  "../_helpers": helpers,
  "@/lib/marketing-editor-model": model,
  "@/lib/marketing-share-storage": storage,
  "@/lib/upload-storage": uploadStorage,
});
const serveApi = await loadTs("app/api/marketing-shares/[filename]/route.ts", {
  "next/server": { NextResponse: PreviewNextResponse },
  "node:fs/promises": actualFs,
  "node:path": path,
  "@/lib/marketing-editor-model": model,
  "@/lib/marketing-share-path": sharePath,
});

const passed = [];
const failed = [];
function uploadRequest(bytes, contentType, origin = "http://localhost") {
  const boundary = "editor-share-boundary-20261016";
  const filename = contentType === "image/png" ? "poster.png" : "poster.jpg";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return new Request("http://localhost/api/admin/marketing-shares", {
    method: "POST",
    body,
    headers: { host: "localhost", origin, "content-type": `multipart/form-data; boundary=${boundary}` },
  });
}
async function post(bytes, contentType = "image/jpeg", origin) {
  return uploadApi.POST(uploadRequest(bytes, contentType, origin));
}
async function check(name, run) {
  try { await run(); passed.push(name); }
  catch (cause) { failed.push({ name, message: cause instanceof Error ? cause.message : String(cause) }); }
}

try {
  await check("hosted shares reject missing, relative, root and in-release storage paths", async () => {
    for (const configured of [undefined, "relative/path", path.parse(scratch).root, releaseCwd, path.join(releaseCwd, "storage"), path.join(scratch, "release-a", "storage")]) {
      assert.throws(() => sharePath.getMarketingShareDirectory({ NODE_ENV: "production", MARKETING_SHARE_DIR: configured }, releaseCwd));
    }
    assert.equal(sharePath.getMarketingShareDirectory({ NODE_ENV: "development" }, releaseCwd), path.join(releaseCwd, "storage", "marketing-shares"));
  });
  await check("unauthenticated upload is rejected before storage creation", async () => {
    authenticated = false;
    assert.equal((await post(jpeg)).status, 401);
    await assert.rejects(fs.stat(shareDir), { code: "ENOENT" });
  });
  await check("cross-origin upload is rejected by admin CSRF origin validation", async () => {
    authenticated = true;
    assert.equal((await post(jpeg, "image/jpeg", "https://attacker.invalid")).status, 401);
    await assert.rejects(fs.stat(shareDir), { code: "ENOENT" });
  });
  await check("valid JPEG upload returns a random public URL and stores exact bytes", async () => {
    forcedUuid = "123e4567-e89b-42d3-a456-426614174000";
    const response = await post(jpeg);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.url, `/api/marketing-shares/${forcedUuid}.jpeg`);
    assert.deepEqual(await fs.readFile(path.join(shareDir, `${forcedUuid}.jpeg`)), jpeg);
  });
  await check("valid PNG upload is structurally checked and stored", async () => {
    forcedUuid = "123e4567-e89b-42d3-a456-426614174001";
    const response = await post(png, "image/png");
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.url, `/api/marketing-shares/${forcedUuid}.png`);
  });
  await check("malformed image content and MIME mismatch are rejected", async () => {
    assert.equal((await post(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg")).status, 400);
    assert.equal((await post(jpeg, "image/png")).status, 400);
  });
  await check("public GET serves only the UUID asset with safe image headers", async () => {
    const response = await serveApi.GET(new Request("http://localhost"), { params: Promise.resolve({ filename: "123e4567-e89b-42d3-a456-426614174000.jpeg" }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("cache-control") ?? "", /immutable/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
  });
  await check("public GET rejects traversal and non-random filenames", async () => {
    await fs.writeFile(path.join(scratch, "outside.jpeg"), "must not be served");
    for (const filename of ["../outside.jpeg", "not-a-token.png", "123e4567-e89b-02d3-a456-426614174000.jpeg"]) {
      const response = await serveApi.GET(new Request("http://localhost"), { params: Promise.resolve({ filename }) });
      assert.equal(response.status, 404);
    }
  });
  await check("per-file 5 MiB limit rejects before a file is stored", async () => {
    forcedUuid = "123e4567-e89b-42d3-a456-426614174002";
    assert.equal((await post(new Uint8Array(5 * 1024 * 1024 + 1))).status, 400);
    await assert.rejects(fs.stat(path.join(shareDir, `${forcedUuid}.jpeg`)), { code: "ENOENT" });
  });
  await check("streamed multipart body limit returns 413", async () => {
    assert.equal((await post(new Uint8Array(5 * 1024 * 1024 + 64 * 1024 + 1024))).status, 413);
  });
  await check("aggregate storage quota returns 507 without writing the new image", async () => {
    const marker = path.join(shareDir, "quota-marker");
    await fs.writeFile(marker, "quota");
    quotaMarkerSize = storage.MAX_MARKETING_SHARE_TOTAL_BYTES;
    forcedUuid = "123e4567-e89b-42d3-a456-426614174003";
    assert.equal((await post(jpeg)).status, 507);
    await assert.rejects(fs.stat(path.join(shareDir, `${forcedUuid}.jpeg`)), { code: "ENOENT" });
  });
  await check("UUID collision preserves the existing file", async () => {
    quotaMarkerSize = null;
    const filename = "123e4567-e89b-42d3-a456-426614174004.jpeg";
    const existing = Buffer.from("existing synthetic asset");
    await fs.writeFile(path.join(shareDir, filename), existing);
    forcedUuid = filename.slice(0, -5);
    await assert.rejects(storage.storeMarketingShare(jpeg, "jpeg"));
    assert.deepEqual(await fs.readFile(path.join(shareDir, filename)), existing);
  });
  await check("new release process reads the previous release's exact share bytes", async () => {
    forcedUuid = "123e4567-e89b-42d3-a456-426614174005";
    const response = await post(png, "image/png");
    assert.equal(response.status, 200);
    const { url } = await response.json();
    releaseCwd = path.join(scratch, "release-b", ".next", "standalone");
    const freshPath = await loadTs("lib/marketing-share-path.ts");
    const freshServe = await loadTs("app/api/marketing-shares/[filename]/route.ts", {
      "next/server": { NextResponse: PreviewNextResponse }, "node:fs/promises": actualFs,
      "node:path": path, "@/lib/marketing-editor-model": model, "@/lib/marketing-share-path": freshPath,
    });
    const downloaded = await freshServe.GET(new Request(`http://localhost${url}`), { params: Promise.resolve({ filename: path.basename(url) }) });
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
    await assert.rejects(fs.stat(path.join(releaseCwd, "storage")), { code: "ENOENT" });
  });
  process.stdout.write(`PASS: ${passed.length} marketing-share route/storage checks\n`);
  for (const name of passed) process.stdout.write(`  PASS ${name}\n`);
  if (failed.length) {
    process.stderr.write(`FAIL: ${failed.length} marketing-share checks\n`);
    for (const item of failed) process.stderr.write(`  FAIL ${item.name}: ${item.message}\n`);
    process.exitCode = 1;
  }
} finally {
  await fs.rm(scratch, { recursive: true, force: true });
}

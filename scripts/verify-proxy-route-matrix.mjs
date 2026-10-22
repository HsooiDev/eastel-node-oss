#!/usr/bin/env node

/**
 * Read-only smoke test for the proxy route matrix.
 *
 * Usage:
 *   EASTEL_BASE_URL=https://staging.example.test node scripts/verify-proxy-route-matrix.mjs
 *   EASTEL_BASE_URL=http://localhost:3000 node scripts/verify-proxy-route-matrix.mjs
 */

const baseUrl = new URL(process.env.EASTEL_BASE_URL || "http://localhost:3000");

function absoluteUrl(pathname) {
  return new URL(pathname, baseUrl);
}

function responsePath(location, fallbackUrl) {
  if (!location) return null;
  return new URL(location, fallbackUrl).pathname;
}

async function request(pathname, headers = {}) {
  const url = absoluteUrl(pathname);
  const response = await fetch(url, {
    headers,
    redirect: "manual",
  });

  return { pathname, url, response };
}

function isRedirect(response) {
  return response.status >= 300 && response.status < 400;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkPage(test, expectedPath) {
  const { response, url } = await request(test.path, test.headers);
  assert(response.status === 200, `${test.name}: expected 200, got ${response.status}`);
  assert(
    (response.headers.get("content-type") || "").includes("text/html"),
    `${test.name}: expected HTML content type`
  );

  if (test.securityHeaders) {
    const csp = response.headers.get("content-security-policy") || "";
    assert(csp.includes("frame-src 'self' https://challenges.cloudflare.com"), `${test.name}: Turnstile frame CSP missing`);
    assert(csp.includes("nonce-"), `${test.name}: CSP nonce missing`);
    assert(response.headers.get("x-content-type-options") === "nosniff", `${test.name}: nosniff header missing`);
    assert(response.headers.get("x-frame-options") === "DENY", `${test.name}: frame header missing`);

    const html = await response.text();
    assert(/<script[^>]+nonce=["'][^"']+["']/.test(html), `${test.name}: HTML nonce missing`);
  }

  if (expectedPath) {
    assert((await url).pathname === expectedPath, `${test.name}: unexpected path`);
  }
}

async function checkRedirect(test, expectedPath) {
  const { response, url } = await request(test.path, test.headers);
  assert(isRedirect(response), `${test.name}: expected redirect, got ${response.status}`);
  assert(
    responsePath(response.headers.get("location"), url) === expectedPath,
    `${test.name}: expected redirect to ${expectedPath}, got ${response.headers.get("location") || "<none>"}`
  );
}

async function checkStatus(test, expectedStatus) {
  const { response } = await request(test.path, test.headers);
  assert(response.status === expectedStatus, `${test.name}: expected ${expectedStatus}, got ${response.status}`);
}

async function checkJsonStatus(test, expectedStatus, expectedBodyStatus) {
  const { response } = await request(test.path, test.headers);
  assert(response.status === expectedStatus, `${test.name}: expected ${expectedStatus}, got ${response.status}`);
  const body = await response.json();
  assert(body.status === expectedBodyStatus, `${test.name}: expected body status ${expectedBodyStatus}, got ${body.status || "<none>"}`);
  assert(typeof body.buildId === "string" && body.buildId.length > 0, `${test.name}: buildId missing`);
}

async function checkNoStore(test) {
  const { response } = await request(test.path, test.headers);
  assert(response.status >= 200 && response.status < 400, `${test.name}: expected success or redirect, got ${response.status}`);
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
  assert(cacheControl.includes("no-store"), `${test.name}: no-store cache directive missing`);
  assert(!cacheControl.includes("s-maxage"), `${test.name}: shared s-maxage directive present`);
  assert((response.headers.get("x-robots-tag") || "").toLowerCase().includes("noindex"), `${test.name}: noindex header missing`);
}

const checks = [
  { name: "English home", path: "/en", kind: "page", securityHeaders: true },
  { name: "Malay plans", path: "/ms/plans", kind: "page", securityHeaders: true },
  { name: "Chinese public page", path: "/zh/contact", kind: "page", securityHeaders: true },
  { name: "Customer login", path: "/en/account/login", kind: "page", securityHeaders: true },
  { name: "Admin login", path: "/hs/login", kind: "page", securityHeaders: true },
  { name: "Payment return landing", path: "/payment/success", kind: "page", securityHeaders: true },
  { name: "Signed-out customer page", path: "/en/account/orders", kind: "redirect", expectedPath: "/en/account/login" },
  { name: "Signed-out admin page", path: "/hs/dashboard", kind: "redirect", expectedPath: "/hs/login" },
  // app/page.tsx intentionally keeps the root default at /ms/. Locale
  // negotiation is exercised below on a nonlocalized, non-root route.
  { name: "Root default route", path: "/", kind: "redirect", expectedPath: "/ms/" },
  { name: "Unknown route locale selection", path: "/does-not-exist", kind: "redirect", expectedPath: "/zh/does-not-exist", headers: { "accept-language": "zh-CN,zh;q=0.9" } },
  { name: "Admin API guard", path: "/api/admin/settings", kind: "status", expectedStatus: 401 },
  { name: "Health readiness API", path: "/api/health", kind: "json-status", expectedStatus: 200, expectedBodyStatus: "healthy" },
  { name: "Health liveness API", path: "/api/health/live", kind: "json-status", expectedStatus: 200, expectedBodyStatus: "ok" },
  { name: "Thank-you cache policy", path: "/en/thankyou?ref=route-matrix-probe", kind: "no-store" },
  { name: "Favicon asset", path: "/favicon.ico", kind: "status", expectedStatus: 200 },
];

let failures = 0;
for (const test of checks) {
  try {
    if (test.kind === "page") await checkPage(test);
    else if (test.kind === "redirect") await checkRedirect(test, test.expectedPath);
    else if (test.kind === "json-status") await checkJsonStatus(test, test.expectedStatus, test.expectedBodyStatus);
    else if (test.kind === "no-store") await checkNoStore(test);
    else await checkStatus(test, test.expectedStatus);
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${test.name}: ${error.message}`);
  }
}

try {
  const login = await request("/en/account/login");
  const html = await login.response.text();
  const asset = html.match(/\/_next\/static\/[^"'\s>]+\.(?:js|css)/)?.[0];
  assert(asset, "could not find a build asset in the login HTML");
  const assetResponse = await request(asset);
  assert(assetResponse.response.status === 200, `build asset returned ${assetResponse.response.status}`);
  console.log(`PASS Next build asset (${asset})`);
} catch (error) {
  failures += 1;
  console.error(`FAIL Next build asset: ${error.message}`);
}

if (failures > 0) {
  console.error(`${failures} route-matrix check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`All ${checks.length + 1} route-matrix checks passed.`);
}

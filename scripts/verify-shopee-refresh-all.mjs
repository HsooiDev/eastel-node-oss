import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = process.cwd();

function loadTypeScript(relativePath, requireModule, globals = {}) {
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: filePath,
  });
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: requireModule,
    Error,
    Promise,
    Response,
    URL,
    AbortSignal,
    Date,
    JSON,
    String,
    console: { error() {} },
    ...globals,
  });
  vm.runInContext(outputText, context, { filename: filePath });
  return module.exports;
}

async function verifySequentialBatch() {
  const clientTimeoutCalls = [];
  const batch = loadTypeScript('lib/shopee-tracking-batch.ts', () => {
    throw new Error('The batch helper must not import runtime modules.');
  }, { AbortSignal: makeAbortSignalMock(clientTimeoutCalls) });
  let capturedRequest;
  const scanResult = await batch.requestShopeeTrackingScan(
    { id: 10, tracking_number: 'MY0000000010' },
    async (url, init) => {
      capturedRequest = { url, init };
      return Response.json({ status: 'success', order_status: 'shipped', tracking_data: '[]' });
    },
  );
  assert.equal(scanResult.ok, true);
  assert.equal(scanResult.orderStatus, 'shipped');
  assert.equal(clientTimeoutCalls[0], 20_000, 'browser requests have a timeout covering the bounded server provider calls');
  assert.equal(capturedRequest.init.signal.timeoutMilliseconds, 20_000);

  const orders = [
    { id: 1, status: 'pending' },
    { id: 2, status: 'processing' },
    { id: 3, status: 'shipped' },
    { id: 4, status: 'delivered' },
    { id: 5, status: 'cancelled' },
  ];
  const active = batch.getRefreshableShopeeOrders(orders);
  assert.equal(active.length, 3, 'terminal delivered/cancelled rows are excluded');

  let inFlight = 0;
  let maximumInFlight = 0;
  const scanned = [];
  const reported = [];
  const results = await batch.refreshShopeeOrdersSequentially(active, async (order) => {
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    scanned.push(order.id);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight -= 1;
    if (order.id === 2) {
      return batch.requestShopeeTrackingScan(
        { id: order.id, tracking_number: `MOCK-${order.id}` },
        async () => { throw new DOMException('Mock tracking timeout', 'TimeoutError'); },
      );
    }
    if (order.id === 3) return { ok: false, message: 'Mock provider unavailable' };
    return { ok: true, message: 'Updated' };
  }, (item) => reported.push(item.order.id));

  assert.equal(maximumInFlight, 1, 'Refresh All never overlaps provider scans');
  assert.equal(scanned.join(','), '1,2,3', 'orders are scanned in source order');
  assert.equal(reported.join(','), '1,2,3', 'each item reports a result before the next batch item');
  assert.equal(results.length, 3, 'one result is returned for every active order');
  assert.equal(results[0].result.ok, true);
  assert.equal(results[1].result.ok, false, 'a thrown timeout is reported as an item failure');
  assert.equal(results[1].result.message, 'Mock tracking timeout');
  assert.equal(results[2].result.message, 'Mock provider unavailable', 'a failed item does not stop later scans');
  console.log('PASS: client timeout, sequential batch concurrency, terminal filtering and per-item timeout/error continuation');
}

function makeAbortSignalMock(timeoutCalls) {
  return class MockAbortSignal {
    static timeout(milliseconds) {
      timeoutCalls.push(milliseconds);
      return { timeoutMilliseconds: milliseconds };
    }
  };
}

async function verifyAdminRouteAndProviderMocks() {
  let sessionCookie = 'mock-admin-session';
  const session = { customerId: 42 };
  let sessionValidationCalls = 0;
  const auth = loadTypeScript('app/api/admin/_helpers.ts', (name) => {
    if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    if (name === '@/lib/cookies') return { getSessionCookie: async () => sessionCookie };
    if (name === '@/lib/session') return {
      validateAdminSession: async (cookie) => {
        sessionValidationCalls += 1;
        return cookie === 'mock-admin-session' ? session : null;
      },
    };
    if (name === '@/lib/security') return { validateCsrfToken: async () => true };
    if (name === '@/lib/site') return { SITE_URL: 'https://admin.example.test' };
    if (name === '@/lib/rate-limit') return {};
    throw new Error(`Unexpected admin helper dependency: ${name}`);
  });

  const timeoutCalls = [];
  const fetchCalls = [];
  let providerMode = 'success';
  const mockFetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    if (String(url).startsWith('https://spx.com.my/')) {
      if (providerMode === 'timeout') throw new DOMException('Mock SPX timeout', 'TimeoutError');
      if (providerMode === 'unavailable') return new Response('', { status: 503 });
      return Response.json({
        retcode: 0,
        data: { sls_tracking_info: { records: [{ buyer_description: 'Parcel delivered', milestone_name: 'delivered', actual_time: 1760000000 }] } },
      });
    }
    if (String(url).startsWith('https://app.easyparcel.com/')) {
      if (providerMode === 'timeout') throw new DOMException('Mock fallback timeout', 'TimeoutError');
      if (providerMode === 'unavailable') return new Response('<html>no status found</html>');
      return new Response('<html></html>');
    }
    throw new Error(`Blocked unexpected network target: ${String(url)}`);
  };
  const dbCalls = [];
  const mockDb = {
    query: async (...args) => {
      dbCalls.push(['query', ...args]);
      return [[], []];
    },
    execute: async (...args) => {
      dbCalls.push(['execute', ...args]);
      return [{ affectedRows: 1 }, []];
    },
  };
  const route = loadTypeScript('app/api/admin/shopee-tracking/route.ts', (name) => {
    if (name === '@/lib/db') return mockDb;
    if (name === '../_helpers') return auth;
    throw new Error(`Unexpected Shopee route dependency: ${name}`);
  }, { fetch: mockFetch, AbortSignal: makeAbortSignalMock(timeoutCalls) });

  const post = (origin = 'https://admin.example.test') => new Request('https://admin.example.test/api/admin/shopee-tracking', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'admin.example.test', ...(origin ? { origin } : {}) },
    body: JSON.stringify({ action: 'fetch_shopee_tracking', id: 7, tracking_number: 'MY0000000001' }),
  });

  sessionCookie = null;
  let response = await route.POST(post());
  assert.equal(response.status, 401, 'missing admin session is rejected');
  assert.equal(fetchCalls.length, 0, 'unauthenticated requests never reach a provider');

  sessionCookie = 'mock-admin-session';
  response = await route.POST(post('https://attacker.example.test'));
  assert.equal(response.status, 401, 'cross-origin mutation is rejected by the existing admin CSRF guard');
  assert.equal(fetchCalls.length, 0, 'CSRF rejection never reaches a provider');

  response = await route.POST(post());
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, 'success');
  assert.equal(body.order_status, 'delivered');
  assert.equal(timeoutCalls[0], 12_000, 'SPX uses the PHP-compatible 12-second timeout');
  assert.equal(fetchCalls[0].init.signal.timeoutMilliseconds, 12_000);
  assert.equal(dbCalls.filter(([kind]) => kind === 'execute').length, 1, 'only the mock DB receives the tracking result');

  providerMode = 'timeout';
  response = await route.POST(post());
  body = await response.json();
  assert.equal(response.status, 400, 'provider timeout is returned as an item-level API failure');
  assert.match(body.message, /timeout/i);
  assert.deepEqual(timeoutCalls.slice(-2), [12_000, 6_000], 'SPX and EasyParcel fallback timeouts remain bounded');

  providerMode = 'unavailable';
  response = await route.POST(post());
  body = await response.json();
  assert.equal(response.status, 400, 'provider errors return an item-level API failure');
  assert.match(body.message, /HTTP 503/i);
  assert.ok(sessionValidationCalls >= 4, 'admin session validation runs on each POST');
  console.log('PASS: POST auth, origin/CSRF guard, bounded provider timeouts, and mocked success/error responses');
}

await verifySequentialBatch();
await verifyAdminRouteAndProviderMocks();

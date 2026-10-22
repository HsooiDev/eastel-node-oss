#!/usr/bin/env node

// Local browser QA only. This fixture intentionally does not import the Next
// app, read .env files, open a database connection, or call an external API.
// It serves the real public/recommender assets with an in-memory catalogue.
import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsRoot = path.join(root, 'public', 'recommender')
const requiredAssets = ['engine.mjs', 'copy.mjs', 'ui.mjs', 'widget.css', 'catalogue.json']

for (const name of requiredAssets) {
  const assetPath = path.join(assetsRoot, name)
  if (!fs.existsSync(assetPath)) {
    console.error(`[fixture] Missing shared asset: ${path.relative(root, assetPath)}`)
    process.exitCode = 1
    process.exit()
  }
}

const { validateCatalogue } = await import(pathToFileURL(path.join(assetsRoot, 'engine.mjs')))
const bundledCatalogue = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'catalogue.json'), 'utf8'))

if (!validateCatalogue(bundledCatalogue)) {
  console.error('[fixture] Bundled catalogue failed validateCatalogue().')
  process.exitCode = 1
  process.exit()
}

// Keep one non-available entry visible in the admin editor so browser QA can
// verify that the public recommender excludes Coming Soon and Inactive plans.
let catalogue = structuredClone({
  ...bundledCatalogue,
  plans: [
    ...bundledCatalogue.plans,
    {
      id: 'fixture-coming-soon',
      name: 'Fixture Coming Soon',
      price: 1,
      dataGB: 10000,
      hotspotGB: 10000,
      hotspotMode: 'shared',
      roamingGB: 10000,
      validityDays: 366,
      status: 'coming_soon',
    },
    {
      id: 'fixture-inactive',
      name: 'Fixture Inactive',
      price: 1,
      dataGB: 10000,
      hotspotGB: 10000,
      hotspotMode: 'shared',
      roamingGB: 10000,
      validityDays: 366,
      status: 'inactive',
    },
  ],
})

const auditEvents = []

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(body)
}

function html(res, body, searchParams = new URLSearchParams()) {
  const isPhpLight = searchParams.get('theme') === 'php-light'
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(`<!doctype html>
<html lang="en" data-fixture-theme="${isPhpLight ? 'php-light' : 'dark'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Eastel plan recommender fixture</title>
  <link rel="stylesheet" href="/recommender/widget.css">
  <style>
    :root { color-scheme: dark; --color-on-surface: #f8fafc; --color-on-surface-variant: #cbd5e1; --color-surface-container: #172033; --color-surface-container-low: #111827; --color-surface-container-high: #1f2b42; --color-outline-variant: #475569; --color-primary: #a78bfa; --color-on-primary: #1e1b4b; --color-error: #fca5a5; --color-success: #86efac; --fixture-background: #070b16; }
    html[data-fixture-theme="php-light"] { color-scheme: light; --surface: #fff; --surface-alt: #f8fafc; --ink: #111827; --ink2: #475569; --border: #cbd5e1; --accent: #6d28d9; --color-surface-container: var(--surface); --color-surface-container-low: var(--surface-alt); --color-surface-container-high: #f1f5f9; --color-on-surface: var(--ink); --color-on-surface-variant: var(--ink2); --color-outline-variant: var(--border); --color-primary: var(--accent); --color-error: #b91c1c; --color-success: #15803d; --fixture-background: #fff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--fixture-background); color: var(--color-on-surface); font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 980px; margin: 0 auto; padding: 28px 18px 80px; }
    nav { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
    nav a { color: #c4b5fd; }
    .fixture-banner { border: 1px solid #334155; border-radius: 12px; padding: 12px 14px; margin-bottom: 22px; color: #cbd5e1; font-size: 13px; }
    .fixture-banner strong { color: #86efac; }
    .fixture-links { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0 24px; }
    .fixture-links a { color: #ddd6fe; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #111827; padding: 12px; border-radius: 10px; }
  </style>
</head>
<body>
<main>
  <nav>
    <a href="/en/plans">EN plans</a>
    <a href="/ms/plans">MS plans</a>
    <a href="/zh/plans">ZH plans</a>
    <a href="/en/order">Order selection</a>
    <a href="/hs/settings">Admin editor</a>
    <a href="/en/plans?theme=php-light">PHP-token light</a>
    <a href="/fixture/state">Fixture state</a>
  </nav>
  <div class="fixture-banner"><strong>LOOPBACK QA FIXTURE</strong> — in-memory catalogue only; database, payment, delivery, and external network are disabled.</div>
  ${body}
</main>
</body>
</html>`)
}

function fixtureDelay(searchParams) {
  const value = Number(searchParams.get('delay') ?? 0)
  return Number.isInteger(value) && value >= 0 && value <= 5000 ? value : 0
}

function fixtureEndpoint(searchParams) {
  const params = new URLSearchParams()
  const delay = fixtureDelay(searchParams)
  if (delay > 0) params.set('delay', String(delay))
  if (searchParams.get('mode') === 'error') params.set('mode', 'error')
  const query = params.toString()
  return `/fixture/api/plan-recommender${query ? `?${query}` : ''}`
}

function recommenderPage(locale, searchParams) {
  return `<h1>${locale.toUpperCase()} plan recommender</h1>
<p>Try data, hotspot, roaming, budget, and validity boundaries. The recommendation uses the live in-memory response below.</p>
<p><a href="/${locale}/plans?delay=800">Delayed response</a> · <a href="/${locale}/plans?mode=error">503 response</a> · <a href="/${locale}/plans?theme=php-light">PHP-token light</a></p>
<div id="fixture-recommender"></div>
<script type="module">
  import { mountRecommender } from '/recommender/ui.mjs';
  mountRecommender(document.querySelector('#fixture-recommender'), {
    locale: ${JSON.stringify(locale)},
    endpoint: ${JSON.stringify(fixtureEndpoint(searchParams))},
    orderUrl: ${JSON.stringify(`/${locale}/order`)},
  });
</script>`
}

function orderPage(locale) {
  return `<h1>${locale.toUpperCase()} order selection</h1>
<p>The selected subscription is informational. This fixture has no order or payment form.</p>
<div id="fixture-selection"></div>
<script type="module">
  import { mountSelection } from '/recommender/ui.mjs';
  mountSelection(document.querySelector('#fixture-selection'), {
    locale: ${JSON.stringify(locale)},
    endpoint: '/fixture/api/plan-recommender',
  });
</script>`
}

function adminPage() {
  return `<h1>Plan catalogue admin fixture</h1>
<p>The admin endpoint is intentionally unauthenticated only inside this loopback fixture. POST writes stay in memory and append a mock audit event.</p>
<div id="fixture-admin"></div>
<script type="module">
  import { mountAdmin } from '/recommender/ui.mjs';
  mountAdmin(document.querySelector('#fixture-admin'), { endpoint: '/fixture/api/admin/plan-recommender' });
</script>`
}

function serveAsset(res, pathname) {
  const name = pathname.slice('/recommender/'.length)
  if (!requiredAssets.includes(name) || name.includes('/') || name.includes('\\')) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const assetPath = path.join(assetsRoot, name)
  const contentType = name.endsWith('.css')
    ? 'text/css; charset=utf-8'
    : name.endsWith('.json')
      ? 'application/json; charset=utf-8'
      : 'text/javascript; charset=utf-8'
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(fs.readFileSync(assetPath))
}

async function readBody(req, maxBytes = 100000) {
  const advertised = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(advertised) && advertised > maxBytes) throw new Error('too_large')
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error('too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const { pathname } = url

  try {
    if (pathname.startsWith('/recommender/')) {
      if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'Method not allowed.' })
      return serveAsset(res, pathname)
    }

    if (pathname === '/fixture/api/plan-recommender' && req.method === 'GET') {
      if (url.searchParams.get('mode') === 'error') {
        return json(res, 503, { status: 'error', message: 'Fixture failure requested.' })
      }
      const delay = fixtureDelay(url.searchParams)
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      return json(res, 200, { status: 'success', catalogue })
    }

    if (pathname === '/fixture/api/admin/plan-recommender') {
      if (req.method === 'GET') return json(res, 200, { status: 'success', catalogue })
      if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed.' })
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch (error) {
        return json(res, 400, { status: 'error', message: error?.message === 'too_large' ? 'Request is too large.' : 'Invalid JSON.' })
      }
      const submitted = body && typeof body === 'object' ? body.catalogue : undefined
      if (!validateCatalogue(submitted)) {
        return json(res, 400, { status: 'error', message: 'Invalid plan catalogue.' })
      }
      catalogue = structuredClone(submitted)
      auditEvents.push({ action: 'save_plan_catalogue', targetTable: 'settings', key: 'plan_recommender_catalogue_v1' })
      return json(res, 200, { status: 'success', catalogue, message: 'Plan catalogue saved.' })
    }

    if (pathname === '/fixture/state' && req.method === 'GET') {
      return json(res, 200, { catalogue, auditEvents, mode: 'loopback-memory-only' })
    }

    const match = pathname.match(/^\/(en|ms|zh)\/(plans|order)\/?$/)
    if (match && req.method === 'GET') {
      return html(res, match[2] === 'plans' ? recommenderPage(match[1], url.searchParams) : orderPage(match[1]), url.searchParams)
    }
    if (pathname === '/hs/settings' && req.method === 'GET') return html(res, adminPage(), url.searchParams)

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  } catch (error) {
    console.error('[fixture] request failed:', error)
    json(res, 500, { status: 'error', message: 'Fixture request failed.' })
  }
})

const rawPort = process.argv[2] ?? '0'
const port = Number(rawPort)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('[fixture] Usage: node scripts/plan-recommender-fixture-server.mjs [port 0-65535]')
  process.exitCode = 1
  process.exit()
}

server.listen(port, '127.0.0.1', () => {
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  console.log(`[fixture] loopback server ready: http://127.0.0.1:${actualPort}/en/plans`)
  console.log(`[fixture] admin: http://127.0.0.1:${actualPort}/hs/settings`)
  console.log('[fixture] stop with Ctrl+C; all catalogue writes disappear on exit')
})

function shutdown() {
  server.close(() => process.exit(0))
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

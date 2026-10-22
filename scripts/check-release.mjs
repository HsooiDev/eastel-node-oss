import { pathToFileURL } from 'node:url'

export function releaseChecks(stack, sha) {
  if (stack === 'php') return [
    { name: 'homepage', path: '/en/', http: 200, html: true },
    { name: 'customer login', path: '/account/login.html', http: 200, password: true },
    { name: 'admin login', path: '/hs/', finalPaths: ['/hs/index.php'], http: 200, password: true },
    { name: 'customer session', path: '/api/auth.php?action=check', http: 200, status: 'error', message: 'Not logged in' },
    { name: 'admin session', path: '/api/admin.php?action=get_admin_info', http: 401, status: 'error' },
    { name: 'database catalogue', path: '/api/plan-recommender.php', http: 200, status: 'success' },
  ]
  if (stack === 'node' && /^[a-f0-9]{40}$/i.test(sha || '')) return [
    { name: 'homepage', path: '/en', http: 200, html: true },
    { name: 'customer login', path: '/en/account/login', http: 200, password: true },
    { name: 'admin login', path: '/hs/login', http: 200, password: true },
    { name: 'customer session', path: '/api/auth/check', http: 401, status: 'error' },
    { name: 'admin authorization', path: '/api/admin/settings', http: 401, status: 'error' },
    { name: 'readiness', path: '/api/health', http: 200, status: 'healthy', sha },
    { name: 'liveness', path: '/api/health/live', http: 200, status: 'ok', sha },
  ]
  throw new Error('Select php or node; node requires the exact 40-character expected commit SHA')
}

export function validateReleaseURL(check, baseUrl, finalUrl) {
  try {
    const expected = new URL(check.path, baseUrl)
    const actual = new URL(finalUrl)
    const clean = path => path.replace(/\/$/, '') || '/'
    const paths = [expected.pathname, ...(check.finalPaths || [])].map(clean)
    return actual.origin === expected.origin && paths.includes(clean(actual.pathname))
      && [...expected.searchParams].every(([key, value]) => actual.searchParams.get(key) === value)
  } catch { return false }
}


export function validateReleaseResponse(check, status, contentType, body) {
  if (status !== check.http || !body.trim()) return false
  if (check.html || check.password) {
    return /text\/html/i.test(contentType) && /Eastel/i.test(body)
      && (!check.password || /type\s*=\s*["']password["']/i.test(body))
  }
  if (!/application\/json/i.test(contentType)) return false
  try {
    const data = JSON.parse(body)
    return data.status === check.status && (!check.message || data.message === check.message)
      && (!check.sha || data.buildId === check.sha)
  } catch { return false }
}

async function main() {
  const arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3)
  const base = new URL(arg('base-url') || '')
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Use a root HTTPS origin without credentials or query parameters')
  }
  const checks = releaseChecks(arg('stack'), arg('expected-sha'))
  let failed = 0
  for (const check of checks) {
    const url = new URL(check.path, base)
    url.searchParams.set('release_check', Date.now().toString())
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow', headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'EastelReleaseCheck/1.0' } })
      const body = await response.text()
      const ok = validateReleaseURL(check, base, response.url)
        && validateReleaseResponse(check, response.status, response.headers.get('content-type') || '', body)
      console.log((ok ? 'PASS' : 'FAIL') + ': ' + check.name + ' HTTP ' + response.status)
      if (!ok) failed++
    } catch {
      console.error('FAIL: ' + check.name + ' request failed')
      failed++
    }
  }
  if (failed) process.exitCode = 1
  else console.log('PASS: read-only release checks; real account login, payment, email and rollback are separate gates')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('FAIL: invalid release check arguments'); process.exitCode = 1 })
}

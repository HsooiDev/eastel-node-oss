import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRegistrationEarnings } from '../lib/earning-calculator.ts'
import { sanitizeLocalRedirect } from '../lib/safe-redirect.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

function sourceIncludes(relativePath, text) {
  assert.ok(read(relativePath).includes(text), `${relativePath} is missing: ${text}`)
}

function sourceExcludes(relativePath, text) {
  assert.ok(!read(relativePath).includes(text), `${relativePath} must not contain: ${text}`)
}

const fallback = '/ms/account/orders'
const validRedirects = [
  '/en/order',
  '/ms/account/orders?payment=failed#top',
  '/zh/plans?from=login',
]
for (const value of validRedirects) {
  assert.equal(sanitizeLocalRedirect(value, fallback), value, `valid redirect rejected: ${value}`)
}

const rejectedRedirects = [
  'https://evil.example/',
  '//evil.example/',
  'javascript:alert(1)',
  '/\\\\evil.example/',
  '/%2F%2Fevil.example/',
  '/%5C%5Cevil.example/',
  '/en/\u0000orders',
]
for (const value of rejectedRedirects) {
  assert.equal(sanitizeLocalRedirect(value, fallback), fallback, `unsafe redirect accepted: ${value}`)
}

const calculatorCases = [
  [10, 'new', 80],
  [11, 'mnp', 154],
  [50, 'mix', 625],
  [100, 'new', 1100],
  [101, 'new', 1313],
  [200, 'mnp', 4000],
  [201, 'new', 3015],
  [201, 'mnp', 5025],
  [500, 'mix', 10000],
]
for (const [count, type, expected] of calculatorCases) {
  assert.equal(getRegistrationEarnings(count, type), expected, `calculator boundary failed: ${count}/${type}`)
}

sourceIncludes('app/api/auth/register/route.ts', 'issueAccountVerification')
sourceIncludes('app/api/auth/register/route.ts', 'email_verified')
sourceIncludes('app/api/auth/login/route.ts', 'email_verified')
sourceIncludes('app/[locale]/account/(protected)/layout.tsx', 'if (!session.emailVerified)')
sourceExcludes('app/api/auth/verify-email/route.ts', 'used')
sourceExcludes('app/api/auth/resend-code/route.ts', 'used')
sourceIncludes('lib/seo-policy.ts', '"x-default"')
sourceIncludes('app/layout.tsx', '<html lang={documentLocale}')
sourceIncludes('lib/seo-policy.ts', '`/${locale}/account/`')
sourceIncludes('lib/seo-policy.ts', '"/hs"')
sourceIncludes('lib/seo-policy.ts', '"/uploads/"')

for (const relativePath of [
  'app/[locale]/track/page.tsx',
  'app/[locale]/terms/page.tsx',
  'app/[locale]/privacy/page.tsx',
  'app/[locale]/delivery/page.tsx',
  'app/[locale]/order/page.tsx',
  'app/[locale]/error.tsx',
  'app/[locale]/account/(protected)/layout.tsx',
]) {
  sourceExcludes(relativePath, '<main')
}

sourceExcludes('app/layout.tsx', 'staging.example.test')
sourceExcludes('app/[locale]/layout.tsx', 'staging.example.test')

for (const roamingId of [
  'ez-roam-7d',
  'ez-roam-15d',
  'ez-roam-30d',
  'ez-roam-explorer-16-7d',
  'ez-roam-explorer-16-15d',
  'ez-roam-global-10',
]) {
  sourceIncludes('lib/roaming-data.ts', `id: "${roamingId}"`)
}
sourceIncludes('lib/roaming-data.ts', 'data: "7GB"')
sourceIncludes('lib/roaming-data.ts', 'data: "15GB"')
sourceIncludes('app/[locale]/roaming/page.tsx', 'generateMetadata')
sourceIncludes('app/[locale]/roaming/page.tsx', 'ROAMING_PLANS')
sourceIncludes('app/[locale]/roaming/page.tsx', 'roaming.voiceSmsNote')
sourceIncludes('components/layout/header.tsx', 'navRoaming')
sourceIncludes('components/layout/footer.tsx', 'navRoaming')
sourceIncludes('lib/seo-policy.ts', '"/roaming"')
sourceIncludes('next.config.ts', 'getLegacyRedirects()')
sourceIncludes('lib/legacy-redirects.ts', 'source: "/hs/zones.php", destination: "/hs/zones"')
sourceIncludes('components/admin/sidebar.tsx', 'label: "Postcode Zones"')
sourceIncludes('components/admin/sidebar.tsx', 'href: "/hs/report", label: "Reports"')
sourceIncludes('components/admin/sidebar.tsx', 'router.replace("/hs/login")')
sourceIncludes('lib/plans-data.ts', 'bwTotal: "300GB"')

console.log(`Migration regression checks passed (${validRedirects.length} redirects, ${calculatorCases.length} calculator cases, roaming/source contracts).`)

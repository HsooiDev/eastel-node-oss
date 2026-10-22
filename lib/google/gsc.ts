// ─────────────────────────────────────────────────────────────
// Google Search Console API Client
// Uses service account OAuth2 via jose JWT assertion
// Requires GSC_SITE_URL and GSC_OAUTH_JSON env vars
// ─────────────────────────────────────────────────────────────

import { getAccessToken } from '@/lib/google/oauth2'

const GSC_API = 'https://www.googleapis.com/webmasters/v3'

export async function querySearchAnalytics(
  startDate: string,
  endDate: string,
  dimensions: string[] = ['query'],
  rowLimit = 25
) {
  const token = await getAccessToken('GSC_OAUTH_JSON')
  const siteUrl = process.env.GSC_SITE_URL
  if (!siteUrl) throw new Error('GSC_SITE_URL not configured')

  const body: Record<string, unknown> = {
    startDate,
    endDate,
    dimensions,
    rowLimit,
  }

  const res = await fetch(`${GSC_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`GSC API error: ${data.error?.message || res.statusText}`)

  return data.rows || []
}

export async function listSitemaps() {
  const token = await getAccessToken('GSC_OAUTH_JSON')
  const siteUrl = process.env.GSC_SITE_URL
  if (!siteUrl) throw new Error('GSC_SITE_URL not configured')

  const res = await fetch(`${GSC_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`GSC API error: ${data.error?.message || res.statusText}`)

  return data.sitemap || []
}

export async function getDashboardStats(startDate: string, endDate: string) {
  const siteUrl = process.env.GSC_SITE_URL
  if (!siteUrl) return null

  const [queries, pages, countries, overview] = await Promise.all([
    querySearchAnalytics(startDate, endDate, ['query'], 10),
    querySearchAnalytics(startDate, endDate, ['page'], 10),
    querySearchAnalytics(startDate, endDate, ['country'], 10),
    querySearchAnalytics(startDate, endDate, ['date']),
  ])

  return { queries, pages, countries, overview }
}

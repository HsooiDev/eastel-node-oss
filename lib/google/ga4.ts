// ─────────────────────────────────────────────────────────────
// GA4 Data API Client
// Uses service account OAuth2 via jose JWT assertion
// Requires GA4_PROPERTY_ID and GA4_OAUTH_JSON env vars
// ─────────────────────────────────────────────────────────────

import { getAccessToken } from '@/lib/google/oauth2'

const GA4_API = 'https://analyticsdata.googleapis.com/v1beta'

interface ReportRequest {
  propertyId: string
  startDate: string
  endDate: string
  metrics: Array<{ name: string }>
  dimensions?: Array<{ name: string }>
  orderBys?: Array<{ dimension?: { dimensionName: string }; metric?: { metricName: string }; desc?: boolean }>
  limit?: number
}

export async function runReport(params: ReportRequest) {
  const token = await getAccessToken('GA4_OAUTH_JSON')
  const propertyId = params.propertyId || process.env.GA4_PROPERTY_ID
  if (!propertyId) throw new Error('GA4_PROPERTY_ID not configured')

  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
    metrics: params.metrics,
    dimensionFilter: { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: 'eastel.site', caseSensitive: false } } },
  }

  if (params.dimensions?.length) body.dimensions = params.dimensions
  if (params.orderBys?.length) body.orderBys = params.orderBys
  if (params.limit) body.limit = params.limit

  const res = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`GA4 API error: ${data.error?.message || res.statusText}`)

  // Transform to simplified format
  const rows: Array<Record<string, string | number>> = []
  if (data.rows) {
    for (const row of data.rows) {
      const r: Record<string, string | number> = {}
      if (row.dimensionValues && params.dimensions) {
        for (let i = 0; i < params.dimensions.length; i++) {
          r[params.dimensions[i].name] = row.dimensionValues[i]?.value || ''
        }
      }
      if (row.metricValues) {
        for (let i = 0; i < params.metrics.length; i++) {
          r[params.metrics[i].name] = row.metricValues[i]?.value || '0'
        }
      }
      rows.push(r)
    }
  }

  return {
    rows,
    rowCount: data.rowCount || 0,
    totals: data.totals ? data.totals.map((t: { metricValues: Array<{ value: string }> }) =>
      t.metricValues.map((v) => v.value)
    ) : [],
  }
}

export async function getDashboardStats(startDate: string, endDate: string) {
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) return null

  const [overview, topPages, devices, geo] = await Promise.all([
    runReport({
      propertyId, startDate, endDate,
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' }],
    }),
    runReport({
      propertyId, startDate, endDate,
      metrics: [{ name: 'screenPageViews' }],
      dimensions: [{ name: 'pagePath' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    }),
    runReport({
      propertyId, startDate, endDate,
      metrics: [{ name: 'sessions' }],
      dimensions: [{ name: 'deviceCategory' }],
    }),
    runReport({
      propertyId, startDate, endDate,
      metrics: [{ name: 'sessions' }],
      dimensions: [{ name: 'country' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
  ])

  return { overview, topPages, devices, geo }
}

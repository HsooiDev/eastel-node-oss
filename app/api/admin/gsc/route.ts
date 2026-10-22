// ─────────────────────────────────────────────────────────────
// GET /api/admin/gsc
// Google Search Console dashboard data
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import { requireAdmin, success, error } from '../_helpers'
import { getDashboardStats } from '@/lib/google/gsc'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) return error('Not authenticated.', 401)

    if (!process.env.GSC_SITE_URL || !process.env.GSC_OAUTH_JSON) {
      return success({ configured: false, message: 'GSC not configured. Set GSC_SITE_URL and GSC_OAUTH_JSON.' })
    }

    const url = new URL(request.url)
    const days = parseInt(url.searchParams.get('days') || '30', 10)
    const endDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10) // GSC data lags 2-3 days
    const startDate = new Date(Date.now() - (days + 3) * 86400000).toISOString().slice(0, 10)

    const data = await getDashboardStats(startDate, endDate)

    return success({ configured: true, startDate, endDate, ...data })
  } catch (e) {
    console.error('GSC dashboard error:', e)
    return error(e instanceof Error ? e.message : 'GSC request failed.', 500)
  }
}

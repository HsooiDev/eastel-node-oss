// ─────────────────────────────────────────────────────────────
// GET /api/admin/ga4
// Google Analytics 4 dashboard data
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import { requireAdmin, success, error } from '../_helpers'
import { getDashboardStats } from '@/lib/google/ga4'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) return error('Not authenticated.', 401)

    if (!process.env.GA4_PROPERTY_ID || !process.env.GA4_OAUTH_JSON) {
      return success({ configured: false, message: 'GA4 not configured. Set GA4_PROPERTY_ID and GA4_OAUTH_JSON.' })
    }

    const url = new URL(request.url)
    const days = parseInt(url.searchParams.get('days') || '30', 10)
    const endDate = new Date().toISOString().slice(0, 10)
    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

    const data = await getDashboardStats(startDate, endDate)

    return success({ configured: true, startDate, endDate, ...data })
  } catch (e) {
    console.error('GA4 dashboard error:', e)
    return error(e instanceof Error ? e.message : 'GA4 request failed.', 500)
  }
}

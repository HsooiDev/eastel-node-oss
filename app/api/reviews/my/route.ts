// ─────────────────────────────────────────────────────────────
// GET /api/reviews/my
// Fetch the authenticated customer's own reviews
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { requireSession, success, error } from '@/app/api/auth/_helpers'
import { safeInt } from '@/lib/db-helpers'
import type { RowDataPacket } from 'mysql2/promise'

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession()
    if (!session) {
      return error('Authentication required.', 401)
    }

    const { searchParams } = request.nextUrl
    const page = safeInt(searchParams.get('page'), 1, 1, 10000)
    const perPage = safeInt(searchParams.get('per_page'), 20, 1, 50)
    const offset = (page - 1) * perPage

    const [countRows] = await db.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM reviews WHERE customer_id = ?',
      [session.customerId]
    )
    const total = countRows[0]?.total ?? 0

    const [reviews] = await db.query<RowDataPacket[]>(
      `SELECT
         r.id, r.order_id, NULL AS product_id, r.rating, r.review_text AS comment,
         r.status, r.created_at,
         'Eastel SIM (single-SIM order)' AS product_name
       FROM reviews r
       WHERE r.customer_id = ?
       ORDER BY r.created_at DESC
       LIMIT ${perPage} OFFSET ${offset}`,
      [session.customerId]
    )

    return success({
      reviews,
      meta: {
        total,
        page,
        per_page: perPage,
        total_pages: Math.ceil(total / perPage),
      },
    })
  } catch (e) {
    console.error('Fetch my reviews error:', e)
    return error('Failed to load reviews.', 500)
  }
}

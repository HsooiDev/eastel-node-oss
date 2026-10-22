// ─────────────────────────────────────────────────────────────
// GET /api/reviews/public
// Fetch approved reviews for public display
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error } from '@/app/api/auth/_helpers'
import { safeInt } from '@/lib/db-helpers'
import type { RowDataPacket } from 'mysql2/promise'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const limit = safeInt(searchParams.get('limit'), 10, 1, 50)
    const [reviews] = await db.query<RowDataPacket[]>(`SELECT
        r.id, r.rating, r.review_text AS comment, r.created_at, r.categories,
        CASE WHEN r.display_mode = 'private' THEN 'Anonymous Customer'
             ELSE COALESCE(NULLIF(r.display_name, ''), 'Eastel Customer') END AS customer_name,
        'Eastel SIM (single-SIM order)' AS product_name
      FROM reviews r WHERE r.status = 'approved'
      ORDER BY r.created_at DESC, r.id DESC LIMIT ${limit}`)

    return success({ reviews, total: reviews.length })
  } catch (e) {
    console.error('Public reviews error:', e)
    return error('Failed to load reviews.', 503)
  }
}

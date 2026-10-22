// ─────────────────────────────────────────────────────────────
// GET /api/reviews/[id]
// Fetch a single review by ID
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error } from '@/app/api/auth/_helpers'
import type { RowDataPacket } from 'mysql2/promise'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const reviewId = parseInt(id, 10)
    if (!Number.isFinite(reviewId) || reviewId <= 0) {
      return error('Invalid review ID.')
    }

    const [reviews] = await db.query<RowDataPacket[]>(
      `SELECT
         r.id, r.rating, r.review_text AS comment, r.status, r.created_at,
         CASE WHEN r.display_mode = 'private' THEN 'Anonymous Customer' ELSE COALESCE(NULLIF(r.display_name, ''), 'Eastel Customer') END AS customer_name,
         'Eastel SIM (single-SIM order)' AS product_name, NULL AS product_id, r.categories
       FROM reviews r
       WHERE r.id = ? AND r.status = 'approved'
       LIMIT 1`,
      [reviewId]
    )

    if (reviews.length === 0) {
      return error('Review not found.', 404)
    }

    const [photos] = await db.query<RowDataPacket[]>(
      'SELECT id, file_path FROM review_photos WHERE review_id = ? ORDER BY sort_order, id',
      [reviewId]
    )

    return success({
      review: { ...reviews[0], photos: photos.map((p) => ({ id: p.id, url: p.file_path })) },
    })
  } catch (e) {
    console.error('Fetch review error:', e)
    return error('Failed to load review.', 500)
  }
}

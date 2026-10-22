// ─────────────────────────────────────────────────────────────
// POST /api/reviews/submit
// Submit a product review for a completed order
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { requireSession, success, error, getClientIp } from '@/app/api/auth/_helpers'
import { verifyTurnstile } from '@/lib/turnstile'
import { checkRateLimit } from '@/lib/rate-limit'
import { formatDate } from '@/lib/db-helpers'
import { reviewSchema, validate } from '@/lib/validation'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession()
    if (!session) {
      return error('Authentication required.', 401)
    }

    const ip = getClientIp(request)

    const rl = checkRateLimit(`review:${ip}`, 10, 60 * 60 * 1000)
    if (!rl.allowed) {
      return error('Too many review submissions. Please try again later.', 429)
    }

    const body = await request.json()

    if (!(await verifyTurnstile(body.turnstileToken ?? body['cf-turnstile-response'], ip))) {
      return error('Security check failed.')
    }

    const parsed = validate(reviewSchema, body)
    if (!parsed.success) {
      return error(parsed.errors?.['_form'] || Object.values(parsed.errors ?? {})[0] || 'Validation failed.')
    }
    const { order_id, rating, comment, display_mode, display_name, categories, photo_url } = parsed.data
    const connection = await db.getConnection()
    let reviewId: number
    try {
      await connection.beginTransaction()
      // Lock the owned order so concurrent submissions cannot both pass the
      // one-review-per-order check. PHP reviews require a delivered order.
      const [orders] = await connection.query<RowDataPacket[]>(
        'SELECT id, order_status FROM orders WHERE id = ? AND customer_id = ? LIMIT 1 FOR UPDATE',
        [order_id, session.customerId]
      )
      if (orders.length === 0 || orders[0].order_status !== 'delivered') {
        await connection.rollback()
        return error(orders.length === 0 ? 'Order not found.' : 'You can only review delivered orders.')
      }
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM reviews WHERE order_id = ? LIMIT 1', [order_id]
      )
      if (existing.length > 0) {
        await connection.rollback()
        return error('You have already reviewed this order.')
      }
      const publicName = (display_name || session.name || 'Eastel Customer').slice(0, 40)
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO reviews (customer_id, order_id, rating, review_text, display_mode, display_name, categories, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [session.customerId, order_id, rating, comment, display_mode,
         display_mode === 'private' ? '' : publicName, JSON.stringify(categories), 'pending', formatDate()]
      )
      reviewId = result.insertId
      if (photo_url) {
        await connection.execute(
          'INSERT INTO review_photos (review_id, file_path, sort_order) VALUES (?, ?, 0)', [reviewId, photo_url]
        )
      }
      await connection.commit()
    } catch (e) {
      await connection.rollback()
      throw e
    } finally {
      connection.release()
    }

    return success({
      review_id: reviewId,
      message: 'Review submitted successfully. It will be visible after moderation.',
    })
  } catch (e) {
    console.error('Review submission error:', e)
    return error('Failed to submit review. Please try again.', 500)
  }
}

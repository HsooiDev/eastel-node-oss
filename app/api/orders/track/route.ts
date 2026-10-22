// ─────────────────────────────────────────────────────────────
// POST /api/orders/track — guest order lookup (no login needed)
// Input:  { order_ref, phone }
// Output: limited, non-sensitive order status fields only.
// Rate-limited per IP to prevent enumeration.
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error, getClientIp } from '@/app/api/auth/_helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import type { RowDataPacket } from 'mysql2/promise'

/** Compare phones loosely: last 9 digits (tolerates +60 / 60 / 0 prefixes). */
function phoneMatches(stored: string | null, input: string): boolean {
  const a = String(stored || '').replace(/\D/g, '')
  const b = String(input || '').replace(/\D/g, '')
  if (a.length < 9 || b.length < 9) return false
  return a.slice(-9) === b.slice(-9)
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const rl = checkRateLimit(`track:${ip}`, 10, 15 * 60 * 1000)
    if (!rl.allowed) return error('Too many attempts. Try again later.', 429)

    const body = await request.json().catch(() => ({}))
    const orderRef = String(body.order_ref || '').trim().toUpperCase()
    const phone = String(body.phone || '').trim()

    if (!orderRef || orderRef.length > 50 || !phone) {
      return error('Order reference and phone number are required.')
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT o.order_ref, o.phone, o.order_status, o.payment_status,
              o.tracking_number, o.created_at,
              COALESCE(cr.name, o.courier_name) AS courier_name
       FROM orders o
       LEFT JOIN couriers cr ON cr.id = o.courier_id
       WHERE o.order_ref = ? LIMIT 1`,
      [orderRef]
    )

    const o = rows[0]
    if (!o || !phoneMatches(o.phone, phone)) {
      // Same message for both cases — don't reveal which field was wrong.
      return error('No order found for that reference and phone number.', 404)
    }

    return success({
      order: {
        order_ref: o.order_ref,
        order_status: o.order_status,
        payment_status: o.payment_status,
        courier_name: o.courier_name,
        tracking_number: o.tracking_number,
        created_at: o.created_at,
      },
    })
  } catch (e) {
    console.error('[orders/track] failed:', e)
    return error('Lookup failed. Please try again.', 500)
  }
}

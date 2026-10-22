// ─────────────────────────────────────────────────────────────
// GET /api/orders/my
// List the authenticated customer's orders
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
    if (!session.emailVerified) {
      return error('Please verify your email to view orders.', 403)
    }

    const { searchParams } = request.nextUrl
    const page = safeInt(searchParams.get('page'), 1, 1, 10000)
    const perPage = safeInt(searchParams.get('per_page'), 20, 1, 50)
    const offset = (page - 1) * perPage
    const eligibility = searchParams.get('reviewable') === '1'
      ? " AND order_status = 'delivered' AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.order_id = orders.id)"
      : ''

    const [countRows] = await db.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?${eligibility}`,
      [session.customerId]
    )
    const total = countRows[0]?.total ?? 0

    const [orders] = await db.query<RowDataPacket[]>(
      `SELECT id, order_ref, NULL AS product_id, 1 AS quantity, sim_fee AS unit_price, sim_fee, delivery_fee,
              plan_fee, plan_snapshot, plan_fulfilled_at, voucher_code, voucher_discount,
              total_amount, payment_status, order_status, tracking_number,
              bill_code, full_name, phone, delivery_address,
              postcode, state, zone, NULL AS notes,
              created_at, updated_at
       FROM orders
       WHERE customer_id = ?${eligibility}
       ORDER BY created_at DESC, id DESC
       LIMIT ${perPage} OFFSET ${offset}`,
      [session.customerId]
    )

    const response = success({
      orders,
      meta: {
        total,
        page,
        per_page: perPage,
        total_pages: Math.ceil(total / perPage),
      },
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (e) {
    console.error('Fetch orders error:', e)
    return error('Failed to load orders.', 500)
  }
}

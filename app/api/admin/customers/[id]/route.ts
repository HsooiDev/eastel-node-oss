// ─────────────────────────────────────────────────────────────
// GET /api/admin/customers/[id]
// Fetch customer detail with orders and reviews
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { requireAdmin, success, error } from '../../_helpers'
import type { RowDataPacket } from 'mysql2/promise'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin()
    if (!session) return error('Not authenticated.', 401)

    const { id } = await params
    const customerId = parseInt(id, 10)
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return error('Invalid customer ID.')
    }

    // Fetch customer
    const [customers] = await db.query<RowDataPacket[]>(
      'SELECT * FROM `customers` WHERE `id` = ? LIMIT 1',
      [customerId]
    )
    if (customers.length === 0) {
      return error('Customer not found.', 404)
    }
    const customer = customers[0]

    // Fetch orders
    const [orders] = await db.query<RowDataPacket[]>(
      `SELECT o.order_ref, o.payment_status, o.order_status,
              o.courier_name, o.delivery_address, o.postcode, o.zone,
              o.total_amount, o.tracking_number, o.created_at,
              'Eastel SIM (single-SIM order)' AS product_name
       FROM \`orders\` o
       WHERE o.\`customer_id\` = ?
       ORDER BY o.\`created_at\` DESC
       LIMIT 50`,
      [customerId]
    )

    // Fetch reviews
    const [reviews] = await db.query<RowDataPacket[]>(
      `SELECT r.*, r.review_text AS comment, 'Eastel SIM (single-SIM order)' AS product_name
       FROM \`reviews\` r
       WHERE r.\`customer_id\` = ?
       ORDER BY r.\`created_at\` DESC
       LIMIT 50`,
      [customerId]
    )

    // Fetch latest email verification code (for admin support use)
    let verifyCode: Record<string, unknown> | null = null
    try {
      const [vcRows] = await db.query<RowDataPacket[]>(
        `SELECT code, verified, expires_at
         FROM \`email_verifications\`
         WHERE email = ?
         ORDER BY expires_at DESC LIMIT 1`,
        [customer.email]
      )
      if (vcRows.length > 0) {
        const vc = vcRows[0]
        verifyCode = {
          code: vc.code,
          verified: vc.verified,
          expires_at: vc.expires_at,
          is_expired: new Date(vc.expires_at) < new Date(),
          is_verified: Number(vc.verified) === 1,
        }
      }
    } catch {
      // Table may not exist on older installs; silently skip
    }

    return success({
      customer: {
        ...customer,
        password_hash: undefined,
        reset_token: undefined,
        reset_expires: undefined,
      },
      orders,
      reviews,
      verify_code: verifyCode,
    })
  } catch (e) {
    console.error('Customer detail error:', e)
    return error('Failed to load customer.', 500)
  }
}

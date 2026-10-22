import { csvText } from '@/lib/csv'
// ─────────────────────────────────────────────────────────────
// GET /api/admin/reports/export?type=orders|customers|reviews
// Export CSV data for reports
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { requireAdmin, error } from '../../_helpers'
import type { RowDataPacket } from 'mysql2/promise'

function csvResponse(header: string[], rows: RowDataPacket[]): NextResponse {
  const numeric = new Set(['quantity', 'unit_price', 'delivery_fee', 'total_amount', 'order_count', 'total_spent', 'rating'])
  const csv = [header.join(','), ...rows.map((r) => header.map((h) => numeric.has(h) ? (r[h] != null && Number.isFinite(Number(r[h])) ? String(Number(r[h])) : '') : csvText(r[h])).join(','))].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=export-${new Date().toISOString().slice(0, 10)}.csv`,
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) return error('Not authenticated.', 401)

    const url = new URL(request.url)
    const type = url.searchParams.get('type') || 'orders'

    switch (type) {
      case 'orders': {
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT o.order_ref, 1 AS quantity, o.sim_fee AS unit_price, o.delivery_fee, o.total_amount,
                  o.payment_status, o.order_status, o.tracking_number,
                  o.full_name, o.phone, o.delivery_address,
                  o.postcode, o.state, o.zone,
                  o.created_at, c.name AS customer_name, c.email AS customer_email,
                  'Eastel SIM (single-SIM order)' AS product_name
           FROM orders o
           LEFT JOIN customers c ON c.id = o.customer_id
           ORDER BY o.created_at DESC LIMIT 10000`
        )
        return csvResponse([
          'order_ref', 'quantity', 'unit_price', 'delivery_fee', 'total_amount',
          'payment_status', 'order_status', 'tracking_number',
          'full_name', 'phone', 'delivery_address',
          'postcode', 'state', 'zone',
          'created_at', 'customer_name', 'customer_email', 'product_name',
        ], rows)
      }

      case 'customers': {
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT c.name, c.email, c.phone, c.address, c.postcode, c.state,
                  c.created_at, COUNT(o.id) AS order_count,
                  COALESCE(SUM(o.total_amount), 0) AS total_spent
           FROM customers c
           LEFT JOIN orders o ON o.customer_id = c.id
           GROUP BY c.id
           ORDER BY c.created_at DESC LIMIT 10000`
        )
        return csvResponse([
          'name', 'email', 'phone', 'address', 'postcode', 'state',
          'created_at', 'order_count', 'total_spent',
        ], rows)
      }

      case 'reviews': {
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT r.rating, r.review_text AS comment, r.status, r.created_at,
                  c.name AS customer_name, c.email AS customer_email,
                  'Eastel SIM (single-SIM order)' AS product_name
           FROM reviews r
           JOIN customers c ON c.id = r.customer_id
           ORDER BY r.created_at DESC LIMIT 10000`
        )
        return csvResponse([
          'rating', 'comment', 'status', 'created_at',
          'customer_name', 'customer_email', 'product_name',
        ], rows)
      }

      case 'whatsapp': {
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT phone, contact_name, direction, message, msg_id, created_at
           FROM wa_conversations ORDER BY created_at DESC LIMIT 10000`
        )
        return csvResponse([
          'phone', 'contact_name', 'direction', 'message', 'msg_id', 'created_at',
        ], rows)
      }

      default:
        return error('Invalid export type. Use: orders, customers, reviews, whatsapp.')
    }
  } catch (e) {
    console.error('Export error:', e)
    return error('Export failed.', 500)
  }
}

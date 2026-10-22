import type { NextRequest } from 'next/server'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import db from '@/lib/db'
import { formatDate } from '@/lib/db-helpers'
import { getOrderPlanSnapshot } from '@/lib/order-plan'
import { ensureOrderPlanColumns } from '@/lib/migrate'
import { requireAdminCsrf, success, error } from '../../_helpers'
import { getClientIp } from '@/app/api/auth/_helpers'

/** Record the merchant's manual App purchase. This never purchases or activates a plan. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request)
    if (!session) return error('Not authenticated.', 401)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return error('Invalid request body.')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Invalid request body.')
    const rawId = (body as Record<string, unknown>).order_id
    if ((typeof rawId !== 'number' && typeof rawId !== 'string') || !/^[1-9]\d*$/.test(String(rawId))) return error('Invalid order ID.')
    const orderId = Number(rawId)
    if (!Number.isSafeInteger(orderId) || orderId > 2147483647) return error('Invalid order ID.')

    await ensureOrderPlanColumns()
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id, order_ref, payment_status, order_status, plan_snapshot, plan_fee,
                plan_fulfilled_at, plan_fulfilled_by
         FROM orders WHERE id = ? LIMIT 1 FOR UPDATE`,
        [orderId]
      )
      const order = rows[0]
      if (!order) {
        await connection.rollback()
        return error('Order not found.', 404)
      }
      const planSnapshot = getOrderPlanSnapshot(order.plan_snapshot)
      if (!planSnapshot) {
        await connection.rollback()
        return error('This order has no valid mobile plan purchase.', 409)
      }
      if (Number(order.plan_fee) !== planSnapshot.plan.price) {
        await connection.rollback()
        return error('The recorded mobile plan fee is inconsistent. Review this order before fulfillment.', 409)
      }
      if (order.payment_status !== 'paid' || order.order_status === 'cancelled') {
        await connection.rollback()
        return error('Only paid, active orders can have a mobile plan fulfilled.', 409)
      }
      if (order.plan_fulfilled_at) {
        await connection.commit()
        return success({
          order_id: orderId,
          already_fulfilled: true,
          plan_fulfilled_at: order.plan_fulfilled_at,
          plan_fulfilled_by: order.plan_fulfilled_by,
        })
      }

      const fulfilledAt = formatDate()
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE orders SET plan_fulfilled_at = ?, plan_fulfilled_by = ?, updated_at = ?
         WHERE id = ? AND payment_status = 'paid' AND order_status <> 'cancelled'
           AND plan_snapshot IS NOT NULL AND plan_fulfilled_at IS NULL`,
        [fulfilledAt, session.customerId, fulfilledAt, orderId]
      )
      if (result.affectedRows !== 1) {
        await connection.rollback()
        return error('The order changed. Reload it before recording plan fulfillment.', 409)
      }
      // Keep the audit and fulfilment atomic so a failed audit cannot leave an
      // untraceable purchase record. Duplicate requests never add another row.
      await connection.execute<ResultSetHeader>(
        `INSERT INTO admin_audit_log
           (admin_id, action, target_table, target_id, old_value, new_value, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [session.customerId, 'fulfill_order_plan', 'orders', orderId,
         JSON.stringify({ plan_fulfilled_at: null, plan_fulfilled_by: null }),
         JSON.stringify({ plan_id: planSnapshot.plan.id, plan_fee: Number(order.plan_fee), plan_fulfilled_at: fulfilledAt, plan_fulfilled_by: session.customerId }),
         getClientIp(request)]
      )
      await connection.commit()
      return success({
        order_id: orderId,
        already_fulfilled: false,
        plan_fulfilled_at: fulfilledAt,
        plan_fulfilled_by: session.customerId,
      })
    } catch (dbError) {
      await connection.rollback()
      throw dbError
    } finally {
      connection.release()
    }
  } catch (fulfillError) {
    console.error('[orders/fulfill-plan]', fulfillError)
    return error('Failed to record mobile plan fulfillment.', 500)
  }
}

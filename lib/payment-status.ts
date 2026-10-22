// ─────────────────────────────────────────────────────────────
// Order payment-status transitions
//
// Shared by payment/callback, payment/check-payment and
// payment/return so every route applies the same rules:
//   - transitions are conditional UPDATEs (race-safe under
//     duplicate ToyyibPay callbacks / concurrent polling)
//   - side effects (notifications) belong to
//     the request that WINS the transition — callers must check
//     the return value before firing them
// ─────────────────────────────────────────────────────────────

import db from '@/lib/db'
import { formatDate } from '@/lib/db-helpers'
import type { ResultSetHeader } from 'mysql2/promise'

/** Prior status the order was transitioned from, or 'none' if another request already processed it. */
export type PaidTransition = 'pending' | 'failed' | 'none'

/**
 * Atomically mark an order as paid.
 *
 * Handles both legitimate paths:
 *   pending → paid  (normal flow)
 *   failed  → paid  (customer retried via the still-active ToyyibPay bill
 *                    after the order was marked failed)
 *
 * PHP orders have no product foreign key; inventory is not inferred from them.
 */
export async function transitionOrderToPaid(
  billCode: string,
  toyyibpayRef: string | null
): Promise<PaidTransition> {
  const now = formatDate()

  const [pendingRes] = await db.execute<ResultSetHeader>(
    `UPDATE orders
        SET payment_status = 'paid', order_status = 'processing', toyyibpay_ref = ?, updated_at = ?
      WHERE bill_code = ? AND payment_status = 'pending'`,
    [toyyibpayRef, now, billCode]
  )
  if (pendingRes.affectedRows > 0) return 'pending'

  const [failedRes] = await db.execute<ResultSetHeader>(
    `UPDATE orders
        SET payment_status = 'paid', order_status = 'processing', toyyibpay_ref = ?, updated_at = ?
      WHERE bill_code = ? AND payment_status = 'failed'`,
    [toyyibpayRef, now, billCode]
  )
  if (failedRes.affectedRows > 0) {
    return 'failed'
  }

  return 'none'
}

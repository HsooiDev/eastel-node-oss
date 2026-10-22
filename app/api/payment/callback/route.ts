// ─────────────────────────────────────────────────────────────
// POST /api/payment/callback
// ToyyibPay webhook — receives payment status notifications
//
// SECURITY: Never trusts status_id from the webhook payload.
// Always verifies real status via ToyyibPay getBillTransactions API.
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { formatDate } from '@/lib/db-helpers'
import { getBillTransactions } from '@/lib/toyyibpay'
import { transitionOrderToPaid } from '@/lib/payment-status'
import { sendOrderConfirmedOnce } from '@/lib/email'
import { notifyTelegramOrderPaid, notifyTelegramOrderFailed } from '@/lib/telegram/notifications'
import { sendText } from '@/lib/whatsapp/client'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'

const BILL_CODE_RE = /^[a-zA-Z0-9]{4,30}$/

// ── POST Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const billCode = (formData.get('billcode') as string | null)?.trim() ?? ''
    const transactionId = (formData.get('transaction_id') as string | null)?.trim() ?? ''

    // ── Validate billcode format ───────────────────────────
    if (!billCode || !BILL_CODE_RE.test(billCode)) {
      return new Response('Invalid billcode', { status: 400 })
    }

    // ── Verify real status via ToyyibPay API ───────────────
    // NEVER trust status_id from the webhook — an attacker could forge it.
    let realStatus = 0
    let verifiedTransactionId = ''

    try {
      const txns = await getBillTransactions(billCode)

      for (const txn of txns) {
        const txnStatus = parseInt(String(txn.billpaymentStatus), 10)
        if (txnStatus === 1) {
          realStatus = 1
          verifiedTransactionId = txn.billpaymentInvoiceNo || txn.billpaymentid
          break
        }
        if (txnStatus === 3 && realStatus !== 1) {
          realStatus = 3
        }
      }
    } catch (verifyErr) {
      console.error('Callback: ToyyibPay verification failed:', verifyErr)
    }

    if (realStatus !== 1 && realStatus !== 3) {
      return new Response('OK - Pending or Unverifiable', { status: 200 })
    }

    // ── Find order by bill code ─────────────────────────────
    const [orders] = await db.query<RowDataPacket[]>(
      'SELECT id, order_ref, payment_status, order_status, source, phone, lang, full_name FROM orders WHERE bill_code = ? LIMIT 1',
      [billCode]
    )

    if (orders.length === 0) {
      console.error('Callback: order not found for bill_code:', billCode)
      return new Response('Order not found', { status: 404 })
    }

    const order = orders[0]

    // ── Idempotency check ───────────────────────────────────
    // A failed order can still become paid: the ToyyibPay bill stays
    // payable and customers are offered a retry link — so only
    // short-circuit failed orders when the new status is also failed.
    if (order.payment_status === 'paid') {
      return new Response('OK - Already processed', { status: 200 })
    }
    if (order.payment_status === 'failed' && realStatus === 3) {
      return new Response('OK - Already processed', { status: 200 })
    }

    // ── Update order ────────────────────────────────────────
    const now = formatDate()
    const ref = verifiedTransactionId || transactionId || null

    if (realStatus === 1) {
      // Race-safe transition (handles pending→paid and failed→paid with
      // retry handling). Only the request that wins the transition may
      // fire side effects (notifications).
      const transition = await transitionOrderToPaid(billCode, ref)

      if (transition === 'none') {
        return new Response('OK - Already processed', { status: 200 })
      }

      // ── Send confirmation email (atomic — won't double-send) ──
      sendOrderConfirmedOnce(billCode).catch((e) =>
        console.error('Callback: sendOrderConfirmedOnce failed:', e)
      )

      // ── Telegram admin notification ───────────────────────
      notifyTelegramOrderPaid(billCode).catch((e) =>
        console.error('Callback: Telegram notify failed:', e)
      )

      // ── WhatsApp confirmation for WA-sourced orders ───────
      if (order.source === 'whatsapp' && order.phone) {
        const lang = order.lang || 'en'
        let waMsg = `Payment confirmed! ✅ Your order ${order.order_ref} has been received and is being processed. We will update you once it ships.`
        if (lang === 'ms') waMsg = `Pembayaran berjaya! ✅ Pesanan ${order.order_ref} anda telah diterima dan sedang diproses. Kami akan maklumkan setelah penghantaran dibuat.`
        if (lang === 'zh') waMsg = `付款成功！✅ 您的订单 ${order.order_ref} 已收到并正在处理中。我们将在发货后通知您。`
        sendText(order.phone, waMsg).then(async (messageId) => {
          const localDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date())
          try {
            await db.execute(
              "INSERT INTO whatsapp_logs (phone, contact_name, direction, message, msg_type, is_ai, msg_id, local_date) VALUES (?, ?, 'out', ?, 'text', 0, ?, ?)",
              [order.phone, order.full_name || '', waMsg, messageId, localDate]
            )
          } catch (e) {
            console.error('Callback: WA confirmation log failed:', e)
          }
          try {
            await db.execute(
              "INSERT INTO wa_conversations (phone, contact_name, direction, message, msg_id, local_date) VALUES (?, ?, 'out', ?, ?, ?)",
              [order.phone, order.full_name || '', waMsg, messageId, localDate]
            )
          } catch (e) {
            console.error('Callback: WA confirmation conversation failed:', e)
          }
        }).catch((e) =>
          console.error('Callback: WA confirmation failed:', e)
        )
      }
    } else {
      // realStatus === 3
      // Only the winning transition releases vouchers and sends notifications.
      const [updResult] = await db.execute<ResultSetHeader>(
        `UPDATE orders
            SET payment_status = ?, order_status = ?, updated_at = ?
          WHERE id = ? AND CAST(bill_code AS BINARY) = CAST(? AS BINARY) AND payment_status = 'pending'`,
        ['failed', 'cancelled', now, order.id, billCode]
      )

      if (updResult.affectedRows === 0) {
        return new Response('OK - Already processed', { status: 200 })
      }


      // A failed attempt does not cancel its payable bill. Keep its voucher
      // reserved so another discounted order cannot reuse the entitlement.

      // ── Telegram admin notification ───────────────────────
      notifyTelegramOrderFailed(billCode).catch((e) =>
        console.error('Callback: Telegram notify failed:', e)
      )

      // ── WhatsApp failure notification for WA-sourced orders ──
      if (order.source === 'whatsapp' && order.phone) {
        const lang = order.lang || 'en'
        let waMsg = `Your payment was not successful (Order: ${order.order_ref}). Please try again or contact us for assistance.`
        if (lang === 'ms') waMsg = `Pembayaran anda tidak berjaya (No. Pesanan: ${order.order_ref}). Sila cuba semula atau hubungi kami untuk bantuan.`
        if (lang === 'zh') waMsg = `您的付款未能处理（订单编号：${order.order_ref}）。请重新点击付款链接再试，或联系我们寻求协助。`
        sendText(order.phone, waMsg).catch((e) =>
          console.error('Callback: WA failure notification failed:', e)
        )
      }
    }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('Payment callback error:', e)
    return new Response('Internal error', { status: 500 })
  }
}

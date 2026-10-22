import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { error } from '@/app/api/auth/_helpers'
import { getBillTransactions } from '@/lib/toyyibpay'
import { transitionOrderToPaid } from '@/lib/payment-status'
import { sendOrderConfirmedOnce } from '@/lib/email'
import { notifyTelegramOrderPaid } from '@/lib/telegram/notifications'
import { formatDate } from '@/lib/db-helpers'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'

export async function POST(request: NextRequest) {
  try {
    const { bill_code } = await request.json()
    if (!bill_code || !/^[a-zA-Z0-9]+$/.test(bill_code)) {
      return error('Invalid bill_code.')
    }

    const [orders] = await db.query<RowDataPacket[]>(
      'SELECT order_ref, payment_status FROM orders WHERE bill_code = ? LIMIT 1',
      [bill_code]
    )
    if (orders.length === 0) return error('Order not found.', 404)
    if (orders[0].payment_status === 'paid') {
      return NextResponse.json({ status: 'ok', paid: true, pay_url: null })
    }

    const txns = await getBillTransactions(bill_code)
    let paid = false
    let failed = false
    let txnId = ''
    for (const txn of txns) {
      const s = Number(txn.billpaymentStatus)
      if (s === 1) {
        paid = true
        txnId = txn.billpaymentInvoiceNo || txn.billpaymentid
        break
      }
      if (s === 3 && !paid) failed = true
    }

    if (paid) {
      // Notifications belong only to the writer that wins the transition.
      const transition = await transitionOrderToPaid(bill_code, txnId)
      if (transition !== 'none') {
        sendOrderConfirmedOnce(bill_code).catch(console.error)
        notifyTelegramOrderPaid(bill_code).catch(console.error)
      }
    } else if (failed) {
      await db.execute<ResultSetHeader>(
        'UPDATE orders SET payment_status="failed", order_status="cancelled", updated_at=? WHERE bill_code=? AND payment_status="pending"',
        [formatDate(), bill_code]
      )
      // The original bill remains payable: retain its voucher reservation.
    }

    // Provider status alone does not prove this bill is still attached and saved.
    const [current] = await db.query<RowDataPacket[]>(
      'SELECT order_ref, payment_status FROM orders WHERE bill_code = ? LIMIT 1',
      [bill_code]
    )
    if (current.length === 0) {
      return error('Payment record changed. Refresh your orders before trying again.', 409)
    }
    const status = current[0].payment_status
    const baseUrl = process.env.TOYYIBPAY_BASE_URL || 'https://dev.toyyibpay.com'
    return NextResponse.json({
      status: 'ok',
      paid: status === 'paid',
      failed: status === 'failed',
      pay_url: status === 'paid' ? null : `${baseUrl}/${bill_code}`,
    })
  } catch (e) {
    console.error('Payment status check failed:', e)
    return error('Payment status could not be confirmed. Refresh your orders before trying again.', 503)
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/payment/return?billcode=XXX&status_id=1&order_id=...
// Handle return redirect from ToyyibPay after payment.
//
// 3-step resolution (matching PHP implementation):
//   1. DB poll  — fast path if callback already fired
//   2. ToyyibPay API fallback — authoritative check; update DB
//   3. Timeout → redirect to processing page
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { formatDate } from '@/lib/db-helpers'
import { sendOrderConfirmedOnce } from '@/lib/email'
import { transitionOrderToPaid } from '@/lib/payment-status'
import { sendMessage } from '@/lib/telegram/client'
import { SITE_URL } from '@/lib/site'
import { isValidLocale } from '@/lib/i18n'
import { escapeHtml } from '@/lib/security'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'

// ── Helpers ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function dbCheckOrder(billCode: string): Promise<RowDataPacket | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, order_ref, payment_status, customer_id, lang,
            full_name, phone, zone,
            total_amount, delivery_fee, delivery_address
     FROM orders WHERE bill_code = ? LIMIT 1`,
    [billCode]
  )
  return rows.length > 0 ? rows[0] : null
}

async function toyyibpayGetTransaction(billCode: string): Promise<Record<string, unknown> | null> {
  try {
    const baseUrl = process.env.TOYYIBPAY_BASE_URL || 'https://dev.toyyibpay.com'
    const userSecret = process.env.TOYYIBPAY_SECRET_KEY
    if (!userSecret) return null

    const formData = new URLSearchParams()
    formData.append('userSecretKey', userSecret)
    formData.append('billCode', billCode)

    const response = await fetch(`${baseUrl}/index.php/api/getBillTransactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) return null

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) return null

    data.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((b.billpaymentid as number) ?? 0) - ((a.billpaymentid as number) ?? 0)
    )
    // A successful attempt must not be hidden by a later failed retry.
    const status = (row: Record<string, unknown>) => Number(row.billpaymentStatus ?? row.billpaymentstatus ?? 0)
    return (data.find((row: Record<string, unknown>) => status(row) === 1)
      ?? data.find((row: Record<string, unknown>) => status(row) === 3)
      ?? data[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

async function trySendEmail(billCode: string): Promise<void> {
  try {
    await sendOrderConfirmedOnce(billCode)
  } catch (e) {
    console.error('[payment_return] Email send failed:', e)
  }
}

async function tryNotifyTelegram(billCode: string): Promise<void> {
  try {
    const [settings] = await db.query<RowDataPacket[]>(
      "SELECT `setting_key`, `setting_value` FROM `settings` WHERE `setting_key` IN ('telegram_bot_enabled', 'telegram_admin_chat_id')"
    )

    const config: Record<string, string> = {}
    for (const row of settings) {
      config[row.setting_key] = row.setting_value
    }

    if (config.telegram_bot_enabled !== 'true') return
    const chatId = config.telegram_admin_chat_id || process.env.TELEGRAM_ADMIN_CHAT_ID
    if (!chatId) return

    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT order_ref, full_name, phone, total_amount, zone FROM orders WHERE bill_code = ? LIMIT 1',
      [billCode]
    )
    if (rows.length === 0) return

    const order = rows[0]
    const amount = `RM ${parseFloat(order.total_amount).toFixed(2)}`
    const paidAt = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })

    const text =
      '💳 <b>New Payment Received!</b>\n\n' +
      `📦 Order: <code>${escapeHtml(String(order.order_ref))}</code>\n` +
      `👤 Customer: ${escapeHtml(String(order.full_name || 'N/A'))}\n` +
      `📱 Phone: ${escapeHtml(String(order.phone || 'N/A'))}\n` +
      `💰 Amount: <b>${amount}</b>\n` +
      `🚚 Zone: ${escapeHtml(String(order.zone || 'N/A'))}\n\n` +
      `⏰ <i>Paid at: ${paidAt} MYT</i>`

    await sendMessage(chatId, text, 'HTML')
  } catch (e) {
    console.error('[payment_return] Telegram notify failed:', e)
  }
}

// ── GET Handler ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const billCode = searchParams.get('billcode') || searchParams.get('ref') || ''
  const statusId = parseInt(searchParams.get('status_id') || '0', 10)
  const siteUrl = SITE_URL
  let locale = 'ms'
  async function readOrder() {
    const order = await dbCheckOrder(billCode)
    if (typeof order?.lang === 'string' && isValidLocale(order.lang)) locale = order.lang
    return order
  }

  // ── Guard ──
  if (!billCode) {
    return Response.redirect(`${siteUrl}/${locale}/account/orders?payment=error`, 302)
  }

  // ─────────────────────────────────────────────────────────
  // STEP 1 — DB poll (6×1s if ToyyibPay says paid, else 3×1s)
  //          Covers cases where callback fires within seconds.
  // ─────────────────────────────────────────────────────────
  const maxPolls = statusId === 1 ? 6 : 3

  for (let i = 0; i < maxPolls; i++) {
    try {
      const order = await readOrder()

      if (order && order.payment_status === 'paid') {
        // Order already marked paid — the writer that won the transition
        // (callback or check-payment) already sent email + Telegram.
        // Notifying again here spammed the admin chat on every revisit.
        return Response.redirect(
          `${siteUrl}/${locale}/account/orders?payment=success&order_ref=${encodeURIComponent(order.order_ref)}`,
          302
        )
      }
    } catch {
      // DB unavailable — skip straight to Step 2
      break
    }

    if (i < maxPolls - 1) await sleep(1000)
  }

  // ─────────────────────────────────────────────────────────
  // STEP 2 — DB still pending; ask ToyyibPay directly.
  //          billpaymentStatus: 1=success, 2=pending, 3=fail, 4=pending
  // ─────────────────────────────────────────────────────────
  const txn = await toyyibpayGetTransaction(billCode)
  let providerConfirmedPaid = false

  if (txn !== null) {
    const tpStatus = parseInt(
      String(txn.billpaymentStatus ?? txn.billpaymentstatus ?? 0),
      10
    )
    const tpInvoice = String(
      txn.billpaymentInvoiceNo ?? txn.billpaymentinvoiceno ?? txn.billpaymentid ?? ''
    ).trim()

    if (tpStatus === 1) {
      providerConfirmedPaid = true
      // ToyyibPay confirms paid — write to DB ourselves
      // (callback may arrive later and will be a no-op since status is already 'paid')
      try {
        // Race-safe transition (handles pending→paid and failed→paid with
        // retry handling). Notifications only fire when this request
        // wins the transition — otherwise the writer that won already sent
        // them, and refreshing this URL must not spam the admin chat.
        const transition = await transitionOrderToPaid(billCode, tpInvoice)

        if (transition !== 'none') {
          trySendEmail(billCode).catch(() => {})
          tryNotifyTelegram(billCode).catch(() => {})
        }
      } catch (e) {
        console.error('[payment_return] DB update failed:', e)
      }
    }

    if (tpStatus === 3) {
      // ToyyibPay confirms failed — update DB
      try {
        const now = formatDate()
        // A failed attempt leaves the original discounted bill payable.
        await db.execute<ResultSetHeader>(
          `UPDATE orders
              SET payment_status = 'failed',
                  order_status   = 'cancelled',
                  updated_at     = ?
            WHERE bill_code = ? AND payment_status = 'pending'`,
          [now, billCode]
        )
      } catch {
        // non-fatal
      }
    }

    // status 2 or 4 = still pending at ToyyibPay — fall through
  }

  // Report only the state currently saved for this attached bill.
  try {
    const order = await readOrder()
    if (order?.payment_status === 'paid') {
      return Response.redirect(
        `${siteUrl}/${locale}/account/orders?payment=success&order_ref=${encodeURIComponent(order.order_ref)}`,
        302
      )
    }
    if (order?.payment_status === 'failed' && !providerConfirmedPaid) {
      return Response.redirect(
        `${siteUrl}/${locale}/account/orders?payment=failed&bill=${encodeURIComponent(billCode)}`,
        302
      )
    }
  } catch {
    // A missing or unreadable record cannot confirm payment or failure.
  }

  // ─────────────────────────────────────────────────────────
  // STEP 3 — Both DB and ToyyibPay API are inconclusive.
  //          Hand off to frontend light-polling.
  //          Pass hint=1 if ToyyibPay told us it's paid so
  //          the frontend can show success after polling confirms.
  // ─────────────────────────────────────────────────────────
  let processingUrl = `${siteUrl}/${locale}/account/orders?status=processing&bill=${encodeURIComponent(billCode)}`
  if (statusId === 1) processingUrl += '&hint=1'
  return Response.redirect(processingUrl, 302)
}

// ─────────────────────────────────────────────────────────────
// Telegram Payment Notifications
// Sends admin alerts when orders are paid or fail.
// ─────────────────────────────────────────────────────────────

import db from '@/lib/db'
import { SITE_URL } from '@/lib/site'
import type { RowDataPacket } from 'mysql2/promise'

interface TelegramConfig {
  bot_token: string
  bot_enabled: string
  admin_chat_id: string
}

async function getTelegramConfig(): Promise<TelegramConfig | null> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT `key`, `value` FROM telegram_settings WHERE `key` IN ('bot_token', 'bot_enabled', 'admin_chat_id')"
    )

    const cfg: Record<string, string> = {}
    for (const row of rows) {
      cfg[row.key] = row.value
    }

    if (!cfg.bot_enabled || cfg.bot_enabled !== '1') return null
    if (!cfg.bot_token || !cfg.admin_chat_id) return null

    return {
      bot_token: cfg.bot_token,
      bot_enabled: cfg.bot_enabled,
      admin_chat_id: cfg.admin_chat_id,
    }
  } catch {
    return null
  }
}

export async function notifyTelegramOrderPaid(billCode: string): Promise<void> {
  const cfg = await getTelegramConfig()
  if (!cfg) return

  try {
    const [orders] = await db.query<RowDataPacket[]>(
      `SELECT order_ref, full_name, phone, total_amount, zone
         FROM orders WHERE bill_code = ? LIMIT 1`,
      [billCode]
    )

    if (orders.length === 0) return

    // Acquire lock to prevent duplicate notifications
    try {
      // We check if tg_sent exists first (if migration hasn't run it will throw, falling back)
      await db.query('SELECT tg_sent FROM orders LIMIT 1')
      const [lockResult] = await db.execute<import('mysql2/promise').ResultSetHeader>(
        'UPDATE orders SET tg_sent = 1 WHERE bill_code = ? AND tg_sent = 0 AND payment_status = "paid"',
        [billCode]
      )
      if (lockResult.affectedRows === 0) return // Already sent or not paid
    } catch (e) {
      // Fallback if column doesn't exist yet
    }

    const order = orders[0]
    const paidAt = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })
    const amount = `RM ${parseFloat(order.total_amount).toFixed(2)}`

    const text = `💳 <b>New Payment Received!</b>\n\n`
      + `📦 Order: <code>${escapeHtml(order.order_ref)}</code>\n`
      + `👤 Customer: ${escapeHtml(order.full_name)}\n`
      + `📱 Phone: ${escapeHtml(order.phone)}\n`
      + `💰 Amount: <b>${amount}</b>\n`
      + `🚚 Zone: ${escapeHtml(order.zone)}\n\n`
      + `⏰ <i>Paid at: ${paidAt} MYT</i>`

    const siteUrl = SITE_URL
    const keyboard = {
      inline_keyboard: [
        [{ text: '📋 View in Admin', url: `${siteUrl}/hs/orders.html` }],
      ],
    }

    await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.admin_chat_id,
        text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }),
    })
  } catch (e) {
    console.error('[TG] notifyTelegramOrderPaid error:', e)
  }
}

export async function notifyTelegramOrderFailed(billCode: string): Promise<void> {
  const cfg = await getTelegramConfig()
  if (!cfg) return

  try {
    const [orders] = await db.query<RowDataPacket[]>(
      `SELECT order_ref, full_name, total_amount
         FROM orders WHERE bill_code = ? LIMIT 1`,
      [billCode]
    )

    if (orders.length === 0) return

    const order = orders[0]
    const amount = `RM ${parseFloat(order.total_amount).toFixed(2)}`

    const text = `❌ <b>Payment Failed</b>\n\n`
      + `📦 Order: <code>${escapeHtml(order.order_ref)}</code>\n`
      + `👤 Customer: ${escapeHtml(order.full_name)}\n`
      + `💰 Amount: ${amount}\n\n`
      + `⏰ <i>${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} MYT</i>`

    await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.admin_chat_id,
        text,
        parse_mode: 'HTML',
      }),
    })
  } catch (e) {
    console.error('[TG] notifyTelegramOrderFailed error:', e)
  }
}

function escapeHtml(str: string | null | undefined): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function notifyWaNoReply(
  phone: string,
  contactName: string | null,
  messageText: string,
  reason: string
): Promise<void> {
  const cfg = await getTelegramConfig()
  if (!cfg) return

  try {
    const now = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })
    const display = contactName || phone
    const preview = messageText.length > 150 ? messageText.slice(0, 150) + '…' : messageText

    const text = `⚠️ <b>WhatsApp — AI didn't reply</b>\n\n`
      + `📱 From: <b>${escapeHtml(display)}</b>\n`
      + `📞 Phone: <code>${escapeHtml(phone)}</code>\n`
      + `💬 Message: ${escapeHtml(preview)}\n`
      + `❌ Reason: <code>${escapeHtml(reason)}</code>\n\n`
      + `⏰ <i>${now} MYT</i>\n`
      + `👉 Reply in <a href="${SITE_URL}/hs/whatsapp">Admin Panel</a>`

    await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.admin_chat_id,
        text,
        parse_mode: 'HTML',
      }),
    })
  } catch (e) {
    console.error('[TG] notifyWaNoReply error:', e)
  }
}

// ─────────────────────────────────────────────────────────────
// Server error alerts (used by instrumentation.ts onRequestError)
// Throttled per error signature to avoid alert storms.
// ─────────────────────────────────────────────────────────────

const errorAlertLog = new Map<string, number>()
const ERROR_ALERT_THROTTLE_MS = 10 * 60 * 1000 // max 1 alert per signature per 10 min

export async function notifyServerError(
  path: string,
  message: string,
  digest?: string
): Promise<void> {
  try {
    const signature = `${path}|${message.slice(0, 120)}`
    const last = errorAlertLog.get(signature)
    const now = Date.now()
    if (last && now - last < ERROR_ALERT_THROTTLE_MS) return
    errorAlertLog.set(signature, now)

    // Prevent unbounded growth
    if (errorAlertLog.size > 200) {
      for (const [k, v] of errorAlertLog) {
        if (now - v > ERROR_ALERT_THROTTLE_MS) errorAlertLog.delete(k)
      }
    }

    const cfg = await getTelegramConfig()
    if (!cfg) return

    const ts = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })
    const text = `🔥 <b>Server Error</b>\n\n`
      + `📍 Path: <code>${escapeHtml(path)}</code>\n`
      + `💥 ${escapeHtml(message.slice(0, 300))}\n`
      + (digest ? `🔎 Digest: <code>${escapeHtml(digest)}</code>\n` : '')
      + `\n⏰ <i>${ts} MYT</i>`

    await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.admin_chat_id,
        text,
        parse_mode: 'HTML',
      }),
    })
  } catch (e) {
    console.error('[TG] notifyServerError error:', e)
  }
}

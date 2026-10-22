import { authorizeCron } from '@/lib/cron-auth'
// ─────────────────────────────────────────────────────────────
// POST /api/orders/abandoned-reminder — remind unpaid orders
// Cron: hourly (see crontab.txt). Protected by CRON_SECRET or admin auth.
//
// Feature toggles (settings table, editable in /hs/settings):
//   abandoned_reminder_enabled = '1' → master switch (default '0' / OFF)
//   wa_proactive_enabled       = '1' → also send WhatsApp reminders
//     (business-initiated WA messages COST MONEY on the free tier —
//      default '0'; e-mail reminders are free and always sent when
//      the master switch is on)
//
// Targets: payment_status='pending', created 3–48 h ago, has bill_code,
// not yet reminded (orders.reminder_sent_at IS NULL). Max 50 per run.
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error } from '@/app/api/auth/_helpers'
import { getSettings } from '@/lib/queries/settings'
import { sendAbandonedReminder } from '@/lib/email'
import { SITE_URL } from '@/lib/site'
import type { RowDataPacket } from 'mysql2/promise'

export async function POST(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) return error('Not authenticated.', 401)

    const cfg = await getSettings(['abandoned_reminder_enabled', 'wa_proactive_enabled'])
    if (cfg['abandoned_reminder_enabled'] !== '1') {
      return success({ message: 'Abandoned reminder is disabled.', enabled: false, processed: 0 })
    }
    const waEnabled = cfg['wa_proactive_enabled'] === '1'

    const [orders] = await db.query<RowDataPacket[]>(
      `SELECT id, order_ref, full_name, email, phone, total_amount, bill_code, lang
       FROM orders
       WHERE payment_status = 'pending'
         AND reminder_sent_at IS NULL
         AND bill_code IS NOT NULL AND bill_code != ''
         AND created_at <= DATE_SUB(NOW(), INTERVAL 3 HOUR)
         AND created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
       ORDER BY created_at ASC
       LIMIT 50`
    )

    let emailed = 0
    let waSent = 0

    for (const o of orders) {
      const lang = o.lang || 'en'
      const payUrl = `${SITE_URL}/api/payment/pay-again?bill_code=${encodeURIComponent(o.bill_code)}`

      if (o.email) {
        const ok = await sendAbandonedReminder(o.email, {
          orderRef: o.order_ref,
          customerName: o.full_name || 'Customer',
          totalAmount: Number(o.total_amount) || 0,
          payUrl,
        }, lang)
        if (ok) emailed++
      }

      if (waEnabled && o.phone) {
        try {
          const { sendText } = await import('@/lib/whatsapp/client')
          let waMsg = `Hi ${o.full_name || ''}! Your Eastel order ${o.order_ref} (RM${Number(o.total_amount).toFixed(2)}) hasn't been paid yet. Complete it here: ${payUrl}`
          if (lang === 'ms') {
            waMsg = `Hai ${o.full_name || ''}! Pesanan Eastel ${o.order_ref} anda (RM${Number(o.total_amount).toFixed(2)}) masih belum dibayar. Lengkapkan di sini: ${payUrl}`
          } else if (lang === 'zh') {
            waMsg = `${o.full_name || ''} 您好！您的 Eastel 订单 ${o.order_ref}（RM${Number(o.total_amount).toFixed(2)}）尚未完成付款。请点击完成：${payUrl}`
          }
          await sendText(o.phone, waMsg)
          waSent++
        } catch (e) {
          console.error(`[abandoned-reminder] WA send failed for ${o.order_ref}:`, e)
        }
      }

      // Mark processed regardless of channel outcome — one reminder max per order.
      await db.execute('UPDATE orders SET reminder_sent_at = NOW() WHERE id = ?', [o.id])
    }

    return success({ message: 'Abandoned reminder run complete.', enabled: true, processed: orders.length, emailed, waSent })
  } catch (e) {
    console.error('[abandoned-reminder] failed:', e)
    return error('Reminder run failed.', 500)
  }
}

import { withDatabaseLock } from '@/lib/database-lock'
// ─────────────────────────────────────────────────────────────
// WhatsApp AI Reply Orchestrator
// Dedup, rate limiting, active hours, conversation history,
// multi-model fallback, pending queue, escalation detection
// ─────────────────────────────────────────────────────────────

import db from '@/lib/db'
import { formatDate } from '@/lib/db-helpers'
import { sendText } from '@/lib/whatsapp/client'
import { generateReply } from '@/lib/ai/gemini'
import { notifyWaNoReply } from '@/lib/telegram/notifications'
import { createBill } from '@/lib/toyyibpay'
import { SITE_URL } from '@/lib/site'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'

// ── Types ────────────────────────────────────────────────────

interface ProcessedResult {
  replied: boolean
  reason?: string
  msgId?: string
}

interface BotConfig {
  enabled: boolean
  activeHoursStart: string // HH:MM
  activeHoursEnd: string   // HH:MM
  model: string
  systemPrompt: string
  enabledModels?: string[]
}

// ── Config ───────────────────────────────────────────────────

async function getBotConfig(): Promise<BotConfig> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT `setting_key`, `setting_value` FROM `settings` WHERE `setting_key` IN (?, ?, ?, ?, ?, ?)",
    [
      'whatsapp_bot_enabled',
      'whatsapp_bot_active_hours_start',
      'whatsapp_bot_active_hours_end',
      'whatsapp_bot_model',
      'whatsapp_bot_system_prompt',
      'whatsapp_bot_enabled_models',
    ]
  )
  const cfg: Record<string, string> = {}
  for (const r of rows) cfg[r.setting_key] = r.setting_value
  
  let enabledModels: string[] = []
  try {
    enabledModels = JSON.parse(cfg.whatsapp_bot_enabled_models || '[]')
  } catch {}

  return {
    enabled: cfg.whatsapp_bot_enabled === 'true',
    activeHoursStart: cfg.whatsapp_bot_active_hours_start || '00:00',
    activeHoursEnd: cfg.whatsapp_bot_active_hours_end || '23:59',
    model: cfg.whatsapp_bot_model || 'gemini-2.0-flash',
    systemPrompt: cfg.whatsapp_bot_system_prompt || '',
    enabledModels: Array.isArray(enabledModels) ? enabledModels : [],
  }
}

// ── Dedup ────────────────────────────────────────────────────

/**
 * Atomically claim a message id for processing.
 * Meta delivers the same webhook event multiple times, often concurrently —
 * a SELECT-then-INSERT check races (both deliveries pass the SELECT, the
 * second INSERT crashes on the primary key). INSERT IGNORE makes the claim
 * a single atomic statement: exactly one delivery wins.
 *
 * @returns true if this call claimed the message, false if already processed
 */
async function claimMessage(msgId: string): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    'INSERT IGNORE INTO whatsapp_processed (msg_id, processed_at) VALUES (?, ?)',
    [msgId, formatDate()]
  )
  return result.affectedRows > 0
}

// ── Rate Limiting (per phone) ────────────────────────────────

async function checkPhoneRateLimit(phone: string): Promise<boolean> {
  try {
    return await withDatabaseLock(`whatsapp-rate:${phone}`, async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(msg_count), 0) AS total FROM wa_rate_limits
         WHERE phone = ? AND window_start > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`, [phone]
      )
      const total = Number(rows[0]?.total)
      if (!Number.isFinite(total) || total >= 10) return true
      await connection.execute(
        `INSERT INTO wa_rate_limits (phone, window_start, msg_count) VALUES (?, NOW(), 1)
         ON DUPLICATE KEY UPDATE msg_count = msg_count + 1`, [phone]
      )
      return false
    })
  } catch { return true }
}

// ── Active Hours ─────────────────────────────────────────────

function isWithinActiveHours(start: string, end: string): boolean {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  if (endMin >= startMin) {
    return currentMinutes >= startMin && currentMinutes <= endMin
  }
  return currentMinutes >= startMin || currentMinutes <= endMin
}

// ── Escalation Detection ─────────────────────────────────────

async function checkEscalation(phone: string): Promise<boolean> {
  const [rules] = await db.query<RowDataPacket[]>(
    'SELECT * FROM wa_escalation_rules WHERE is_active = 1'
  )
  for (const rule of rules) {
    if (rule.condition_type === 'consecutive_short') {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM wa_conversations
         WHERE phone = ? AND direction = 'in'
         AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
        [phone]
      )
      if ((rows[0]?.cnt ?? 0) >= rule.threshold) {
        if (rule.action_pause_bot) {
          await db.execute(
            "INSERT INTO `settings` (`setting_key`, `setting_value`, `updated_at`) VALUES ('whatsapp_bot_enabled', 'false', ?) ON DUPLICATE KEY UPDATE `setting_value` = 'false', `updated_at` = VALUES(`updated_at`)",
            [formatDate()]
          )
        }
        if (rule.action_notify_admin) {
          await db.execute(
            'INSERT INTO wa_admin_notices (notice_type, message, context, is_read, created_at) VALUES (?, ?, ?, 0, ?)',
            ['escalation', `Escalation triggered for ${phone}: ${rule.rule_name}`, JSON.stringify({ phone, rule: rule.rule_name }), formatDate()]
          )
        }
        await addTag(phone, 'escalated', '#ef4444')
        return true
      }
    }
  }
  return false
}

// ── Conversation History ─────────────────────────────────────

async function getConversationHistory(phone: string, limit = 10): Promise<Array<{ role: string; content: string }>> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT direction, message FROM wa_conversations
     WHERE phone = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [phone, limit]
  )
  return rows.reverse().map((r: RowDataPacket) => ({
    role: r.direction === 'in' ? 'user' : 'model',
    content: r.message,
  }))
}

async function logConversation(
  phone: string,
  contactName: string | null,
  direction: 'in' | 'out',
  message: string,
  msgId: string | null,
  model: string | null,
  replyMs: number | null,
  mediaType: string | null,
  mediaUrl: string | null,
  language: string | null = null,
  intent: string | null = null,
  sentiment: string | null = null
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const [result] = await db.execute(
    `INSERT INTO wa_conversations
     (phone, contact_name, direction, message, msg_id, media_data, local_date, gemini_model, reply_ms, created_at, \`language\`, intent, sentiment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      phone,
      contactName,
      direction,
      message,
      msgId,
      mediaType && mediaUrl ? JSON.stringify({ type: mediaType, url: mediaUrl }) : null,
      today,
      model,
      replyMs,
      formatDate(),
      language,
      intent,
      sentiment,
    ]
  )

  // Update customer record
  await db.execute(
    `INSERT INTO wa_customers (phone, contact_name, first_seen, last_seen)
     VALUES (?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE contact_name = COALESCE(?, contact_name), last_seen = NOW()`,
    [phone, contactName, contactName]
  )

  return (result as { insertId: number }).insertId
}

async function addTag(phone: string, tagName: string, tagColor: string): Promise<void> {
  await db.execute(
    `INSERT INTO wa_conversation_tags (phone, tag_name, tag_color)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE tag_color = VALUES(tag_color)`,
    [phone, tagName, tagColor]
  )
}

// ── Proactive Limit Check ────────────────────────────────────

async function getAvailableModel(preferredModel: string, fallbackModels: string[]): Promise<string> {
  const models = [preferredModel, ...fallbackModels]
  const today = new Date().toISOString().slice(0, 10)
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT ai_model, `count`, daily_limit FROM ai_daily_usage WHERE `date` = ?',
    [today]
  )
  const usageMap = new Map(rows.map(r => [r.ai_model, { count: r.count, limit: r.daily_limit }]))
  
  for (const m of models) {
    const u = usageMap.get(m)
    if (!u || u.limit === null || u.count < u.limit) {
      return m
    }
  }
  throw new Error('All models exhausted their daily limits')
}

// ── Daily Usage Tracking ─────────────────────────────────────

async function trackDailyUsage(model: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await db.execute(
    `INSERT INTO ai_daily_usage (\`date\`, \`ai_provider\`, \`ai_model\`, \`count\`, \`daily_limit\`)
     VALUES (?, 'gemini', ?, 1, NULL)
     ON DUPLICATE KEY UPDATE \`count\` = \`count\` + 1`,
    [today, model]
  )
}

// ── Language / Intent / Sentiment Detection ──────────────────

function detectLanguage(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh'
  const malay = ['saya','nak','boleh','tak','ada','macam','mana','berapa','harga','plan','nombor','telefon',
    'penghantaran','alamat','nama','hari','bulan','terima kasih','ok','ye','lah','la',
    'eh','wei','bro','sis','dah','belum','beli','apa','ni','tu','yang','untuk','dengan','ke']
  const lower = text.toLowerCase()
  let hits = 0
  for (const w of malay) { if (lower.includes(w)) hits++ }
  if (hits >= 2) return 'ms'
  return 'en'
}

function detectIntent(text: string): string {
  const lower = text.toLowerCase()
  const map: Record<string, string[]> = {
    order: ['beli','order','purchase','nak','want to buy','how to buy','place order','subscribe','sign up','daftar','pilih','choose','select plan'],
    roaming: ['roaming','luar negara','travel','oversea','overseas','international','abroad','jalan'],
    mnp: ['port','mnp','port in','migrate','tukar','number','keep number','same number','nombor lama'],
    complaint: ['complaint','complain','problem','issue','not working','slow','cannot','tak boleh','rugi','mahal','worst','bad','terrible','bodoh','tipu'],
    inquiry: ['harga','price','plan','berapa','how much','coverage','liputan','apa ada','what plan','details','info','tell me','explain','cakap'],
    support: ['reload','topup','top up','cas semula','number','sim','activate','daftar','register','esim','help','tolong','bantuan','assist'],
  }
  for (const [intent, keywords] of Object.entries(map)) {
    for (const kw of keywords) { if (lower.includes(kw)) return intent }
  }
  return 'other'
}

function detectSentiment(text: string): string {
  const lower = text.toLowerCase()
  const neg = ['complaint','complain','problem','issue','not working','cannot','bodoh','tipu','rugi','mahal','worst','bad','terrible','hate','angry','stupid','cheat','scam','refund','slow']
  const pos = ['thank','thanks','terima kasih','good','great','excellent','bagus','ok','okay','noted','perfect','happy','nice','love','best','helpful','fast','quick','efficient','satisfied']
  for (const w of neg) { if (lower.includes(w)) return 'negative' }
  for (const w of pos) { if (lower.includes(w)) return 'positive' }
  return 'neutral'
}

// ── Customer Data Extraction ─────────────────────────────────

async function extractAndSaveCustomerData(phone: string, inMsg: string, botReply: string): Promise<void> {
  const combined = inMsg + ' ' + botReply
  const updates: Record<string, string | number> = {}

  const icMatch = combined.match(/\b(\d{6}[-\s]?\d{2}[-\s]?\d{4})\b/)
  if (icMatch) updates.ic_number = icMatch[1].replace(/[-\s]/g, '')

  const pcMatch = combined.match(/(?:postcode|poskod|zip|pos\s*code|postal)[^\d]*(\d{5})\b/i)
  if (pcMatch) {
    const pc = parseInt(pcMatch[1])
    if (pc >= 1000 && pc <= 98859) updates.postcode = pcMatch[1]
  }

  if (/\b(penang|butterworth|bt pahat|balik pulau|georgetown|pulau pinang)\b/i.test(combined)) {
    updates.meetup = 1
  }

  const planMatch = inMsg.match(/\bRM\s?(\d+)\b/i)
  if (planMatch) updates.preferred_plan = 'RM' + planMatch[1]

  const states = ['Selangor','Kuala Lumpur','Penang','Johor','Kedah','Kelantan','Malacca','Negeri Sembilan','Pahang','Perak','Perlis','Sabah','Sarawak','Terengganu','Labuan','Putrajaya']
  for (const state of states) {
    if (combined.toLowerCase().includes(state.toLowerCase())) { updates.state = state; break }
  }

  if (Object.keys(updates).length === 0) return

  const overwritable = ['postcode', 'preferred_plan', 'meetup', 'state']
  const entries = Object.entries(updates)
  const sets = entries.map(([k]) =>
    overwritable.includes(k) ? `\`${k}\` = ?` : `\`${k}\` = COALESCE(\`${k}\`, ?)`
  ).join(', ')
  const vals = [...entries.map(([, v]) => v), phone]
  await db.execute(`UPDATE wa_customers SET ${sets}, last_seen = NOW() WHERE phone = ?`, vals)
}

// ── Prompt Injection Protection ──────────────────────────────

function sanitiseUserInput(text: string): string {
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above|your)\s+instructions?/i,
    /forget\s+(everything|all|your\s+instructions?)/i,
    /disregard\s+(all\s+)?(previous|prior|your)\s+/i,
    /override\s+(your\s+)?(system|instructions?|prompt)/i,
    /you\s+are\s+now\s+(a\s+|an\s+)?(?!Eastel)/i,
    /act\s+as\s+(a\s+|an\s+)?(?!Eastel)/i,
    /pretend\s+(you\s+are|to\s+be)\s+/i,
    /roleplay\s+as\s+/i,
    /your\s+new\s+(role|persona|instructions?|prompt)\s+(is|are)/i,
    /repeat\s+(your\s+)?(system\s+)?(prompt|instructions?)/i,
    /print\s+(your\s+)?(system\s+)?(prompt|instructions?)/i,
    /what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?)/i,
    /reveal\s+(your\s+)?(system\s+)?(prompt|instructions?)/i,
    /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/i,
    /SYSTEM:\s*You/i,
    /###\s*(Instruction|Human|Assistant|System)/i,
  ]

  for (const pattern of injectionPatterns) {
    if (pattern.test(text)) {
      console.warn('WA Bot: Prompt injection detected:', text.slice(0, 100))
      return '[Customer sent a message — please respond helpfully about Eastel Mobile services]'
    }
  }

  if (text.length > 2000) return text.slice(0, 2000) + '… [message truncated]'
  return text
}

// ── Markdown Stripping for WhatsApp ──────────────────────────

function stripMarkdownForWA(text: string): string {
  text = text.replace(/\*\*([\s\S]*?)\*\*/g, '$1')
  text = text.replace(/__([\s\S]*?)__/g, '$1')
  text = text.replace(/(?<!\*)\*(?!\*)([\s\S]+?)(?<!\*)\*(?!\*)/g, '$1')
  text = text.replace(/(?<!_)_(?!_)([\s\S]+?)(?<!_)_(?!_)/g, '$1')
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_: string, m: string) => m.toUpperCase())
  text = text.replace(/```[a-z]*\n?([\s\S]*?)```/g, '$1')
  text = text.replace(/`([^`]+)`/, '$1')
  text = text.replace(/^[-*]\s+/gm, '• ')
  text = text.replace(/^[-*_]{3,}\s*$/gm, '')
  text = text.replace(/^>\s*/gm, '')
  text = text.replace(/[ \t]+$/gm, '')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

// ── Human Takeover Check ─────────────────────────────────────

async function isHumanTakeover(phone: string): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT cfg_value FROM whatsapp_config WHERE cfg_key = 'paused_contacts' LIMIT 1"
  )
  if (rows.length === 0) return false
  try {
    const paused: string[] = JSON.parse(rows[0].cfg_value || '[]')
    return paused.includes(phone)
  } catch { return false }
}

// ── Session Tracking ─────────────────────────────────────────

async function updateSession(phone: string, intent: string, lang: string, isAiReply: boolean): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM wa_sessions WHERE phone = ? AND last_msg_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) ORDER BY id DESC LIMIT 1",
    [phone]
  )
  if (rows.length > 0) {
    if (isAiReply) {
      await db.execute("UPDATE wa_sessions SET ai_replies = ai_replies + 1, last_msg_at = NOW() WHERE id = ?", [rows[0].id])
    } else {
      await db.execute("UPDATE wa_sessions SET msg_count = msg_count + 1, last_msg_at = NOW(), primary_intent = ?, primary_lang = ? WHERE id = ?", [intent, lang, rows[0].id])
    }
  } else if (!isAiReply) {
    await db.execute("INSERT INTO wa_sessions (phone, started_at, last_msg_at, msg_count, primary_intent, primary_lang) VALUES (?, NOW(), NOW(), 1, ?, ?)", [phone, intent, lang])
  }
}

// ── Admin Notice Helper ───────────────────────────────────────

async function addAdminNotice(type: string, message: string, context?: string): Promise<void> {
  try {
    const [recent] = await db.query<RowDataPacket[]>(
      "SELECT id FROM wa_admin_notices WHERE notice_type = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 1",
      [type]
    )
    if (recent.length > 0) return

    await db.execute(
      "INSERT INTO wa_admin_notices (notice_type, message, context, is_read, created_at) VALUES (?, ?, ?, 0, ?)",
      [type, message, context || null, formatDate()]
    )
  } catch (e) {
    console.error('Failed to add admin notice:', e)
  }
}

// ── WhatsApp Payment Link Helpers ────────────────────────────

export function buildPaymentMessage(lang: string, payUrl: string, orderRef: string, amountRM: number): string {
  const amt = amountRM.toFixed(2)
  if (lang === 'zh') {
    return `您好！感谢您的订单。\n\n请通过以下链接完成付款：\n${payUrl}\n\n订单号：${orderRef}\n总额：RM${amt}\n\n完成付款后，我们将尽快为您处理订单。谢谢！`
  }
  if (lang === 'ms') {
    return `Terima kasih atas tempahan anda!\n\nSila buat bayaran melalui pautan berikut:\n${payUrl}\n\nNo. Pesanan: ${orderRef}\nJumlah: RM${amt}\n\nSelepas bayaran berjaya, kami akan proses pesanan anda segera. Terima kasih!`
  }
  return `Thank you for your order!\n\nPlease complete your payment via the link below:\n${payUrl}\n\nOrder Ref: ${orderRef}\nTotal: RM${amt}\n\nOnce payment is confirmed, we will process your order promptly. Thank you!`
}

async function sendPaymentLink(phone: string, lang: string, contactName: string | null): Promise<void> {
  const safeLang = ['en', 'ms', 'zh'].includes(lang) ? lang : 'en'
  try {
    // ── Dedup guard: check for existing pending WA order for this phone ──
    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT order_ref, bill_code, total_amount FROM orders WHERE phone = ? AND source = 'whatsapp' AND payment_status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [phone]
    )
    if (existing.length > 0 && existing[0].bill_code) {
      // Re-send existing link — no new bill needed
      const baseUrl = process.env.TOYYIBPAY_BASE_URL || 'https://dev.toyyibpay.com'
      const payUrl = `${baseUrl}/${existing[0].bill_code}`
      const linkMsg = buildPaymentMessage(safeLang, payUrl, existing[0].order_ref, parseFloat(existing[0].total_amount))
      await sendText(phone, linkMsg)
      console.log(`WA Bot [${phone}]: Existing pending order found (${existing[0].order_ref}), resent existing link`)
      return
    }

    // ── Lookup customer delivery details from wa_customers ──
    const [custRows] = await db.query<RowDataPacket[]>(
      'SELECT full_name, contact_name, delivery_addr, postcode FROM wa_customers WHERE phone = ? LIMIT 1',
      [phone]
    )
    const cust = custRows[0] ?? {}
    const waName    = (cust.full_name || cust.contact_name || contactName || phone) as string
    const waAddr    = (cust.delivery_addr || '') as string
    const waPostcode = (cust.postcode || '') as string

    if (!/^\d{5}$/.test(String(waPostcode))) throw new Error('A valid delivery postcode is required.')
    const [zoneRows] = await db.query<RowDataPacket[]>(
      'SELECT zone FROM postcode_zones WHERE ? BETWEEN postcode_start AND postcode_end LIMIT 1', [Number(waPostcode)]
    )
    const waZone = zoneRows[0]?.zone
    if (!['WM', 'EM', 'Labuan'].includes(waZone)) throw new Error('Delivery zone is unavailable.')
    const feeCol = waZone === 'Labuan' ? 'labuan_fee' : waZone === 'EM' ? 'em_fee' : 'wm_fee'
    const [cRows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, ${feeCol} AS fee FROM couriers WHERE is_active = 1 ORDER BY ${feeCol} ASC, id ASC LIMIT 1`
    )
    const [products] = await db.query<RowDataPacket[]>(
      'SELECT id, name, price, stock FROM products WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1'
    )
    const product = products[0]
    const waCourierId = cRows[0]?.id
    const waCourierName = cRows[0]?.name
    const waDeliveryFee = Number(cRows[0]?.fee)
    const waSimFee = Number(product?.price)
    const stock = Number(product?.stock)
    if (!product || product.stock == null || !Number.isInteger(stock) || (stock !== -1 && stock <= 0) ||
        !waCourierId || !Number.isFinite(waSimFee) || waSimFee < 0 ||
        !Number.isFinite(waDeliveryFee) || waDeliveryFee < 0) {
      throw new Error('A valid active product and delivery quote are required.')
    }
    const totalCents = Math.round(waSimFee * 100) + Math.round(waDeliveryFee * 100)
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new Error('Invalid payment total.')
    const amountRM = totalCents / 100

    // ── Create ToyyibPay bill ──
    const orderRef = `WA-${phone}-${Date.now()}`
    const siteUrl  = SITE_URL
    const { billCode, paymentUrl } = await createBill({
      billName: `Eastel SIM - ${waName}`,
      billDescription: `Eastel SIM Card Order ${orderRef}`,
      billAmount: totalCents,
      billTo: waName,
      billEmail: '',
      billPhone: phone,
      billReturnUrl: `${siteUrl}/payment/success`,
      billCallbackUrl: `${siteUrl}/api/payment/callback`,
      billExternalReferenceNo: orderRef,
    })

    // ── Save order row ──
    await db.execute(
      `INSERT INTO orders
         (order_ref, full_name, email, phone, delivery_address, postcode, zone,
          courier_id, courier_name, delivery_fee, sim_fee, total_amount,
          payment_status, order_status, bill_code, lang, source)
       VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'processing', ?, ?, 'whatsapp')`,
      [orderRef, waName, phone, waAddr, waPostcode, waZone,
       waCourierId, waCourierName, waDeliveryFee, waSimFee, amountRM,
       billCode, safeLang]
    )

    // ── Send payment link ──
    const linkMsg = buildPaymentMessage(safeLang, paymentUrl, orderRef, amountRM)
    await sendText(phone, linkMsg)
    console.log(`WA Bot [${phone}]: Payment link sent — ${paymentUrl}`)
  } catch (e) {
    console.error(`WA Bot [${phone}]: sendPaymentLink failed:`, e)
  }
}

async function handleResendPayLink(phone: string, lang: string): Promise<void> {
  const safeLang = ['en', 'ms', 'zh'].includes(lang) ? lang : 'en'
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT order_ref, bill_code, total_amount FROM orders WHERE phone = ? AND source = 'whatsapp' AND payment_status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [phone]
    )
    if (rows.length > 0 && rows[0].bill_code) {
      const baseUrl = process.env.TOYYIBPAY_BASE_URL || 'https://dev.toyyibpay.com'
      const payUrl  = `${baseUrl}/${rows[0].bill_code}`
      const linkMsg = buildPaymentMessage(safeLang, payUrl, rows[0].order_ref, parseFloat(rows[0].total_amount))
      await sendText(phone, linkMsg)
      console.log(`WA Bot [${phone}]: Payment link resent (self-service) — ${payUrl}`)
    } else {
      console.log(`WA Bot [${phone}]: RESEND_PAYMENT_LINK fired but no pending WA order found`)
    }
  } catch (e) {
    console.error(`WA Bot [${phone}]: handleResendPayLink failed:`, e)
  }
}

// ── Machine Tag Detection ─────────────────────────────────────

interface TagResult {
  cleanText: string
  paymentAmountRM: number | null
  resendPayLink: boolean
}

function extractMachineTags(text: string): TagResult {
  let cleanText = text
  let paymentAmountRM: number | null = null
  let resendPayLink = false

  const payMatch = cleanText.match(/\[PAYMENT_READY:\s*RM\s*([\d]+(?:\.[\d]{1,2})?)\s*\]/i)
  if (payMatch) {
    paymentAmountRM = Math.round(parseFloat(payMatch[1]) * 100) / 100
    cleanText = cleanText.replace(/\[PAYMENT_READY:\s*RM\s*[\d]+(?:\.[\d]{1,2})?\s*\]/gi, '').trim()
  }

  if (/\[RESEND_PAYMENT_LINK\]/i.test(cleanText)) {
    resendPayLink = true
    cleanText = cleanText.replace(/\[RESEND_PAYMENT_LINK\]/gi, '').trim()
  }

  return { cleanText, paymentAmountRM, resendPayLink }
}

// ── Main Handler ─────────────────────────────────────────────

export async function processIncoming(
  phone: string,
  msgId: string,
  text: string,
  contactName?: string | null,
  mediaType?: string | null,
  mediaUrl?: string | null
): Promise<ProcessedResult> {
  // 1. Atomic dedup claim — exactly one concurrent delivery proceeds
  if (msgId && !(await claimMessage(msgId))) {
    return { replied: false, reason: 'duplicate' }
  }

  // 2. Check human takeover BEFORE any AI processing
  if (await isHumanTakeover(phone)) {
    return { replied: false, reason: 'human_takeover' }
  }

  const startTime = Date.now()

  // 3. Get bot config
  const config = await getBotConfig()

  if (!config.enabled) {
    return { replied: false, reason: 'bot_disabled' }
  }

  if (!isWithinActiveHours(config.activeHoursStart, config.activeHoursEnd)) {
    return { replied: false, reason: 'outside_active_hours' }
  }

  if (await checkPhoneRateLimit(phone)) {
    await addTag(phone, 'rate-limited', '#f59e0b')
    return { replied: false, reason: 'rate_limited' }
  }


  // 4. Build message text (include media info)
  let aiInput = text
  if (mediaType === 'image' && mediaUrl) {
    aiInput = `[User sent an image: ${mediaUrl}] ${text || ''}`
  } else if (mediaType === 'audio') {
    aiInput = `[User sent a voice message] ${text || ''}`
  }

  // Voice reply support (requires ffmpeg on server)
  // const voiceReplyMode = cfg.voice_reply_mode || 'text'
  // if (msgType === 'audio' && voiceReplyMode === 'voice') {
  //   // TODO: Implement Gemini TTS → OGG → sendAudio
  // }

  // 5. Sanitize input (prompt injection protection)
  aiInput = sanitiseUserInput(aiInput)

  // 6. Detect language + intent
  const lang = detectLanguage(aiInput)
  const intent = detectIntent(aiInput)

  // 7. Log incoming with language + intent
  await logConversation(phone, contactName || null, 'in', text, msgId, null, null, mediaType || null, mediaUrl || null, lang, intent)

  // 8. Update session with incoming message
  await updateSession(phone, intent, lang, false)

  // Get conversation history
  const history = await getConversationHistory(phone)

  // Get system prompt from config or default
  const systemPrompt = config.systemPrompt ||
    "You are Eastel Mobile's AI assistant on WhatsApp. Help customers with plans, SIM registration, roaming, and general inquiries. Be friendly and concise."

  try {
    // 9. Check DB limits proactively (dynamic cascade)
    const fallbackModels = ['gemini-2.5-flash', 'gemini-1.5-flash']
    if (config.enabledModels) {
      for (const em of config.enabledModels) {
        if (typeof em !== 'string' || em === '') continue
        if (/tts|audio|image|imagen|embedding|live/i.test(em)) continue
        if (!fallbackModels.includes(em) && em !== config.model) {
          fallbackModels.push(em)
        }
      }
    }

    const modelToUse = await getAvailableModel(config.model, fallbackModels)

    // 10. Generate AI reply
    let actualModel = modelToUse
    let rawReply = ''
    try {
      const res = await generateReply(modelToUse, aiInput, history, systemPrompt, fallbackModels)
      rawReply = res.text
      actualModel = res.model
    } catch (err: any) {
      throw err
    }

    // Dynamic warning: if we fell back, check if main model is retired/404
    if (actualModel !== modelToUse) {
      try {
        await generateReply(modelToUse, 'ping', [], 'ping', [])
      } catch (checkErr: any) {
        if (checkErr.message?.includes('HTTP 404') || checkErr.message?.includes('404')) {
          await addAdminNotice(
            'model_retired',
            `Gemini model '${modelToUse}' returned 404 (retired or renamed by Google). Update the active model in WhatsApp Settings. Bot is falling back to other enabled models for now.`,
            JSON.stringify({ model: modelToUse, http_code: 404 })
          )
        }
      }
    }

    const elapsed = Date.now() - startTime

    // Track usage
    await trackDailyUsage(actualModel)

    // 11. Strip markdown from reply
    const rawStripped = stripMarkdownForWA(rawReply)

    // 12. Extract + strip machine tags (invisible to customer)
    const { cleanText: reply, paymentAmountRM, resendPayLink } = extractMachineTags(rawStripped)

    // 13. Detect sentiment from the reply context
    const sentiment = detectSentiment(text)

    // 14. Extract customer data
    await extractAndSaveCustomerData(phone, text, reply)

    // 15. Update session with AI reply
    await updateSession(phone, intent, lang, true)

    // 16. Send cleaned reply (tags already stripped)
    const sentMsgId = await sendText(phone, reply)

    // Log outgoing with model info and sentiment
    await logConversation(phone, contactName || null, 'out', reply, sentMsgId, actualModel, elapsed, null, null, lang, intent, sentiment)

    // 17. Post-send: trigger payment actions asynchronously
    if (paymentAmountRM !== null) {
      const [custRows] = await db.query<RowDataPacket[]>('SELECT postcode FROM wa_customers WHERE phone = ? LIMIT 1', [phone])
      const postcode = custRows[0]?.postcode || ''

      if (!postcode) {
        const msgs: Record<string, string> = {
          'en': 'Please provide your postcode to calculate the shipping fee before we proceed to payment.',
          'ms': 'Sila berikan poskod anda untuk mengira kos penghantaran sebelum kita teruskan dengan pembayaran.',
          'zh': '在继续付款之前，请提供您的邮政编码以计算运费。'
        }
        await sendText(phone, msgs[lang] || msgs['en'])
      } else {
        sendPaymentLink(phone, lang, contactName || null).catch(
          (e) => console.error('WA Bot: sendPaymentLink error:', e)
        )
      }
    } else if (resendPayLink) {
      handleResendPayLink(phone, lang).catch(
        (e) => console.error('WA Bot: handleResendPayLink error:', e)
      )
    }

    return { replied: true, msgId: sentMsgId }
  } catch (aiErr) {
    console.error('AI reply failed:', aiErr)

    // Notify admin via Telegram
    notifyWaNoReply(phone, contactName ?? null, text, String(aiErr)).catch(() => {})

    // Add to pending queue for retry
    await db.execute(
      `INSERT INTO wa_pending_queue (phone, message, reason, status, retry_count, next_retry_at, created_at)
       VALUES (?, ?, ?, 'pending', 0, DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?)`,
      [phone, text, String(aiErr), formatDate()]
    )

    // Check escalation
    await checkEscalation(phone)

    return { replied: false, reason: 'ai_error' }
  }
}

// ── Cron: Process Pending Queue ──────────────────────────────

export async function processPendingQueue(): Promise<number> {
  // 1. Expire stale pending (>12h) to prevent late out-of-context replies
  await db.execute(
    `UPDATE wa_pending_queue SET status = 'failed' 
     WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 12 HOUR)`
  )

  // 2. Respect the global bot toggle - exit early if disabled
  const config = await getBotConfig()
  if (!config.enabled) return 0

  // 3. Load paused contacts (human takeover)
  const [pausedRows] = await db.query<RowDataPacket[]>(
    "SELECT cfg_value FROM whatsapp_config WHERE cfg_key = 'paused_contacts' LIMIT 1"
  )
  let paused: string[] = []
  if (pausedRows.length > 0) {
    try {
      paused = JSON.parse(pausedRows[0].cfg_value || '[]')
    } catch {}
  }

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM wa_pending_queue
     WHERE status = 'pending' AND next_retry_at <= NOW()
     ORDER BY created_at ASC
     LIMIT 10`
  )

  let processed = 0
  for (const item of rows) {
    // 4. Skip paused contacts and defer by 1 day
    if (paused.includes(item.phone)) {
      await db.execute(
        "UPDATE wa_pending_queue SET next_retry_at = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE id = ?",
        [item.id]
      )
      continue
    }

    try {
      await db.execute(
        "UPDATE wa_pending_queue SET status = 'processing' WHERE id = ?",
        [item.id]
      )
      const result = await processIncoming(item.phone, `retry-${item.id}`, item.message)
      if (result.replied) {
        await db.execute(
          "UPDATE wa_pending_queue SET status = 'done' WHERE id = ?",
          [item.id]
        )
        processed++
      } else {
        const retries = (item.retry_count || 0) + 1
        if (retries >= 5) {
          await db.execute(
            "UPDATE wa_pending_queue SET status = 'failed' WHERE id = ?",
            [item.id]
          )
        } else {
          await db.execute(
            `UPDATE wa_pending_queue SET status = 'pending', retry_count = ?,
             next_retry_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?`,
            [retries, 5 * retries, item.id]
          )
        }
      }
    } catch {
      await db.execute(
        "UPDATE wa_pending_queue SET status = 'failed' WHERE id = ?",
        [item.id]
      )
    }
  }
  return processed
}

// ── Cron: Missed Message Check ───────────────────────────────

export async function checkMissedMessages(): Promise<number> {
  // Check for conversations that haven't had a reply in 3+ hours
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT phone FROM wa_conversations
     WHERE direction = 'in'
       AND created_at < DATE_SUB(NOW(), INTERVAL 3 HOUR)
       AND phone NOT IN (
         SELECT DISTINCT phone FROM wa_conversations
         WHERE direction = 'out' AND created_at > DATE_SUB(NOW(), INTERVAL 3 HOUR)
       )
     GROUP BY phone`
  )

  for (const row of rows) {
    await db.execute(
      `INSERT INTO wa_admin_notices (notice_type, message, context, is_read, created_at)
       VALUES (?, ?, ?, 0, ?)`,
      ['missed', `Missed conversation with ${row.phone} (no reply in 3+ hours)`, JSON.stringify({ phone: row.phone }), formatDate()]
    )
  }
  return rows.length
}

// ── Self-Enhance ─────────────────────────────────────────────

export async function learnFromResponse(
  question: string,
  answer: string,
  category?: string
): Promise<void> {
  // Store approved Q&A pair as a template for future reference
  await db.execute(
    `INSERT INTO wa_templates (template_name, shortcut, content, category)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content = VALUES(content)`,
    [
      `Learned: ${question.slice(0, 80)}`,
      null,
      answer,
      category || 'learned',
    ]
  )
}

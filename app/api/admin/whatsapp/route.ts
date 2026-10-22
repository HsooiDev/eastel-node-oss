import { csvText } from '@/lib/csv'
import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { safeInt, paginate, formatDate } from "@/lib/db-helpers";
import { requireAdmin, success, error } from "../_helpers";
import { generateReply, generate } from "@/lib/ai/gemini";
import {
  sendText,
  editMessage as waEditMessage,
  deleteMessage as waDeleteMessage,
  sendReaction as waSendReaction,
} from "@/lib/whatsapp/client";
import { learnFromResponse } from "@/lib/whatsapp/ai";
import type { RowDataPacket } from "mysql2/promise";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "config";

    switch (action) {
      case "conversations": return getConversations(url);
      case "chat": return getChatMessages(url);
      case "tags": return getTags(url);
      case "notes": return getNotes(url);
      case "templates": return getTemplates(url);
      case "escalation": return getEscalationRules();
      case "notices": return getNotices(url);
      case "export": return exportConversations(url);
      case "stats": return getStats();
      case "has_new_messages": return hasNewMessages(url);
      case "pending_queue": return getPendingQueue(url);
      case "audit_log": return getAuditLog(url);
      case "gemini_models": return getGeminiModels();
      case "test_gemini": return testGeminiConnection();
      case "wa_limit": return getWaLimit();
      case "webhook_health": return webhookHealth();
      default: return getConfig();
    }
  } catch (e) {
    console.error("Admin WhatsApp GET error:", e);
    return error("Failed to load data.", 500);
  }
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case "toggle": return toggleBot();
      case "config": return saveConfig(data.config);
      case "send": return sendFromAdmin(data);
      case "editMessage": return editMessage(data);
      case "deleteMessage": return deleteMessage(data);
      case "reactMessage": return reactMessage(data);
      case "addTag": return addTag(data);
      case "removeTag": return removeTag(data);
      case "addNote": return addNote(data, session.name);
      case "deleteNote": return deleteNote(data);
      case "saveTemplate": return saveTemplate(data);
      case "deleteTemplate": return deleteTemplate(data);
      case "saveEscalation": return saveEscalationRule(data);
      case "deleteEscalation": return deleteEscalationRule(data);
      case "test": return testBot(data);
      case "selfEnhance": return selfEnhance(data);
      case "dismissNotice": return dismissNotice(data);
      case "clearChat": return clearChat(data);
      case "ai_reply": return triggerAiReply(data);
      case "update_customer": return updateCustomer(data);
      case "retry_pending": return retryPending(data);
      case "pause_contact": return setPauseContact(data, true);
      case "resume_contact": return setPauseContact(data, false);
      case "translate_text": return translateText(data);
      default: return error("Invalid action.");
    }
  } catch (e) {
    console.error("Admin WhatsApp POST error:", e);
    return error("Operation failed.", 500);
  }
}

// ── Config ────────────────────────────────────────────────────

async function getConfig() {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT `setting_key`, `setting_value` FROM `settings` WHERE `setting_key` LIKE 'whatsapp_bot_%' OR `setting_key` IN ('gemini_api_key', 'gemini_model', 'system_prompt', 'system_prompt_locked', 'system_prompt_dynamic', 'wa_daily_limit', 'wa_phone_number_id', 'wa_access_token', 'wa_verify_token', 'wa_app_secret', 'wa_waba_id')"
  );
  const config: Record<string, string> = {};
  for (const row of rows) config[row.setting_key] = row.setting_value;
  return success({ config });
}

async function toggleBot() {
  const [current] = await db.query<RowDataPacket[]>(
    "SELECT `setting_value` FROM `settings` WHERE `setting_key` = ?",
    ["whatsapp_bot_enabled"]
  );
  const newVal = current[0]?.setting_value === "true" ? "false" : "true";
  await db.execute(
    "INSERT INTO `settings` (`setting_key`, `setting_value`, `updated_at`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = VALUES(`updated_at`)",
    ["whatsapp_bot_enabled", newVal, formatDate()]
  );
  return success({ enabled: newVal === "true" });
}

async function saveConfig(config: Record<string, unknown>) {
  if (!config || typeof config !== "object") return error("Config object required.");
  // Skip values prefixed with masking sentinel — user didn't change those fields
  const MASKED_PREFIX = "••••";
  // Never wipe a sensitive key that was intentionally left blank in the form
  const SENSITIVE_SUBSTRINGS = ["access_token", "api_key", "secret", "token", "password"];
  const now = formatDate();
  for (const [key, value] of Object.entries(config)) {
    if (typeof key !== "string") continue;
    const allowedPrefixes = ["whatsapp_bot_", "gemini_", "system_", "wa_"];
    if (!allowedPrefixes.some((p) => key.startsWith(p))) continue;
    const strVal = String(value ?? "");
    if (strVal.startsWith(MASKED_PREFIX)) continue;
    const isSensitive = SENSITIVE_SUBSTRINGS.some((s) => key.includes(s));
    if (isSensitive && strVal === "") continue;
    await db.execute(
      "INSERT INTO `settings` (`setting_key`, `setting_value`, `updated_at`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = VALUES(`updated_at`)",
      [key, strVal, now]
    );
  }
  return success({ message: "Config saved." });
}

// ── Conversations ─────────────────────────────────────────────

async function getConversations(url: URL) {
  const page = safeInt(url.searchParams.get("page"), 1, 1, 10000);
  const perPage = safeInt(url.searchParams.get("per_page"), 20, 1, 100);
  const { limit, offset } = paginate(page, perPage);
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const tag = url.searchParams.get("tag");
  const unreadOnly = url.searchParams.get("unread_only") === "true";
  const sentiment = url.searchParams.get("sentiment");
  const language = url.searchParams.get("language");

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (dateFrom) { conditions.push("c.last_seen >= ?"); params.push(dateFrom); }
  if (dateTo) { conditions.push("c.last_seen <= ?"); params.push(`${dateTo} 23:59:59`); }
  if (unreadOnly) {
    // Conversations where the last message was incoming (awaiting reply)
    conditions.push(
      "(SELECT direction FROM wa_conversations WHERE phone = c.phone ORDER BY created_at DESC LIMIT 1) = 'in'"
    );
  }
  if (tag) {
    conditions.push(
      "EXISTS (SELECT 1 FROM wa_conversation_tags wt WHERE wt.phone = c.phone AND wt.tag_name = ?)"
    );
    params.push(tag);
  }
  if (sentiment) {
    conditions.push("(SELECT sentiment FROM wa_conversations WHERE phone = c.phone ORDER BY created_at DESC LIMIT 1) = ?");
    params.push(sentiment);
  }
  if (language) {
    conditions.push("(SELECT language FROM wa_conversations WHERE phone = c.phone ORDER BY created_at DESC LIMIT 1) = ?");
    params.push(language);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM wa_customers c ${whereClause}`,
    params
  );
  const total = countRows[0]?.total ?? 0;

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       c.phone, c.contact_name, c.first_seen, c.last_seen,
       (SELECT message FROM wa_conversations WHERE phone = c.phone ORDER BY created_at DESC LIMIT 1) AS last_message,
       (SELECT direction FROM wa_conversations WHERE phone = c.phone ORDER BY created_at DESC LIMIT 1) AS last_direction,
       (SELECT COUNT(*) FROM wa_conversations WHERE phone = c.phone) AS message_count
     FROM wa_customers c
     ${whereClause}
     ORDER BY c.last_seen DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return success({
    conversations: rows,
    meta: { total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) },
  });
}

// ── Chat Messages ─────────────────────────────────────────────

async function getChatMessages(url: URL) {
  const phone = url.searchParams.get("phone");
  if (!phone) return error("Phone number required.");
  const limit = safeInt(url.searchParams.get("limit"), 50, 1, 200);
  const since = url.searchParams.get("since");

  let messages: RowDataPacket[];
  if (since) {
    const sinceId = parseInt(since, 10);
    if (isNaN(sinceId)) return error("Invalid since value.");
    [messages] = await db.query<RowDataPacket[]>(
      "SELECT * FROM wa_conversations WHERE phone = ? AND id > ? ORDER BY created_at DESC LIMIT ?",
      [phone, sinceId, limit]
    );
  } else {
    [messages] = await db.query<RowDataPacket[]>(
      "SELECT * FROM wa_conversations WHERE phone = ? ORDER BY created_at DESC LIMIT ?",
      [phone, limit]
    );
  }

  const [tags] = await db.query<RowDataPacket[]>(
    "SELECT * FROM wa_conversation_tags WHERE phone = ?", [phone]
  );

  const [notes] = await db.query<RowDataPacket[]>(
    "SELECT * FROM wa_conversation_notes WHERE phone = ? ORDER BY created_at DESC", [phone]
  );

  return success({
    phone,
    messages: messages.reverse(),
    tags: tags.map((t) => ({ id: t.id, name: t.tag_name, color: t.tag_color })),
    notes,
  });
}

// ── Send from Admin ───────────────────────────────────────────

async function sendFromAdmin(data: Record<string, unknown>) {
  const phone = String(data.phone || "");
  const message = String(data.message || "").trim();
  if (!phone || !message) return error("Phone and message required.");

  const replyTo = data.reply_to_msg_id ? String(data.reply_to_msg_id) : null;
  const replyLogId = data.reply_log_id ? Number(data.reply_log_id) : null;
  const msgId = await sendText(phone, message, replyTo ?? undefined);
  const today = new Date().toISOString().slice(0, 10);
  await db.execute(
    "INSERT INTO wa_conversations (phone, contact_name, direction, message, msg_id, reply_to_msg_id, local_date, created_at) VALUES (?, 'Admin', 'out', ?, ?, ?, ?, ?)",
    [phone, message, msgId, replyLogId ? String(replyLogId) : replyTo, today, formatDate()]
  );
  return success({ msgId, message: "Message sent." });
}

// ── Edit / Delete / React (calls Meta API) ────────────────────

async function editMessage(data: Record<string, unknown>) {
  const id = safeInt(data.id, 0, 1);
  const message = String(data.message || "").trim();
  if (id <= 0 || !message) return error("Message ID and new message required.");

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT msg_id, phone, direction, created_at FROM wa_conversations WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return error("Message not found.");
  const row = rows[0];
  if (row.direction !== "out") return error("Can only edit outgoing messages.");

  if (row.msg_id) {
    const ageMs = Date.now() - new Date(row.created_at as string).getTime();
    if (ageMs > 15 * 60 * 1000) return error("Cannot edit — Meta's 15-minute edit window has passed.");
    await waEditMessage(String(row.msg_id), message, String(row.phone));
  }

  await db.execute("UPDATE wa_conversations SET message = ?, edited = 1 WHERE id = ?", [message, id]);
  return success({ message: "Message updated." });
}

async function deleteMessage(data: Record<string, unknown>) {
  const id = safeInt(data.id, 0, 1);
  if (id <= 0) return error("Message ID required.");

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT msg_id, direction FROM wa_conversations WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return error("Message not found.");
  const row = rows[0];

  if (row.msg_id && row.direction === "out") {
    await waDeleteMessage(String(row.msg_id));
  }

  await db.execute(
    "UPDATE wa_conversations SET message = '[This message was deleted]', msg_type = 'deleted' WHERE id = ?",
    [id]
  );
  return success({ message: "Message deleted." });
}

async function reactMessage(data: Record<string, unknown>) {
  const logId = safeInt(data.log_id, 0, 1);
  const phone = String(data.phone || "");
  const emoji = String(data.emoji ?? "");
  if (logId <= 0 || !phone) return error("log_id and phone required.");

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT msg_id FROM wa_conversations WHERE id = ? LIMIT 1",
    [logId]
  );
  const msgId = rows[0]?.msg_id ? String(rows[0].msg_id) : String(data.msg_id || "");

  // Send to Meta (empty emoji removes reaction)
  if (msgId) {
    await waSendReaction(phone, msgId, emoji);
  }

  // Update local reactions store — toggle if same emoji already exists
  if (!emoji) {
    await db.execute("DELETE FROM wa_message_reactions WHERE log_id = ? AND phone = ?", [logId, phone]);
  } else {
    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT id FROM wa_message_reactions WHERE log_id = ? AND phone = ? AND emoji = ?",
      [logId, phone, emoji]
    );
    if (existing.length > 0) {
      await db.execute("DELETE FROM wa_message_reactions WHERE id = ?", [existing[0].id]);
    } else {
      await db.execute(
        "INSERT INTO wa_message_reactions (log_id, phone, msg_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)",
        [logId, phone, msgId, emoji, formatDate()]
      );
    }
  }

  const [reactions] = await db.query<RowDataPacket[]>(
    "SELECT emoji, COUNT(*) as count FROM wa_message_reactions WHERE log_id = ? AND phone = ? GROUP BY emoji",
    [logId, phone]
  );
  return success({ reactions });
}

// ── Tags ──────────────────────────────────────────────────────

async function getTags(url: URL) {
  const phone = url.searchParams.get("phone");
  let sql = "SELECT * FROM wa_conversation_tags";
  const params: string[] = [];
  if (phone) { sql += " WHERE phone = ?"; params.push(phone); }
  const [rows] = await db.query<RowDataPacket[]>(sql, params);
  return success({ tags: rows });
}

async function addTag(data: Record<string, unknown>) {
  const phone = String(data.phone || "");
  const tagName = String(data.tag_name || "").trim();
  const tagColor = String(data.tag_color || "#9B7BFF");
  if (!phone || !tagName) return error("Phone and tag name required.");
  await db.execute(
    "INSERT INTO wa_conversation_tags (phone, tag_name, tag_color) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE tag_color = VALUES(tag_color)",
    [phone, tagName, tagColor]
  );
  return success({ message: "Tag added." });
}

async function removeTag(data: Record<string, unknown>) {
  const id = safeInt(data.id, 0, 1);
  if (id <= 0) return error("Tag ID required.");
  await db.execute("DELETE FROM wa_conversation_tags WHERE id = ?", [id]);
  return success({ message: "Tag removed." });
}

// ── Notes ─────────────────────────────────────────────────────

async function getNotes(url: URL) {
  const phone = url.searchParams.get("phone");
  if (!phone) return error("Phone required.");
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM wa_conversation_notes WHERE phone = ? ORDER BY created_at DESC", [phone]
  );
  return success({ notes: rows });
}

async function addNote(data: Record<string, unknown>, adminName: string) {
  const phone = String(data.phone || "");
  const note = String(data.note || "").trim();
  if (!phone || !note) return error("Phone and note required.");
  await db.execute(
    "INSERT INTO wa_conversation_notes (phone, admin_id, note, created_at) VALUES (?, ?, ?, ?)",
    [phone, adminName, note, formatDate()]
  );
  return success({ message: "Note added." });
}

async function deleteNote(data: Record<string, unknown>) {
  const id = safeInt(data.id, 0, 1);
  if (id <= 0) return error("Note ID required.");
  await db.execute("DELETE FROM wa_conversation_notes WHERE id = ?", [id]);
  return success({ message: "Note deleted." });
}

// ── Templates ─────────────────────────────────────────────────

async function getTemplates(url: URL) {
  const search = url.searchParams.get("search") || "";
  let sql = "SELECT * FROM wa_templates";
  const params: string[] = [];
  if (search) { sql += " WHERE template_name LIKE ? OR content LIKE ?"; params.push(`%${search}%`, `%${search}%`); }
  sql += " ORDER BY id DESC LIMIT 100";
  const [rows] = await db.query<RowDataPacket[]>(sql, params);
  return success({ templates: rows });
}

async function saveTemplate(data: Record<string, unknown>) {
  const id = data.id ? safeInt(data.id, 0, 1) : 0;
  const templateName = String(data.template_name || "").trim();
  const shortcut = String(data.shortcut || "").trim() || null;
  const content = String(data.content || "").trim();
  const category = String(data.category || "").trim() || null;
  if (!templateName || !content) return error("Template name and content required.");

  if (id > 0) {
    await db.execute(
      "UPDATE wa_templates SET template_name = ?, shortcut = ?, content = ?, category = ? WHERE id = ?",
      [templateName, shortcut, content, category, id]
    );
  } else {
    await db.execute(
      "INSERT INTO wa_templates (template_name, shortcut, content, category) VALUES (?, ?, ?, ?)",
      [templateName, shortcut, content, category]
    );
  }
  return success({ message: "Template saved." });
}

async function deleteTemplate(data: Record<string, unknown>) {
  const id = safeInt(data.id, 0, 1);
  if (id <= 0) return error("Template ID required.");
  await db.execute("DELETE FROM wa_templates WHERE id = ?", [id]);
  return success({ message: "Template deleted." });
}

// ── Escalation Rules ──────────────────────────────────────────

async function getEscalationRules() {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM wa_escalation_rules ORDER BY id ASC");
  return success({ rules: rows });
}

async function saveEscalationRule(data: Record<string, unknown>) {
  const id = data.id ? safeInt(data.id, 0, 1) : 0;
  const ruleName = String(data.rule_name || "").trim();
  const conditionType = String(data.condition_type || "consecutive_short");
  const threshold = safeInt(data.threshold, 3, 1, 100);
  const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1;
  const pauseBot = data.action_pause_bot ? 1 : 0;
  const addTagAction = data.action_add_tag ? 1 : 0;
  const notifyAdmin = data.action_notify_admin ? 1 : 0;
  if (!ruleName) return error("Rule name required.");

  if (id > 0) {
    await db.execute(
      `UPDATE wa_escalation_rules SET rule_name=?, condition_type=?, threshold=?,
       is_active=?, action_pause_bot=?, action_add_tag=?, action_notify_admin=?
       WHERE id=?`,
      [ruleName, conditionType, threshold, isActive, pauseBot, addTagAction, notifyAdmin, id]
    );
  } else {
    await db.execute(
      `INSERT INTO wa_escalation_rules (rule_name, condition_type, threshold, is_active,
       action_pause_bot, action_add_tag, action_notify_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ruleName, conditionType, threshold, isActive, pauseBot, addTagAction, notifyAdmin]
    );
  }
  return success({ message: "Rule saved." });
}

async function deleteEscalationRule(data: Record<string, unknown>) {
  const id = safeInt(data.id, 0, 1);
  if (id <= 0) return error("Rule ID required.");
  await db.execute("DELETE FROM wa_escalation_rules WHERE id = ?", [id]);
  return success({ message: "Rule deleted." });
}

// ── Notices ───────────────────────────────────────────────────

async function getNotices(url: URL) {
  const unread = url.searchParams.get("unread") === "true";
  let sql = "SELECT * FROM wa_admin_notices";
  if (unread) sql += " WHERE is_read = 0";
  sql += " ORDER BY created_at DESC LIMIT 50";
  const [rows] = await db.query<RowDataPacket[]>(sql);
  return success({ notices: rows });
}

async function dismissNotice(data: Record<string, unknown>) {
  const id = safeInt(data.id, 0, 1);
  if (id <= 0) return error("Notice ID required.");
  await db.execute("UPDATE wa_admin_notices SET is_read = 1 WHERE id = ?", [id]);
  return success({ message: "Notice dismissed." });
}

async function clearChat(data: Record<string, unknown>) {
  const phone = String(data.phone || "");
  if (!phone) return error("Phone required.");
  await db.execute("DELETE FROM wa_conversations WHERE phone = ?", [phone]);
  await db.execute("DELETE FROM wa_conversation_tags WHERE phone = ?", [phone]);
  await db.execute("DELETE FROM wa_conversation_notes WHERE phone = ?", [phone]);
  await db.execute("DELETE FROM wa_message_reactions WHERE phone = ?", [phone]);
  return success({ message: "Chat history cleared." });
}

// ── Export CSV ────────────────────────────────────────────────

async function exportConversations(url: URL) {
  const phone = url.searchParams.get("phone") || "";
  let sql = "SELECT phone, contact_name, direction, message, msg_id, created_at FROM wa_conversations";
  const params: string[] = [];
  if (phone) { sql += " WHERE phone = ?"; params.push(phone); }
  sql += " ORDER BY created_at ASC LIMIT 10000";

  const [rows] = await db.query<RowDataPacket[]>(sql, params);

  const header = "phone,contact_name,direction,message,msg_id,created_at";
  const csvLines = rows.map((r) => [r.phone, r.contact_name, r.direction, r.message, r.msg_id, r.created_at].map(csvText).join(','));

  return success({ csv: [header, ...csvLines].join('\n') });
}

// ── Stats ─────────────────────────────────────────────────────

async function getStats() {
  // MYT = UTC+8
  const todayMyt = "DATE(CONVERT_TZ(created_at, '+00:00', '+08:00'))";
  const todayExpr = "DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))";

  const basicQueries: Record<string, string> = {
    total: "SELECT COUNT(*) AS cnt FROM wa_conversations",
    today: `SELECT COUNT(*) AS cnt FROM wa_conversations WHERE ${todayMyt} = ${todayExpr}`,
    today_in: `SELECT COUNT(*) AS cnt FROM wa_conversations WHERE direction='in' AND ${todayMyt} = ${todayExpr}`,
    today_out: `SELECT COUNT(*) AS cnt FROM wa_conversations WHERE direction='out' AND ${todayMyt} = ${todayExpr}`,
    customers: "SELECT COUNT(*) AS cnt FROM wa_customers",
    pending: "SELECT COUNT(*) AS cnt FROM wa_pending_queue WHERE status IN ('pending','processing')",
    failed: "SELECT COUNT(*) AS cnt FROM wa_pending_queue WHERE status = 'failed'",
  };

  const stats: Record<string, number> = {};
  for (const [key, sql] of Object.entries(basicQueries)) {
    const [rows] = await db.query<RowDataPacket[]>(sql);
    stats[key] = rows[0]?.cnt ?? 0;
  }

  // Gemini per-model daily usage (degraded gracefully if table schema differs)
  let geminiUsage: RowDataPacket[] = [];
  try {
    const [usageRows] = await db.query<RowDataPacket[]>(
      `SELECT ai_model as model, \`count\` as total_requests
       FROM ai_daily_usage
       WHERE \`date\` = ${todayExpr}
       ORDER BY ai_model`
    );
    geminiUsage = usageRows;
  } catch {
    // Schema mismatch — skip usage breakdown
  }

  return success({ stats, gemini_usage: geminiUsage });
}

// ── has_new_messages ──────────────────────────────────────────

async function hasNewMessages(url: URL) {
  const since = url.searchParams.get("since");
  if (!since) return error("since timestamp required.");
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS cnt FROM wa_conversations WHERE direction = 'in' AND created_at > ?",
    [since]
  );
  const count = rows[0]?.cnt ?? 0;
  return success({ has_new: count > 0, count });
}

// ── pending_queue ─────────────────────────────────────────────

async function getPendingQueue(url: URL) {
  const status = url.searchParams.get("status") || "pending";
  const limit = safeInt(url.searchParams.get("limit"), 50, 1, 200);
  const validStatuses = ["pending", "processing", "failed", "completed"];
  if (!validStatuses.includes(status)) return error("Invalid status.");
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM wa_pending_queue WHERE status = ? ORDER BY created_at ASC LIMIT ${limit}`,
    [status]
  );
  return success({ items: rows });
}

// ── audit_log ─────────────────────────────────────────────────

async function getAuditLog(url: URL) {
  const page = safeInt(url.searchParams.get("page"), 1, 1, 10000);
  const perPage = safeInt(url.searchParams.get("per_page"), 50, 1, 100);
  const { limit, offset } = paginate(page, perPage);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM wa_audit_log ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
  );
  const [countRows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM wa_audit_log");
  return success({ items: rows, total: countRows[0]?.total ?? 0 });
}

// ── Test Bot ──────────────────────────────────────────────────

async function testBot(data: Record<string, unknown>) {
  const message = String(data.message || "").trim();
  if (!message) return error("Message required.");

  const systemPrompt = String(data.system_prompt || "");
  const history: Array<{ role: string; content: string }> = Array.isArray(data.history)
    ? data.history.map((h: { role: string; content: string }) => ({ role: h.role, content: h.content }))
    : [];

  const [configRows] = await db.query<RowDataPacket[]>(
    "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('whatsapp_bot_testbot_model', 'whatsapp_bot_model')"
  );
  const cfg: Record<string, string> = {};
  for (const r of configRows) cfg[r.setting_key] = r.setting_value;
  const model = String(data.model || cfg["whatsapp_bot_testbot_model"] || cfg["whatsapp_bot_model"] || "gemini-2.0-flash");

  try {
    const { text: reply } = await generateReply(model, message, history, systemPrompt || undefined);
    const sessionId = String(data.session_id || Date.now().toString(36));
    await db.execute(
      "INSERT INTO wa_test_logs (session_id, message, response, model, created_at) VALUES (?, ?, ?, ?, ?)",
      [sessionId, message, reply, model, formatDate()]
    );
    return success({ reply, session_id: sessionId });
  } catch (e) {
    return error(`AI error: ${e}`);
  }
}

// ── Self-Enhance ──────────────────────────────────────────────

async function selfEnhance(data: Record<string, unknown>) {
  const question = String(data.question || "").trim();
  const answer = String(data.answer || "").trim();
  const category = String(data.category || "learned").trim();
  if (!question || !answer) return error("Question and answer required.");
  await learnFromResponse(question, answer, category);
  return success({ message: "Knowledge saved to templates." });
}

// ── Trigger AI Reply ──────────────────────────────────────────

async function triggerAiReply(data: Record<string, unknown>) {
  const phone = String(data.phone || "");
  if (!phone) return error("Phone required.");

  const [historyRows] = await db.query<RowDataPacket[]>(
    "SELECT direction, message FROM wa_conversations WHERE phone = ? ORDER BY created_at DESC LIMIT 20",
    [phone]
  );
  const history = historyRows.reverse().map((r) => ({
    role: r.direction === "in" ? "user" : "model",
    content: String(r.message || ""),
  }));

  const lastMsg = [...history].reverse().find((h) => h.role === "user")?.content;
  if (!lastMsg) return error("No incoming messages to reply to.");

  const [configRows] = await db.query<RowDataPacket[]>(
    "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('whatsapp_bot_system_prompt', 'whatsapp_bot_model')"
  );
  const cfg: Record<string, string> = {};
  for (const r of configRows) cfg[r.setting_key] = r.setting_value;

  const contextHistory = history.slice(0, -1);
  const model = cfg["whatsapp_bot_model"] || "gemini-2.0-flash";
  const { text: reply } = await generateReply(model, lastMsg, contextHistory, cfg["whatsapp_bot_system_prompt"]);
  const msgId = await sendText(phone, reply);
  const today = new Date().toISOString().slice(0, 10);
  await db.execute(
    "INSERT INTO wa_conversations (phone, contact_name, direction, message, msg_id, local_date, created_at) VALUES (?, 'Admin AI', 'out', ?, ?, ?, ?)",
    [phone, reply, msgId, today, formatDate()]
  );

  return success({ reply, msgId, message: "AI reply sent." });
}

// ── Update Customer ───────────────────────────────────────────

async function updateCustomer(data: Record<string, unknown>) {
  const phone = String(data.phone || "");
  const contactName = String(data.contact_name || "").trim();
  if (!phone) return error("Phone required.");
  if (!contactName) return error("Contact name required.");
  await db.execute(
    "UPDATE wa_customers SET contact_name = ? WHERE phone = ?",
    [contactName, phone]
  );
  return success({ message: "Customer updated." });
}

// ── Retry Pending ─────────────────────────────────────────────

async function retryPending(data: Record<string, unknown>) {
  const id = data.id ? safeInt(data.id, 0, 1) : 0;
  if (id > 0) {
    await db.execute(
      "UPDATE wa_pending_queue SET status = 'pending', retry_count = 0 WHERE id = ?",
      [id]
    );
  } else {
    await db.execute(
      "UPDATE wa_pending_queue SET status = 'pending', retry_count = 0 WHERE status = 'failed'"
    );
  }
  return success({ message: "Queued for retry." });
}

// ── Pause / Resume Contact ────────────────────────────────────

async function setPauseContact(data: Record<string, unknown>, pause: boolean) {
  const phone = String(data.phone || "");
  if (!phone) return error("Phone required.");
  await db.execute(
    "UPDATE wa_customers SET is_bot_paused = ? WHERE phone = ?",
    [pause ? 1 : 0, phone]
  );
  return success({ message: pause ? "Bot paused for contact." : "Bot resumed for contact." });
}

// ── Translate Text ────────────────────────────────────────────

async function translateText(data: Record<string, unknown>) {
  const text = String(data.text || "").trim();
  if (!text) return error("Text required.");

  const [configRows] = await db.query<RowDataPacket[]>(
    "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('gemini_model', 'whatsapp_bot_model')"
  );
  const cfg: Record<string, string> = {};
  for (const r of configRows) cfg[r.setting_key] = r.setting_value;
  const model = cfg["gemini_model"] || cfg["whatsapp_bot_model"] || "gemini-2.0-flash";

  const prompt = `Translate the following text into both English and Chinese. Output ONLY a valid JSON object in the following format, with no markdown, no code blocks, and no extra text:
{
  "en": "English translation",
  "zh": "Chinese translation"
}

Text to translate:
"${text}"`;

  try {
    const result = await generate(model, [
      { role: "user", parts: [{ text: prompt }] }
    ], { temperature: 0.1 });

    let responseText = result.text.trim();
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }

    try {
      const trans = JSON.parse(responseText);
      if (trans.en && trans.zh) {
        return success({
          en: trans.en.trim(),
          zh: trans.zh.trim(),
          model: result.model
        });
      }
    } catch {
      // Fallback if parsing fails
    }

    return success({
      en: result.text,
      zh: result.text,
      model: result.model,
      raw: true
    });
  } catch (e) {
    return error(`Translation error: ${e}`);
  }
}

// ── Gemini Models ─────────────────────────────────────────────

async function getGeminiModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return error('Gemini API key not configured');

  const catalogue: Record<string, { cat: string; rpm: number | null; tpm: string | null; rpd: number | null }> = {
    'gemini3.1flashlitepreview': { cat: 'Text-out models', rpm: 15, tpm: '250K', rpd: 500 },
    'gemini3.1flashlite': { cat: 'Text-out models', rpm: 15, tpm: '250K', rpd: 500 },
    'gemini2.5flashlite': { cat: 'Text-out models', rpm: 10, tpm: '250K', rpd: 20 },
    'gemini2.5flashnativeaudio': { cat: 'Multi-modal generative models', rpm: null, tpm: '1M', rpd: null },
    'gemini2.5flashtts': { cat: 'Multi-modal generative models', rpm: 3, tpm: '10K', rpd: 10 },
    'gemini2.5flash': { cat: 'Text-out models', rpm: 5, tpm: '250K', rpd: 20 },
    'gemini3flashpreview': { cat: 'Text-out models', rpm: 5, tpm: '250K', rpd: 20 },
    'gemini3.1flashtts': { cat: 'Multi-modal generative models', rpm: 3, tpm: '10K', rpd: 10 },
    'gemini3.1flashlive': { cat: 'Live API', rpm: null, tpm: '65K', rpd: null },
    'gemini3flashlive': { cat: 'Live API', rpm: null, tpm: '65K', rpd: null },
    'gemini3flash': { cat: 'Text-out models', rpm: 5, tpm: '250K', rpd: 20 },
    'gemmarobotics': { cat: 'Other models', rpm: 10, tpm: '250K', rpd: 20 },
    'geminirobotics': { cat: 'Other models', rpm: 10, tpm: '250K', rpd: 20 },
    'geminiembedding2': { cat: 'Embedding', rpm: 100, tpm: '30K', rpd: 1000 },
    'geminiembedding1': { cat: 'Embedding', rpm: 100, tpm: '30K', rpd: 1000 },
    'textembedding': { cat: 'Embedding', rpm: 100, tpm: '30K', rpd: 1000 },
    'gemma31b': { cat: 'Other models', rpm: 30, tpm: '15K', rpd: 14400 },
    'gemma32b': { cat: 'Other models', rpm: 30, tpm: '15K', rpd: 14400 },
    'gemma34b': { cat: 'Other models', rpm: 30, tpm: '15K', rpd: 14400 },
    'gemma312b': { cat: 'Other models', rpm: 30, tpm: '15K', rpd: 14400 },
    'gemma327b': { cat: 'Other models', rpm: 30, tpm: '15K', rpd: 14400 },
    'gemma426b': { cat: 'Other models', rpm: 15, tpm: 'Unlimited', rpd: 1500 },
    'gemma431b': { cat: 'Other models', rpm: 15, tpm: 'Unlimited', rpd: 1500 },
    'gemma4': { cat: 'Other models', rpm: 15, tpm: 'Unlimited', rpd: 1500 },
    'gemma3': { cat: 'Other models', rpm: 30, tpm: '15K', rpd: 14400 },
    'imagen': { cat: 'Image Generation', rpm: null, tpm: null, rpd: null },
  };

  const autoCategory = (methods: string[]): string => {
    if (methods.includes('generateImages')) return 'Image Generation';
    if (methods.includes('embedContent')) return 'Embedding';
    if (methods.includes('bidiGenerateContent')) return 'Live API';
    if (methods.includes('generateContent')) return 'Text-out models';
    return 'Other models';
  };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`);
  if (!res.ok) return error(`Gemini API returned HTTP ${res.status}`);
  const apiData = await res.json();
  const models = apiData.models || [];

  const catOrder = ['Text-out models', 'Multi-modal generative models', 'Live API', 'Image Generation', 'Embedding', 'Other models'];
  const categorized: Record<string, unknown[]> = {};

  for (const m of models) {
    const id = (m.name || '').replace('models/', '');
    const displayName = m.displayName || id;
    const methods: string[] = m.supportedGenerationMethods || [];
    const description = m.description || '';
    const norm = displayName.toLowerCase().replace(/[^a-z0-9.]/g, '');

    let catData: { cat: string; rpm: number | null; tpm: string | null; rpd: number | null } | null = null;
    let bestLen = 0;
    for (const [pattern, data] of Object.entries(catalogue)) {
      if (pattern.length > bestLen && norm.includes(pattern)) {
        catData = data;
        bestLen = pattern.length;
      }
    }

    const category = catData?.cat ?? autoCategory(methods);
    if (!categorized[category]) categorized[category] = [];
    categorized[category].push({
      id, displayName, category,
      rpm: catData?.rpm ?? null, tpm: catData?.tpm ?? null, rpd: catData?.rpd ?? null,
      methods, description,
    });
  }

  const sorted: Record<string, unknown[]> = {};
  for (const cat of catOrder) { if (categorized[cat]) sorted[cat] = categorized[cat]; }
  for (const [cat, ms] of Object.entries(categorized)) { if (!sorted[cat]) sorted[cat] = ms; }

  return success({ categories: sorted, total: models.length });
}

// ── Test Gemini Connection ────────────────────────────────────

async function testGeminiConnection() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return error('Gemini API key not configured');

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) return error(`Gemini API returned HTTP ${res.status}`);
  const data = await res.json();
  const count = data.models?.length ?? 0;
  return success({ ok: true, models_available: count });
}

// ── WhatsApp Limit ────────────────────────────────────────────

async function getWaLimit() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return error('WhatsApp not configured');

  try {
    const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}?fields=messaging_feature_limit,quality_rating`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return error(`Meta API returned ${res.status}`);
    const data = await res.json();
    return success({ limit: data });
  } catch (e) {
    return error(`Failed to fetch: ${e}`);
  }
}

// ── Webhook Health ────────────────────────────────────────────

async function webhookHealth() {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT MAX(created_at) as last_incoming FROM wa_conversations WHERE direction = 'in'"
  );
  const lastIncoming = rows[0]?.last_incoming || null;
  const now = Date.now();
  const lastTime = lastIncoming ? new Date(lastIncoming as string).getTime() : 0;
  const minutesAgo = lastTime ? Math.floor((now - lastTime) / 60000) : null;
  const healthy = minutesAgo !== null && minutesAgo < 60;
  return success({ healthy, last_incoming: lastIncoming, minutes_ago: minutesAgo });
}

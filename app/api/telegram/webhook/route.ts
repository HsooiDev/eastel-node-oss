import { reservePublicInference } from '@/lib/ai/public-budget';
import type { NextRequest } from "next/server";
import { sendMessage } from "@/lib/telegram/client";
import { generateReply } from "@/lib/ai/gemini";
import db from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

// ── Update Parser ────────────────────────────────────────────

interface ParsedUpdate {
  update_id: number;
  type: string;
  chat_id: number | null;
  chat_type: string | null;
  from_name: string;
  from_username: string;
  message_id: number | null;
  text: string;
  media_type: string | null;
  file_id: string | null;
  caption: string;
  callback_query_id: string | null;
  callback_data: string | null;
  raw: Record<string, unknown>;
}

function parseUpdate(data: Record<string, unknown>): ParsedUpdate {
  const base: ParsedUpdate = {
    update_id: (data.update_id as number) || 0,
    type: "unknown",
    chat_id: null,
    chat_type: null,
    from_name: "",
    from_username: "",
    message_id: null,
    text: "",
    media_type: null,
    file_id: null,
    caption: "",
    callback_query_id: null,
    callback_data: null,
    raw: data,
  };

  function fillFromMsg(msg: Record<string, unknown>) {
    const chat = msg.chat as Record<string, unknown> | undefined;
    const from = msg.from as Record<string, unknown> | undefined;
    base.chat_id = (chat?.id as number) ?? null;
    base.chat_type = (chat?.type as string) ?? null;
    base.from_name = `${from?.first_name || ""} ${from?.last_name || ""}`.trim();
    base.from_username = (from?.username as string) || "";
    base.message_id = (msg.message_id as number) ?? null;
    base.text = (msg.text as string) || "";
    base.caption = (msg.caption as string) || "";

    // Detect media
    for (const t of ["photo", "video", "audio", "document", "voice", "video_note", "animation", "sticker"]) {
      if (!msg[t]) continue;
      base.media_type = t;
      const item = t === "photo" && Array.isArray(msg[t]) ? msg[t][msg[t].length - 1] : msg[t];
      base.file_id = (item as Record<string, unknown>)?.file_id as string || null;
      break;
    }
    for (const t of ["location", "contact", "venue", "dice", "game", "invoice"]) {
      if (msg[t]) { base.media_type = t; break; }
    }
  }

  if (data.message) {
    base.type = "message";
    fillFromMsg(data.message as Record<string, unknown>);
  } else if (data.edited_message) {
    base.type = "edited_message";
    fillFromMsg(data.edited_message as Record<string, unknown>);
  } else if (data.channel_post) {
    base.type = "channel_post";
    fillFromMsg(data.channel_post as Record<string, unknown>);
  } else if (data.callback_query) {
    const cq = data.callback_query as Record<string, unknown>;
    base.type = "callback_query";
    base.callback_query_id = cq.id as string;
    base.callback_data = (cq.data as string) || null;
    const from = cq.from as Record<string, unknown>;
    base.from_name = `${from?.first_name || ""} ${from?.last_name || ""}`.trim();
    base.from_username = (from?.username as string) || "";
    if (cq.message) {
      const msg = cq.message as Record<string, unknown>;
      const chat = msg.chat as Record<string, unknown>;
      base.chat_id = (chat?.id as number) ?? null;
      base.chat_type = (chat?.type as string) ?? null;
      base.message_id = (msg.message_id as number) ?? null;
    }
  }

  return base;
}

// ── DB Helpers ───────────────────────────────────────────────

async function upsertConversation(update: ParsedUpdate) {
  const raw = update.raw;
  const msg = (raw.message || raw.edited_message || raw.channel_post) as Record<string, unknown> | undefined;
  const from = msg?.from as Record<string, unknown> | undefined;
  const chat = msg?.chat as Record<string, unknown> | undefined;
  const firstName = (from?.first_name as string) || update.from_name || "";
  const lastName = (from?.last_name as string) || "";
  const chatType = (chat?.type as string) || update.chat_type || "private";
  const title = (chat?.title as string) || "";
  const preview = update.text || (update.media_type ? `[${update.media_type}]` : "");

  await db.execute(
    `INSERT INTO telegram_conversations (chat_id, chat_type, title, username, first_name, last_name, last_message_text, last_message_at, unread_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 1)
     ON DUPLICATE KEY UPDATE
       last_message_text = VALUES(last_message_text),
       last_message_at = NOW(),
       unread_count = unread_count + 1`,
    [update.chat_id, chatType, title, update.from_username, firstName, lastName, preview.slice(0, 255)]
  );
}

async function logMessage(
  chatId: number | null,
  direction: "in" | "out",
  type: string,
  text: string,
  tgMsgId: number | null = null,
  fileId = "",
  caption = "",
  raw: string | null = null
) {
  await db.execute(
    "INSERT INTO telegram_messages (chat_id, message_id, direction, message_type, text, file_id, caption, raw_data, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
    [chatId, tgMsgId, direction, type, text, fileId, caption, raw]
  );
}

async function getTelegramConfig(): Promise<{ token: string; adminChatId: string; botEnabled: boolean }> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT `key`, `value` FROM telegram_settings WHERE `key` IN ('bot_token', 'bot_enabled', 'admin_chat_id')"
    );
    const cfg: Record<string, string> = {};
    for (const row of rows) {
      cfg[row.key] = row.value;
    }
    return {
      token: cfg.bot_token || "",
      adminChatId: cfg.admin_chat_id || "",
      botEnabled: cfg.bot_enabled === "1",
    };
  } catch {
    return { token: "", adminChatId: "", botEnabled: false };
  }
}

// ── Webhook Handler ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
    const [secretRow] = await db.query<RowDataPacket[]>(
      "SELECT `value` FROM telegram_settings WHERE `key` = 'secret_token'"
    );
    const dbSecret = String(secretRow[0]?.value ?? '');
    if (!dbSecret.trim() || !secretToken?.trim() || secretToken !== dbSecret) {
      return new Response("Unauthorized", { status: 403 });
    }

    const cfg = await getTelegramConfig();
    if (!cfg.botEnabled || !cfg.token) {
      return new Response("OK", { status: 200 });
    }

    const rawBody = await request.text();
    const data = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const update = parseUpdate(data);

    if (!update.update_id) {
      return new Response("OK", { status: 200 });
    }

    // ── Log incoming message ──────────────────────────────
    if (["message", "edited_message", "channel_post"].includes(update.type)) {
      try {
        await upsertConversation(update);
        await logMessage(
          update.chat_id,
          "in",
          update.media_type || "text",
          update.text || update.caption || (update.media_type ? `[${update.media_type}]` : ""),
          update.message_id,
          update.file_id || "",
          update.caption,
          rawBody
        );
      } catch { /* non-fatal */ }
    }

    // ── Notify admin of incoming non-admin message ────────
    if (
      update.type === "message" &&
      cfg.adminChatId &&
      String(update.chat_id) !== String(cfg.adminChatId)
    ) {
      try {
        const displayName = update.from_name || (update.from_username ? `@${update.from_username}` : String(update.chat_id));
        const preview = update.text
          ? update.text.slice(0, 100)
          : `[${update.media_type || "unknown"}]`;
        const notif =
          `💬 <b>New Telegram Message</b>\n\n` +
          `From: ${escapeHtml(displayName)}\n` +
          `Text: ${escapeHtml(preview)}\n\n` +
          `Reply in admin panel → /hs/telegram`;
        await sendMessage(cfg.adminChatId, notif, "HTML");
      } catch { /* notification failure must not break webhook */ }
    }

    // ── Bot logic ─────────────────────────────────────────
    if (update.type === "message") {
      const text = update.text;
      const chatId = update.chat_id!;

      if (text === "/start") {
        const reply = `👋 Hello <b>${escapeHtml(update.from_name)}</b>!\n\nWelcome to <b>Eastel</b>. How can we help you today?`;
        const sent = await sendMessage(chatId, reply, "HTML");
        await logMessage(chatId, "out", "text", reply, sent.messageId);
        return new Response("OK", { status: 200 });
      }

      if (text === "/id") {
        const reply = `Your chat ID is: <code>${chatId}</code>`;
        const sent = await sendMessage(chatId, reply, "HTML");
        await logMessage(chatId, "out", "text", reply, sent.messageId);
        return new Response("OK", { status: 200 });
      }

      if (text === "/help") {
        const reply = "📋 <b>Available Commands</b>\n\n/start — Welcome message\n/id — Get your chat ID\n/help — Show this menu\n/orders — Last 5 orders (admin only)\n/status — Bot health check (admin only)\n/stats — Bot statistics (admin only)";
        const sent = await sendMessage(chatId, reply, "HTML");
        await logMessage(chatId, "out", "text", reply, sent.messageId);
        return new Response("OK", { status: 200 });
      }

      if (text === "/orders") {
        if (String(chatId) !== String(cfg.adminChatId)) {
          const reply = "🔒 This command is for admins only.";
          const sent = await sendMessage(chatId, reply, "HTML");
          await logMessage(chatId, "out", "text", reply, sent.messageId);
          return new Response("OK", { status: 200 });
        }
        try {
          const [orders] = await db.query<RowDataPacket[]>(
            "SELECT order_ref, full_name, payment_status, order_status, total_amount, created_at FROM orders ORDER BY id DESC LIMIT 5"
          );
          let reply: string;
          if (orders.length === 0) {
            reply = "No orders found.";
          } else {
            reply = "📋 <b>Last 5 Orders:</b>\n\n";
            for (const o of orders) {
              reply += `<code>${o.order_ref}</code> — <b>RM ${parseFloat(o.total_amount).toFixed(2)}</b> — ${escapeHtml(o.full_name)} — <i>${o.payment_status} / ${o.order_status}</i>\n`;
            }
          }
          const sent = await sendMessage(chatId, reply, "HTML");
          await logMessage(chatId, "out", "text", reply, sent.messageId);
        } catch {
          const sent = await sendMessage(chatId, "⚠️ Could not retrieve orders.", "HTML");
          await logMessage(chatId, "out", "text", "⚠️ Could not retrieve orders.", sent.messageId);
        }
        return new Response("OK", { status: 200 });
      }

      if (text === "/status") {
        if (String(chatId) !== String(cfg.adminChatId)) {
          const reply = "🔒 This command is for admins only.";
          const sent = await sendMessage(chatId, reply, "HTML");
          await logMessage(chatId, "out", "text", reply, sent.messageId);
          return new Response("OK", { status: 200 });
        }
        try {
          const [[{ cnt }]] = await db.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM orders WHERE payment_status = 'pending'"
          );
          const nowMYT = new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
          const reply = `🤖 <b>Bot Status</b>\n\n✅ Bot: Online\n📦 Pending orders: ${cnt}\n⏰ Checked: ${nowMYT} MYT`;
          const sent = await sendMessage(chatId, reply, "HTML");
          await logMessage(chatId, "out", "text", reply, sent.messageId);
        } catch {
          const sent = await sendMessage(chatId, "⚠️ Could not retrieve status.", "HTML");
          await logMessage(chatId, "out", "text", "⚠️ Could not retrieve status.", sent.messageId);
        }
        return new Response("OK", { status: 200 });
      }

      if (text === "/stats") {
        if (String(chatId) !== String(cfg.adminChatId)) {
          const reply = "🔒 This command is for admins only.";
          const sent = await sendMessage(chatId, reply, "HTML");
          await logMessage(chatId, "out", "text", reply, sent.messageId);
          return new Response("OK", { status: 200 });
        }
        try {
          const [[{ total_conv }]] = await db.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS total_conv FROM telegram_conversations"
          );
          const [[{ total_msg }]] = await db.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS total_msg FROM telegram_messages"
          );
          const [[{ today_msg }]] = await db.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS today_msg FROM telegram_messages WHERE DATE(CONVERT_TZ(sent_at, '+00:00', '+08:00')) = CONVERT_TZ(NOW(), '+00:00', '+08:00')"
          );
          const [[{ pending_orders }]] = await db.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS pending_orders FROM orders WHERE payment_status = 'pending'"
          );
          const [[{ revenue_today }]] = await db.query<RowDataPacket[]>(
            "SELECT COALESCE(SUM(total_amount), 0) AS revenue_today FROM orders WHERE payment_status = 'paid' AND DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) = CONVERT_TZ(NOW(), '+00:00', '+08:00')"
          );
          const nowMYT = new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
          const reply =
            `📊 <b>Bot Stats</b>\n\n` +
            `💬 Conversations: ${total_conv}\n` +
            `📨 Messages today: ${today_msg} / ${total_msg} total\n` +
            `📦 Pending orders: ${pending_orders}\n` +
            `💰 Revenue today: RM ${parseFloat(revenue_today).toFixed(2)}\n\n` +
            `⏰ ${nowMYT} MYT`;
          const sent = await sendMessage(chatId, reply, "HTML");
          await logMessage(chatId, "out", "text", reply, sent.messageId);
        } catch {
          const sent = await sendMessage(chatId, "⚠️ Could not retrieve stats.", "HTML");
          await logMessage(chatId, "out", "text", "⚠️ Could not retrieve stats.", sent.messageId);
        }
        return new Response("OK", { status: 200 });
      }

      // AI reply for non-command messages
      const systemPrompt = process.env.TG_SYSTEM_PROMPT || "You are Eastel Mobile's Telegram assistant. Be helpful and concise.";
      // Reserve three provider attempts, including both fallback models.
      const release = await reservePublicInference(`telegram:${chatId}`, 3);
      if (!release) return new Response("OK", { status: 200 });
      try {
        const { text: reply } = await generateReply("gemini-2.0-flash", text, [], systemPrompt);
        if (reply) {
          const sent = await sendMessage(chatId, reply);
          await logMessage(chatId, "out", "text", reply, sent.messageId);
        }
      } catch { /* AI failure non-fatal */ }
      finally { release(); }
    }

    if (update.type === "callback_query") {
      // Acknowledge callback — handle callback_data here
      // tg.answerCallbackQuery is not imported but we can add if needed
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("Telegram webhook error:", e);
    return new Response("OK", { status: 200 });
  }
}

function escapeHtml(str: string | null | undefined): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

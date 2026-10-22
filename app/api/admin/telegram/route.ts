import { withDatabaseLock } from '@/lib/database-lock';
import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import type { RowDataPacket } from "mysql2/promise";
import * as tg from "@/lib/telegram/client";

// ── Helpers ──────────────────────────────────────────────────

async function loadCfg(): Promise<{ token: string; secret: string; adminChatId: string; botEnabled: boolean }> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT `key`, `value` FROM telegram_settings"
    );
    const cfg: Record<string, string> = {};
    for (const row of rows) {
      cfg[row.key] = row.value;
    }
    return {
      token: cfg.bot_token || "",
      secret: cfg.secret_token || "",
      adminChatId: cfg.admin_chat_id || "",
      botEnabled: cfg.bot_enabled === "1",
    };
  } catch {
    return { token: "", secret: "", adminChatId: "", botEnabled: false };
  }
}

async function saveSetting(key: string, value: string): Promise<void> {
  await db.execute(
    "INSERT INTO telegram_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
    [key, value, value]
  );
}

function maskToken(token: string): string {
  if (token.length <= 10) return token;
  return token.slice(0, 6) + "*".repeat(token.length - 10) + token.slice(-4);
}

// ── GET actions ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";

    // ── get_bot_status ─────────────────────────────────────
    if (action === "get_bot_status") {
      const cfg = await loadCfg();
      let bot = null;
      let botOk = false;
      let webhook = null;
      let webhookOk = false;

      if (cfg.token) {
        try {
          bot = await tg.getMe(cfg.token);
          botOk = true;
        } catch {
          bot = null;
        }
        try {
          webhook = await tg.getWebhookInfo(cfg.token);
          webhookOk = !!(webhook as Record<string, unknown>)?.url;
        } catch {
          webhook = null;
        }
      }

      return success({
        bot,
        bot_ok: botOk,
        webhook,
        webhook_ok: webhookOk,
        admin_chat_id: cfg.adminChatId,
        bot_enabled: cfg.botEnabled,
      });
    }

    // ── get_config ─────────────────────────────────────────
    if (action === "get_config") {
      const cfg = await loadCfg();
      return success({
        config: {
          bot_token_masked: cfg.token ? maskToken(cfg.token) : "",
          has_token: !!cfg.token,
          has_secret: !!cfg.secret,
          admin_chat_id: cfg.adminChatId,
          bot_enabled: cfg.botEnabled,
        },
      });
    }

    // ── get_conversations ──────────────────────────────────
    if (action === "get_conversations") {
      const search = (url.searchParams.get("search") || "").slice(0, 100).trim();
      const unreadOnly = url.searchParams.get("unread_only") === "1";

      const where: string[] = [];
      const params: (string | number)[] = [];

      if (search) {
        const like = `%${search}%`;
        where.push("(first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR title LIKE ?)");
        params.push(like, like, like, like);
      }
      if (unreadOnly) {
        where.push("unread_count > 0");
      }

      let sql = "SELECT * FROM telegram_conversations";
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY last_message_at DESC LIMIT 100";

      try {
        const [rows] = await db.query<RowDataPacket[]>(sql, params);
        return success({ conversations: rows });
      } catch {
        return success({ conversations: [] });
      }
    }

    // ── get_messages ───────────────────────────────────────
    if (action === "get_messages") {
      const chatId = url.searchParams.get("chat_id");
      if (!chatId) return error("chat_id required");
      try {
        const [rows] = await db.query<RowDataPacket[]>(
          "SELECT * FROM telegram_messages WHERE chat_id = ? ORDER BY sent_at ASC LIMIT 200",
          [chatId]
        );
        return success({ messages: rows });
      } catch {
        return success({ messages: [] });
      }
    }

    // ── get_file_url ───────────────────────────────────────
    if (action === "get_file_url") {
      const fileId = (url.searchParams.get("file_id") || "").trim();
      if (!fileId) return error("file_id required");
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot not configured");
      try {
        const file = await tg.getFile(fileId, cfg.token);
        if (!file.file_path) return error("Could not get file from Telegram");
        return success({ url: tg.getFileUrl(file.file_path, cfg.token) });
      } catch {
        return error("Could not get file from Telegram");
      }
    }

    // ── get_stats ──────────────────────────────────────────
    if (action === "get_stats") {
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
        return success({
          total_conversations: total_conv,
          total_messages: total_msg,
          messages_today: today_msg,
        });
      } catch {
        return success({ total_conversations: 0, total_messages: 0, messages_today: 0 });
      }
    }

    // ── get_bot_profile ────────────────────────────────────
    if (action === "get_bot_profile") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot not configured");
      try {
        const [nameResult, descResult, shortResult] = await Promise.all([
          tg.getMyName(undefined, cfg.token).catch(() => ({ name: "" })),
          tg.getMyDescription(undefined, cfg.token).catch(() => ({ description: "" })),
          tg.getMyShortDescription(undefined, cfg.token).catch(() => ({ short_description: "" })),
        ]);
        return success({
          name: (nameResult as { name?: string })?.name || "",
          description: (descResult as { description?: string })?.description || "",
          short_description: (shortResult as { short_description?: string })?.short_description || "",
        });
      } catch {
        return error("Failed to fetch bot profile");
      }
    }

    // ── get_bot_commands ───────────────────────────────────
    if (action === "get_bot_commands") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot not configured");
      const scopeParam = url.searchParams.get("scope");
      let scope: Record<string, unknown> | undefined;
      if (scopeParam && scopeParam !== "default") {
        scope = { type: scopeParam };
      }
      try {
        const commands = await tg.getMyCommands(scope, cfg.token);
        return success({ commands });
      } catch {
        return error("Failed to fetch commands");
      }
    }

    // ── get_webhook_settings ───────────────────────────────
    if (action === "get_webhook_settings") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot not configured");
      try {
        const info = await tg.getWebhookInfo(cfg.token);
        return success({
          max_connections: (info as Record<string, unknown>)?.max_connections ?? 40,
          allowed_updates: (info as Record<string, unknown>)?.allowed_updates ?? [],
          webhook_url: (info as Record<string, unknown>)?.url ?? "",
        });
      } catch {
        return error("Failed to fetch webhook settings");
      }
    }

    if (action === "detect_chat_id") return error("Use POST for chat detection.", 405);

    return error("Unknown action");
  } catch (e) {
    console.error("Admin Telegram GET error:", e);
    return error("Failed to load Telegram data.", 500);
  }
}

// ── POST actions ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    // Handle FormData for save_bot_photo
    const contentType = request.headers.get("content-type") || "";
    let action: string;
    let body: Record<string, unknown> = {};

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      action = (formData.get("action") as string) || "";
      body = Object.fromEntries(formData.entries());
    } else {
      const json = await request.json();
      action = json.action || "";
      body = json;
    }

    if (["detect_chat_id", "save_config", "set_webhook", "delete_webhook", "save_webhook_settings"].includes(action)) {
      return await withDatabaseLock('telegram-webhook-config', () => performAction(action, body));
    }
    return await performAction(action, body);
  } catch (e) {
    console.error("Admin Telegram POST error:", e);
    return error("Failed to update Telegram config.", 500);
  }
}

async function performAction(action: string, body: Record<string, unknown>) {
    if (action === "detect_chat_id") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot token not configured");
      const info = await tg.getWebhookInfo(cfg.token) as Record<string, unknown>;
      const prevUrl = typeof info.url === 'string' ? info.url : '';
      if (prevUrl && !cfg.secret.trim()) return error("Repair the webhook secret through Set Webhook before detection.");
      try {
        await tg.deleteWebhook(false, cfg.token);
        const updates = await tg.getUpdates(0, 1, 0, cfg.token);
        if (!updates.length) return success({ status: "waiting", message: "No messages found. Send /id or any message to your bot first, then try again." });
        const last = updates[updates.length - 1];
        const message = (last.message || last.edited_message || last.channel_post) as Record<string, unknown> | undefined;
        const chatId = (message?.chat as Record<string, unknown> | undefined)?.id;
        const from = message?.from as Record<string, unknown> | undefined;
        if (!chatId) return success({ status: "waiting", message: "Could not extract chat ID. Send /id to your bot and try again." });
        // Do not acknowledge the update or persist the detected administrator ID.
        return success({ status: "ok", chat_id: String(chatId), from_name: `${from?.first_name || ''} ${from?.last_name || ''}`.trim(), from_username: String(from?.username || '') });
      } finally {
        if (prevUrl) await tg.setWebhook(prevUrl, cfg.secret, {
          drop_pending_updates: false,
          max_connections: typeof info.max_connections === 'number' ? info.max_connections : 40,
          allowed_updates: Array.isArray(info.allowed_updates) ? info.allowed_updates as string[] : [],
        }, cfg.token);
      }
    }

    // ── save_config ────────────────────────────────────────
    if (action === "save_config") {
      const token = (body.bot_token as string || "").trim();
      const secret = (body.secret_token as string || "").trim();
      const chatId = (body.admin_chat_id as string || "").trim();
      const enabled = body.bot_enabled ? "1" : "0";

      // Only overwrite token if a new one was submitted (not masked)
      if (token && !token.includes("*")) await saveSetting("bot_token", token);
      if (secret !== "") await saveSetting("secret_token", secret);
      if (chatId !== "") await saveSetting("admin_chat_id", chatId);
      await saveSetting("bot_enabled", enabled);

      return success({ message: "Configuration saved." });
    }

    // ── set_webhook ────────────────────────────────────────
    if (action === "set_webhook") {
      const cfg = await loadCfg();
      const url = (body.webhook_url as string || "").trim();
      if (!url) return error("webhook_url required");
      if (!cfg.token) return error("Bot token not configured");

      const secret = crypto.randomUUID().replace(/-/g, "");
      await saveSetting("secret_token", secret);

      try {
        await tg.setWebhook(url, secret, {
          drop_pending_updates: true,
          allowed_updates: ["message", "callback_query", "inline_query"],
        }, cfg.token);
        return success({ message: "Webhook registered." });
      } catch (e) {
        return error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // ── delete_webhook ─────────────────────────────────────
    if (action === "delete_webhook") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot token not configured");
      try {
        await tg.deleteWebhook(true, cfg.token);
        return success({ message: "Webhook removed." });
      } catch (e) {
        return error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // ── test_send ──────────────────────────────────────────
    if (action === "test_send") {
      const cfg = await loadCfg();
      const chatId = (body.chat_id as string) || cfg.adminChatId;
      const text = (body.text as string) || `✅ Test message from Eastel Admin Panel — ${new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}`;
      if (!chatId) return error("No admin_chat_id configured");
      if (!cfg.token) return error("Bot token not configured");

      try {
        const result = await tg.sendMessage(chatId, text, "HTML");
        // Log the outgoing message
        try {
          await db.execute(
            "INSERT INTO telegram_messages (chat_id, message_id, direction, message_type, text, sent_at) VALUES (?, ?, 'out', 'text', ?, NOW())",
            [chatId, result.messageId, text]
          );
        } catch { /* non-fatal */ }
        return success({ message: "Message sent.", message_id: result.messageId });
      } catch (e) {
        return error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // ── send_message ───────────────────────────────────────
    if (action === "send_message") {
      const cfg = await loadCfg();
      const chatId = (body.chat_id as string || "").trim();
      const text = (body.text as string || "").trim();
      if (!chatId || !text) return error("chat_id and text required");
      if (!cfg.token) return error("Bot token not configured");

      try {
        const result = await tg.sendMessage(chatId, text, "HTML");
        // Log outgoing message
        await db.execute(
          "INSERT INTO telegram_messages (chat_id, message_id, direction, message_type, text, sent_at) VALUES (?, ?, 'out', 'text', ?, NOW())",
          [chatId, result.messageId, text]
        );
        // Update conversation last message
        await db.execute(
          "UPDATE telegram_conversations SET last_message_text = ?, last_message_at = NOW() WHERE chat_id = ?",
          [text.slice(0, 255), chatId]
        );
        return success({ message: "Sent.", message_id: result.messageId });
      } catch (e) {
        return error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // ── mark_read ──────────────────────────────────────────
    if (action === "mark_read") {
      const chatId = body.chat_id as string;
      if (chatId) {
        await db.execute(
          "UPDATE telegram_conversations SET unread_count = 0 WHERE chat_id = ?",
          [chatId]
        );
      }
      return success({});
    }

    // ── delete_conversation ────────────────────────────────
    if (action === "delete_conversation") {
      const chatId = body.chat_id as string;
      if (!chatId) return error("chat_id required");
      await db.execute("DELETE FROM telegram_messages WHERE chat_id = ?", [chatId]);
      await db.execute(
        "UPDATE telegram_conversations SET unread_count = 0, last_message_text = '' WHERE chat_id = ?",
        [chatId]
      );
      return success({ message: "Conversation history cleared." });
    }

    // ── save_bot_profile ───────────────────────────────────
    if (action === "save_bot_profile") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot not configured");

      const errors: string[] = [];
      const name = (body.name as string || "").trim();
      const desc = (body.description as string || "").trim();
      const short = (body.short_description as string || "").trim();

      if (name) {
        try { await tg.setMyName(name, undefined, cfg.token); }
        catch (e) { errors.push("Name: " + (e instanceof Error ? e.message : "unknown")); }
      }
      if (desc) {
        try { await tg.setMyDescription(desc, undefined, cfg.token); }
        catch (e) { errors.push("Description: " + (e instanceof Error ? e.message : "unknown")); }
      }
      if (short) {
        try { await tg.setMyShortDescription(short, undefined, cfg.token); }
        catch (e) { errors.push("Short description: " + (e instanceof Error ? e.message : "unknown")); }
      }

      return errors.length
        ? error(errors.join("; "))
        : success({ message: "Bot profile updated." });
    }

    // ── save_bot_commands ──────────────────────────────────
    if (action === "save_bot_commands") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot not configured");

      const commands = body.commands as Array<{ command: string; description: string }>;
      if (!Array.isArray(commands)) return error("commands must be an array");

      const scopeParam = (body.scope as string || "").trim();
      let scope: Record<string, unknown> | undefined;
      if (scopeParam && scopeParam !== "default") {
        scope = { type: scopeParam };
      }

      try {
        await tg.setMyCommands(commands, scope, cfg.token);
        return success({ message: "Commands saved." });
      } catch (e) {
        return error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // ── save_bot_photo ─────────────────────────────────────
    if (action === "save_bot_photo") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot not configured");

      const remove = body.remove === true || body.remove === "1" || body.remove === "true";
      if (remove) {
        try {
          await tg.removeMyProfilePhoto(cfg.token);
          return success({ message: "Profile photo removed." });
        } catch (e) {
          return error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }

      const photo = body.photo as File | null;
      if (!photo) return error("No photo file uploaded.");

      try {
        const blob = photo instanceof Blob ? photo : new Blob([photo]);
        await tg.setMyProfilePhoto(blob, cfg.token);
        return success({ message: "Profile photo updated." });
      } catch (e) {
        return error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // ── save_webhook_settings ──────────────────────────────
    if (action === "save_webhook_settings") {
      const cfg = await loadCfg();
      if (!cfg.token) return error("Bot not configured");

      // Get current webhook URL
      let currentUrl = "";
      try {
        const info = (await tg.getWebhookInfo(cfg.token)) as Record<string, unknown>;
        currentUrl = (info?.url as string) || "";
      } catch { /* ignore */ }

      if (!currentUrl) return error("No webhook is currently set. Set a webhook first.");

      const maxConn = Math.max(1, Math.min(100, parseInt(body.max_connections as string) || 40));
      const allowedUpdates = (body.allowed_updates as string[]) || [];
      const secret = cfg.secret || crypto.randomUUID().replace(/-/g, "");
      if (!cfg.secret) await saveSetting("secret_token", secret);

      try {
        await tg.setWebhook(currentUrl, secret, {
          max_connections: maxConn,
          allowed_updates: allowedUpdates,
          drop_pending_updates: false,
        }, cfg.token);
        return success({ message: "Webhook settings updated." });
      } catch (e) {
        return error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    return error("Unknown action");
}

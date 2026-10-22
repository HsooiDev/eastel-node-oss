import type { NextRequest } from "next/server";
import { verifyWebhook, sendText, markRead } from "@/lib/whatsapp/client";
import { processIncoming } from "@/lib/whatsapp/ai";
import { storeWhatsAppMedia } from "@/lib/whatsapp/media-storage";
import db from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

const STICKER_REPLIES = [
  "Sticker received! Ada apa yang boleh saya bantu?",
  "Hehe! Kalau ada soalan pasal Eastel Mobile, feel free to ask ye!",
  "Nice sticker! Nak tahu pasal plan kami? Visit eastel.site!",
];

async function isPausedContact(phone: string): Promise<boolean> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT cfg_value FROM whatsapp_config WHERE cfg_key = 'paused_contacts' LIMIT 1"
    );
    if (!rows.length) return false;
    const paused: string[] = JSON.parse(rows[0].cfg_value || "[]");
    return paused.includes(phone);
  } catch {
    return false;
  }
}

async function logIncoming(
  msgId: string,
  phone: string,
  contactName: string | null,
  message: string,
  msgType: string,
  mediaId: string,
  mediaPath: string | null
): Promise<boolean> {
  try {
    const mediaColumn = mediaPath ? ', media_path' : '';
    const mediaValue = mediaPath ? ', ?' : '';
    const values: Array<string | null> = [msgId, phone, contactName, message, msgType, mediaId || ''];
    if (mediaPath) values.push(mediaPath);
    await db.execute(
      `INSERT INTO whatsapp_logs (msg_id, phone, contact_name, direction, message, msg_type, is_ai, media_id${mediaColumn}, local_date)
       VALUES (?, ?, ?, 'in', ?, ?, 0, ?${mediaValue}, CURDATE())`,
      values
    );
    return true;
  } catch {
    console.error("WhatsApp incoming log write failed.");
    return false;
  }
}

async function logOutgoing(
  phone: string,
  contactName: string | null,
  message: string,
  outMsgId: string,
  replyToMsgId: string
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO whatsapp_logs (phone, contact_name, direction, message, msg_type, is_ai, msg_id, reply_to_msg_id, local_date)
       VALUES (?, ?, 'out', ?, 'text', 0, ?, ?, CURDATE())`,
      [phone, contactName, message, outMsgId, replyToMsgId]
    );
  } catch (e) {
    console.error("WhatsApp log outgoing failed:", e);
  }
}

async function updateDeliveryStatuses(
  statuses: Array<Record<string, unknown>>
): Promise<void> {
  for (const status of statuses) {
    const statusId = status.id as string | undefined;
    const statusVal = status.status as string | undefined;
    if (!statusId || !statusVal) continue;

    try {
      await db.execute(
        "UPDATE whatsapp_logs SET delivery_status = ? WHERE msg_id = ? AND direction = 'out' LIMIT 1",
        [statusVal, statusId]
      );
    } catch (e) {
      console.error("Delivery status update failed:", e);
    }

    if (statusVal === "failed") {
      const errCode =
        (status.errors as Array<Record<string, unknown>>)?.[0]?.code ?? "";
      const errTitle =
        (status.errors as Array<Record<string, unknown>>)?.[0]?.title ?? "";
      console.error(
        `WA Delivery FAILED msg_id=${statusId} code=${errCode} title=${errTitle}`
      );
    }
  }
}

async function handleReaction(
  msg: Record<string, unknown>,
  phone: string
): Promise<void> {
  const reaction = msg.reaction as Record<string, unknown> | undefined;
  const emoji = (reaction?.emoji as string) || "";
  const reactMsgId = (reaction?.message_id as string) || "";

  try {
    if (emoji) {
      await db.execute(
        "DELETE FROM wa_message_reactions WHERE msg_id = ? AND phone = ?",
        [reactMsgId, phone]
      );
      await db.execute(
        "INSERT INTO wa_message_reactions (phone, msg_id, emoji) VALUES (?, ?, ?)",
        [phone, reactMsgId, emoji]
      );
    } else {
      await db.execute(
        "DELETE FROM wa_message_reactions WHERE msg_id = ? AND phone = ?",
        [reactMsgId, phone]
      );
    }
  } catch (e) {
    console.error("Reaction store failed:", e);
  }
}

async function handleStickerReply(
  phone: string,
  contactName: string | null,
  msgId: string
): Promise<void> {
  const reply =
    STICKER_REPLIES[Math.floor(Math.random() * STICKER_REPLIES.length)];
  try {
    const outMsgId = await sendText(phone, reply, msgId);
    await logOutgoing(phone, contactName, reply, outMsgId, msgId);
  } catch (e) {
    console.error("Sticker reply failed:", e);
  }
}

async function handleVideoReply(
  phone: string,
  contactName: string | null,
  msgId: string
): Promise<void> {
  const reply =
    "Video received — if you have a question, please type it or send a photo instead 📸";
  try {
    const outMsgId = await sendText(phone, reply, msgId);
    await logOutgoing(phone, contactName, reply, outMsgId, msgId);
  } catch (e) {
    console.error("Video reply failed:", e);
  }
}

function extractMessageData(msg: Record<string, unknown>): {
  text: string;
  mediaType: string | null;
  mediaId: string;
  skipAI: boolean;
} {
  const type = (msg.type as string) || "text";
  let text = "";
  let mediaType: string | null = null;
  let mediaId = "";
  let skipAI = false;

  switch (type) {
    case "text":
      text = (msg.text as Record<string, string>)?.body || "";
      break;

    case "image": {
      const image = msg.image as Record<string, string> | undefined;
      mediaType = "image";
      mediaId = image?.id || "";
      text = image?.caption || "";
      break;
    }

    case "sticker": {
      const sticker = msg.sticker as Record<string, string> | undefined;
      mediaId = sticker?.id || "";
      text = "[sticker]";
      break;
    }

    case "audio":
    case "voice": {
      const audio = msg.audio as Record<string, string> | undefined;
      const voice = msg.voice as Record<string, string> | undefined;
      mediaType = "audio";
      mediaId = audio?.id || voice?.id || "";
      break;
    }

    case "video": {
      const video = msg.video as Record<string, string> | undefined;
      mediaId = video?.id || "";
      text = video?.caption || "[Video received]";
      skipAI = true;
      break;
    }

    case "document": {
      const doc = msg.document as Record<string, string> | undefined;
      mediaType = "document";
      mediaId = doc?.id || "";
      text = doc?.caption || "";
      break;
    }

    case "interactive": {
      const interactive = msg.interactive as Record<
        string,
        Record<string, string>
      > | null;
      text =
        interactive?.button_reply?.title ||
        interactive?.list_reply?.title ||
        "";
      break;
    }

    case "button": {
      const button = msg.button as Record<string, string> | undefined;
      text = button?.text || button?.payload || "[Button pressed]";
      break;
    }

    case "location": {
      const loc = msg.location as Record<string, unknown> | undefined;
      const lat = (loc?.latitude as number) || 0;
      const lng = (loc?.longitude as number) || 0;
      const locName = (loc?.name as string) || "";
      const addr = (loc?.address as string) || "";
      const label = locName || addr || `(${lat}, ${lng})`;
      text = `[Location: ${label}] https://maps.google.com/?q=${lat},${lng}`;
      skipAI = true;
      break;
    }

    case "contacts": {
      const contacts = (msg.contacts as Array<Record<string, unknown>>) || [];
      const names = contacts.map(
        (c) =>
          (c.name as Record<string, string>)?.formatted_name ||
          (
            (c.phones as Array<Record<string, string>>)?.[0] as Record<
              string,
              string
            >
          )?.phone ||
          "Unknown"
      );
      text = `[Contact: ${names.join(", ")}]`;
      skipAI = true;
      break;
    }

    case "reaction": {
      const reaction = msg.reaction as Record<string, string> | undefined;
      text = reaction?.emoji
        ? `[Reacted: ${reaction.emoji}]`
        : "[Reaction removed]";
      skipAI = true;
      break;
    }

    case "order": {
      const order = msg.order as Record<
        string,
        Array<Record<string, unknown>>
      > | undefined;
      const items = (order?.product_items || []).map(
        (item) => `${item.quantity || 1}x ${item.name || "item"}`
      );
      text = `[Order: ${items.join(", ")}]`;
      skipAI = true;
      break;
    }

    case "system": {
      const system = msg.system as Record<string, string> | undefined;
      text = system?.body || "[System message]";
      skipAI = true;
      break;
    }

    case "template": {
      const template = msg.template as Record<
        string,
        Array<Record<string, Array<Record<string, string>>>>
      > | null;
      text =
        template?.components?.[0]?.parameters?.[0]?.text ||
        (msg.template as Record<string, string>)?.name ||
        "[Template message]";
      skipAI = true;
      break;
    }

    case "unsupported":
      text = "Meta webhook test received";
      skipAI = true;
      break;

    default:
      text = `[${type}]`;
      skipAI = true;
      break;
  }

  return { text, mediaType, mediaId, skipAI };
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256") || "";

    if (!verifyWebhook(rawBody, signature)) {
      return new Response("Invalid signature", { status: 403 });
    }

    // Probabilistic cleanup of stale records (~2% chance)
    if (Math.random() < 0.02) {
      db.execute("DELETE FROM whatsapp_processed WHERE created_at < NOW() - INTERVAL 24 HOUR").catch(() => {})
      db.execute("DELETE FROM wa_rate_limits WHERE window_start < NOW() - INTERVAL 2 HOUR").catch(() => {})
    }

    const body = JSON.parse(rawBody);
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages: Array<Record<string, unknown>> =
      value?.messages || [];
    const contacts: Array<Record<string, unknown>> =
      value?.contacts || [];
    const statuses: Array<Record<string, unknown>> =
      value?.statuses || [];

    if (statuses.length > 0) {
      await updateDeliveryStatuses(statuses);
    }

    if (messages.length === 0) {
      return new Response("OK", { status: 200 });
    }

    const contactMap = new Map<string, string>();
    for (const c of contacts) {
      const waId = c.wa_id as string;
      const name = (c.profile as Record<string, string>)?.name || "";
      if (waId) contactMap.set(waId, name);
    }

    for (const msg of messages) {
      const phone = msg.from as string;
      const msgId = msg.id as string;
      const contactName = contactMap.get(phone) || null;

      const { text, mediaType, mediaId, skipAI } = extractMessageData(msg);
      const msgType = (msg.type as string) || "text";

      let mediaPath: string | null = null;
      if (mediaId) {
        try { mediaPath = await storeWhatsAppMedia(phone, msgId, mediaId); }
        catch {
          // Keep delivery retryable; never acknowledge an unsaved attachment.
          console.error("WhatsApp attachment persistence failed.");
          return new Response("Media temporarily unavailable", { status: 503 });
        }
      }
      const logged = await logIncoming(msgId, phone, contactName, text, msgType, mediaId, mediaPath);
      if (mediaPath && !logged) return new Response("Media log temporarily unavailable", { status: 503 });

      const shouldMarkRead = ["text", "image", "document"].includes(msgType);
      if (shouldMarkRead) {
        markRead(msgId).catch((e) =>
          console.error("markRead failed:", e)
        );
      }

      if (await isPausedContact(phone)) {
        console.log(
          `WA Bot: Bot paused for ${phone} — human takeover mode, skipping ALL replies`
        );
        continue;
      }

      if (msgType === "sticker") {
        handleStickerReply(phone, contactName, msgId).catch(console.error);
        continue;
      }

      if (msgType === "video") {
        handleVideoReply(phone, contactName, msgId).catch(console.error);
        continue;
      }

      if (msgType === "reaction") {
        await handleReaction(msg, phone);
        continue;
      }

      if (skipAI) {
        continue;
      }

      processIncoming(phone, msgId, text, contactName, mediaType, null).catch(
        console.error
      );
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("WhatsApp webhook error:", e);
    return new Response("OK", { status: 200 });
  }
}

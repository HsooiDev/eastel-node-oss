# WhatsApp Rules

## Architecture

- **Client:** `lib/whatsapp/client.ts` — 20 functions for WhatsApp Cloud API (send, media, CRUD, webhook parse).
- **AI Orchestrator:** `lib/whatsapp/ai.ts` — dedup, rate limiting, escalation, pending queue, daily usage tracking.
- **Shared AI:** `lib/ai/gemini.ts` — used by WhatsApp, Telegram, and website chatbot.
- **Admin API:** `app/api/admin/whatsapp/route.ts` — 13 GET + 15 POST actions.
- **Webhook:** `app/api/whatsapp/webhook/route.ts` — receives Meta webhook events.
- **Cron:** `app/api/whatsapp/debounce/route.ts` (1 min) and `app/api/whatsapp/missed/route.ts` (3 hr).

## Phone Number Format

- Stored **without `+` prefix**: `60123456789` not `+60123456789`.
- Always strip `+` before storing or comparing.

## Deduplication

- Meta delivers the same webhook event multiple times.
- Always check `whatsapp_processed` table before processing.
- Insert message ID into `whatsapp_processed` immediately after first processing.

## Rate Limiting

- Per-phone rate limiting tracked in `wa_rate_limits`.
- Daily AI usage tracked in `wa_daily_usage`.
- Respect active hours configuration from `whatsapp_config`.

## Reply Queue (Debounce)

- Rapid messages from same user are batched via `wa_reply_queue`.
- Cron job (`debounce/route.ts`) processes queue every minute.
- Failed AI replies go to `wa_pending_queue` for retry with exponential backoff.

## Escalation

- Auto-escalation rules in `wa_escalation_rules` — keyword-based or time-based.
- Actions: pause bot, apply tag, create admin notice.
- Admin notices show in dashboard bell icon.

## App Secret Proof

- All API requests must include HMAC `appsecret_proof` (using `appSecretProof()` in client.ts).
- API version: v22.0.

## Testing

- Test Bot feature in admin panel — saves conversations to `wa_test_logs`.
- Self-enhance (learn from response) saves to knowledge base.

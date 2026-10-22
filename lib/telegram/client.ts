// Telegram Bot API Client — Reusable, project-agnostic
// No DB, no sessions, no project-specific logic.

const API = 'https://api.telegram.org'

function getToken(customToken?: string): string {
  const t = customToken || process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN not configured')
  return t
}

interface TgResponse {
  ok: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any
  description?: string
}

async function tg(method: string, body?: Record<string, unknown>, token?: string): Promise<TgResponse> {
  const res = await fetch(`${API}/bot${getToken(token)}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data: TgResponse = await res.json()
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.statusText}`)
  return data
}

async function tgMultipart(method: string, form: FormData, token?: string): Promise<TgResponse> {
  const res = await fetch(`${API}/bot${getToken(token)}/${method}`, {
    method: 'POST',
    body: form,
  })
  const data: TgResponse = await res.json()
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.statusText}`)
  return data
}

// ── Messages ─────────────────────────────────────────────────

export async function sendMessage(chatId: number | string, text: string, parseMode?: 'MarkdownV2' | 'HTML', replyTo?: number) {
  const r = await tg('sendMessage', { chat_id: String(chatId), text, ...(parseMode ? { parse_mode: parseMode } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number, chatId: r.result?.chat?.id as number }
}

export async function sendPhoto(chatId: number | string, photo: string, caption?: string, replyTo?: number) {
  const r = await tg('sendPhoto', { chat_id: String(chatId), photo, ...(caption ? { caption } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendDocument(chatId: number | string, document: string, caption?: string, replyTo?: number) {
  const r = await tg('sendDocument', { chat_id: String(chatId), document, ...(caption ? { caption } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendAudio(chatId: number | string, audio: string, caption?: string, replyTo?: number) {
  const r = await tg('sendAudio', { chat_id: String(chatId), audio, ...(caption ? { caption } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendVideo(chatId: number | string, video: string, caption?: string, replyTo?: number) {
  const r = await tg('sendVideo', { chat_id: String(chatId), video, ...(caption ? { caption } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendLocation(chatId: number | string, lat: number, lng: number, replyTo?: number) {
  const r = await tg('sendLocation', { chat_id: String(chatId), latitude: lat, longitude: lng, ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendContact(chatId: number | string, phone: string, firstName: string, lastName?: string, replyTo?: number) {
  const r = await tg('sendContact', { chat_id: String(chatId), phone_number: phone, first_name: firstName, ...(lastName ? { last_name: lastName } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendSticker(chatId: number | string, sticker: string, replyTo?: number) {
  const r = await tg('sendSticker', { chat_id: String(chatId), sticker, ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendVoice(chatId: number | string, voice: string, caption?: string, replyTo?: number) {
  const r = await tg('sendVoice', { chat_id: String(chatId), voice, ...(caption ? { caption } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendPoll(chatId: number | string, question: string, options: string[], replyTo?: number) {
  const r = await tg('sendPoll', { chat_id: String(chatId), question, options, ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendChatAction(chatId: number | string, action: string) {
  await tg('sendChatAction', { chat_id: String(chatId), action })
}

export async function forwardMessage(chatId: number | string, fromChatId: number | string, messageId: number) {
  const r = await tg('forwardMessage', { chat_id: String(chatId), from_chat_id: String(fromChatId), message_id: messageId })
  return { messageId: r.result?.message_id as number }
}

export async function copyMessage(chatId: number | string, fromChatId: number | string, messageId: number) {
  const r = await tg('copyMessage', { chat_id: String(chatId), from_chat_id: String(fromChatId), message_id: messageId })
  return { messageId: r.result?.message_id as number }
}

export async function sendMediaGroup(chatId: number | string, media: Array<{ type: string; media: string; caption?: string }>, replyTo?: number) {
  const r = await tg('sendMediaGroup', { chat_id: String(chatId), media, ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageIds: (r.result as Array<{ message_id: number }>)?.map(m => m.message_id) || [] }
}

// ── Message Management ───────────────────────────────────────

export async function editMessageText(chatId: number | string, messageId: number, text: string, parseMode?: 'MarkdownV2' | 'HTML') {
  await tg('editMessageText', { chat_id: String(chatId), message_id: messageId, text, ...(parseMode ? { parse_mode: parseMode } : {}) })
}

export async function deleteMessage(chatId: number | string, messageId: number) {
  await tg('deleteMessage', { chat_id: String(chatId), message_id: messageId })
}

export async function pinChatMessage(chatId: number | string, messageId: number, disableNotification?: boolean) {
  await tg('pinChatMessage', { chat_id: String(chatId), message_id: messageId, disable_notification: disableNotification ?? false })
}

export async function unpinChatMessage(chatId: number | string, messageId?: number) {
  await tg('unpinChatMessage', { chat_id: String(chatId), ...(messageId ? { message_id: messageId } : {}) })
}

// ── Webhook ──────────────────────────────────────────────────

export async function setWebhook(url: string, secretToken?: string, options?: Record<string, unknown>, token?: string) {
  const r = await tg('setWebhook', { url, ...(secretToken ? { secret_token: secretToken } : {}), ...(options || {}) }, token)
  return { ok: r.ok }
}

export async function deleteWebhook(dropPending?: boolean, token?: string) {
  const r = await tg('deleteWebhook', { drop_pending_updates: dropPending ?? false }, token)
  return { ok: r.ok }
}

export async function getWebhookInfo(token?: string) {
  const r = await tg('getWebhookInfo', undefined, token)
  return r.result
}

// ── Bot Info ─────────────────────────────────────────────────

export async function getMe(token?: string) {
  const r = await tg('getMe', undefined, token)
  return r.result as { id: number; username?: string; first_name: string }
}

export async function getChat(chatId: number | string, token?: string) {
  const r = await tg('getChat', { chat_id: String(chatId) }, token)
  return r.result
}

export async function getUpdates(offset?: number, limit?: number, timeout?: number, token?: string) {
  const r = await tg('getUpdates', { ...(offset ? { offset } : {}), ...(limit ? { limit } : {}), ...(timeout ? { timeout } : {}) }, token)
  return (r.result as Array<Record<string, unknown>>) || []
}

// ── Commands ─────────────────────────────────────────────────

export async function setMyCommands(commands: Array<{ command: string; description: string }>, scope?: Record<string, unknown>, token?: string) {
  await tg('setMyCommands', { commands, ...(scope ? { scope } : {}) }, token)
}

export async function getMyCommands(scope?: Record<string, unknown>, token?: string) {
  const r = await tg('getMyCommands', { ...(scope ? { scope } : {}) }, token)
  return (r.result as Array<{ command: string; description: string }>) || []
}

export async function deleteMyCommands(scope?: Record<string, unknown>, token?: string) {
  await tg('deleteMyCommands', { ...(scope ? { scope } : {}) }, token)
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean) {
  await tg('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}), show_alert: showAlert ?? false })
}

// ── Additional Send Functions ─────────────────────────────────

export async function sendAnimation(chatId: number | string, animation: string, caption?: string, replyTo?: number) {
  const r = await tg('sendAnimation', { chat_id: String(chatId), animation, ...(caption ? { caption } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendVenue(chatId: number | string, lat: number, lng: number, title: string, address: string, replyTo?: number) {
  const r = await tg('sendVenue', { chat_id: String(chatId), latitude: lat, longitude: lng, title, address, ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

export async function sendDice(chatId: number | string, emoji?: string, replyTo?: number) {
  const r = await tg('sendDice', { chat_id: String(chatId), ...(emoji ? { emoji } : {}), ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number, value: r.result?.dice?.value as number }
}

export async function sendVideoNote(chatId: number | string, videoNote: string, replyTo?: number) {
  const r = await tg('sendVideoNote', { chat_id: String(chatId), video_note: videoNote, ...(replyTo ? { reply_to_message_id: replyTo } : {}) })
  return { messageId: r.result?.message_id as number }
}

// ── Bulk Operations ───────────────────────────────────────────

export async function forwardMessages(chatId: number | string, fromChatId: number | string, messageIds: number[]) {
  const r = await tg('forwardMessages', { chat_id: String(chatId), from_chat_id: String(fromChatId), message_ids: messageIds })
  return { messageIds: (r.result as Array<{ message_id: number }>)?.map(m => m.message_id) || [] }
}

export async function copyMessages(chatId: number | string, fromChatId: number | string, messageIds: number[]) {
  const r = await tg('copyMessages', { chat_id: String(chatId), from_chat_id: String(fromChatId), message_ids: messageIds })
  return { messageIds: (r.result as Array<{ message_id: number }>)?.map(m => m.message_id) || [] }
}

export async function deleteMessages(chatId: number | string, messageIds: number[]) {
  await tg('deleteMessages', { chat_id: String(chatId), message_ids: messageIds })
}

// ── Extended Edit ─────────────────────────────────────────────

export async function editMessageCaption(chatId: number | string, messageId: number, caption: string, parseMode?: 'MarkdownV2' | 'HTML') {
  await tg('editMessageCaption', { chat_id: String(chatId), message_id: messageId, caption, ...(parseMode ? { parse_mode: parseMode } : {}) })
}

export async function editMessageReplyMarkup(chatId: number | string, messageId: number, replyMarkup: Record<string, unknown>) {
  await tg('editMessageReplyMarkup', { chat_id: String(chatId), message_id: messageId, reply_markup: replyMarkup })
}

// ── Reactions ─────────────────────────────────────────────────

export async function setMessageReaction(chatId: number | string, messageId: number, reaction?: Array<{ type: string; emoji: string }>) {
  await tg('setMessageReaction', { chat_id: String(chatId), message_id: messageId, ...(reaction ? { reaction } : {}) })
}

// ── Pin/Unpin All ─────────────────────────────────────────────

export async function unpinAllChatMessages(chatId: number | string) {
  const r = await tg('unpinAllChatMessages', { chat_id: String(chatId) })
  return { ok: r.ok }
}

// ── Chat Management ───────────────────────────────────────────

export async function getChatMemberCount(chatId: number | string) {
  const r = await tg('getChatMemberCount', { chat_id: String(chatId) })
  return r.result as number
}

export async function getChatAdministrators(chatId: number | string) {
  const r = await tg('getChatAdministrators', { chat_id: String(chatId) })
  return r.result || []
}

export async function leaveChat(chatId: number | string) {
  const r = await tg('leaveChat', { chat_id: String(chatId) })
  return { ok: r.ok }
}

export async function banChatMember(chatId: number | string, userId: number, untilDate?: number) {
  const r = await tg('banChatMember', { chat_id: String(chatId), user_id: userId, ...(untilDate ? { until_date: untilDate } : {}) })
  return { ok: r.ok }
}

export async function unbanChatMember(chatId: number | string, userId: number, onlyIfBanned?: boolean) {
  const r = await tg('unbanChatMember', { chat_id: String(chatId), user_id: userId, only_if_banned: onlyIfBanned ?? true })
  return { ok: r.ok }
}

export async function restrictChatMember(chatId: number | string, userId: number, permissions: Record<string, unknown>, untilDate?: number) {
  const r = await tg('restrictChatMember', { chat_id: String(chatId), user_id: userId, permissions, ...(untilDate ? { until_date: untilDate } : {}) })
  return { ok: r.ok }
}

export async function promoteChatMember(chatId: number | string, userId: number, privileges: Record<string, unknown>) {
  const r = await tg('promoteChatMember', { chat_id: String(chatId), user_id: userId, ...privileges })
  return { ok: r.ok }
}

export async function setChatTitle(chatId: number | string, title: string) {
  const r = await tg('setChatTitle', { chat_id: String(chatId), title })
  return { ok: r.ok }
}

export async function setChatDescription(chatId: number | string, description: string) {
  const r = await tg('setChatDescription', { chat_id: String(chatId), description })
  return { ok: r.ok }
}

// ── Invite Links ──────────────────────────────────────────────

export async function createChatInviteLink(chatId: number | string, name?: string, expireDate?: number, memberLimit?: number) {
  const r = await tg('createChatInviteLink', { chat_id: String(chatId), ...(name ? { name } : {}), ...(expireDate ? { expire_date: expireDate } : {}), ...(memberLimit ? { member_limit: memberLimit } : {}) })
  return r.result
}

export async function editChatInviteLink(chatId: number | string, inviteLink: string, name?: string, expireDate?: number, memberLimit?: number) {
  const r = await tg('editChatInviteLink', { chat_id: String(chatId), invite_link: inviteLink, ...(name ? { name } : {}), ...(expireDate ? { expire_date: expireDate } : {}), ...(memberLimit ? { member_limit: memberLimit } : {}) })
  return r.result
}

export async function revokeChatInviteLink(chatId: number | string, inviteLink: string) {
  const r = await tg('revokeChatInviteLink', { chat_id: String(chatId), invite_link: inviteLink })
  return r.result
}

// ── Files ─────────────────────────────────────────────────────

export async function getFile(fileId: string, token?: string) {
  const r = await tg('getFile', { file_id: fileId }, token)
  return r.result as { file_id: string; file_unique_id: string; file_size?: number; file_path?: string }
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const file = await getFile(fileId)
  if (!file.file_path) throw new Error('File path not available')
  const token = getToken()
  const res = await fetch(`${API}/file/bot${token}/${file.file_path}`)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return res.arrayBuffer()
}

export function getFileUrl(filePath: string, token?: string): string {
  return `${API}/file/bot${getToken(token)}/${filePath}`
}

// ── Bot Profile ───────────────────────────────────────────────

export async function setMyName(name?: string, languageCode?: string, token?: string) {
  await tg('setMyName', { ...(name ? { name } : {}), ...(languageCode ? { language_code: languageCode } : {}) }, token)
}

export async function getMyName(languageCode?: string, token?: string) {
  const r = await tg('getMyName', { ...(languageCode ? { language_code: languageCode } : {}) }, token)
  return r.result
}

export async function setMyDescription(description?: string, languageCode?: string, token?: string) {
  await tg('setMyDescription', { ...(description ? { description } : {}), ...(languageCode ? { language_code: languageCode } : {}) }, token)
}

export async function getMyDescription(languageCode?: string, token?: string) {
  const r = await tg('getMyDescription', { ...(languageCode ? { language_code: languageCode } : {}) }, token)
  return r.result
}

export async function setMyShortDescription(shortDescription?: string, languageCode?: string, token?: string) {
  await tg('setMyShortDescription', { ...(shortDescription ? { short_description: shortDescription } : {}), ...(languageCode ? { language_code: languageCode } : {}) }, token)
}

export async function getMyShortDescription(languageCode?: string, token?: string) {
  const r = await tg('getMyShortDescription', { ...(languageCode ? { language_code: languageCode } : {}) }, token)
  return r.result
}

export async function setMyProfilePhoto(photo: Blob, token?: string) {
  const form = new FormData()
  form.set('photo', photo)
  const r = await tgMultipart('setMyProfilePhoto', form, token)
  return r.result
}

export async function removeMyProfilePhoto(token?: string) {
  await tg('removeMyProfilePhoto', {}, token)
}

// ── Inline Queries ────────────────────────────────────────────

export async function answerInlineQuery(inlineQueryId: string, results: Array<Record<string, unknown>>, cacheTime?: number) {
  await tg('answerInlineQuery', { inline_query_id: inlineQueryId, results, ...(cacheTime ? { cache_time: cacheTime } : {}) })
}

// ── Keyboard Builders ─────────────────────────────────────────

export function inlineKeyboard(buttons: Array<Array<{ text: string; url?: string; callback_data?: string; web_app?: { url: string } }>>) {
  return { inline_keyboard: buttons }
}

export function replyKeyboard(buttons: Array<Array<{ text: string; request_contact?: boolean; request_location?: boolean }>>, options?: { resize?: boolean; oneTime?: boolean; inputFieldPlaceholder?: string }) {
  return {
    keyboard: buttons,
    resize_keyboard: options?.resize ?? true,
    one_time_keyboard: options?.oneTime ?? false,
    ...(options?.inputFieldPlaceholder ? { input_field_placeholder: options.inputFieldPlaceholder } : {}),
  }
}

export function removeKeyboard() {
  return { remove_keyboard: true }
}

export function forceReply(inputFieldPlaceholder?: string) {
  return { force_reply: true, ...(inputFieldPlaceholder ? { input_field_placeholder: inputFieldPlaceholder } : {}) }
}

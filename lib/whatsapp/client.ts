// Meta WhatsApp Cloud API Client — Reusable, project-agnostic
// No DB, no sessions, no project-specific logic.

import { createHash, createHmac } from 'node:crypto'

const API = 'https://graph.facebook.com/v22.0'

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured')
  if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN not configured')
  if (!appSecret) throw new Error('WHATSAPP_APP_SECRET not configured')
  return { phoneNumberId, accessToken, appSecret }
}

// ── Helpers ──────────────────────────────────────────────────

function appSecretProof(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex')
}

function buildUrl(path: string): string {
  const { accessToken: token, appSecret: secret } = getConfig()
  let url = `${API}${path}`
  if (secret && token) {
    url += `${url.includes('?') ? '&' : '?'}appsecret_proof=${appSecretProof(token, secret)}`
  }
  return url
}

interface WaResponse {
  ok: boolean
  code: number
  error?: string
  data?: Record<string, unknown>
  msg_id?: string
  media_id?: string
  download_url?: string
  mime_type?: string
}

async function waRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  formFields?: Record<string, string | Blob>
): Promise<WaResponse> {
  const { accessToken } = getConfig()
  const url = buildUrl(path)
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }

  if (formFields) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(formFields)) fd.append(k, v)
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd })
    const data = await res.json()
    const ok = res.status >= 200 && res.status < 300
    return { ok, code: res.status, data, error: ok ? undefined : data?.error?.message, msg_id: data?.messages?.[0]?.id }
  }

  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  const ok = res.status >= 200 && res.status < 300
  return { ok, code: res.status, data, error: ok ? undefined : data?.error?.message, msg_id: data?.messages?.[0]?.id }
}

// ── Send Messages ────────────────────────────────────────────

export async function sendText(phone: string, message: string, replyTo?: string): Promise<string> {
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: phone,
    type: 'text', text: { preview_url: false, body: message },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendText: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendImage(phone: string, imageUrlOrId: string, caption?: string, replyTo?: string): Promise<string> {
  const isId = !imageUrlOrId.startsWith('http')
  const image: Record<string, string> = isId ? { id: imageUrlOrId } : { link: imageUrlOrId }
  if (caption) image.caption = caption
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'image', image,
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendImage: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendAudio(phone: string, audioUrlOrId: string, replyTo?: string): Promise<string> {
  const isId = !audioUrlOrId.startsWith('http')
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'audio',
    audio: isId ? { id: audioUrlOrId } : { link: audioUrlOrId },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendAudio: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendVideo(phone: string, videoUrlOrId: string, caption?: string, replyTo?: string): Promise<string> {
  const isId = !videoUrlOrId.startsWith('http')
  const video: Record<string, string> = isId ? { id: videoUrlOrId } : { link: videoUrlOrId }
  if (caption) video.caption = caption
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'video', video,
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendVideo: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendDocument(phone: string, docUrlOrId: string, filename?: string, caption?: string, replyTo?: string): Promise<string> {
  const isId = !docUrlOrId.startsWith('http')
  const document: Record<string, string> = isId ? { id: docUrlOrId } : { link: docUrlOrId }
  if (filename) document.filename = filename
  if (caption) document.caption = caption
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'document', document,
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendDocument: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendSticker(phone: string, stickerUrlOrId: string, replyTo?: string): Promise<string> {
  const isId = !stickerUrlOrId.startsWith('http')
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'sticker',
    sticker: isId ? { id: stickerUrlOrId } : { link: stickerUrlOrId },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendSticker: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendLocation(phone: string, lat: number, lng: number, name?: string, address?: string, replyTo?: string): Promise<string> {
  const loc: Record<string, unknown> = { latitude: lat, longitude: lng }
  if (name) loc.name = name
  if (address) loc.address = address
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'location', location: loc,
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendLocation: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendReaction(phone: string, msgId: string, emoji: string): Promise<string> {
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'reaction',
    reaction: { message_id: msgId, emoji },
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendReaction: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendInteractiveButtons(
  phone: string, bodyText: string, buttons: Array<{ id: string; title: string }>,
  header?: string, footer?: string, replyTo?: string
): Promise<string> {
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
      ...(header ? { header: { type: 'text', text: header } } : {}),
      ...(footer ? { footer: { text: footer } } : {}),
    },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendInteractiveButtons: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendInteractiveList(
  phone: string, bodyText: string, buttonText: string,
  sections: Array<Record<string, unknown>>, header?: string, footer?: string, replyTo?: string
): Promise<string> {
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'interactive',
    interactive: {
      type: 'list', body: { text: bodyText },
      action: { button: buttonText, sections },
      ...(header ? { header: { type: 'text', text: header } } : {}),
      ...(footer ? { footer: { text: footer } } : {}),
    },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendInteractiveList: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

export async function sendTemplate(
  phone: string, templateName: string, langCode: string = 'en',
  components?: Array<Record<string, unknown>>, replyTo?: string
): Promise<string> {
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: phone, type: 'template',
    template: { name: templateName, language: { code: langCode }, ...(components ? { components } : {}) },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
  if (!r.ok || !r.msg_id) throw new Error(`sendTemplate: ${r.error || 'no msg_id'}`)
  return r.msg_id
}

// ── Media Operations ─────────────────────────────────────────

export async function uploadMedia(filePath: string, mimeType: string): Promise<{ media_id: string }> {
  // Read file from disk
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const fileBuffer = await fs.readFile(filePath)
  const blob = new Blob([fileBuffer], { type: mimeType })
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/media`, undefined, {
    messaging_product: 'whatsapp',
    type: mimeType,
    file: blob,
  })
  if (!r.ok || !r.data?.id) throw new Error(`uploadMedia: ${r.error || 'no media_id'}`)
  return { media_id: r.data.id as string }
}

export async function getMediaUrl(mediaId: string): Promise<{ url: string; mimeType: string; fileSize: number }> {
  const r = await waRequest('GET', `/${mediaId}`)
  if (!r.ok) throw new Error(`getMediaUrl: ${r.error}`)
  return { url: r.data?.url as string, mimeType: (r.data?.mime_type as string) || 'application/octet-stream', fileSize: (r.data?.file_size as number) || 0 }
}

// Local admission limits, independent of provider quota or messaging permissions.
export const MAX_MEDIA_FILE_BYTES = 100 * 1024 * 1024
const MEDIA_TYPES: Record<string, { extension: string; maxBytes: number; inline: boolean }> = Object.create(null)
for (const [mime, extension] of Object.entries({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/webm': 'webm',
  'application/pdf': 'pdf', 'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt', 'text/csv': 'csv', 'application/rtf': 'rtf', 'application/octet-stream': 'bin',
})) {
  MEDIA_TYPES[mime] = { extension, maxBytes: mime.startsWith('image/') ? 5 * 1024 * 1024
    : /^(audio|video)\//.test(mime) ? 16 * 1024 * 1024 : MAX_MEDIA_FILE_BYTES,
  inline: /^(image|audio|video)\//.test(mime) || mime === 'application/pdf' }
}

export function getMediaType(mime: string) {
  const normalized = mime.split(';')[0].trim().toLowerCase()
  return MEDIA_TYPES[normalized] ? { ...MEDIA_TYPES[normalized], mime: normalized } : null
}

export function getMediaTypeFromFilename(filename: string) {
  const extension = filename.split('.').pop()?.toLowerCase()
  const mime = Object.keys(MEDIA_TYPES).find(key => MEDIA_TYPES[key].extension === extension)
  // PHP also stored .jpeg; Node's older reader accepted .oga/.opus.
  const legacy = extension === 'jpeg' ? 'image/jpeg' : ['oga', 'opus'].includes(extension || '') ? 'audio/ogg' : 'application/octet-stream'
  return getMediaType(mime || legacy)!
}

async function readBoundedMediaBody(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body?.cancel()
    throw new Error('Media response exceeds its limit.')
  }
  if (!response.body) throw new Error('Media response is empty.')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('Media response exceeds its limit.')
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  return Buffer.concat(chunks, size)
}

export async function downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string; fileSize: number }> {
  if (!/^\d{1,40}$/.test(mediaId)) throw new Error('Invalid media identifier.')
  const { phoneNumberId } = getConfig()
  const { accessToken } = getConfig()
  const signal = AbortSignal.timeout(20_000)
  const metadataUrl = new URL(buildUrl(`/${mediaId}`))
  metadataUrl.searchParams.set('phone_number_id', phoneNumberId)
  const options = { headers: { Authorization: `Bearer ${accessToken}` }, signal, redirect: 'error' as const }
  const metadataResponse = await fetch(metadataUrl, options)
  if (!metadataResponse.ok) { await metadataResponse.body?.cancel(); throw new Error('Media lookup failed.') }
  const metadata = JSON.parse((await readBoundedMediaBody(metadataResponse, 16 * 1024)).toString('utf8'))
  const type = getMediaType(String(metadata.mime_type || 'application/octet-stream'))
  if (!type || !Number.isSafeInteger(metadata.file_size) || metadata.file_size < 1 || metadata.file_size > type.maxBytes) {
    throw new Error('Media type or size is not supported.')
  }
  const url = new URL(String(metadata.url))
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || !(url.hostname === 'lookaside.fbsbx.com' || url.hostname === 'lookaside.facebook.com' || url.hostname.endsWith('.fbcdn.net'))) {
    throw new Error('Unexpected media download origin.')
  }
  const res = await fetch(url, options)
  if (!res.ok) { await res.body?.cancel(); throw new Error(`downloadMedia: HTTP ${res.status}`) }
  const data = await readBoundedMediaBody(res, type.maxBytes)
  if (data.length !== metadata.file_size || (metadata.sha256 && createHash('sha256').update(data).digest('hex') !== metadata.sha256)) {
    throw new Error('Media integrity check failed.')
  }
  return { data, mimeType: type.mime, fileSize: data.length }
}

// ── Message CRUD ─────────────────────────────────────────────

export async function editMessage(msgId: string, newText: string, toPhone: string): Promise<void> {
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: toPhone, type: 'text',
    text: { body: newText }, context: { message_id: msgId },
  })
  if (!r.ok) throw new Error(`editMessage: ${r.error}`)
}

export async function deleteMessage(msgId: string): Promise<void> {
  const r = await waRequest('DELETE', `/${getConfig().phoneNumberId}/messages?message_id=${msgId}`)
  if (!r.ok) throw new Error(`deleteMessage: ${r.error}`)
}

export async function markRead(msgId: string): Promise<void> {
  const r = await waRequest('POST', `/${getConfig().phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', status: 'read', message_id: msgId,
  })
  if (!r.ok) throw new Error(`markRead: ${r.error}`)
}

// ── Webhook ──────────────────────────────────────────────────

export function verifyWebhook(body: string, signature: string): boolean {
  const { appSecret } = getConfig()
  const expected = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`
  if (expected.length !== signature.length) return false
  let result = 0
  for (let i = 0; i < expected.length; i++) result |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return result === 0
}

export interface ParsedMessage {
  msg_id: string
  from: string
  type: string
  timestamp: string
  text: string
  media_id: string
  media_mime: string
  location: Record<string, unknown> | null
  contacts: Array<Record<string, unknown>> | null
  interactive: Record<string, unknown> | null
  reaction: Record<string, unknown> | null
  button: Record<string, unknown> | null
  order: Record<string, unknown> | null
  system: Record<string, unknown> | null
  context: Record<string, unknown> | null
  raw: Record<string, unknown>
}

export function parseWebhook(rawBody: string): ParsedMessage[] {
  const payload = JSON.parse(rawBody)
  const messages: ParsedMessage[] = []

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {}
      if (value.statuses) continue
      for (const msg of value.messages || []) {
        const type = msg.type || 'unknown'
        const parsed: ParsedMessage = {
          msg_id: msg.id || '', from: msg.from || '', type, timestamp: msg.timestamp || '',
          text: '', media_id: '', media_mime: '', location: null, contacts: null,
          interactive: null, reaction: null, button: null, order: null, system: null,
          context: msg.context || null, raw: msg,
        }
        switch (type) {
          case 'text': parsed.text = msg.text?.body || ''; break
          case 'image': parsed.text = msg.image?.caption || ''; parsed.media_id = msg.image?.id || ''; parsed.media_mime = msg.image?.mime_type || 'image/jpeg'; break
          case 'audio': case 'voice': parsed.media_id = msg.audio?.id || msg.voice?.id || ''; parsed.media_mime = msg.audio?.mime_type || msg.voice?.mime_type || 'audio/ogg'; break
          case 'video': parsed.text = msg.video?.caption || ''; parsed.media_id = msg.video?.id || ''; parsed.media_mime = msg.video?.mime_type || 'video/mp4'; break
          case 'document': parsed.text = msg.document?.filename || 'document'; parsed.media_id = msg.document?.id || ''; parsed.media_mime = msg.document?.mime_type || 'application/pdf'; break
          case 'sticker': parsed.media_id = msg.sticker?.id || ''; parsed.media_mime = 'image/webp'; break
          case 'location': parsed.location = msg.location || null; break
          case 'contacts': parsed.contacts = msg.contacts || []; break
          case 'interactive': parsed.interactive = msg.interactive || null; break
          case 'reaction': parsed.reaction = msg.reaction || null; break
          case 'button': parsed.button = msg.button || null; break
          case 'order': parsed.order = msg.order || null; break
          case 'system': parsed.system = msg.system || null; break
        }
        messages.push(parsed)
      }
    }
  }

  return messages
}

export function guessMime(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', aac: 'audio/aac', amr: 'audio/amr', m4a: 'audio/mp4',
    mp4: 'video/mp4', '3gp': 'video/3gpp', '3gpp': 'video/3gpp',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  }
  return map[ext] || 'application/octet-stream'
}

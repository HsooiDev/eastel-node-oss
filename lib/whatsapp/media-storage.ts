import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises'
import * as path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { getWhatsAppMediaDirectory } from '@/lib/marketing-share-path'
import { withDatabaseLock } from '@/lib/database-lock'
import { downloadMedia, getMediaType, getMediaTypeFromFilename, MAX_MEDIA_FILE_BYTES } from '@/lib/whatsapp/client'

export const MAX_WHATSAPP_STORAGE_BYTES = 1024 * 1024 * 1024
export const MAX_WHATSAPP_PHONE_BYTES = 256 * 1024 * 1024
const MAX_ENTRIES = 10_000
const FILE_RE = /^[A-Za-z0-9_-]{1,220}\.[A-Za-z0-9]{1,10}$/

export function normalizeWhatsAppMediaPath(value: unknown): string | null {
  const raw = String(value ?? '').replace(/^\//, '')
  return /^media\/wa\/\d{4}-(?:0[1-9]|1[0-2])\/\d{5,20}\/[A-Za-z0-9_-]{1,220}\.[A-Za-z0-9]{1,10}$/.test(raw)
    ? raw.slice('media/wa/'.length) : null
}

function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === 'ENOENT' }
function inside(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function checkedRoot(root: string, persistent: boolean): Promise<string> {
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Media storage is unavailable.')
  const actual = await realpath(root)
  if (persistent && process.env.NODE_ENV === 'production') {
    getWhatsAppMediaDirectory({ ...process.env, WHATSAPP_MEDIA_DIR: actual })
  }
  return actual
}

async function checkedFile(root: string, relative: string, persistent: boolean) {
  const actual = await checkedRoot(root, persistent)
  let file = root
  for (const [index, segment] of relative.split('/').entries()) {
    file = path.join(file, segment)
    const info = await lstat(file)
    if (info.isSymbolicLink() || (index < 2 ? !info.isDirectory() : !info.isFile())) throw new Error('Invalid media storage path.')
  }
  if (!inside(actual, await realpath(file))) throw new Error('Invalid media storage path.')
  return file
}

/** Only the private persistent root and the current release's old WA directory. */
export async function openWhatsAppMedia(storedPath: unknown) {
  const relative = normalizeWhatsAppMediaPath(storedPath)
  if (!relative) return null
  const root = getWhatsAppMediaDirectory()
  const roots = [...new Set([root, path.join(process.cwd(), 'public', 'media', 'wa')])]
  for (const candidate of roots) {
    let handle
    try {
      const file = await checkedFile(candidate, relative, candidate === root)
      handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
      const info = await handle.stat()
      if (!info.isFile() || info.size > MAX_MEDIA_FILE_BYTES) throw new Error('Media file is unavailable.')
      return { handle, size: info.size, filename: path.basename(file), ...getMediaTypeFromFilename(file) }
    } catch (error) {
      await handle?.close()
      if (!missing(error)) throw error
    }
  }
  return null
}

async function scanStorage(root: string, phone: string) {
  let bytes = 0, phoneBytes = 0, entries = 0
  const files: string[] = []
  async function visit(directory: string, depth: number) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++entries > MAX_ENTRIES) throw new Error('Media storage inventory limit reached.')
      const filename = path.join(directory, entry.name), info = await lstat(filename)
      if (info.isSymbolicLink()) throw new Error('Invalid media storage path.')
      if (info.isDirectory()) {
        if (depth >= 2) throw new Error('Invalid media storage layout.')
        await visit(filename, depth + 1)
      } else if (info.isFile()) {
        bytes += info.size
        const relative = path.relative(root, filename).split(path.sep).join('/')
        if (relative.split('/')[1] === phone) phoneBytes += info.size
        files.push(relative)
      }
    }
  }
  await visit(root, 0)
  return { bytes, phoneBytes, files }
}

/** Bounded private storage; same message id never replaces existing bytes. */
export async function storeWhatsAppMedia(phone: string, messageId: string, mediaId: string) {
  if (!/^\d{5,20}$/.test(phone) || !messageId || messageId.length > 512) throw new Error('Invalid media identity.')
  const root = getWhatsAppMediaDirectory()
  if (process.env.NODE_ENV !== 'production') await mkdir(root, { recursive: true, mode: 0o700 })
  await checkedRoot(root, true)
  // One pool connection only. Busy deliveries receive 503 and are retried by Meta.
  return withDatabaseLock('whatsapp-media-storage', async () => {
    const inventory = await scanStorage(root, phone)
    const stem = createHash('sha256').update(messageId).digest('hex')
    const existing = inventory.files.find(file => file.split('/')[1] === phone && path.basename(file).startsWith(stem + '.'))
    if (existing) {
      const file = await checkedFile(root, existing, true)
      if (!(await lstat(file)).size) throw new Error('Existing media file is incomplete.')
      return `media/wa/${existing}`
    }
    // Reserve room for the largest allowed attachment before contacting the provider.
    if (inventory.bytes + MAX_MEDIA_FILE_BYTES > MAX_WHATSAPP_STORAGE_BYTES
      || inventory.phoneBytes + MAX_MEDIA_FILE_BYTES > MAX_WHATSAPP_PHONE_BYTES) throw new Error('Media storage quota reached.')
    const media = await downloadMedia(mediaId)
    const type = getMediaType(media.mimeType)
    if (!type || media.fileSize < 1 || media.fileSize !== media.data.byteLength || media.fileSize > type.maxBytes) {
      throw new Error('Media type or size is not supported.')
    }
    const current = await scanStorage(root, phone)
    if (current.bytes + media.fileSize > MAX_WHATSAPP_STORAGE_BYTES
      || current.phoneBytes + media.fileSize > MAX_WHATSAPP_PHONE_BYTES) throw new Error('Media storage quota reached.')
    const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }).formatToParts(new Date())
    const month = `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`
    let directory = root
    for (const segment of [month, phone]) {
      directory = path.join(directory, segment)
      try { await mkdir(directory, { mode: 0o700 }) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink() || !inside(await realpath(root), await realpath(directory))) {
        throw new Error('Invalid media storage path.')
      }
    }
    const filename = `${stem}.${type.extension}`
    if (!FILE_RE.test(filename)) throw new Error('Invalid media filename.')
    const temporary = path.join(directory, `.${stem}.${randomUUID()}.tmp`)
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600)
    try {
      try { await handle.writeFile(media.data); await handle.sync() } finally { await handle.close() }
      await link(temporary, path.join(directory, filename))
    } finally { await unlink(temporary) }
    return `media/wa/${month}/${phone}/${filename}`
  })
}

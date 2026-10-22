import { readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { withDatabaseLock } from '@/lib/database-lock'
import { getReviewUploadRoots, assertReviewUploadRoot } from '@/lib/review-upload-path'

export const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024
export const MAX_UPLOAD_TOTAL_BYTES = 512 * 1024 * 1024
export const MAX_UPLOAD_ACCOUNT_BYTES = 20 * 1024 * 1024

export async function storeReviewImage(owner: string, extension: string, buffer: Buffer): Promise<string> {
  if (!/^[ca][1-9]\d*$/.test(owner) || !['.jpg', '.png', '.webp'].includes(extension) || buffer.length > MAX_UPLOAD_FILE_BYTES) throw new Error('Invalid upload.')
  return withDatabaseLock('review-upload-storage', async () => {
    const roots = getReviewUploadRoots()
    const ROOT = roots[0]
    await mkdir(ROOT, { recursive: true })
    await assertReviewUploadRoot(ROOT)
    let total = 0; let owned = 0
    const counted = new Set<string>()
    async function count(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name)
        if (entry.isSymbolicLink()) throw new Error('Upload storage contains an unsupported link.')
        if (entry.isDirectory()) await count(file)
        else if (entry.isFile()) {
          const size = (await stat(file)).size
          total += size
          if (entry.name.startsWith(`${owner}_`)) owned += size
        }
      }
    }
    for (const root of roots) {
      try {
        const actual = await assertReviewUploadRoot(root)
        if (counted.has(actual)) continue
        counted.add(actual)
        await count(root)
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    if (total + buffer.length > MAX_UPLOAD_TOTAL_BYTES || owned + buffer.length > MAX_UPLOAD_ACCOUNT_BYTES) throw new Error('Upload storage quota reached.')
    const filename = `${owner}_${Date.now()}_${randomBytes(8).toString('hex')}${extension}`
    await writeFile(join(ROOT, filename), buffer, { flag: 'wx' })
    return filename
  })
}

/** Count streamed bytes before multipart parsing; length headers are not trusted. */
export async function boundedUploadForm(request: Request): Promise<FormData> {
  if (!request.body) throw new Error('Missing upload body.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { void reader.cancel(); reject(new Error('Upload timed out.')) }, 20_000)
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_UPLOAD_FILE_BYTES + 64 * 1024) throw new Error('Upload body is too large.')
      chunks.push(value)
    }
    const body = Buffer.concat(chunks)
    return await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData()
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}) }
}

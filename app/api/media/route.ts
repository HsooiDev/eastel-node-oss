import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/app/api/admin/_helpers'
import { normalizeWhatsAppMediaPath, openWhatsAppMedia } from '@/lib/whatsapp/media-storage'

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
  const storedPath = request.nextUrl.searchParams.get('path')
  if (!storedPath) return NextResponse.json({ status: 'error', message: 'Missing path' }, { status: 400 })
  if (!normalizeWhatsAppMediaPath(storedPath)) return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
  let media
  try {
    media = await openWhatsAppMedia(storedPath)
    if (!media) return NextResponse.json({ status: 'error', message: 'File not found' }, { status: 404 })
    const headers = new Headers({
      'Content-Type': media.mime,
      'Content-Disposition': `${media.inline ? 'inline' : 'attachment'}; filename="${media.filename}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    })
    let start = 0, end = media.size - 1, status = 200
    const range = request.headers.get('range')
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, media.size - Number(match[2]))
        end = match[1] && match[2] ? Math.min(Number(match[2]), media.size - 1) : media.size - 1
      }
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start < 0 || end < start || start >= media.size) {
        headers.set('Content-Range', `bytes */${media.size}`)
        return new NextResponse(null, { status: 416, headers })
      }
      status = 206
      headers.set('Content-Range', `bytes ${start}-${end}/${media.size}`)
    }
    const length = Math.max(0, end - start + 1), buffer = Buffer.alloc(length)
    let offset = 0
    while (offset < length) {
      const { bytesRead } = await media.handle.read(buffer, offset, length - offset, start + offset)
      if (!bytesRead) throw new Error('Incomplete media file.')
      offset += bytesRead
    }
    headers.set('Content-Length', String(length))
    return new NextResponse(new Uint8Array(buffer), { status, headers })
  } catch {
    return NextResponse.json({ status: 'error', message: 'Media storage is unavailable' }, { status: 503 })
  } finally { await media?.handle.close() }
}

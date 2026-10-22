import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/admin/_helpers'
import { readMarketingGalleryImage } from '@/lib/marketing-gallery'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; filename: string }> },
) {
  if (!(await requireAdmin())) return new NextResponse('Not authenticated.', { status: 401 })
  try {
    const { source, filename } = await params
    const image = await readMarketingGalleryImage(source, filename)
    if (!image) return new NextResponse('File not found', { status: 404 })
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Failed to load image.', { status: 500 })
  }
}

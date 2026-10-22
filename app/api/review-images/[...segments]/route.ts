import { NextResponse } from 'next/server'
import { readReviewPhoto } from '@/lib/review-upload-path'

// Review image URLs were already public. Only raster paths under upload roots are served.
export async function GET(_request: Request, { params }: { params: Promise<{ segments: string[] }> }) {
  try {
    const { segments } = await params
    if (segments.some(segment => /[\\/]/.test(segment))) return new NextResponse('File not found', { status: 404 })
    const image = await readReviewPhoto(`uploads/${segments.join('/')}`)
    if (!image) return new NextResponse('File not found', { status: 404 })
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: { 'Content-Type': image.contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch { return new NextResponse('Image storage unavailable', { status: 503 }) }
}

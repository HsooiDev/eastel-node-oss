import { NextResponse } from 'next/server'
import { getStorefrontCheckout } from '@/lib/storefront'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(
      { status: 'success', ...await getStorefrontCheckout() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Checkout information is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

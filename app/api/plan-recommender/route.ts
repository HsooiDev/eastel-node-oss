import { NextResponse } from 'next/server'
import { getPlanCatalogue } from '@/lib/plan-recommender'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(
      { status: 'success', catalogue: await getPlanCatalogue() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Plan catalogue is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

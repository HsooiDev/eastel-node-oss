import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUILD_ID = process.env.BUILD_SHA || process.env.GITHUB_SHA || 'unknown'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    buildId: BUILD_ID,
  })
}

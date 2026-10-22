// ─────────────────────────────────────────────────────────────
// Health Check Endpoint
// Returns system status including DB connection and env vars
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { validateRuntimeConfig } from '@/lib/runtime-config'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type CheckStatus = 'ok' | 'error' | 'unknown' | 'not_checked'

interface HealthStatus {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  buildId: string
  checks: {
    database: { status: CheckStatus; latencyMs?: number }
    environment: { status: 'ok' | 'missing' | 'invalid'; missing: string[]; invalid: string[] }
  }
}

const BUILD_ID = process.env.BUILD_SHA || process.env.GITHUB_SHA || 'unknown'

function getDatabaseErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return 'UNKNOWN'
}

export async function GET() {
  const { missing, invalid } = validateRuntimeConfig(process.env)
  const configOk = missing.length === 0 && invalid.length === 0

  const checks: HealthStatus['checks'] = {
    database: { status: configOk ? 'unknown' : 'not_checked' },
    environment: {
      status: configOk ? 'ok' : missing.length ? 'missing' : 'invalid',
      missing,
      invalid,
    },
  }

  // ── Database Check ───────────────────────────────────────
  if (configOk) {
    try {
      const start = Date.now()
      await db.query('SELECT 1')
      const latencyMs = Date.now() - start
      checks.database = { status: 'ok', latencyMs }
    } catch (error) {
      checks.database = { status: 'error', latencyMs: -1 }
      console.error('Health check DB error:', getDatabaseErrorCode(error))
    }
  }

  // ── Overall Status ───────────────────────────────────────
  const dbOk = checks.database.status === 'ok'
  const envOk = checks.environment.status === 'ok'
  const ready = dbOk && envOk
  const status: HealthStatus['status'] = ready ? 'healthy' : 'unhealthy'

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      buildId: BUILD_ID,
      checks,
    } satisfies HealthStatus,
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}

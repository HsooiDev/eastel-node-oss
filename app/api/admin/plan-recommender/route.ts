import { NextResponse } from 'next/server'
import { requireAdmin, requireAdminCsrf } from '../_helpers'
import { getPlanCatalogue, savePlanCatalogue } from '@/lib/plan-recommender'
import { validateCatalogue } from '@/public/recommender/engine.mjs'
import { logAdminAction } from '@/lib/audit'

export const dynamic = 'force-dynamic'

function respond(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return respond({ status: 'error', message: 'Not authenticated.' }, 401)
    }
    return respond({ status: 'success', catalogue: await getPlanCatalogue() })
  } catch {
    return respond({ status: 'error', message: 'Plan catalogue is temporarily unavailable.' }, 503)
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminCsrf(request)
    if (!session) {
      return respond({ status: 'error', message: 'Not authenticated.' }, 401)
    }

    const contentLength = request.headers.get('content-length')
    if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > 100000) {
      return respond({ status: 'error', message: 'Request is too large.' }, 400)
    }

    let body: unknown
    try {
      const rawBody = await request.text()
      if (new TextEncoder().encode(rawBody).length > 100000) {
        return respond({ status: 'error', message: 'Request is too large.' }, 400)
      }
      body = JSON.parse(rawBody)
    } catch {
      return respond({ status: 'error', message: 'Invalid JSON.' }, 400)
    }
    const catalogue = body && typeof body === 'object' && 'catalogue' in body
      ? body.catalogue
      : undefined
    if (!validateCatalogue(catalogue)) {
      return respond({ status: 'error', message: 'Invalid plan catalogue. Check every plan field and unique ID.' }, 400)
    }

    await savePlanCatalogue(catalogue)
    void logAdminAction(
      session.customerId,
      'save_plan_catalogue',
      'settings',
      null,
      null,
      'plan_recommender_catalogue_v1',
    )
    return respond({ status: 'success', catalogue, message: 'Plan catalogue saved.' })
  } catch {
    return respond({ status: 'error', message: 'Could not save the plan catalogue.' }, 503)
  }
}

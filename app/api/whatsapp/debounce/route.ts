import { authorizeCron } from '@/lib/cron-auth'
// ─────────────────────────────────────────────────────────────
// POST /api/whatsapp/debounce
// Cron: Process pending WhatsApp reply queue
// Protected by CRON_SECRET header or admin auth
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import { processPendingQueue } from '@/lib/whatsapp/ai'
import { success, error } from '@/app/api/auth/_helpers'

export async function POST(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) return error('Not authenticated.', 401)

    const processed = await processPendingQueue()
    return success({ processed, message: `Processed ${processed} pending messages.` })
  } catch (e) {
    console.error('Debounce cron error:', e)
    return error('Cron failed.', 500)
  }
}

import { authorizeCron } from '@/lib/cron-auth'
// ─────────────────────────────────────────────────────────────
// POST /api/whatsapp/missed
// Cron: Check for missed conversations (no reply in 3+ hours)
// Protected by CRON_SECRET header or admin auth
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import { checkMissedMessages } from '@/lib/whatsapp/ai'
import { success, error } from '@/app/api/auth/_helpers'

export async function POST(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) return error('Not authenticated.', 401)

    const count = await checkMissedMessages()
    return success({ missed: count, message: `Found ${count} missed conversations.` })
  } catch (e) {
    console.error('Missed check cron error:', e)
    return error('Cron failed.', 500)
  }
}

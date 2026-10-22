import { authorizeCron } from '@/lib/cron-auth'
// ─────────────────────────────────────────────────────────────
// POST /api/admin/cleanup
// Cron endpoint: clean expired sessions and verification codes.
// Protected by admin auth or a shared cron secret.
// ─────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error } from '@/app/api/auth/_helpers'

export async function POST(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) return error('Not authenticated.', 401)

    let cleaned = 0

    // Delete expired sessions
    const [sessionsResult] = await db.execute(
      'DELETE FROM `sessions` WHERE `expires_at` < NOW()'
    )
    cleaned += (sessionsResult as { affectedRows?: number }).affectedRows ?? 0

    // Delete expired email verifications
    const [verificationsResult] = await db.execute(
      'DELETE FROM `email_verifications` WHERE `expires_at` < NOW()'
    )
    cleaned += (verificationsResult as { affectedRows?: number }).affectedRows ?? 0

    // Delete expired password reset tokens (older than 24h)
    const [resetResult] = await db.execute(
      "UPDATE `customers` SET `reset_token` = NULL, `reset_expires` = NULL WHERE `reset_expires` IS NOT NULL AND `reset_expires` < NOW()"
    )
    cleaned += (resetResult as { affectedRows?: number }).affectedRows ?? 0

    return success({
      message: 'Cleanup completed.',
      cleaned,
    })
  } catch (e) {
    console.error('Cleanup error:', e)
    return error('Cleanup failed.', 500)
  }
}

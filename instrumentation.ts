// ─────────────────────────────────────────────────────────────
// Next.js instrumentation — server error reporting
// onRequestError fires whenever the Next.js server captures an
// error (Server Components, route handlers, middleware, etc.).
// Alerts go to the admin Telegram chat (throttled, requires
// telegram bot_enabled = 1 in /hs/telegram settings).
// ─────────────────────────────────────────────────────────────

import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request
) => {
  try {
    // Only the Node.js runtime can reach the DB / Telegram helper.
    if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return

    const message = err instanceof Error ? err.message : String(err)
    const digest =
      typeof err === 'object' && err !== null && 'digest' in err
        ? String((err as { digest?: unknown }).digest)
        : undefined

    const { notifyServerError } = await import('@/lib/telegram/notifications')
    await notifyServerError(request.path, message, digest)
  } catch {
    // Never let error reporting itself throw.
  }
}

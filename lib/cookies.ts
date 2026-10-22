// ─────────────────────────────────────────────────────────────
// Cookie Helpers
// Thin wrappers around next/headers cookies() for session management
// ─────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'

// ── Constants ────────────────────────────────────────────────

const COOKIE_NAME = 'eastel_session'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
}

// ── Public API ───────────────────────────────────────────────

/**
 * Set the session cookie.
 * Must be called from a Server Action or Route Handler.
 */
export async function setSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, sessionId, COOKIE_OPTIONS)
}

/**
 * Read the session cookie value.
 * Returns the session ID or null if not present.
 */
export async function getSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value ?? null
}

/**
 * Clear the session cookie.
 * Must be called from a Server Action or Route Handler.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

// ─────────────────────────────────────────────────────────────
// Cloudflare Turnstile Verification
// Server-side token verification for bot protection
// ─────────────────────────────────────────────────────────────

interface TurnstileResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
}

// Localhost IPs that bypass Turnstile in development
const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * Verify a Cloudflare Turnstile token.
 *
 * @param token The `cf-turnstile-response` token from the client
 * @param ip    Optional client IP — used for localhost bypass in dev
 * @returns `true` if the token is valid, `false` otherwise
 */
export async function verifyTurnstile(
  token: string,
  ip?: string,
  expected?: { hostname: string; action: string }
): Promise<boolean> {
  // Bypass Turnstile on localhost during development ONLY.
  // In production the client IP comes from X-Forwarded-For, whose leftmost
  // entry is attacker-controlled (nginx appends the real IP after it), so
  // honoring a "127.0.0.1" here would let anyone bypass bot protection by
  // sending `X-Forwarded-For: 127.0.0.1`. Never trust it in production.
  if (process.env.NODE_ENV !== 'production' && ip && LOCALHOST_IPS.has(ip)) {
    return true
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
    // If Turnstile is not configured, reject by default in production
    // but allow in development for convenience
    return process.env.NODE_ENV !== 'production'
  }

  if (typeof token !== 'string' || token.length > 2048 || !token.trim()) {
    return false
  }
  if (expected && (!expected.hostname || !expected.action)) return false

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secretKey)
    formData.append('response', token)
    if (ip) {
      formData.append('remoteip', ip)
    }

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      }
    )

    if (!response.ok) {
      return false
    }

    const result: TurnstileResponse = await response.json()
    return result?.success === true && (!expected || (
      result.hostname === expected.hostname && result.action === expected.action
    ))
  } catch {
    // Network error or JSON parse failure — fail closed
    return false
  }
}

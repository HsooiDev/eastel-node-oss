import { randomBytes, randomInt } from 'node:crypto'
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { sendVerificationCode } from '@/lib/email'
import { reserveGuestOtp } from '@/lib/guest-otp-budget'
import { verifyTurnstile } from '@/lib/turnstile'
import { SITE_URL } from '@/lib/site'
import { success, error, getClientIp } from '@/app/api/auth/_helpers'

let inFlight = 0

export async function POST(request: NextRequest) {
  if (inFlight >= 4) return error('Too many code requests. Please try again later.', 429)
  inFlight++
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
    const lang = body.lang ?? 'en'

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return error('Invalid email address.')
    }
    if (!['en', 'ms', 'zh'].includes(lang)) return error('Invalid language.')
    const ip = getClientIp(request)
    const proof = body['cf-turnstile-response'] ?? body.turnstileToken ?? ''
    if (!(await verifyTurnstile(proof, ip, { hostname: new URL(SITE_URL).hostname, action: 'order' }))) {
      return error('Security check failed.')
    }
    if (!(await reserveGuestOtp(email, ip))) {
      return error('Too many code requests. Please wait before requesting another code.', 429)
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60_000) // 1 hour

    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      await conn.execute(
        'DELETE FROM email_verifications WHERE email = ? AND verified = 0',
        [email]
      )
      await conn.execute(
        'INSERT INTO email_verifications (email, code, token, verified, expires_at) VALUES (?, ?, ?, 0, ?)',
        [email, code, token, expiresAt]
      )
      await conn.commit()
    } catch (dbErr) {
      await conn.rollback()
      throw dbErr
    } finally {
      conn.release()
    }

    const sent = await sendVerificationCode(email, code, lang)
    if (!sent) {
      return error('Failed to send verification code. Please try again.', 502)
    }

    return success({ token })
  } catch (e) {
    console.error('[send-otp]', e)
    return error('Failed to send verification code.', 500)
  } finally { inFlight-- }
}

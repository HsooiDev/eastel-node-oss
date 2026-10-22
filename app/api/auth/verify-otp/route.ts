import type { NextRequest } from 'next/server'
import { verifyEmailRecord } from '@/lib/email-verification'
import { success, error } from '@/app/api/auth/_helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = String(body.token ?? '').trim()
    const code = String(body.code ?? '').trim()
    if (!/^[a-f0-9]{64}$/i.test(token) || !/^\d{6}$/.test(code)) return error('Invalid request.')
    const result = await verifyEmailRecord({ token, code, account: false })
    if (!result.ok) {
      if (result.reason === 'too_many_attempts') return error('Too many incorrect attempts. Please request a new code.', 429)
      if (result.reason === 'invalid_code') return error('Incorrect verification code. Please try again.')
      return error('Invalid or expired verification code.')
    }
    return success({ message: 'Email verified.' })
  } catch (e) {
    console.error('[verify-otp]', e)
    return error('Verification failed.', 500)
  }
}

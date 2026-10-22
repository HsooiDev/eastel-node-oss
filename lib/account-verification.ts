import { randomBytes, randomInt } from 'node:crypto'
import { verifyEmailRecord, type VerificationFailure, type VerificationResult } from '@/lib/email-verification'
import db from '@/lib/db'
import { formatDate } from '@/lib/db-helpers'
import { sendVerificationCode } from '@/lib/email'

const VERIFICATION_TTL_MS = 60 * 60 * 1000

export interface IssueAccountVerificationResult {
  token: string
  sent: boolean
}

export type AccountVerificationFailure = VerificationFailure
export type VerifyAccountEmailResult = VerificationResult

/** Create one schema-compatible account verification record and send its code. */
export async function issueAccountVerification(
  email: string,
  locale: string = 'en',
): Promise<IssueAccountVerificationResult> {
  const normalizedEmail = email.trim().toLowerCase()
  const safeLocale = ['en', 'ms', 'zh'].includes(locale) ? locale : 'en'
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS)

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute(
      'DELETE FROM email_verifications WHERE email = ? AND verified = 0',
      [normalizedEmail],
    )
    await connection.execute(
      'INSERT INTO email_verifications (email, code, token, verified, expires_at) VALUES (?, ?, ?, 0, ?)',
      [normalizedEmail, code, token, formatDate(expiresAt)],
    )
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  const sent = await sendVerificationCode(normalizedEmail, code, safeLocale, token)
  return { token, sent }
}

/** Verify an account code and atomically update both verification and customer state. */
export async function verifyAccountEmail({
  customerId,
  email,
  token,
  code,
}: {
  customerId?: number
  email?: string
  token?: string
  code: string
}): Promise<VerifyAccountEmailResult> {
  return verifyEmailRecord({ customerId, email, token, code, account: true })
}

import { createHash } from 'node:crypto'
import type { RowDataPacket } from 'mysql2/promise'
import db from '@/lib/db'

export type VerificationFailure = 'not_found' | 'expired' | 'invalid_code' | 'customer_not_found' | 'too_many_attempts'
export type VerificationResult = { ok: true; alreadyVerified: boolean } | { ok: false; reason: VerificationFailure }

/** Account and guest checkout share one durable, serialized attempt ceiling. */
export async function verifyEmailRecord(input: {
  token?: string; code: string; email?: string; customerId?: number; account: boolean
}): Promise<VerificationResult> {
  const email = input.email?.trim().toLowerCase()
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const where = input.token ? `token = ?${email ? ' AND email = ?' : ''}` : 'email = ? AND verified = 0'
    const params = input.token ? (email ? [input.token, email] : [input.token]) : [email]
    if (!input.token && !email) { await connection.rollback(); return { ok: false, reason: 'not_found' } }
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, email, code, token, verified, expires_at FROM email_verifications WHERE ${where} ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`, params
    )
    const record = rows[0]
    if (!record) { await connection.rollback(); return { ok: false, reason: 'not_found' } }
    const expiry = new Date(record.expires_at).getTime()
    if (!Number.isFinite(expiry) || expiry <= Date.now()) { await connection.rollback(); return { ok: false, reason: 'expired' } }
    const key = createHash('sha256').update(`email-verification:${record.id}:${record.token}`).digest('hex')
    const [counts] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS attempts FROM login_attempts WHERE email = ? AND attempt_type = 'EMAIL_VERIFICATION'", [key]
    )
    const attempts = Number(counts[0]?.attempts)
    if (!Number.isFinite(attempts)) throw new Error('Verification attempt state unavailable.')
    if (attempts >= 5 || String(record.code) !== input.code) {
      if (attempts < 5) await connection.execute(
        "INSERT INTO login_attempts (email, ip_address, success, attempted_at, attempt_type) VALUES (?, '127.0.0.1', 0, NOW(), 'EMAIL_VERIFICATION')", [key]
      )
      if (attempts >= 4) await connection.execute('DELETE FROM email_verifications WHERE id = ?', [record.id])
      await connection.commit()
      return { ok: false, reason: attempts >= 4 ? 'too_many_attempts' : 'invalid_code' }
    }
    let customer: RowDataPacket | undefined
    if (input.account) {
      const [customers] = await connection.query<RowDataPacket[]>(
        `SELECT id, email_verified FROM customers WHERE email = ?${input.customerId ? ' AND id = ?' : ''} LIMIT 1 FOR UPDATE`,
        input.customerId ? [String(record.email).toLowerCase(), input.customerId] : [String(record.email).toLowerCase()]
      )
      customer = customers[0]
      if (!customer) { await connection.rollback(); return { ok: false, reason: 'customer_not_found' } }
      await connection.execute('UPDATE customers SET email_verified = 1 WHERE id = ?', [customer.id])
    }
    await connection.execute('UPDATE email_verifications SET verified = 1 WHERE id = ?', [record.id])
    await connection.commit()
    return { ok: true, alreadyVerified: input.account ? Number(customer?.email_verified) === 1 : Number(record.verified) === 1 }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

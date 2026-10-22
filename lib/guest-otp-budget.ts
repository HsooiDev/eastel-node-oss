import { createHash } from 'node:crypto'
import type { RowDataPacket } from 'mysql2/promise'
import { withDatabaseLock } from '@/lib/database-lock'

/** Reserve mail admission across workers/restarts before verification rows or SMTP.
 * Failed mail attempts consume budget too. Recipient rotation cannot allocate
 * keys in the shared authentication limiter. No schema or scheduler is needed.
 */
export async function reserveGuestOtp(email: string, ip: string): Promise<boolean> {
  try {
    const recipient = createHash('sha256').update(email).digest('hex')
    return await withDatabaseLock(`guest-otp-mail-budget:${process.env.DB_NAME ?? ''}`, async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS daily,
                COALESCE(SUM(attempted_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)), 0) AS minute,
                COALESCE(SUM(ip_address = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)), 0) AS caller_hour,
                COALESCE(SUM(ip_address = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)), 0) AS caller_minute,
                COALESCE(SUM(email = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)), 0) AS recipient_hour,
                COALESCE(SUM(email = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)), 0) AS recipient_minute
           FROM login_attempts WHERE attempt_type = 'GUEST_OTP_MAIL'
             AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 DAY)`, [ip, ip, recipient, recipient]
      )
      const counts = ['daily', 'minute', 'caller_hour', 'caller_minute', 'recipient_hour', 'recipient_minute']
        .map(key => {
          const value = rows[0]?.[key]
          return typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN
        })
      const limits = [300, 30, 10, 3, 10, 1]
      if (!counts.every((count, index) => Number.isSafeInteger(count) && count >= 0 && count < limits[index])) return false
      await connection.execute(
        "INSERT INTO login_attempts (email, ip_address, attempted_at, attempt_type) VALUES (?, ?, NOW(), 'GUEST_OTP_MAIL')",
        [recipient, ip]
      )
      return true
    })
  } catch { return false }
}

import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { withDatabaseLock } from '@/lib/database-lock'

type AuthenticationResult<T> =
  | { status: 'success'; value: T }
  | { status: 'invalid' }
  | { status: 'conflict' }

type LoginAttemptResult<T> = AuthenticationResult<T>
  | { status: 'limited' }
  | { status: 'unavailable' }

/** One connection and one per-IP lock cover the check, authentication and log.
 * Session creation happens only after this operation releases its connection.
 */
export async function withCustomerLoginAttempt<T>(
  identity: { ip: string; email: string; userAgent: string },
  authenticate: (connection: PoolConnection) => Promise<AuthenticationResult<T>>,
): Promise<LoginAttemptResult<T>> {
  try {
    // Named locks are server-wide. Scope them to this configured database too.
    return await withDatabaseLock(`customer-login:${process.env.DB_NAME}:${identity.ip}`, async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS attempts FROM login_attempts WHERE ip_address = ? AND attempt_type = 'CUSTOMER_WRONG_PASSWORD' AND attempted_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
        [identity.ip],
      )
      const rawCount = rows[0]?.attempts
      if (!(typeof rawCount === 'number' || (typeof rawCount === 'string' && /^\d+$/.test(rawCount)))) throw new Error('Login attempt state unavailable.')
      const count = Number(rawCount)
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Login attempt state unavailable.')
      if (count >= 10) return { status: 'limited' }

      const result = await authenticate(connection)
      if (result.status === 'invalid') {
        await connection.execute(
          "INSERT INTO login_attempts (ip_address, email, password_tried, attempt_type, user_agent, attempted_at) VALUES (?, ?, '***', 'CUSTOMER_WRONG_PASSWORD', ?, NOW())",
          [identity.ip, identity.email, Array.from(identity.userAgent).slice(0, 512).join('')],
        )
      }
      return result
    })
  } catch {
    // No process-local fallback when shared state, its write or lock fails.
    return { status: 'unavailable' }
  }
}

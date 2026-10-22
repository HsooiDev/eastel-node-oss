import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { withDatabaseLocks } from '@/lib/database-lock'

type AuthenticationResult<T> = { status: 'success'; value: T } | { status: 'invalid' }
type AdminLoginResult<T> = AuthenticationResult<T>
  | { status: 'limited' }
  | { status: 'locked' }
  | { status: 'unavailable' }

function count(value: unknown): number {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))) throw new Error('Admin attempt state unavailable.')
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Admin attempt state unavailable.')
  return result
}

/** IP and email checks, authentication and audit share one connection/lock scope.
 * Session creation must borrow its connection only after this returns.
 */
export async function withAdminLoginAttempt<T>(
  identity: { ip: string; email: string; userAgent: string },
  authenticate: (connection: PoolConnection) => Promise<AuthenticationResult<T>>,
): Promise<AdminLoginResult<T>> {
  const email = identity.email.toLowerCase().trim()
  const userAgent = Array.from(identity.userAgent).slice(0, 512).join('')
  try {
    return await withDatabaseLocks([
      `admin-login-ip:${process.env.DB_NAME}:${identity.ip}`,
      `admin-login-email:${process.env.DB_NAME}:${email}`,
    ], async connection => {
      const [ipRows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS ip_attempts FROM `login_attempts` WHERE `ip_address` = ? AND `attempt_type` = 'WRONG_PASSWORD' AND `attempted_at` >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
        [identity.ip],
      )
      if (count(ipRows[0]?.ip_attempts) >= 10) return { status: 'limited' }

      const log = async (type: 'SUCCESS' | 'WRONG_PASSWORD' | 'LOCKED_OUT') => connection.execute(
        "INSERT INTO `login_attempts` (`ip_address`, `email`, `password_tried`, `attempt_type`, `user_agent`, `attempted_at`) VALUES (?, ?, '***', ?, ?, NOW())",
        [identity.ip, email, type, userAgent || null],
      )
      const [emailRows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS email_attempts FROM `login_attempts` WHERE `email` = ? AND `attempt_type` IN ('WRONG_PASSWORD', 'LOCKED_OUT') AND `attempted_at` > DATE_SUB(NOW(), INTERVAL 5 MINUTE)",
        [email],
      )
      if (count(emailRows[0]?.email_attempts) >= 5) {
        await log('LOCKED_OUT')
        return { status: 'locked' }
      }
      const result = await authenticate(connection)
      await log(result.status === 'success' ? 'SUCCESS' : 'WRONG_PASSWORD')
      return result
    })
  } catch {
    // Never degrade to a process-only quota when shared state is unavailable.
    return { status: 'unavailable' }
  }
}

import { createHash } from 'node:crypto'
import type { RowDataPacket } from 'mysql2/promise'
import { withDatabaseLock } from '@/lib/database-lock'

let inFlight = 0
/** Persisted website/Telegram admission. Upstream errors still consume quota. */
export async function reservePublicInference(principal: string, units = 1): Promise<(() => void) | null> {
  if (!Number.isInteger(units) || units < 1 || units > 3 || inFlight >= 4) return null
  inFlight++
  let released = false
  const release = () => { if (!released) { released = true; inFlight-- } }
  try {
    const key = createHash('sha256').update(principal).digest('hex')
    const allowed = await withDatabaseLock('public-inference-budget', async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS daily,
                COALESCE(SUM(attempted_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)), 0) AS minute,
                COALESCE(SUM(email = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)), 0) AS principal
           FROM login_attempts WHERE attempt_type = 'AI_PAID_REQUEST'
             AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 DAY)`, [key]
      )
      const row = rows[0]
      const counts = [Number(row?.daily), Number(row?.minute), Number(row?.principal)]
      if (!counts.every(Number.isFinite) || counts[0] + units > 1000 || counts[1] + units > 60 || counts[2] + units > 10) return false
      await connection.beginTransaction()
      try {
        for (let i = 0; i < units; i++) await connection.execute(
          "INSERT INTO login_attempts (email, ip_address, success, attempted_at, attempt_type) VALUES (?, '127.0.0.1', 1, NOW(), 'AI_PAID_REQUEST')", [key]
        )
        await connection.commit()
      } catch (error) { await connection.rollback(); throw error }
      return true
    })
    if (!allowed) { release(); return null }
    return release
  } catch { release(); return null }
}

// ─────────────────────────────────────────────────────────────
// MySQL-backed Session Management
// Sessions stored in MariaDB with automatic expiry and cleanup
// ─────────────────────────────────────────────────────────────

import { randomBytes } from 'node:crypto'
import { query, execute, getConnection } from '@/lib/db'
import { formatDate } from '@/lib/db-helpers'
import { ensureAllTables } from '@/lib/migrate'
import type { RowDataPacket } from 'mysql2/promise'

// ── Types ────────────────────────────────────────────────────

export interface SessionData {
  customerId: number
  name: string
  email: string
  isAdmin: boolean
  emailVerified: boolean
}

// ── Constants ────────────────────────────────────────────────

const SESSION_ID_BYTES = 32
const SESSION_DURATION_DAYS = 7

// ── Session CRUD ─────────────────────────────────────────────

/**
 * Create a new session.
 *
 * The `role` column is the privilege boundary: customer ids and admin ids
 * are independent auto-increments that can collide, so validation must
 * match on role + id, never id alone.
 *
 * @returns The session ID (hex string) to store in a cookie
 */
export async function createSession(
  customerId: number,
  ip: string,
  userAgent: string,
  role: 'customer' | 'admin' = 'customer',
  expectedPasswordHash?: string
): Promise<string> {
  await ensureAllTables()

  const sessionId = randomBytes(SESSION_ID_BYTES).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)

  const sql = 'INSERT INTO `sessions` (`id`, `customer_id`, `role`, `ip_address`, `user_agent`, `expires_at`) VALUES (?, ?, ?, ?, ?, ?)'
  const params = [sessionId, customerId, role, ip || null, userAgent || null, formatDate(expiresAt)]
  if (expectedPasswordHash !== undefined) {
    if (role !== 'customer') throw new Error('Password-bound sessions must be customer sessions.')
    const connection = await getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>('SELECT password_hash FROM customers WHERE id = ? FOR UPDATE', [customerId])
      if (rows[0]?.password_hash !== expectedPasswordHash) throw new Error('Credentials changed. Please sign in again.')
      await connection.execute(sql, params)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally { connection.release() }
  } else {
    await execute(sql, params)
  }

  return sessionId
}

/**
 * Validate a session by its ID.
 * Joins with the customers table to return user data.
 *
 * @returns Session data or null if invalid/expired
 */
export async function validateSession(sessionId: string): Promise<SessionData | null> {
  if (!sessionId || sessionId.trim().length === 0) {
    return null
  }

  await ensureAllTables()

  const [rows] = await query<(RowDataPacket & SessionData)[]>(
    `SELECT
       s.\`customer_id\` AS customerId,
       c.\`name\`        AS name,
       c.\`email\`       AS email,
       c.\`email_verified\` AS emailVerified,
       c.\`is_temp_pass\` AS isTempPass
     FROM \`sessions\` s
     JOIN \`customers\` c ON c.\`id\` = s.\`customer_id\`
     WHERE s.\`id\` = ?
       AND s.\`role\` = 'customer'
       AND s.\`expires_at\` > NOW()
     LIMIT 1`,
    [sessionId]
  )

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]
  return {
    customerId: row.customerId,
    name: row.name,
    email: row.email,
    isAdmin: false,
    emailVerified: Number(row.emailVerified) === 1,
  }
}

/**
 * Validate an admin session by its ID.
 * Joins with the admin_users table to return admin data.
 *
 * @returns Session data or null if invalid/expired
 */
export async function validateAdminSession(sessionId: string): Promise<SessionData | null> {
  if (!sessionId || sessionId.trim().length === 0) {
    return null
  }

  await ensureAllTables()

  const [rows] = await query<(RowDataPacket & SessionData)[]>(
    `SELECT
       s.\`customer_id\` AS customerId,
       a.\`name\`        AS name,
       a.\`email\`       AS email
     FROM \`sessions\` s
     JOIN \`admin_users\` a ON a.\`id\` = s.\`customer_id\`
     WHERE s.\`id\` = ?
       AND s.\`role\` = 'admin'
       AND a.\`is_active\` = 1
       AND s.\`expires_at\` > NOW()
     LIMIT 1`,
    [sessionId]
  )

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]
  return {
    customerId: row.customerId,
    name: row.name,
    email: row.email,
    isAdmin: true,
    emailVerified: true,
  }
}

/**
 * Revoke a single session by its ID.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  if (!sessionId || sessionId.trim().length === 0) return

  await ensureAllTables()
  await execute(
    'DELETE FROM `sessions` WHERE `id` = ?',
    [sessionId]
  )
}

/**
 * Revoke all sessions for a customer (e.g. after password change).
 */
export async function revokeAllSessions(customerId: number): Promise<void> {
  if (!customerId || customerId <= 0) return

  await ensureAllTables()
  await execute(
    "DELETE FROM `sessions` WHERE `customer_id` = ? AND `role` = 'customer'",
    [customerId]
  )
}

/**
 * Delete expired sessions. Call periodically (e.g. via a cron or
 * as a lazy cleanup on login).
 */
export async function cleanupExpiredSessions(): Promise<void> {
  await ensureAllTables()
  await execute(
    'DELETE FROM `sessions` WHERE `expires_at` < NOW()'
  )
}

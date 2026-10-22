// ─────────────────────────────────────────────────────────────
// Database Connection Pool (Singleton)
// Uses mysql2/promise for async/await support with MariaDB
// ─────────────────────────────────────────────────────────────

import mysql from 'mysql2/promise'

// ── Pool Configuration ───────────────────────────────────────

interface PoolConfig {
  host: string
  user: string
  password: string
  database: string
  connectionLimit: number
  waitForConnections: boolean
  queueLimit: number
  connectTimeout: number
  charset: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required database environment variable: ${name}`)
  }
  return value
}

function getPoolConfig(): PoolConfig {
  const configuredHost = requiredEnv('DB_HOST')
  return {
    // Hostinger's local MySQL grants use IPv4; localhost may resolve to ::1.
    host: configuredHost === 'localhost' ? '127.0.0.1' : configuredHost,
    user: requiredEnv('DB_USER'),
    password: requiredEnv('DB_PASS'),
    database: requiredEnv('DB_NAME'),
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 10,
    connectTimeout: 5000,
    charset: 'utf8mb4',
  }
}

// ── Singleton Pool ───────────────────────────────────────────

let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(getPoolConfig())
  }
  return pool
}

// ── Exported Functions ───────────────────────────────────────

/**
 * Get a raw connection from the pool.
 * Use only when you need transactions or connection-level control.
 */
export async function getConnection(): Promise<mysql.PoolConnection> {
  const p = getPool()
  return p.getConnection()
}

/**
 * Execute a SQL query and return results.
 *
 * CRITICAL: Do NOT bind LIMIT/OFFSET as parameters.
 * Use the safeLimit/safeOffset helpers from db-helpers.ts instead.
 */
export async function query<T = mysql.RowDataPacket[]>(
  sql: string,
  params?: unknown[]
): Promise<[T, mysql.FieldPacket[]]> {
  const p = getPool()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return p.execute(sql, params as any) as Promise<[T, mysql.FieldPacket[]]>
}

/**
 * Execute a SQL statement (INSERT, UPDATE, DELETE).
 * Returns ResultSetHeader with affectedRows, insertId, etc.
 */
export async function execute<T = mysql.ResultSetHeader>(
  sql: string,
  params?: unknown[]
): Promise<[T, mysql.FieldPacket[]]> {
  const p = getPool()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return p.execute(sql, params as any) as Promise<[T, mysql.FieldPacket[]]>
}

/**
 * Close the connection pool. Call on graceful shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export default {
  getConnection,
  query,
  execute,
  closePool,
}

import { createHash } from 'node:crypto'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import db from '@/lib/db'

/** Serialize a bounded operation across processes without changing the schema. */
export async function withDatabaseLock<T>(key: string, operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  return withDatabaseLocks([key], operation)
}

/** Acquire related scopes on one connection, in deterministic order. */
export async function withDatabaseLocks<T>(keys: string[], operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const names = [...new Set(keys.map(key => `eastel:${createHash('sha256').update(key).digest('hex').slice(0, 48)}`))].sort()
  if (names.length === 0) throw new Error('A database lock scope is required.')
  const connection = await db.getConnection()
  const acquired: string[] = []
  let reusable = true
  try {
    for (const name of names) {
      let rows: RowDataPacket[]
      try {
        ;[rows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, 0) AS acquired', [name])
      } catch (error) {
        // A lost response cannot prove whether the server acquired the lock.
        reusable = false
        throw error
      }
      if (Number(rows[0]?.acquired) !== 1) throw new Error('Operation is busy or its lock is unavailable.')
      acquired.push(name)
    }
    return await operation(connection)
  } finally {
    for (const name of acquired.reverse()) {
      try {
        const [rows] = await connection.query<RowDataPacket[]>('SELECT RELEASE_LOCK(?) AS released', [name])
        if (Number(rows[0]?.released) !== 1) reusable = false
      } catch { reusable = false }
    }
    if (reusable) connection.release()
    else connection.destroy()
  }
}

// ─────────────────────────────────────────────────────────────
// Settings Query Module
// Key-value store operations for the `settings` table
// ─────────────────────────────────────────────────────────────

import { query, execute, getConnection } from '@/lib/db'
import { formatDate } from '@/lib/db-helpers'
import type { Setting } from '@/types/database'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

// ── Read ─────────────────────────────────────────────────────

/**
 * Get a single setting value by key.
 * Returns null if the key does not exist.
 */
export async function getSetting(key: string): Promise<string | null> {
  const [rows] = await query<(RowDataPacket & { setting_value: string })[]>(
    'SELECT `setting_value` FROM `settings` WHERE `setting_key` = ? LIMIT 1',
    [key]
  )
  return rows.length > 0 ? rows[0].setting_value : null
}

/**
 * Get a setting with a default fallback.
 */
export async function getSettingOrDefault(key: string, defaultValue: string): Promise<string> {
  const value = await getSetting(key)
  return value ?? defaultValue
}

/**
 * Get multiple settings by keys. Returns a key-value map.
 */
export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {}

  const placeholders = keys.map(() => '?').join(', ')
  const [rows] = await query<(RowDataPacket & Pick<Setting, 'setting_key' | 'setting_value'>)[]>(
    "SELECT `setting_key`, `setting_value` FROM `settings` WHERE `setting_key` IN (" + placeholders + ")",
    keys
  )

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.setting_key] = row.setting_value
  }
  return result
}

/**
 * Get all settings. Use sparingly -- prefer getSettings with specific keys.
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const [rows] = await query<(RowDataPacket & Pick<Setting, 'setting_key' | 'setting_value'>)[]>(
    'SELECT `setting_key`, `setting_value` FROM `settings`'
  )

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.setting_key] = row.setting_value
  }
  return result
}

// ── Write ────────────────────────────────────────────────────

/**
 * Upsert a setting (insert or update if exists).
 * Uses MariaDB INSERT ... ON DUPLICATE KEY UPDATE.
 */
export async function updateSetting(key: string, value: string): Promise<number> {
  const now = formatDate()
  const [result] = await execute<ResultSetHeader>(
    "INSERT INTO `settings` (`setting_key`, `setting_value`, `updated_at`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = VALUES(`updated_at`)",
    [key, value, now]
  )
  return result.affectedRows
}

/**
 * Bulk upsert multiple settings.
 * All operations run in a single transaction.
 */
export async function updateSettings(entries: Record<string, string>): Promise<number> {
  const keys = Object.keys(entries)
  if (keys.length === 0) return 0

  const conn = await getConnection()
  try {
    await conn.beginTransaction()

    const now = formatDate()
    let totalAffected = 0

    for (const key of keys) {
      const [result] = await conn.execute<ResultSetHeader>(
        "INSERT INTO `settings` (`setting_key`, `setting_value`, `updated_at`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = VALUES(`updated_at`)",
        [key, entries[key], now]
      )
      totalAffected += result.affectedRows
    }

    await conn.commit()
    return totalAffected
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Delete a setting by key.
 */
export async function deleteSetting(key: string): Promise<number> {
  const [result] = await execute<ResultSetHeader>(
    'DELETE FROM `settings` WHERE `setting_key` = ?',
    [key]
  )
  return result.affectedRows
}

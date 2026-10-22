// ─────────────────────────────────────────────────────────────
// Customer Query Module
// CRUD operations for the `customers` table
// ─────────────────────────────────────────────────────────────

import { query, execute } from '@/lib/db'
import { safeInt, paginate, buildWhereClause, formatDate } from '@/lib/db-helpers'
import { hashPasswordResetToken } from '@/lib/auth'
import type { Customer } from '@/types/database'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

// ── Read ─────────────────────────────────────────────────────

/**
 * Find a customer by ID.
 */
export async function findCustomerById(id: number): Promise<Customer | null> {
  const safeId = safeInt(id, 0, 1)
  const [rows] = await query<Customer[] & RowDataPacket[]>(
    'SELECT * FROM `customers` WHERE `id` = ? LIMIT 1',
    [safeId]
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * Find a customer by email address.
 */
export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  const [rows] = await query<Customer[] & RowDataPacket[]>(
    'SELECT * FROM `customers` WHERE `email` = ? LIMIT 1',
    [email]
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * Find a customer by phone number.
 */
export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const [rows] = await query<Customer[] & RowDataPacket[]>(
    'SELECT * FROM `customers` WHERE `phone` = ? LIMIT 1',
    [phone]
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * Find a customer by raw reset-link token (only if not expired).
 * Stored values use the same SHA-256 digest as the PHP implementation.
 */
export async function findCustomerByResetToken(token: string): Promise<Customer | null> {
  const [rows] = await query<Customer[] & RowDataPacket[]>(
    'SELECT * FROM `customers` WHERE `reset_token` = ? AND `reset_expires` > ? LIMIT 1',
    [hashPasswordResetToken(token), formatDate()]
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * List customers with pagination and optional filters.
 */
export async function listCustomers(
  page: number = 1,
  perPage: number = 20,
  filters: Record<string, unknown> = {}
): Promise<{ rows: Customer[]; total: number; page: number; perPage: number; totalPages: number }> {
  const { limit, offset } = paginate(page, perPage)
  const { clause: whereClause, params } = buildWhereClause(
    filters as Record<string, string | number | boolean | null | undefined>
  )

  const countSql = `SELECT COUNT(*) as total FROM \`customers\` ${whereClause}`
  const [countRows] = await query<(RowDataPacket & { total: number })[]>(
    countSql,
    params
  )
  const total = countRows[0]?.total ?? 0

  const dataSql = `SELECT * FROM \`customers\` ${whereClause} ORDER BY \`created_at\` DESC LIMIT ${limit} OFFSET ${offset}`
  const [rows] = await query<Customer[] & RowDataPacket[]>(dataSql, params)

  return {
    rows,
    total,
    page: safeInt(page, 1, 1),
    perPage: limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ── Create ───────────────────────────────────────────────────

export interface CreateCustomerInput {
  name: string
  email: string
  phone: string
  password_hash: string
  is_temp_pass?: number
  address?: string | null
  postcode?: string | null
  state?: string | null
}

/**
 * Create a new customer. Returns the inserted ID.
 */
export async function createCustomer(input: CreateCustomerInput): Promise<number> {
  const now = formatDate()
  const [result] = await execute<ResultSetHeader>(
    "INSERT INTO `customers` (`name`, `email`, `phone`, `password_hash`, `is_temp_pass`, `address`, `postcode`, `state`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      input.name,
      input.email,
      input.phone,
      input.password_hash,
      input.is_temp_pass ?? 0,
      input.address ?? null,
      input.postcode ?? null,
      input.state ?? null,
      now,
    ]
  )
  return result.insertId
}

// ── Update ───────────────────────────────────────────────────

export interface UpdateCustomerInput {
  name?: string
  email?: string
  phone?: string
  password_hash?: string
  is_temp_pass?: number
  address?: string | null
  postcode?: string | null
  state?: string | null
  reset_token?: string | null
  reset_expires?: string | null
}

/**
 * Update a customer by ID. Returns affected row count.
 */
export async function updateCustomer(id: number, input: UpdateCustomerInput): Promise<number> {
  const safeId = safeInt(id, 0, 1)
  if (safeId <= 0) return 0

  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      fields.push("`${key}` = ?")
      values.push(value)
    }
  }

  if (fields.length === 0) return 0

  values.push(safeId)
  const sql = `UPDATE \`customers\` SET ${fields.join(', ')} WHERE \`id\` = ?`
  const [result] = await execute<ResultSetHeader>(sql, values)
  return result.affectedRows
}

// ── Delete ───────────────────────────────────────────────────

/**
 * Delete a customer by ID. Returns affected row count.
 */
export async function deleteCustomer(id: number): Promise<number> {
  const safeId = safeInt(id, 0, 1)
  if (safeId <= 0) return 0

  const [result] = await execute<ResultSetHeader>(
    'DELETE FROM `customers` WHERE `id` = ?',
    [safeId]
  )
  return result.affectedRows
}

/**
 * Set a password reset token for a customer. The caller passes the raw token;
 * only its SHA-256 digest is persisted.
 */
export async function setResetToken(
  customerId: number,
  token: string,
  expiresAt: string
): Promise<number> {
  return updateCustomer(customerId, {
    reset_token: hashPasswordResetToken(token),
    reset_expires: expiresAt,
  })
}

/**
 * Clear the reset token after successful password reset.
 */
export async function clearResetToken(customerId: number): Promise<number> {
  return updateCustomer(customerId, {
    reset_token: null,
    reset_expires: null,
  })
}

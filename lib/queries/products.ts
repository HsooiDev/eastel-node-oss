// ─────────────────────────────────────────────────────────────
// Product Query Module
// CRUD operations for the `products` table
// ─────────────────────────────────────────────────────────────

import { query, execute } from '@/lib/db'
import { safeInt, paginate, buildWhereClause, formatDate } from '@/lib/db-helpers'
import type { Product } from '@/types/database'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

// ── Read ─────────────────────────────────────────────────────

/**
 * Find a product by ID.
 */
export async function findProductById(id: number): Promise<Product | null> {
  const safeId = safeInt(id, 0, 1)
  const [rows] = await query<Product[] & RowDataPacket[]>(
    'SELECT * FROM `products` WHERE `id` = ? LIMIT 1',
    [safeId]
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * List all active products (for storefront display).
 * Ordered by sort_order, then by created_at.
 */
export async function listActiveProducts(): Promise<Product[]> {
  const [rows] = await query<Product[] & RowDataPacket[]>(
    'SELECT * FROM `products` WHERE `is_active` = 1 ORDER BY `sort_order` ASC, `created_at` DESC'
  )
  return rows
}

/**
 * List all products with pagination and optional filters (for admin).
 */
export async function listProducts(
  page: number = 1,
  perPage: number = 20,
  filters: Record<string, unknown> = {}
): Promise<{ rows: Product[]; total: number; page: number; perPage: number; totalPages: number }> {
  const { limit, offset } = paginate(page, perPage)
  const { clause: whereClause, params } = buildWhereClause(
    filters as Record<string, string | number | boolean | null | undefined>
  )

  const countSql = `SELECT COUNT(*) as total FROM \`products\` ${whereClause}`
  const [countRows] = await query<(RowDataPacket & { total: number })[]>(
    countSql,
    params
  )
  const total = countRows[0]?.total ?? 0

  const dataSql = `SELECT * FROM \`products\` ${whereClause} ORDER BY \`sort_order\` ASC, \`created_at\` DESC LIMIT ${limit} OFFSET ${offset}`
  const [rows] = await query<Product[] & RowDataPacket[]>(dataSql, params)

  return {
    rows,
    total,
    page: safeInt(page, 1, 1),
    perPage: limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ── Create ───────────────────────────────────────────────────

export interface CreateProductInput {
  name: string
  description?: string | null
  price: string
  weight_g: number
  stock?: number
  is_active?: number
  sort_order?: number
  image_url?: string | null
}

/**
 * Create a new product. Returns the inserted ID.
 */
export async function createProduct(input: CreateProductInput): Promise<number> {
  const now = formatDate()
  const [result] = await execute<ResultSetHeader>(
    `INSERT INTO \`products\`
      (\`name\`, \`description\`, \`price\`, \`weight_g\`, \`stock\`,
       \`is_active\`, \`sort_order\`, \`image_url\`, \`created_at\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.description ?? null,
      input.price,
      input.weight_g,
      input.stock ?? -1,
      input.is_active ?? 1,
      input.sort_order ?? 0,
      input.image_url ?? null,
      now,
    ]
  )
  return result.insertId
}

// ── Update ───────────────────────────────────────────────────

export interface UpdateProductInput {
  name?: string
  description?: string | null
  price?: string
  weight_g?: number
  stock?: number
  is_active?: number
  sort_order?: number
  image_url?: string | null
}

/**
 * Update a product by ID. Returns affected row count.
 */
export async function updateProduct(id: number, input: UpdateProductInput): Promise<number> {
  const safeId = safeInt(id, 0, 1)
  if (safeId <= 0) return 0

  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      fields.push(`\`${key}\` = ?`)
      values.push(value)
    }
  }

  if (fields.length === 0) return 0

  values.push(safeId)
  const sql = `UPDATE \`products\` SET ${fields.join(', ')} WHERE \`id\` = ?`
  const [result] = await execute<ResultSetHeader>(sql, values)
  return result.affectedRows
}

/**
 * Adjust product stock. Use negative delta to decrease.
 * Returns affected row count. Does not check for negative stock
 * (stock = -1 means unlimited).
 */
export async function adjustStock(id: number, delta: number): Promise<number> {
  const safeId = safeInt(id, 0, 1)
  if (safeId <= 0) return 0

  const [result] = await execute<ResultSetHeader>(
    'UPDATE `products` SET `stock` = `stock` + ? WHERE `id` = ? AND `stock` != -1',
    [delta, safeId]
  )
  return result.affectedRows
}

// ── Delete ───────────────────────────────────────────────────

/**
 * Soft-delete a product by setting is_active = 0.
 */
export async function deactivateProduct(id: number): Promise<number> {
  return updateProduct(id, { is_active: 0 })
}

/**
 * Hard-delete a product by ID. Returns affected row count.
 */
export async function deleteProduct(id: number): Promise<number> {
  const safeId = safeInt(id, 0, 1)
  if (safeId <= 0) return 0

  const [result] = await execute<ResultSetHeader>(
    'DELETE FROM `products` WHERE `id` = ?',
    [safeId]
  )
  return result.affectedRows
}

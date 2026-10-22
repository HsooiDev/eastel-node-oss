// ─────────────────────────────────────────────────────────────
// Order Query Module
// CRUD operations for the `orders` table
// ─────────────────────────────────────────────────────────────

import { query, execute } from '@/lib/db'
import { safeInt, paginate, buildWhereClause, formatDate } from '@/lib/db-helpers'
import type { Order } from '@/types/database'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

// ── Read ─────────────────────────────────────────────────────

/**
 * Find an order by ID.
 */
export async function findOrderById(id: number): Promise<Order | null> {
  const safeId = safeInt(id, 0, 1)
  const [rows] = await query<Order[] & RowDataPacket[]>(
    'SELECT * FROM `orders` WHERE `id` = ? LIMIT 1',
    [safeId]
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * Find an order by order reference (ORD-YYYYMMDD-XXXX).
 */
export async function findOrderByRef(orderRef: string): Promise<Order | null> {
  const [rows] = await query<Order[] & RowDataPacket[]>(
    'SELECT * FROM `orders` WHERE `order_ref` = ? LIMIT 1',
    [orderRef]
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * Find an order by ToyyibPay bill code.
 */
export async function findOrderByBillCode(billCode: string): Promise<Order | null> {
  const [rows] = await query<Order[] & RowDataPacket[]>(
    'SELECT * FROM `orders` WHERE `bill_code` = ? LIMIT 1',
    [billCode]
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * List orders for a customer with pagination.
 */
export async function listOrdersByCustomer(
  customerId: number,
  page: number = 1,
  perPage: number = 20
): Promise<{ rows: Order[]; total: number; page: number; perPage: number; totalPages: number }> {
  const safeCustId = safeInt(customerId, 0, 1)
  const { limit, offset } = paginate(page, perPage)

  const [countRows] = await query<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) as total FROM `orders` WHERE `customer_id` = ?',
    [safeCustId]
  )
  const total = countRows[0]?.total ?? 0

  const [rows] = await query<Order[] & RowDataPacket[]>(
    `SELECT * FROM \`orders\` WHERE \`customer_id\` = ? ORDER BY \`created_at\` DESC LIMIT ${limit} OFFSET ${offset}`,
    [safeCustId]
  )

  return {
    rows,
    total,
    page: safeInt(page, 1, 1),
    perPage: limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * List all orders with pagination and optional filters.
 */
export async function listOrders(
  page: number = 1,
  perPage: number = 20,
  filters: Record<string, unknown> = {}
): Promise<{ rows: Order[]; total: number; page: number; perPage: number; totalPages: number }> {
  const { clause, limit, offset } = paginate(page, perPage)
  const { clause: whereClause, params } = buildWhereClause(
    filters as Record<string, string | number | boolean | null | undefined>
  )

  const countSql = `SELECT COUNT(*) as total FROM \`orders\` ${whereClause}`
  const [countRows] = await query<(RowDataPacket & { total: number })[]>(
    countSql,
    params
  )
  const total = countRows[0]?.total ?? 0

  const dataSql = `SELECT * FROM \`orders\` ${whereClause} ORDER BY \`created_at\` DESC LIMIT ${limit} OFFSET ${offset}`
  const [rows] = await query<Order[] & RowDataPacket[]>(dataSql, params)

  return {
    rows,
    total,
    page: safeInt(page, 1, 1),
    perPage: limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ── Create ───────────────────────────────────────────────────

export interface CreateOrderInput {
  order_ref: string
  customer_id: number
  courier_id: number
  courier_name: string
  email: string
  sim_fee: string
  delivery_fee: string
  total_amount: string
  payment_status?: Order['payment_status']
  order_status?: Order['order_status']
  full_name: string
  phone: string
  delivery_address: string
  postcode: string
  state: string
  zone: Order['zone']
  source?: string
}

/**
 * Create a new order. Returns the inserted ID.
 */
export async function createOrder(input: CreateOrderInput): Promise<number> {
  const now = formatDate()
  const [result] = await execute<ResultSetHeader>(
    `INSERT INTO orders
      (order_ref, customer_id, courier_id, courier_name, email, sim_fee,
       delivery_fee, total_amount, payment_status, order_status, full_name,
       phone, delivery_address, postcode, state, zone, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.order_ref, input.customer_id, input.courier_id, input.courier_name, input.email,
     input.sim_fee, input.delivery_fee, input.total_amount, input.payment_status ?? 'pending',
     input.order_status ?? 'pending', input.full_name, input.phone, input.delivery_address,
     input.postcode, input.state, input.zone, input.source ?? 'website', now, now]
  )
  return result.insertId
}

// ── Update ───────────────────────────────────────────────────

export interface UpdateOrderInput {
  payment_status?: Order['payment_status']
  order_status?: Order['order_status']
  tracking_number?: string | null
  bill_code?: string | null
}

/**
 * Update an order by ID. Returns affected row count.
 */
export async function updateOrder(id: number, input: UpdateOrderInput): Promise<number> {
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

  // Always update updated_at
  fields.push('`updated_at` = ?')
  values.push(formatDate())

  values.push(safeId)
  const sql = `UPDATE \`orders\` SET ${fields.join(', ')} WHERE \`id\` = ?`
  const [result] = await execute<ResultSetHeader>(sql, values)
  return result.affectedRows
}

/**
 * Mark an order as paid.
 */
export async function markOrderPaid(id: number, billCode?: string): Promise<number> {
  const input: UpdateOrderInput = { payment_status: 'paid' }
  if (billCode) input.bill_code = billCode
  return updateOrder(id, input)
}

/**
 * Update order tracking information.
 */
export async function updateTracking(
  id: number,
  trackingNumber: string,
  status: Order['order_status'] = 'shipped'
): Promise<number> {
  return updateOrder(id, {
    tracking_number: trackingNumber,
    order_status: status,
  })
}

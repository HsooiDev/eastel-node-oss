// ─────────────────────────────────────────────────────────────
// Database Query Helpers
// Reusable utilities for pagination, filtering, formatting
// ─────────────────────────────────────────────────────────────

// ── Pagination ───────────────────────────────────────────────

export interface PaginatedResult<T> {
  rows: T
  total: number
  page: number
  perPage: number
  totalPages: number
}

/**
 * Safely cast a value to a bounded integer for LIMIT/OFFSET.
 * MariaDB requires LIMIT/OFFSET to be literal integers,
 * NOT bound parameters. Always use this before interpolation.
 */
export function safeInt(
  value: unknown,
  defaultValue: number,
  min: number = 1,
  max: number = 500
): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num < min) return defaultValue
  return Math.min(Math.floor(num), max)
}

/**
 * Build a LIMIT/OFFSET clause string for pagination.
 * Returns { clause, limit, offset } for use in queries.
 */
export function paginate(
  page: unknown = 1,
  perPage: unknown = 20
): { clause: string; limit: number; offset: number } {
  const limit = safeInt(perPage, 20, 1, 500)
  const currentPage = safeInt(page, 1, 1, 10000)
  const offset = (currentPage - 1) * limit

  return {
    clause: `LIMIT ${limit} OFFSET ${offset}`,
    limit,
    offset,
  }
}

// ── WHERE Clause Builder ─────────────────────────────────────

export type FilterValue = string | number | boolean | null | undefined
export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL'

export interface FilterCondition {
  field: string
  value?: FilterValue | FilterValue[]
  operator?: FilterOperator
}

/**
 * Build a WHERE clause from a filter object.
 *
 * Returns { clause, params } where clause includes "WHERE" prefix if needed.
 * All values are safely parameterized (no string interpolation for user input).
 *
 * @example
 * const { clause, params } = buildWhereClause({
 *   is_active: 1,
 *   name: { value: '%test%', operator: 'LIKE' },
 *   deleted_at: { value: null, operator: 'IS NULL' },
 * })
 * // clause: "WHERE `is_active` = ? AND `name` LIKE ? AND `deleted_at` IS NULL"
 * // params: [1, '%test%']
 */
export function buildWhereClause(
  filters: Record<string, FilterValue | FilterCondition>
): { clause: string; params: FilterValue[] } {
  const conditions: string[] = []
  const params: FilterValue[] = []

  for (const [key, filter] of Object.entries(filters)) {
    if (filter === undefined) continue

    const field = `\`${key}\``

    if (filter !== null && typeof filter === 'object' && !Array.isArray(filter) && 'operator' in filter) {
      const cond = filter as FilterCondition
      const op = cond.operator || '='

      if (op === 'IS NULL' || op === 'IS NOT NULL') {
        conditions.push(`${field} ${op}`)
      } else if (op === 'IN' && Array.isArray(cond.value)) {
        const placeholders = cond.value.map(() => '?').join(', ')
        conditions.push(`${field} IN (${placeholders})`)
        params.push(...(cond.value as FilterValue[]))
      } else {
        conditions.push(`${field} ${op} ?`)
        params.push(cond.value as FilterValue)
      }
    } else if (filter === null) {
      conditions.push(`${field} IS NULL`)
    } else {
      conditions.push(`${field} = ?`)
      params.push(filter as FilterValue)
    }
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { clause, params }
}

// ── Date Formatting ──────────────────────────────────────────

/**
 * Format a Date (or date string) for MySQL DATETIME columns.
 * Returns 'YYYY-MM-DD HH:MM:SS' format.
 */
export function formatDate(date?: Date | string | null): string {
  if (!date) {
    date = new Date()
  } else if (typeof date === 'string') {
    date = new Date(date)
  }

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')

  return `${y}-${m}-${d} ${h}:${min}:${s}`
}

// ── Currency Conversion ──────────────────────────────────────

/**
 * Convert RM (ringgit) to cents for ToyyibPay.
 * Handles string or number input, rounds to nearest cent.
 *
 * @example toCents('29.90') => 2990
 */
export function toCents(ringgit: string | number): number {
  const value = typeof ringgit === 'string' ? parseFloat(ringgit) : ringgit
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

/**
 * Convert cents to RM display string.
 *
 * @example fromCents(2990) => '29.90'
 */
export function fromCents(cents: number): string {
  if (!Number.isFinite(cents)) return '0.00'
  return (cents / 100).toFixed(2)
}

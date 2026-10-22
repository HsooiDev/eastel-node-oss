import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { requireAdmin, requireAdminCsrf, success, error } from '@/app/api/admin/_helpers'
import { safeInt, paginate } from '@/lib/db-helpers'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'

export async function GET(request: NextRequest): Promise<Response> {
  const admin = await requireAdmin()
  if (!admin) return error('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const status    = searchParams.get('status')
  const postcode  = searchParams.get('postcode')
  const email     = searchParams.get('email')
  const phone     = searchParams.get('phone')
  const city      = searchParams.get('city')
  const state     = searchParams.get('state')
  const dateFrom  = searchParams.get('date_from')
  const dateTo    = searchParams.get('date_to')
  const waOpened  = searchParams.get('wa_opened')
  const page      = safeInt(searchParams.get('page'), 1, 1)
  const perPage   = safeInt(searchParams.get('per_page'), 20, 1, 100)

  const conditions: string[] = []
  const params: unknown[] = []

  if (status && ['new','contacted','resolved','no_action'].includes(status)) {
    conditions.push('status = ?')
    params.push(status)
  }
  if (postcode) { conditions.push('postcode LIKE ?'); params.push(`%${postcode}%`) }
  if (email)    { conditions.push('email LIKE ?');    params.push(`%${email}%`) }
  if (phone)    { conditions.push('phone LIKE ?');    params.push(`%${phone}%`) }
  if (city)     { conditions.push('city LIKE ?');     params.push(`%${city}%`) }
  if (state)    { conditions.push('state LIKE ?');    params.push(`%${state}%`) }
  if (dateFrom) { conditions.push('DATE(created_at) >= ?'); params.push(dateFrom) }
  if (dateTo)   { conditions.push('DATE(created_at) <= ?'); params.push(dateTo) }
  if (waOpened === '1') { conditions.push('wa_opened = 1') }
  if (waOpened === '0') { conditions.push('wa_opened = 0') }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const { limit, offset } = paginate(page, perPage)

  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM postcode_inquiries ${where}`,
    params
  )
  const total = Number(countRows[0]?.total ?? 0)

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, session_id, postcode, full_name, email, phone, alt_phone,
            address_line1, address_line2, city, state, status, wa_opened,
            ip_address, admin_notes, created_at, updated_at
     FROM postcode_inquiries ${where}
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  )

  const [statusCountRows] = await db.query<RowDataPacket[]>(
    `SELECT status, COUNT(*) AS cnt FROM postcode_inquiries GROUP BY status`
  )
  const counts = { new: 0, contacted: 0, resolved: 0, no_action: 0, total: 0 }
  for (const r of statusCountRows) {
    const s = r.status as keyof typeof counts
    if (s in counts) counts[s] = Number(r.cnt)
  }
  counts.total = counts.new + counts.contacted + counts.resolved + counts.no_action

  return success({ data: rows, total, page, per_page: perPage, counts })
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const admin = await requireAdminCsrf(request)
  if (!admin) return error('Unauthorized', 401)

  let body: { ids?: unknown; status?: unknown }
  try {
    body = await request.json() as { ids?: unknown; status?: unknown }
  } catch {
    return error('Invalid JSON', 400)
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is number => typeof v === 'number' && Number.isInteger(v))
    : []
  const newStatus = typeof body.status === 'string' ? body.status : ''

  if (ids.length === 0) return error('ids array is required and must be non-empty', 400)
  if (!['new','contacted','resolved','no_action'].includes(newStatus)) {
    return error('Invalid status value', 400)
  }

  const placeholders = ids.map(() => '?').join(',')
  await db.execute<ResultSetHeader>(
    `UPDATE postcode_inquiries SET status = ? WHERE id IN (${placeholders})`,
    [newStatus, ...ids]
  )

  return success({ updated: ids.length })
}

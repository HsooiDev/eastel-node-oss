import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error, getClientIp } from '@/app/api/auth/_helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

export async function POST(request: NextRequest): Promise<Response> {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`postcode-inquiry:${ip}`, 10, 60 * 60 * 1000)
  if (!rl.allowed) {
    return error('Too many requests', 429)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return error('Invalid JSON', 400)
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : ''
  const postcode  = typeof body.postcode   === 'string' ? body.postcode.trim()   : ''
  if (!sessionId || !postcode) {
    return error('session_id and postcode are required', 400)
  }
  if (!/^\d{5}$/.test(postcode)) {
    return error('Invalid postcode format', 400)
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  // Server-side dedup: if this session already has a row, return its id
  const [existing] = await db.query<RowDataPacket[]>(
    'SELECT id FROM postcode_inquiries WHERE session_id = ? LIMIT 1',
    [sessionId]
  )
  if (existing.length > 0) {
    return success({ id: existing[0].id })
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO postcode_inquiries
      (session_id, postcode, full_name, email, phone, alt_phone,
       address_line1, address_line2, city, state, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      postcode,
      str(body.full_name),
      str(body.email),
      str(body.phone),
      str(body.alt_phone),
      str(body.address_line1),
      str(body.address_line2),
      str(body.city),
      str(body.state),
      ip,
    ]
  )

  return success({ id: result.insertId })
}

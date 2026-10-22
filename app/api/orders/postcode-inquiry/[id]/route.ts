import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error, getClientIp } from '@/app/api/auth/_helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (!id || isNaN(id)) return error('Invalid id', 400)

  const ip = getClientIp(request)
  const rl = checkRateLimit(`postcode-inquiry-patch:${ip}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) return error('Too many requests', 429)

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return error('Invalid JSON', 400)
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : ''
  if (!sessionId) return error('session_id is required', 400)

  // Verify ownership before updating (IDOR prevention)
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id FROM postcode_inquiries WHERE id = ? AND session_id = ? LIMIT 1',
    [id, sessionId]
  )
  if (rows.length === 0) {
    return error('Not authorized to update this inquiry', 403)
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const sets: string[] = []
  const vals: unknown[] = []

  const fieldMap: Record<string, string> = {
    postcode: 'postcode', full_name: 'full_name', email: 'email',
    phone: 'phone', alt_phone: 'alt_phone', address_line1: 'address_line1',
    address_line2: 'address_line2', city: 'city', state: 'state',
  }
  for (const [bodyKey, col] of Object.entries(fieldMap)) {
    if (bodyKey in body) {
      sets.push(`\`${col}\` = ?`)
      vals.push(str(body[bodyKey]))
    }
  }

  if (body.wa_opened === true) {
    sets.push('`wa_opened` = 1')
  }

  if (sets.length === 0) return error('Nothing to update', 400)

  vals.push(id, sessionId)
  await db.execute<ResultSetHeader>(
    `UPDATE postcode_inquiries SET ${sets.join(', ')} WHERE id = ? AND session_id = ?`,
    vals
  )

  return success({})
}

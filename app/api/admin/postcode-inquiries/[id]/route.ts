import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { requireAdminCsrf, success, error } from '@/app/api/admin/_helpers'
import type { ResultSetHeader } from 'mysql2/promise'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const admin = await requireAdminCsrf(request)
  if (!admin) return error('Unauthorized', 401)

  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (!id || isNaN(id)) return error('Invalid id', 400)

  let body: { status?: unknown; admin_notes?: unknown }
  try {
    body = await request.json() as { status?: unknown; admin_notes?: unknown }
  } catch {
    return error('Invalid JSON', 400)
  }

  const sets: string[] = []
  const vals: unknown[] = []

  if (typeof body.status === 'string') {
    if (!['new','contacted','resolved','no_action'].includes(body.status)) {
      return error('Invalid status value', 400)
    }
    sets.push('`status` = ?')
    vals.push(body.status)
  }

  if ('admin_notes' in body) {
    sets.push('`admin_notes` = ?')
    vals.push(typeof body.admin_notes === 'string' && body.admin_notes.trim()
      ? body.admin_notes.trim()
      : null)
  }

  if (sets.length === 0) return error('Nothing to update', 400)

  vals.push(id)
  await db.execute<ResultSetHeader>(
    `UPDATE postcode_inquiries SET ${sets.join(', ')} WHERE id = ?`,
    vals
  )

  return success({})
}

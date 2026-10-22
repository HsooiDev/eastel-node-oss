import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error } from '@/app/api/auth/_helpers'
import type { RowDataPacket } from 'mysql2/promise'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const postcode = (searchParams.get('postcode') ?? '').trim()

    if (!/^\d{5}$/.test(postcode)) {
      return error('Invalid postcode format.')
    }

    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT zone FROM postcode_zones WHERE ? BETWEEN postcode_start AND postcode_end LIMIT 1',
      [Number(postcode)]
    )

    if (rows.length === 0) {
      return error('Postcode not found.')
    }

    return success({ zone: rows[0].zone as 'WM' | 'EM' | 'Labuan' })
  } catch (e) {
    console.error('[orders/zone]', e)
    return error('Zone lookup failed.', 500)
  }
}

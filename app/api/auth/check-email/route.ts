import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { success, error } from '@/app/api/auth/_helpers'
import type { RowDataPacket } from 'mysql2/promise'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = (searchParams.get('email') ?? '').toLowerCase().trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return error('Invalid email address.')
    }

    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id FROM customers WHERE email = ? LIMIT 1',
      [email]
    )

    return success({ registered: rows.length > 0 })
  } catch (e) {
    console.error('[check-email]', e)
    return error('Server error.', 500)
  }
}

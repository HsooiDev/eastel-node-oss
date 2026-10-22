import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'
import { SITE_URL } from '@/lib/site'

export async function GET(request: NextRequest) {
  const billCode = request.nextUrl.searchParams.get('bill_code') || ''
  const baseUrl = process.env.TOYYIBPAY_BASE_URL || 'https://dev.toyyibpay.com'
  const siteUrl = SITE_URL

  if (!billCode || !/^[a-zA-Z0-9]+$/.test(billCode)) {
    return Response.redirect(`${siteUrl}/ms/account/orders?payment=error`, 302)
  }

  const [orders] = await db.query<RowDataPacket[]>(
    'SELECT payment_status FROM orders WHERE bill_code = ? LIMIT 1',
    [billCode]
  )

  if (orders.length === 0) {
    return Response.redirect(`${siteUrl}/ms/account/orders?payment=error`, 302)
  }

  if (orders[0].payment_status === 'paid') {
    return Response.redirect(`${siteUrl}/ms/account/orders`, 302)
  }

  return Response.redirect(`${baseUrl}/${billCode}`, 302)
}

import db from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'

export interface StorefrontCheckout {
  product: { id: number; name: string; price: number; available: boolean } | null
  couriers: Array<{ id: number; name: string; wm_fee: string; em_fee: string; labuan_fee: string }>
}

function money(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(value))) {
    throw new Error('Invalid storefront price')
  }
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) {
    throw new Error('Invalid storefront price')
  }
  return amount
}

function positiveId(value: unknown): number {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid storefront ID')
  return id
}

function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid storefront name')
  return value.trim()
}

/** Read only the SIM and delivery information that public checkout needs. */
export async function getStorefrontCheckout(): Promise<StorefrontCheckout> {
  const [[products], [couriers]] = await Promise.all([
    // Match orders/create exactly: the website purchases one SIM, not arbitrary products.
    db.query<RowDataPacket[]>(
      'SELECT id, name, price, stock FROM products WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1',
    ),
    db.query<RowDataPacket[]>(
      'SELECT id, name, wm_fee, em_fee, labuan_fee FROM couriers WHERE is_active = 1 ORDER BY sort_order ASC, id ASC',
    ),
  ])

  let product: StorefrontCheckout['product'] = null
  if (products.length > 0) {
    const row = products[0]
    if ((typeof row.stock !== 'number' && typeof row.stock !== 'string') ||
        !/^-?\d+$/.test(String(row.stock))) throw new Error('Invalid storefront stock')
    const stock = Number(row.stock)
    if (!Number.isSafeInteger(stock) || stock < -1) throw new Error('Invalid storefront stock')
    product = {
      id: positiveId(row.id), name: name(row.name), price: money(row.price),
      available: stock === -1 || stock > 0,
    }
  }

  return {
    product,
    couriers: couriers.map((row) => ({
      id: positiveId(row.id), name: name(row.name),
      wm_fee: money(row.wm_fee).toFixed(2),
      em_fee: money(row.em_fee).toFixed(2),
      labuan_fee: money(row.labuan_fee).toFixed(2),
    })),
  }
}

import { timingSafeEqual } from 'node:crypto'
import { requireAdminCsrf } from '@/app/api/admin/_helpers'

export async function authorizeCron(request: Request): Promise<boolean> {
  const expected = process.env.CRON_SECRET
  const supplied = request.headers.get('x-cron-secret')
  if (expected?.trim() && supplied?.trim()) {
    const a = Buffer.from(expected)
    const b = Buffer.from(supplied)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return Boolean(await requireAdminCsrf(request))
}

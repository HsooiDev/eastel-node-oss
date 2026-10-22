import { z } from 'zod'
import { decryptCheckoutDetails } from '@/lib/ai-checkout-details'
import { CommerceError } from '@/lib/ai-commerce'
import { readCommerceJson, assertCommerceOrigin, commerceRateLimit, commerceRateLimitError, commerceJson, commerceHttpError } from '@/lib/ai-commerce-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Internal browser handoff; deliberately excluded from AI tool discovery.
// Possession of the private draft token grants access only to that draft, never
// to a customer account, session, order, payment or verification token.
export async function POST(request: Request) {
  try {
    assertCommerceOrigin(request)
    const limit = commerceRateLimit(request)
    if (!limit.allowed) return commerceRateLimitError(limit)
    const parsed = z.object({ token: z.string().min(1).max(4096) }).strict().safeParse(await readCommerceJson(request))
    if (!parsed.success) throw new CommerceError('invalid_draft', 'Invalid checkout draft.')
    try {
      const details = await decryptCheckoutDetails(parsed.data.token)
      return commerceJson({ status: 'success', details }, 200, limit)
    } catch {
      throw new CommerceError('invalid_draft', 'This checkout draft is invalid or expired. Please enter your details on the website.', 400)
    }
  } catch (error) {
    return commerceHttpError(error)
  }
}

import { executeCommerceTool } from '@/lib/ai-commerce'
import { assertCommerceOrigin, commerceHttpError, commerceJson, commerceRateLimit, commerceRateLimitError, readCommerceJson } from '@/lib/ai-commerce-http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rateLimit = commerceRateLimit(request)
  if (!rateLimit.allowed) return commerceRateLimitError(rateLimit)
  try {
    assertCommerceOrigin(request)
    const args = await readCommerceJson(request)
    return commerceJson(await executeCommerceTool('eastel_recommend_plan', args), 200, rateLimit)
  } catch (error) {
    return commerceHttpError(error, rateLimit)
  }
}

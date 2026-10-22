import { executeCommerceTool } from '@/lib/ai-commerce'
import { commerceHttpError, CommerceHttpError, commerceJson, commerceRateLimit, commerceRateLimitError } from '@/lib/ai-commerce-http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const rateLimit = commerceRateLimit(request)
  if (!rateLimit.allowed) return commerceRateLimitError(rateLimit)
  try {
    const params = new URL(request.url).searchParams
    if ([...params.keys()].some(key => key !== 'locale') || params.getAll('locale').length > 1) {
      throw new CommerceHttpError('invalid_arguments', 'Only one optional locale query parameter is accepted.', 400)
    }
    const locale = params.get('locale')
    const result = await executeCommerceTool('eastel_get_catalogue', locale === null ? {} : { locale })
    return commerceJson(result, 200, rateLimit)
  } catch (error) {
    return commerceHttpError(error, rateLimit)
  }
}

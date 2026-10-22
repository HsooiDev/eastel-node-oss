import { NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitResult } from '@/lib/rate-limit'
import { SITE_URL } from '@/lib/site'
import { clientIp } from '@/lib/client-ip'

const BODY_LIMIT_BYTES = 16 * 1024
const RATE_LIMIT = 60

export class CommerceHttpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'CommerceHttpError'
  }
}

/** Reuse the application's proxy IP convention; deployment must trust only its proxy. */
export function commerceRateLimit(request: Request): RateLimitResult {
  const ip = clientIp(request)
  return checkRateLimit(`ai-commerce:${ip}`, RATE_LIMIT, 60_000)
}

/** Server-to-server AI clients omit Origin. Browser POSTs must use the configured site. */
export function assertCommerceOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== new URL(SITE_URL).origin) {
    throw new CommerceHttpError('invalid_origin', 'The request origin is not allowed.', 403)
  }
}

/** Bound the actual stream, including bodies without a trustworthy Content-Length. */
export async function readCommerceJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new CommerceHttpError('unsupported_media_type', 'Use application/json for this request.', 415)
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new CommerceHttpError('invalid_request', 'Invalid Content-Length.', 400)
    }
    if (Number(declaredLength) > BODY_LIMIT_BYTES) {
      throw new CommerceHttpError('request_too_large', 'Request body must be at most 16 KiB.', 413)
    }
  }

  if (!request.body) {
    throw new CommerceHttpError('invalid_request', 'A JSON request body is required.', 400)
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > BODY_LIMIT_BYTES) {
        void reader.cancel().catch(() => {})
        throw new CommerceHttpError('request_too_large', 'Request body must be at most 16 KiB.', 413)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    if (error instanceof CommerceHttpError) throw error
    throw new CommerceHttpError('invalid_request', 'The request body must contain valid JSON.', 400)
  } finally {
    reader.releaseLock()
  }
}

export function commerceJson(
  body: unknown,
  status = 200,
  rateLimit?: RateLimitResult,
): NextResponse {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  if (rateLimit) {
    headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    headers.set('X-RateLimit-Remaining', String(rateLimit.remaining))
    headers.set('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetAt / 1000)))
    if (!rateLimit.allowed) {
      headers.set('Retry-After', String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))))
    }
  }
  return NextResponse.json(body, { status, headers })
}

export function commerceHttpError(error: unknown, rateLimit?: RateLimitResult): NextResponse {
  // CommerceError from the tool layer and local transport errors share this contract.
  if (error instanceof Error
    && 'code' in error && typeof error.code === 'string'
    && 'httpStatus' in error && typeof error.httpStatus === 'number'
    && Number.isInteger(error.httpStatus) && error.httpStatus >= 400 && error.httpStatus <= 599) {
    return commerceJson({ status: 'error', code: error.code, message: error.message }, error.httpStatus, rateLimit)
  }
  return commerceJson({
    status: 'error',
    code: 'temporarily_unavailable',
    message: 'Eastel commerce is temporarily unavailable. Please try again later.',
  }, 503, rateLimit)
}

export function commerceRateLimitError(rateLimit: RateLimitResult): NextResponse {
  return commerceHttpError(new CommerceHttpError(
    'rate_limited', 'Too many AI commerce requests. Please try again later.', 429,
  ), rateLimit)
}

// ─────────────────────────────────────────────────────────────
// Security Headers Middleware
// Adds CSP, X-Frame-Options, X-Content-Type-Options, and
// rate limiting headers to responses.
//
// In Next.js 16, middleware.ts is deprecated and renamed to proxy.ts.
// Import these helpers into your proxy.ts or use next.config.ts headers().
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit as boundedRateLimit } from '@/lib/rate-limit'

// ── Security Header Values ───────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Prevent XSS (legacy browsers)
  'X-XSS-Protection': '1; mode=block',

  // Permissions policy -- restrict browser features
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=(self)',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', '),
}

// ── Content Security Policy ──────────────────────────────────

function getCspHeader(nonce?: string): string {
  const scriptSrc = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "'self' 'unsafe-inline'"

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc} https://challenges.cloudflare.com https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://challenges.cloudflare.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.googletagmanager.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ]

  return directives.join('; ')
}

// ── Apply Security Headers ───────────────────────────────────

/**
 * Apply security headers to a NextResponse.
 * Can be imported and used in proxy.ts or individual route handlers.
 */
export function applySecurityHeaders(
  response: NextResponse,
  options?: { nonce?: string }
): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }

  response.headers.set('Content-Security-Policy', getCspHeader(options?.nonce))

  return response
}

/**
 * Create a NextResponse.next() with security headers applied.
 * Convenience wrapper for use in proxy.ts.
 */
export function secureNext(
  request: NextRequest,
  options?: { nonce?: string; locale?: string; productionHost?: boolean }
): NextResponse {
  const requestHeaders = new Headers(request.headers)
  // These are proxy assertions, never client assertions.
  requestHeaders.delete('x-nonce')
  requestHeaders.delete('x-locale')
  requestHeaders.delete('x-seo-production')
  requestHeaders.delete('x-seo-pathname')
  requestHeaders.delete('x-forwarded-host')
  requestHeaders.set('x-seo-production', options?.productionHost ? '1' : '0')
  requestHeaders.set('x-seo-pathname', request.nextUrl.pathname)
  
  if (options?.nonce) {
    requestHeaders.set('x-nonce', options.nonce)
    requestHeaders.set('Content-Security-Policy', getCspHeader(options.nonce))
  }

  if (options?.locale) {
    requestHeaders.set('x-locale', options.locale)
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  return applySecurityHeaders(response, options)
}

// ── Rate Limit Headers ───────────────────────────────────────

/**
 * Add rate limiting headers to a response.
 * Use after checking rate limits to inform clients of their quota.
 */
export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetAt: number
): NextResponse {
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)))

  return response
}

// ── Rate Limiter Implementation ──────────────────────────────

/**
 * Check if the given identifier (e.g. IP) has exceeded the rate limit.
 * Uses a simple fixed window in-memory store.
 */
export function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; resetAt: number } {
  const result = boundedRateLimit(identifier, limit, windowMs);
  return {
    success: result.allowed,
    remaining: result.remaining,
    resetAt: result.resetAt,
  };
}

export { SECURITY_HEADERS, getCspHeader }

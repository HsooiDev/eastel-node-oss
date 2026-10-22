import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "@/lib/cookies";
import { validateSession } from "@/lib/session";
import type { RateLimitResult } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";

export function success(data?: Record<string, unknown>) {
  return NextResponse.json({ status: "success", ...data });
}

export function error(message: string, status = 400, rateLimit?: RateLimitResult) {
  const res = NextResponse.json({ status: "error", message }, { status });
  if (rateLimit) applyRateLimitHeaders(res, rateLimit);
  return res;
}

export function getClientIp(request: NextRequest): string {
  return clientIp(request);
}

/**
 * Apply X-RateLimit-* headers to a response.
 */
export function applyRateLimitHeaders(res: NextResponse, rl: RateLimitResult): void {
  res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
  res.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
  if (!rl.allowed) {
    res.headers.set("Retry-After", String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
  }
}

export async function requireSession() {
  const sessionId = await getSessionCookie();
  if (!sessionId) return null;
  return validateSession(sessionId);
}

import { NextResponse } from "next/server";
import { getSessionCookie } from "@/lib/cookies";
import { validateAdminSession, type SessionData } from "@/lib/session";
import { validateCsrfToken } from "@/lib/security";
import { SITE_URL } from "@/lib/site";
import type { RateLimitResult } from "@/lib/rate-limit";

export function success(data?: Record<string, unknown>) {
  return NextResponse.json({ status: "success", ...data });
}

export function error(message: string, status = 400, rateLimit?: RateLimitResult) {
  const res = NextResponse.json({ status: "error", message }, { status });
  if (rateLimit) {
    res.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(rateLimit.resetAt / 1000)));
    if (!rateLimit.allowed) {
      res.headers.set("Retry-After", String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)));
    }
  }
  return res;
}

/**
 * Require a valid admin session.
 * Returns the session data or null if not authenticated as admin.
 */
export async function requireAdmin(): Promise<SessionData | null> {
  const sessionId = await getSessionCookie();
  if (!sessionId) return null;
  return validateAdminSession(sessionId);
}

/**
 * Require admin session + CSRF protection for mutating endpoints.
 * Uses Origin-header validation: if Origin is present it must match
 * NEXT_PUBLIC_SITE_URL or the request Host. This prevents cross-origin
 * CSRF attacks without requiring per-request tokens on the client.
 */
export async function requireAdminCsrf(request: Request): Promise<SessionData | null> {
  const sessionId = await getSessionCookie();
  if (!sessionId) return null;

  const session = await validateAdminSession(sessionId);
  if (!session) return null;

  const origin = request.headers.get("origin");
  if (origin) {
    const siteUrl = SITE_URL;
    const host = request.headers.get("host") ?? "";
    const allowed = [
      siteUrl,
      `https://${host}`,
      `http://${host}`,
    ].filter(Boolean);
    if (!allowed.includes(origin)) {
      return null;
    }
  }

  return session;
}

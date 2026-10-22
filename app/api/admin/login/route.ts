import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { withAdminLoginAttempt } from "@/lib/admin-login-attempts";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { setSessionCookie } from "@/lib/cookies";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema, validate } from "@/lib/validation";
import { logAdminAction } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";
import { SITE_URL } from "@/lib/site";
import { success, error } from "../_helpers";

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") || "";

    // ── IP rate limit: 10 attempts per 15 min ────────────────
    const rl = checkRateLimit(`admin_login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return error("Too many login attempts. Try again later.", 429);
    }

    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return error("Invalid email or password.");
    }
    // Both local and legacy PHP aliases reject without holding a timer open.
    if ([body._hp, body.hp_field].some(value => value !== undefined && value !== null && value !== "")) {
      return error("Invalid email or password.");
    }

    // ── Turnstile ────────────────────────────────────────────
    if (!(await verifyTurnstile(body.turnstileToken, ip, {
      hostname: new URL(SITE_URL).hostname,
      action: "admin_login",
    }))) {
      return error("Security check failed.");
    }

    // ── Zod validation ───────────────────────────────────────
    const parsed = validate(loginSchema, body);
    if (!parsed.success) {
      return error("Invalid email or password.");
    }
    const { email, password } = parsed.data;

    const result = await withAdminLoginAttempt<RowDataPacket>({ ip, email, userAgent }, async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT `id`, `name`, `email`, `password_hash` FROM `admin_users` WHERE `email` = ? AND `is_active` = 1 LIMIT 1",
        [email]
      );
      const admin = rows[0];
      if (!admin || !(await verifyPassword(password, admin.password_hash))) return { status: "invalid" };
      return { status: "success", value: admin };
    });
    if (result.status === "unavailable") return error("Login temporarily unavailable. Try again later.", 503);
    if (result.status === "limited") return error("Too many login attempts. Try again later.", 429);
    if (result.status === "locked") return error("Account temporarily locked due to too many failed attempts. Try again in 5 minutes.");
    if (result.status === "invalid") return error("Invalid email or password.");
    const admin = result.value;

    // ── Login success ────────────────────────────────────────
    resetRateLimit(`admin_login:${ip}`);
    void logAdminAction(admin.id, "admin_login", null, null, null, null, ip);

    const sessionId = await createSession(admin.id, ip, userAgent, "admin");
    await setSessionCookie(sessionId);

    return success({
      admin: { id: admin.id, name: admin.name, email: admin.email },
    });
  } catch (e) {
    console.error("Admin login error:", e);
    return error("Login failed.", 500);
  }
}

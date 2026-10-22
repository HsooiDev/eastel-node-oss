import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { setSessionCookie } from "@/lib/cookies";
import { verifyTurnstile } from "@/lib/turnstile";
import { SITE_URL } from "@/lib/site";
import { checkRateLimit } from "@/lib/rate-limit";
import { registerSchema, validate } from "@/lib/validation";
import { voucherIssueWelcome } from "@/lib/vouchers";
import { issueAccountVerification } from "@/lib/account-verification";
import { success, error, getClientIp } from "../_helpers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ip = getClientIp(request);

    const rl = checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) return error("Too many attempts. Try again later.", 429);

    const parsed = validate(registerSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { name, email, phone, password } = parsed.data;

    if (!(await verifyTurnstile(body.turnstileToken, ip, {
      hostname: new URL(SITE_URL).hostname,
      action: "register",
    }))) {
      return error("Security check failed.");
    }

    const [existing] = await db.query("SELECT id FROM customers WHERE email = ?", [email]);
    if (existing.length > 0) return error("This email is already registered.");

    const hash = await hashPassword(password);
    const [result] = await db.execute(
      "INSERT INTO customers (name, email, phone, password_hash, is_temp_pass, email_verified) VALUES (?, ?, ?, ?, 0, 0)",
      [name, email, phone, hash]
    );
    const customerId = result.insertId;

    // Issue welcome voucher (idempotent; no-op if no active welcome campaign) — PHP auth.php parity
    await voucherIssueWelcome(customerId);

    const verification = await issueAccountVerification(email, String(body.lang ?? "en"));
    const sessionId = await createSession(customerId, ip, request.headers.get("user-agent") || "", "customer", hash);
    await setSessionCookie(sessionId);

    return success({
      customer: { id: customerId, name, email, phone },
      emailVerified: false,
      requiresEmailVerification: true,
      verificationToken: verification.token,
      verificationSent: verification.sent,
    });
  } catch (e) {
    console.error("Register error:", e);
    return error("Registration failed.", 500);
  }
}

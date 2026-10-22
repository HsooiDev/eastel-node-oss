import type { NextRequest } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { setSessionCookie } from "@/lib/cookies";
import { verifyTurnstile } from "@/lib/turnstile";
import { SITE_URL } from "@/lib/site";
import { checkRateLimit } from "@/lib/rate-limit";
import { loginSchema, validate } from "@/lib/validation";
import { success, error, getClientIp } from "../_helpers";
import { withCustomerLoginAttempt } from "@/lib/customer-login-attempts";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ip = getClientIp(request);

    const rl = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) return error("Too many login attempts. Try again later.", 429);

    if (!(await verifyTurnstile(body.turnstileToken, ip, {
      hostname: new URL(SITE_URL).hostname,
      action: "login",
    }))) {
      return error("Security check failed.");
    }

    const parsed = validate(loginSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { email, password } = parsed.data;

    const userAgent = request.headers.get("user-agent") || "";
    const attempt = await withCustomerLoginAttempt<{ customer: RowDataPacket; passwordHash: string }>({ ip, email, userAgent }, async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT id, name, email, phone, password_hash, is_temp_pass, email_verified FROM customers WHERE email = ?",
        [email]
      );
      if (rows.length === 0) return { status: "invalid" };

      const customer = rows[0];
      const valid = await verifyPassword(password, customer.password_hash);
      if (!valid) return { status: "invalid" };

      let passwordHash: string = customer.password_hash;
      if (passwordHash.startsWith("scrypt:")) {
        // Only a successful owner login can migrate a legacy one-way hash.
        // CAS prevents a concurrent reset from being overwritten by this rehash.
        const upgradedHash = await hashPassword(password);
        const [result] = await connection.execute<ResultSetHeader>(
          "UPDATE customers SET password_hash = ? WHERE id = ? AND password_hash = ?",
          [upgradedHash, customer.id, passwordHash]
        );
        if (result.affectedRows !== 1) return { status: "conflict" };
        passwordHash = upgradedHash;
      }

      return { status: "success", value: { customer, passwordHash } };
    });
    if (attempt.status === "limited") return error("Too many login attempts. Try again later.", 429);
    if (attempt.status === "unavailable") return error("Login temporarily unavailable. Try again later.", 503);
    if (attempt.status === "invalid") return error("Invalid email or password.");
    if (attempt.status === "conflict") return error("Credentials changed. Please sign in again.", 409);
    const { customer, passwordHash } = attempt.value;

    const sessionId = await createSession(customer.id, ip, userAgent, 'customer', passwordHash);
    await setSessionCookie(sessionId);

    return success({
      customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
      requiresPasswordChange: customer.is_temp_pass === 1,
      emailVerified: Number(customer.email_verified) === 1,
      requiresEmailVerification: Number(customer.email_verified) !== 1,
    });
  } catch (e) {
    console.error("Login error:", e);
    return error("Login failed.", 500);
  }
}

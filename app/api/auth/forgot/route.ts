import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import db from "@/lib/db";
import { hashPasswordResetToken } from "@/lib/auth";
import { verifyTurnstile } from "@/lib/turnstile";
import { SITE_URL } from "@/lib/site";
import { checkRateLimit } from "@/lib/rate-limit";
import { forgotSchema, validate } from "@/lib/validation";
import { sendPasswordReset } from "@/lib/email";
import { success, error, getClientIp } from "../_helpers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ip = getClientIp(request);

    const rl = checkRateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) return error("Too many attempts. Try again later.", 429);

    if (!(await verifyTurnstile(body.turnstileToken, ip, {
      hostname: new URL(SITE_URL).hostname,
      action: "forgot_password",
    }))) return error("Security check failed.");

    const parsed = validate(forgotSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { email } = parsed.data;

    const [rows] = await db.query("SELECT id FROM customers WHERE email = ?", [email]);
    if (rows.length > 0) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashPasswordResetToken(token);
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await db.execute("UPDATE customers SET reset_token = ?, reset_expires = ? WHERE id = ?", [tokenHash, expires, rows[0].id]);

      // Fire-and-forget keeps response timing uniform (no account enumeration)
      const locale = ["en", "ms", "zh"].includes(body.lang) ? body.lang : "en";
      sendPasswordReset(email, token, locale).catch((e) =>
        console.error("Forgot: reset email send failed:", e)
      );
    }

    return success({ message: "If the email exists, a reset link has been sent." });
  } catch (e) {
    console.error("Forgot error:", e);
    return error("Request failed.", 500);
  }
}

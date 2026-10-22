import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyAccountEmail } from "@/lib/account-verification";
import { requireSession, success, error } from "../_helpers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body.code ?? "").trim();
    const token = String(body.token ?? "").trim() || undefined;
    const session = await requireSession();

    if (!/^\d{6}$/.test(code)) return error("Invalid verification code.");
    if (token && !/^[a-f0-9]{64}$/i.test(token)) return error("Invalid verification token.");
    if (!session && !token) return error("Not authenticated.", 401);

    if (session) {
      const rl = checkRateLimit(`verify-email:${session.customerId}`, 5, 15 * 60 * 1000);
      if (!rl.allowed) return error("Too many verification attempts. Request a new code later.", 429, rl);
    }

    const result = await verifyAccountEmail({
      customerId: session?.customerId,
      email: session?.email,
      token,
      code,
    });
    if (!result.ok) {
      if (result.reason === "too_many_attempts") return error("Too many verification attempts. Request a new code.", 429);
      if (result.reason === "expired") return error("Verification code has expired. Please request a new one.");
      if (result.reason === "invalid_code") return error("Incorrect verification code. Please try again.");
      if (result.reason === "customer_not_found") return error("Account not found.", 404);
      return error("Invalid or expired verification code.");
    }

    return success({ message: result.alreadyVerified ? "Email already verified." : "Email verified successfully.", emailVerified: true });
  } catch (e) {
    console.error("Verify email error:", e);
    return error("Email verification failed.", 500);
  }
}

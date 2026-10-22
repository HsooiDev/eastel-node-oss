import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { hashPassword, hashPasswordResetToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { SITE_URL } from "@/lib/site";
import { resetSchema, validate } from "@/lib/validation";
import { success, error, getClientIp } from "../_helpers";
import type { RowDataPacket } from "mysql2/promise";

export async function POST(request: NextRequest) {
  try {
    // Bound anonymous work before parsing, password hashing or database access.
    const rl = checkRateLimit(`reset:${getClientIp(request)}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) return error("Too many attempts. Try again later.", 429, rl);

    const body = await request.json();

    const parsed = validate(resetSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { token, password } = parsed.data;

    const verified = await verifyTurnstile(body.turnstileToken, getClientIp(request), {
      hostname: new URL(SITE_URL).hostname,
      action: "reset_password",
    });
    if (!verified) return error("Security check failed.");

    // Reject invalid proofs before the expensive password KDF, matching PHP.
    // Hash outside the transaction, then recheck the same account/proof under lock.
    const tokenHash = hashPasswordResetToken(token);
    const [candidates] = await db.query<RowDataPacket[]>(
      "SELECT id, reset_expires FROM customers WHERE reset_token = ? LIMIT 1",
      [tokenHash]
    );
    const candidateExpiry = candidates[0]?.reset_expires ? new Date(candidates[0].reset_expires).getTime() : NaN;
    if (candidates.length === 0 || !Number.isFinite(candidateExpiry) || candidateExpiry <= Date.now()) {
      return error("Invalid or expired reset token.");
    }

    const hash = await hashPassword(password);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>("SELECT id, reset_expires FROM customers WHERE id = ? AND reset_token = ? LIMIT 1 FOR UPDATE", [candidates[0].id, tokenHash]);
      const expiry = rows[0]?.reset_expires ? new Date(rows[0].reset_expires).getTime() : NaN;
      if (rows.length === 0 || !Number.isFinite(expiry) || expiry <= Date.now()) {
        await connection.rollback();
        return error("Invalid or expired reset token.");
      }
      // Like PHP, a valid mailbox reset also confirms an unverified email.
      // Keep it in this transaction so a later failure rolls back all state.
      await connection.execute(
        "UPDATE customers SET password_hash = ?, reset_token = NULL, reset_expires = NULL, is_temp_pass = 0, email_verified = CASE WHEN email_verified = 0 THEN 1 ELSE email_verified END WHERE id = ?",
        [hash, rows[0].id]
      );
      await connection.execute("DELETE FROM sessions WHERE customer_id = ? AND role = 'customer'", [rows[0].id]);
      await connection.commit();
    } catch (e) { await connection.rollback(); throw e; }
    finally { connection.release(); }

    return success({ message: "Password has been reset successfully." });
  } catch (e) {
    console.error("Reset error:", e);
    return error("Password reset failed.", 500);
  }
}

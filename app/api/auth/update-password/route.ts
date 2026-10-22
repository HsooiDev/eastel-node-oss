import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { updatePasswordSchema, validate } from "@/lib/validation";
import { requireSession, success, error, getClientIp } from "../_helpers";
import { verifyTurnstile } from "@/lib/turnstile";
import { SITE_URL } from "@/lib/site";
import { clearSessionCookie } from "@/lib/cookies";
import type { ResultSetHeader } from "mysql2/promise";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();

    const parsed = validate(updatePasswordSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { currentPassword, newPassword } = parsed.data;

    if (!(await verifyTurnstile(body.turnstileToken, getClientIp(request), {
      hostname: new URL(SITE_URL).hostname,
      action: "update_password",
    }))) return error("Security check failed.");

    const [rows] = await db.query("SELECT password_hash FROM customers WHERE id = ?", [session.customerId]);
    if (rows.length === 0) return error("Customer not found.");

    const valid = await verifyPassword(currentPassword, rows[0].password_hash);
    if (!valid) return error("Current password is incorrect.");

    const hash = await hashPassword(newPassword);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        "UPDATE customers SET password_hash = ?, is_temp_pass = 0 WHERE id = ? AND password_hash = ?",
        [hash, session.customerId, rows[0].password_hash]
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return error("Credentials changed. Please sign in again.", 409);
      }
      await connection.execute("DELETE FROM sessions WHERE customer_id = ? AND role = 'customer'", [session.customerId]);
      await connection.commit();
    } catch (e) { await connection.rollback(); throw e; }
    finally { connection.release(); }
    await clearSessionCookie();

    return success({ message: "Password updated successfully.", reauthenticate: true });
  } catch (e) {
    console.error("Update password error:", e);
    return error("Password update failed.", 500);
  }
}

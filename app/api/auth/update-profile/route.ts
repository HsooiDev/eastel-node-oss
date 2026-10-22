import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { updateProfileSchema, validate } from "@/lib/validation";
import { requireSession, success, error, getClientIp } from "../_helpers";
import { verifyTurnstile } from "@/lib/turnstile";
import { SITE_URL } from "@/lib/site";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();

    const parsed = validate(updateProfileSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { name, phone, address, postcode, state } = parsed.data;

    if (!(await verifyTurnstile(body.turnstileToken, getClientIp(request), {
      hostname: new URL(SITE_URL).hostname,
      action: "update_profile",
    }))) return error("Security check failed.");

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "UPDATE customers SET name = ?, phone = ?, address = ?, postcode = ?, state = ? WHERE id = ?",
        [name, phone || null, address || null, postcode || null, state || null, session.customerId]
      );
      try {
        // PHP resubmits public names for moderation on every profile save.
        // Count complete Unicode characters within the existing 40-char column.
        await connection.execute(
          "UPDATE reviews SET display_name = ?, status = 'pending' WHERE customer_id = ? AND display_mode = 'public'",
          [Array.from(name).slice(0, 40).join(""), session.customerId]
        );
      } catch (cause) {
        // Older PHP databases can predate reviews. Other failures must roll
        // back the profile too, so an unmoderated display name is never saved.
        if (!(cause && typeof cause === "object" && "code" in cause && cause.code === "ER_NO_SUCH_TABLE")) throw cause;
      }
      await connection.commit();
    } catch (cause) {
      await connection.rollback();
      throw cause;
    } finally { connection.release(); }

    return success({ message: "Profile updated." });
  } catch (e) {
    console.error("Update profile error:", e);
    return error("Profile update failed.", 500);
  }
}

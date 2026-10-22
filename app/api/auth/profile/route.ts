import db from "@/lib/db";
import { requireSession, success, error } from "../_helpers";

export async function GET() {
  try {
    const session = await requireSession();
    if (!session) return error("Not authenticated.", 401);

    const [rows] = await db.query(
      "SELECT id, name, email, phone, address, postcode, state, is_temp_pass FROM customers WHERE id = ?",
      [session.customerId]
    );
    if (rows.length === 0) return error("Customer not found.");

    return success({ customer: rows[0] });
  } catch (e) {
    console.error("Profile error:", e);
    return error("Failed to load profile.", 500);
  }
}

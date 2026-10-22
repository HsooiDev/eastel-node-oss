import { NextRequest } from "next/server";
import { requireAdmin, success, error } from "../../_helpers";
import db from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { formatDate } from "@/lib/db-helpers";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const today = formatDate().split(" ")[0]; // YYYY-MM-DD

    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT `ai_model`, `count` FROM `ai_daily_usage` WHERE `date` = ?",
      [today]
    );

    const stats: Record<string, number> = {};
    for (const row of rows) {
      stats[row.ai_model] = row.count;
    }

    return success({ stats });
  } catch (e) {
    console.error("Marketing AI stats GET error:", e);
    return error("Failed to load stats.", 500);
  }
}

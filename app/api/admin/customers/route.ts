import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { safeInt, paginate } from "@/lib/db-helpers";
import { requireAdmin, success, error } from "../_helpers";
import type { RowDataPacket } from "mysql2/promise";

// ── GET: List customers with order count ────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const all = url.searchParams.get("all") === "1";
    const page = url.searchParams.get("page") ?? "1";
    const perPage = url.searchParams.get("perPage") ?? "20";
    const search = url.searchParams.get("search");

    let whereClause = "";
    const params: unknown[] = [];

    if (search && search.trim().length > 0) {
      whereClause =
        "WHERE c.`name` LIKE ? OR c.`email` LIKE ? OR c.`phone` LIKE ?";
      const like = `%${search.trim()}%`;
      params.push(like, like, like);
    }

    if (all) {
      const [customers] = await db.query<RowDataPacket[]>(
        `SELECT
           c.\`id\`, c.\`name\`, c.\`email\`, c.\`phone\`,
           c.\`is_temp_pass\`, c.\`created_at\`,
           COUNT(o.\`id\`) AS order_count
         FROM \`customers\` c
         LEFT JOIN \`orders\` o ON o.\`customer_id\` = c.\`id\`
         ${whereClause}
         GROUP BY c.\`id\`
         ORDER BY c.\`created_at\` DESC`,
        params
      );
      return success({ customers });
    }

    const { limit, offset } = paginate(page, perPage);

    // Count total
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM \`customers\` c ${whereClause}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    // Fetch customers with order count
    const [customers] = await db.query<RowDataPacket[]>(
      `SELECT
         c.\`id\`, c.\`name\`, c.\`email\`, c.\`phone\`,
         c.\`is_temp_pass\`, c.\`address\`, c.\`postcode\`, c.\`state\`,
         c.\`created_at\`,
         COUNT(o.\`id\`) AS order_count
       FROM \`customers\` c
       LEFT JOIN \`orders\` o ON o.\`customer_id\` = c.\`id\`
       ${whereClause}
       GROUP BY c.\`id\`
       ORDER BY c.\`created_at\` DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return success({
      customers,
      pagination: {
        total,
        page: safeInt(page, 1, 1),
        perPage: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("Admin customers GET error:", e);
    return error("Failed to load customers.", 500);
  }
}

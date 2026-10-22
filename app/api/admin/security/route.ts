import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { safeInt, paginate } from "@/lib/db-helpers";
import { requireAdmin, success, error } from "../_helpers";
import type { RowDataPacket } from "mysql2/promise";

// ── GET: List login attempts ────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const page = url.searchParams.get("page") ?? "1";
    const perPage = url.searchParams.get("perPage") ?? "50";
    const search = url.searchParams.get("search");
    const ipFilter = url.searchParams.get("ip")?.trim() ?? "";
    const attemptType = url.searchParams.get("attempt_type")?.trim() ?? "";

    // ── action=audit → admin action audit trail ──────────────
    if (url.searchParams.get("action") === "audit") {
      const { limit, offset } = paginate(page, perPage);
      const [countRows] = await db.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM `admin_audit_log`"
      );
      const total = countRows[0]?.total ?? 0;
      const [entries] = await db.query<RowDataPacket[]>(
        `SELECT a.id, a.admin_id, a.action, a.target_table, a.target_id,
                a.new_value, a.ip_address, a.created_at,
                u.name AS admin_name
         FROM \`admin_audit_log\` a
         LEFT JOIN \`admin_users\` u ON u.id = a.admin_id
         ORDER BY a.id DESC
         LIMIT ${limit} OFFSET ${offset}`
      );
      return success({
        entries,
        pagination: {
          total,
          page: safeInt(page, 1, 1),
          perPage: limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    }

    const { limit, offset } = paginate(page, perPage);

    if (attemptType && !["WRONG_PASSWORD", "CUSTOMER_WRONG_PASSWORD", "HONEYPOT", "LOCKED_OUT", "SUCCESS"].includes(attemptType)) {
      return error("Invalid attempt type filter.", 400);
    }
    if (ipFilter.length > 100) return error("IP filter must not exceed 100 characters.", 400);
    if ((search?.trim().length ?? 0) > 200) return error("Search must not exceed 200 characters.", 400);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (ipFilter) {
      conditions.push("`ip_address` LIKE ? ESCAPE '!'");
      params.push(`%${ipFilter.replace(/[!%_]/g, "!$&")}%`);
    } else if (search && search.trim().length > 0) {
      conditions.push("(`ip_address` LIKE ? ESCAPE '!' OR `email` LIKE ? ESCAPE '!')");
      const literal = search.trim().replace(/[!%_]/g, "!$&");
      const like = `%${literal}%`;
      params.push(like, like);
    }

    if (attemptType) {
      conditions.push("`attempt_type` = ?");
      params.push(attemptType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM \`login_attempts\` ${whereClause}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    // Fetch login attempts
    const [attempts] = await db.query<RowDataPacket[]>(
      `SELECT \`id\`, \`ip_address\`, \`email\`, \`attempt_type\`, \`attempted_at\` FROM \`login_attempts\` ${whereClause}
       ORDER BY \`attempted_at\` DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return success({
      attempts,
      pagination: {
        total,
        page: safeInt(page, 1, 1),
        perPage: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("Admin security GET error:", e);
    return error("Failed to load login attempts.", 500);
  }
}

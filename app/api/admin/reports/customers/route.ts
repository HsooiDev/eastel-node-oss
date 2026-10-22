import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { requireAdmin, success, error } from "../../_helpers";
import { parseAdminReportDateRange, reportDateWhere } from "@/lib/admin-report-filters";
import type { RowDataPacket } from "mysql2/promise";

// ── Types ────────────────────────────────────────────────────

interface TopCustomerRow extends RowDataPacket {
  customer_id: number;
  name: string;
  email: string;
  order_count: number;
  total_spent: string;
  last_order_at: string;
}

interface NewCustomerRow extends RowDataPacket {
  period_label: string;
  new_count: number;
}

// ── GET: Customer reports ────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const parsedRange = parseAdminReportDateRange(url.searchParams);
    if (!parsedRange.ok) return error(parsedRange.message, 400);
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

    // Top customers by spend
    const topDate = reportDateWhere("o.`created_at`", parsedRange.range);
    const topConditions: string[] = ["o.`payment_status` = 'paid'", ...topDate.conditions];
    const topParams: unknown[] = topDate.params;

    const topWhere = `WHERE ${topConditions.join(" AND ")}`;

    const [topCustomers] = await db.query<TopCustomerRow[]>(
      `SELECT
         c.\`id\` AS customer_id,
         c.\`name\`,
         c.\`email\`,
         COUNT(o.\`id\`) AS order_count,
         COALESCE(SUM(o.\`total_amount\`), 0) AS total_spent,
         MAX(o.\`created_at\`) AS last_order_at
       FROM \`customers\` c
       JOIN \`orders\` o ON o.\`customer_id\` = c.\`id\`
       ${topWhere}
       GROUP BY c.\`id\`, c.\`name\`, c.\`email\`
       ORDER BY total_spent DESC
       LIMIT ${limit}`,
      topParams
    );

    // New customers over time (last 12 months)
    const newDate = reportDateWhere("`created_at`", parsedRange.range);
    const newConditions: string[] = [...newDate.conditions];
    const newParams: unknown[] = newDate.params;

    const newWhere = newConditions.length > 0 ? `WHERE ${newConditions.join(" AND ")}` : "";

    const [newCustomers] = await db.query<NewCustomerRow[]>(
      `SELECT
         DATE_FORMAT(\`created_at\`, '%Y-%m') AS period_label,
         COUNT(*) AS new_count
       FROM \`customers\`
       ${newWhere}
       GROUP BY DATE_FORMAT(\`created_at\`, '%Y-%m')
       ORDER BY period_label ASC`,
      newParams
    );

    // Total customer count
    const customerDate = reportDateWhere("`created_at`", parsedRange.range);
    const customerWhere = customerDate.conditions.length ? `WHERE ${customerDate.conditions.join(" AND ")}` : "";
    const [totalRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM \`customers\` ${customerWhere}`,
      customerDate.params
    );
    const totalCustomers = totalRows[0]?.total ?? 0;

    return success({ topCustomers, newCustomers, totalCustomers });
  } catch (e) {
    console.error("Admin reports customers GET error:", e);
    return error("Failed to load customer reports.", 500);
  }
}

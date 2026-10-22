import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { requireAdmin, success, error } from "../../_helpers";
import { parseAdminReportDateRange, reportDateWhere } from "@/lib/admin-report-filters";
import type { RowDataPacket } from "mysql2/promise";

// ── Types ────────────────────────────────────────────────────

interface BestSellerRow extends RowDataPacket {
  product_id: number | null;
  product_name: string;
  price: string;
  total_qty_sold: number;
  total_revenue: string;
  order_count: number;
}

interface StockLevelRow extends RowDataPacket {
  id: number;
  name: string;
  price: string;
  stock_quantity: number;
  is_active: number;
}

interface RevenuePerProductRow extends RowDataPacket {
  product_id: number | null;
  product_name: string;
  total_revenue: string;
  total_qty: number;
  avg_unit_price: string;
}

// ── GET: Product reports ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const parsedRange = parseAdminReportDateRange(url.searchParams);
    if (!parsedRange.ok) return error(parsedRange.message, 400);

    // Best sellers (by quantity sold)
    const salesDate = reportDateWhere("o.`created_at`", parsedRange.range);
    const salesConditions: string[] = ["o.`payment_status` = 'paid'", ...salesDate.conditions];
    const salesParams: unknown[] = salesDate.params;

    const salesWhere = `WHERE ${salesConditions.join(" AND ")}`;

    const [bestSellers] = await db.query<BestSellerRow[]>(
      `SELECT NULL AS product_id, 'Eastel SIM (single-SIM order)' AS product_name,
         COALESCE(AVG(o.sim_fee), 0) AS price, COUNT(*) AS total_qty_sold,
         COALESCE(SUM(o.sim_fee), 0) AS total_revenue, COUNT(*) AS order_count
       FROM orders o ${salesWhere} HAVING COUNT(*) > 0`, salesParams
    );

    // Stock levels (column is `stock`; -1 = unlimited, sorted last)
    const [stockLevels] = await db.query<StockLevelRow[]>(
      `SELECT
         \`id\`,
         \`name\`,
         \`price\`,
         \`stock\` AS stock_quantity,
         \`is_active\`
       FROM \`products\`
       ORDER BY (\`stock\` = -1) ASC, \`stock\` ASC`
    );

    // Revenue per product
    const [revenuePerProduct] = await db.query<RevenuePerProductRow[]>(
      `SELECT NULL AS product_id, 'Eastel SIM (single-SIM order)' AS product_name,
         COALESCE(SUM(o.sim_fee), 0) AS total_revenue, COUNT(*) AS total_qty,
         COALESCE(AVG(o.sim_fee), 0) AS avg_unit_price
       FROM orders o ${salesWhere} HAVING COUNT(*) > 0`, salesParams
    );

    // Product count summary (`stock` = -1 means unlimited — never out of stock)
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN \`is_active\` = 1 THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN \`stock\` = 0 THEN 1 ELSE 0 END) AS out_of_stock,
         SUM(CASE WHEN \`stock\` > 0 AND \`stock\` <= 10 THEN 1 ELSE 0 END) AS low_stock
       FROM \`products\``
    );
    const productSummary = countRows[0] ?? {
      total: 0,
      active: 0,
      out_of_stock: 0,
      low_stock: 0,
    };

    return success({ bestSellers, stockLevels, revenuePerProduct, productSummary });
  } catch (e) {
    console.error("Admin reports products GET error:", e);
    return error("Failed to load product reports.", 500);
  }
}

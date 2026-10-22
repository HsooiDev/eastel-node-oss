import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { requireAdmin, success, error } from "../_helpers";
import { parseAdminReportDateRange, reportDateWhere } from "@/lib/admin-report-filters";
import type { RowDataPacket } from "mysql2/promise";

// ── Types ────────────────────────────────────────────────────

interface SummaryRow extends RowDataPacket {
  total_orders: number;
  total_revenue: string;
  avg_order_value: string;
}

interface RevenueRow extends RowDataPacket {
  period_label: string;
  order_count: number;
  revenue: string;
}

interface TopProductRow extends RowDataPacket {
  product_id: number | null;
  product_name: string;
  total_qty: number;
  total_revenue: string;
}

function csvText(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvNumber(value: unknown, money = false): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return money ? amount.toFixed(2) : String(amount);
}

function reportCsvResponse(view: string, rows: string[][], dateLabel: string) {
  const csv = rows.map(row => row.join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="eastel-report-${view}-${dateLabel}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// ── GET: Revenue reports with date filtering ─────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "daily";
    const parsedRange = parseAdminReportDateRange(url.searchParams);
    if (!parsedRange.ok) return error(parsedRange.message, 400);
    const view = url.searchParams.get("view");
    if (view) {
      const { conditions, params } = reportDateWhere("o.`created_at`", parsedRange.range);
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const dateLabel = new Date().toISOString().slice(0, 10);

      if (url.searchParams.get("format") === "csv" && (view === "orders" || view === "overview")) {
        const [orders] = await db.query<RowDataPacket[]>(
          `SELECT o.order_ref, DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i') AS export_date,
                  o.full_name, o.email, o.phone, o.zone,
                  o.courier_name, o.sim_fee, o.delivery_fee, o.total_amount,
                  o.payment_status, o.order_status
           FROM orders o ${whereClause}
           ORDER BY o.created_at DESC, o.id DESC`,
          params
        );
        const rows = [[
          "Order Ref", "Date", "Name", "Email", "Phone", "Zone", "Courier",
          "SIM Fee", "Delivery Fee", "Total", "Payment", "Status",
        ].map(csvText)];
        for (const order of orders) rows.push([
          csvText(order.order_ref), csvText(order.export_date),
          csvText(order.full_name), csvText(order.email), csvText(order.phone),
          csvText(order.zone), csvText(order.courier_name), csvNumber(order.sim_fee, true),
          csvNumber(order.delivery_fee, true), csvNumber(order.total_amount, true),
          csvText(order.payment_status), csvText(order.order_status),
        ]);
        return reportCsvResponse(view, rows, dateLabel);
      }

      if (url.searchParams.get("format") === "csv" && view === "reviews") {
        const reviewDates = reportDateWhere("r.created_at", parsedRange.range);
        const reviewWhere = reviewDates.conditions.length ? `WHERE ${reviewDates.conditions.join(" AND ")}` : "";
        const [reviews] = await db.query<RowDataPacket[]>(
          `SELECT DATE_FORMAT(r.created_at, '%Y-%m-%d') AS export_date,
                  o.order_ref, r.rating, r.status, r.review_text,
                  r.display_mode, r.display_name, c.name AS customer_name
           FROM reviews r
           LEFT JOIN orders o ON o.id = r.order_id
           LEFT JOIN customers c ON c.id = r.customer_id
           ${reviewWhere}
           ORDER BY r.created_at DESC, r.id DESC`,
          reviewDates.params
        );
        const rows = [["Date", "Order Ref", "Customer", "Rating", "Status", "Review"].map(csvText)];
        for (const review of reviews) rows.push([
          csvText(review.export_date), csvText(review.order_ref),
          csvText(review.display_mode === "private" ? "Anonymous" : review.display_name || review.customer_name || ""),
          csvNumber(review.rating), csvText(review.status), csvText(review.review_text),
        ]);
        return reportCsvResponse(view, rows, dateLabel);
      }

      switch (view) {
        case "overview": {
          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS total_orders,
                    SUM(CASE WHEN o.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
                    SUM(CASE WHEN o.order_status = 'shipped' THEN 1 ELSE 0 END) AS shipped_orders,
                    SUM(CASE WHEN o.order_status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
                    SUM(CASE WHEN o.order_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
                    COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0) AS total_revenue
             FROM orders o ${whereClause}`,
            params
          );
          const [statusRows] = await db.query<RowDataPacket[]>(
            `SELECT o.order_status, COUNT(*) AS count FROM orders o ${whereClause}
             GROUP BY o.order_status ORDER BY o.order_status`, params
          );
          return success({ summary: rows[0] ?? {}, statuses: statusRows });
        }
        case "orders": {
          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS period_label,
                    COUNT(*) AS total_orders,
                    SUM(CASE WHEN o.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
                    COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0) AS revenue,
                    COALESCE(AVG(CASE WHEN o.payment_status = 'paid' THEN o.total_amount END), 0) AS avg_paid_order
             FROM orders o ${whereClause}
             GROUP BY DATE_FORMAT(o.created_at, '%Y-%m') ORDER BY period_label ASC`, params
          );
          return success({ ordersByMonth: rows });
        }
        case "revenue": {
          const paidWhere = conditions.length
            ? `WHERE o.payment_status = 'paid' AND ${conditions.join(" AND ")}`
            : "WHERE o.payment_status = 'paid'";
          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS paid_orders,
                    COALESCE(SUM(o.total_amount), 0) AS total_revenue,
                    COALESCE(AVG(o.total_amount), 0) AS avg_paid_order,
                    COALESCE(SUM(o.sim_fee), 0) AS sim_fee_revenue,
                    COALESCE(SUM(o.delivery_fee), 0) AS delivery_fee_revenue
             FROM orders o ${paidWhere}`, params
          );
          const [monthly] = await db.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS period_label,
                    COUNT(*) AS paid_orders,
                    COALESCE(SUM(o.total_amount), 0) AS revenue,
                    COALESCE(SUM(o.sim_fee), 0) AS sim_fee_revenue,
                    COALESCE(SUM(o.delivery_fee), 0) AS delivery_fee_revenue
             FROM orders o ${paidWhere}
             GROUP BY DATE_FORMAT(o.created_at, '%Y-%m') ORDER BY period_label ASC`, params
          );
          return success({ summary: rows[0] ?? {}, monthlyRevenue: monthly });
        }
        case "couriers":
        case "zones": {
          const group = view === "couriers"
            ? "COALESCE(NULLIF(TRIM(o.courier_name), ''), 'Unknown')"
            : "COALESCE(NULLIF(TRIM(o.zone), ''), 'Unknown')";
          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT ${group} AS label, COUNT(*) AS total_orders,
                    SUM(CASE WHEN o.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
                    COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0) AS paid_revenue,
                    COALESCE(AVG(o.delivery_fee), 0) AS avg_delivery_fee
             FROM orders o ${whereClause}
             GROUP BY ${group} ORDER BY total_orders DESC, label ASC`, params
          );
          return success({ rows });
        }
        case "reviews": {
          const reviewDates = reportDateWhere("r.created_at", parsedRange.range);
          const reviewWhere = reviewDates.conditions.length ? `WHERE ${reviewDates.conditions.join(" AND ")}` : "";
          const [summaryRows] = await db.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS total_reviews,
                    SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) AS approved_reviews,
                    SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) AS pending_reviews,
                    SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_reviews,
                    COALESCE(AVG(CASE WHEN r.status = 'approved' THEN r.rating END), 0) AS approved_average_rating
             FROM reviews r ${reviewWhere}`, reviewDates.params
          );
          const [ratingRows] = await db.query<RowDataPacket[]>(
            `SELECT r.rating, COUNT(*) AS count FROM reviews r
             ${reviewWhere}${reviewWhere ? " AND" : " WHERE"} r.status = 'approved'
             GROUP BY r.rating ORDER BY r.rating DESC`, reviewDates.params
          );
          const [recentReviews] = await db.query<RowDataPacket[]>(
            `SELECT r.created_at, o.order_ref, r.rating, r.review_text AS comment,
                    r.display_mode, r.display_name, c.name AS customer_name
             FROM reviews r
             LEFT JOIN orders o ON o.id = r.order_id
             LEFT JOIN customers c ON c.id = r.customer_id
             ${reviewWhere}${reviewWhere ? " AND" : " WHERE"} r.status = 'approved'
             ORDER BY r.created_at DESC, r.id DESC LIMIT 20`, reviewDates.params
          );
          return success({ summary: summaryRows[0] ?? {}, ratingDistribution: ratingRows, recentReviews });
        }
        default:
          return error("Invalid report view.", 400);
      }
    }

    // Build date filter
    const dateConditions: string[] = ["`payment_status` = 'paid'", ...reportDateWhere("`created_at`", parsedRange.range).conditions];
    const dateParams: unknown[] = reportDateWhere("`created_at`", parsedRange.range).params;

    const whereClause = `WHERE ${dateConditions.join(" AND ")}`;

    // Summary
    const [summaryRows] = await db.query<SummaryRow[]>(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(\`total_amount\`), 0) AS total_revenue,
         COALESCE(AVG(\`total_amount\`), 0) AS avg_order_value
       FROM \`orders\`
       ${whereClause}`,
      dateParams
    );
    const summary = summaryRows[0] ?? {
      total_orders: 0,
      total_revenue: "0",
      avg_order_value: "0",
    };

    // Revenue by period
    let groupExpr: string;
    switch (type) {
      case "weekly":
        groupExpr = "CONCAT(YEARWEEK(`created_at`, 1))";
        break;
      case "monthly":
        groupExpr = "DATE_FORMAT(`created_at`, '%Y-%m')";
        break;
      default: // daily
        groupExpr = "DATE(`created_at`)";
        break;
    }

    const revenueConditions = [...dateConditions];
    const revenueParams = [...dateParams];

    const revenueWhere = `WHERE ${revenueConditions.join(" AND ")}`;

    const [revenue] = await db.query<RevenueRow[]>(
      `SELECT
         ${groupExpr} AS period_label,
         COUNT(*) AS order_count,
         COALESCE(SUM(\`total_amount\`), 0) AS revenue
       FROM \`orders\`
       ${revenueWhere}
       GROUP BY ${groupExpr}
       ORDER BY period_label ASC`,
      revenueParams
    );

    // PHP stores one SIM per order, without a product foreign key. Use stored
    // amounts; never attribute historical sales to today's active product.
    const [topProducts] = await db.query<TopProductRow[]>(
      `SELECT NULL AS product_id, 'Eastel SIM (single-SIM order)' AS product_name,
         COUNT(*) AS total_qty, COALESCE(SUM(sim_fee), 0) AS total_revenue
       FROM orders ${whereClause} HAVING COUNT(*) > 0`, dateParams
    );

    return success({ summary, revenue, topProducts, type });
  } catch (e) {
    console.error("Admin reports GET error:", e);
    return error("Failed to load reports.", 500);
  }
}

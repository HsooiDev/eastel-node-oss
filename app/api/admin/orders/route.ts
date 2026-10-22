import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { safeInt, paginate, formatDate } from "@/lib/db-helpers";
import { buildAdminOrderWhere, parseAdminOrderFilters } from "@/lib/admin-order-filters";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import { adminOrderUpdateSchema, validate } from "@/lib/validation";
import { sendShippingNotification, sendOrderStatusChanged } from "@/lib/email";
import { getOrderPlanSnapshot } from "@/lib/order-plan";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

function csvCell(value: unknown, userText = false): string {
  let text = value == null ? "" : String(value);
  if (userText && (/^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r]/.test(text))) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvAmount(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "";
}

function hasPlanRecord(order: RowDataPacket): boolean {
  return Number(order.plan_fee) > 0 || (order.plan_snapshot != null && order.plan_snapshot !== "");
}

function ordersCsv(orders: RowDataPacket[]): string {
  const columns: { label: string; get: (order: RowDataPacket) => unknown; text?: boolean; amount?: boolean }[] = [
    { label: "Order Ref", get: order => order.order_ref, text: true },
    { label: "Date", get: order => order.export_created_at, text: true },
    { label: "Name", get: order => order.full_name, text: true },
    { label: "Email", get: order => order.email, text: true },
    { label: "Phone", get: order => order.phone, text: true },
    { label: "Address", get: order => order.delivery_address, text: true },
    { label: "Postcode", get: order => order.postcode, text: true },
    { label: "Zone", get: order => order.zone, text: true },
    { label: "Payment", get: order => order.payment_status, text: true },
    { label: "Status", get: order => order.order_status, text: true },
    { label: "SIM Fee", get: order => order.sim_fee, amount: true },
    { label: "Purchased Plan", get: order => getOrderPlanSnapshot(order.plan_snapshot)?.plan.name ?? (hasPlanRecord(order) ? "Saved plan details unavailable" : "SIM only"), text: true },
    { label: "Plan ID", get: order => getOrderPlanSnapshot(order.plan_snapshot)?.plan.id, text: true },
    { label: "Plan Fee", get: order => order.plan_fee, amount: true },
    { label: "Plan Data GB", get: order => getOrderPlanSnapshot(order.plan_snapshot)?.plan.dataGB },
    { label: "Plan Hotspot GB", get: order => getOrderPlanSnapshot(order.plan_snapshot)?.plan.hotspotGB },
    { label: "Plan Hotspot Mode", get: order => getOrderPlanSnapshot(order.plan_snapshot)?.plan.hotspotMode, text: true },
    { label: "Plan Roaming GB", get: order => getOrderPlanSnapshot(order.plan_snapshot)?.plan.roamingGB },
    { label: "Plan Validity Days", get: order => getOrderPlanSnapshot(order.plan_snapshot)?.plan.validityDays },
    { label: "Plan Fulfillment", get: order => getOrderPlanSnapshot(order.plan_snapshot) ? (order.plan_fulfilled_at ? "Activated" : "Awaiting activation") : hasPlanRecord(order) ? "Check saved plan details" : "Not applicable", text: true },
    { label: "Plan Activated At", get: order => order.export_plan_fulfilled_at, text: true },
    { label: "Plan Activated By", get: order => order.plan_fulfilled_by },
    { label: "Delivery Fee", get: order => order.delivery_fee, amount: true },
    { label: "Voucher Code", get: order => order.voucher_code, text: true },
    { label: "Voucher Discount", get: order => order.voucher_discount, amount: true },
    { label: "Total", get: order => order.total_amount, amount: true },
    { label: "Courier", get: order => order.courier_name, text: true },
    { label: "Tracking", get: order => order.tracking_number, text: true },
  ];
  const header = columns.map(column => csvCell(column.label)).join(",");
  const rows = orders.map(order => columns.map(column => {
    const value = column.get(order);
    return column.amount ? csvAmount(value) : csvCell(value, column.text);
  }).join(","));
  return [header, ...rows].join("\r\n");
}

// ── GET: List all orders with customer info ─────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const parsedFilters = parseAdminOrderFilters(url.searchParams);
    if (!parsedFilters.ok) return error(parsedFilters.message, 400);
    const { whereClause, params } = buildAdminOrderWhere(parsedFilters.filters);

    // Auto-correct: failed-payment orders should not stay pending/processing
    await db.execute(
      `UPDATE \`orders\` SET \`order_status\` = 'cancelled', \`updated_at\` = ?
       WHERE \`payment_status\` = 'failed'
       AND \`order_status\` IN ('pending', 'processing')`,
      [formatDate()]
    );

    const page = url.searchParams.get("page") ?? "1";
    const perPage = url.searchParams.get("perPage") ?? "20";
    const { limit, offset } = paginate(page, perPage);

    // Count total — LEFT JOIN so WA orders (no customer_id) are included
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM \`orders\` o
       LEFT JOIN \`customers\` c ON c.\`id\` = o.\`customer_id\`
       ${whereClause}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    const today = new Date().toISOString().slice(0, 10);
    const [summaryRows] = await db.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_orders,
         COALESCE(SUM(CASE WHEN o.payment_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_payment,
         COALESCE(SUM(CASE WHEN o.order_status = 'shipped' THEN 1 ELSE 0 END), 0) AS shipped_orders,
         COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0) AS paid_revenue,
         COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND DATE(o.created_at) = ? THEN o.total_amount ELSE 0 END), 0) AS today_revenue
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       ${whereClause}`,
      [today, ...params]
    );
    const rawSummary = summaryRows[0] ?? {};
    const summary = {
      total_orders: Number(rawSummary.total_orders ?? 0),
      paid_orders: Number(rawSummary.paid_orders ?? 0),
      pending_payment: Number(rawSummary.pending_payment ?? 0),
      shipped_orders: Number(rawSummary.shipped_orders ?? 0),
      paid_revenue: String(rawSummary.paid_revenue ?? "0"),
      today_revenue: String(rawSummary.today_revenue ?? "0"),
    };

    if (url.searchParams.get("format") === "csv") {
      const [exportOrders] = await db.query<RowDataPacket[]>(
        `SELECT o.order_ref, DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i') AS export_created_at,
                o.full_name, o.email, o.phone,
                o.delivery_address, o.postcode, o.zone, o.payment_status, o.order_status,
                o.sim_fee, o.plan_fee, o.plan_snapshot, o.plan_fulfilled_by,
                DATE_FORMAT(o.plan_fulfilled_at, '%Y-%m-%d %H:%i') AS export_plan_fulfilled_at,
                o.plan_fulfilled_at, o.delivery_fee, o.voucher_code, o.voucher_discount,
                o.total_amount, o.courier_name, o.tracking_number
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         ${whereClause}
         ORDER BY o.created_at DESC, o.id DESC`,
        params
      );
      const todayLabel = new Date().toISOString().slice(0, 10);
      return new Response(ordersCsv(exportOrders), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="eastel-orders-${todayLabel}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Fetch orders
    const [orders] = await db.query<RowDataPacket[]>(
      `SELECT
         o.\`id\`, o.\`order_ref\`,
         o.\`full_name\`, o.\`email\`, o.\`phone\`,
         o.\`delivery_address\`, o.\`postcode\`, o.\`zone\`,
         1 AS quantity, o.\`sim_fee\` AS unit_price, o.\`delivery_fee\`, o.\`sim_fee\`, o.\`total_amount\`,
         o.\`plan_fee\`, o.\`plan_snapshot\`, o.\`plan_fulfilled_at\`, o.\`plan_fulfilled_by\`,
         o.\`voucher_code\`, o.\`voucher_discount\`,
         o.\`payment_status\`, o.\`order_status\`,
         o.\`tracking_number\`, o.\`bill_code\`, o.\`toyyibpay_ref\`,
         o.\`courier_name\`, o.\`lang\`, o.\`source\`,
         o.\`created_at\`, o.\`updated_at\`,
         c.\`name\`  AS customer_name,
         c.\`email\` AS customer_email,
         c.\`phone\` AS customer_phone
       FROM \`orders\` o
       LEFT JOIN \`customers\` c ON c.\`id\` = o.\`customer_id\`
       ${whereClause}
       ORDER BY o.\`created_at\` DESC, o.\`id\` DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const response = success({
      orders,
      summary,
      pagination: {
        total,
        page: safeInt(page, 1, 1),
        perPage: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    console.error("Admin orders GET error:", e);
    return error("Failed to load orders.", 500);
  }
}

// ── POST: Update order status and/or tracking ───────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();

    const parsed = validate(adminOrderUpdateSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { orderId, orderStatus, trackingNumber, courierName } = parsed.data;

    // Build update fields dynamically
    const fields: string[] = [];
    const values: unknown[] = [];

    if (orderStatus) {
      fields.push("`order_status` = ?");
      values.push(orderStatus);
    }

    if (trackingNumber !== undefined) {
      fields.push("`tracking_number` = ?");
      values.push(trackingNumber || null);
    }

    // Match the PHP operation: blank means keep the current courier value.
    if (courierName !== undefined && courierName.trim().length > 0) {
      fields.push("`courier_name` = ?");
      values.push(courierName.trim());
    }

    if (fields.length === 0) return error("No fields to update.");


    const [beforeRows] = await db.query<RowDataPacket[]>(
      "SELECT order_status, tracking_number, courier_name FROM orders WHERE id = ? LIMIT 1",
      [orderId]
    );
    const before = beforeRows[0];
    if (!before) return error("Order not found.");

    const nextStatus = orderStatus ?? before.order_status;
    const nextTracking = trackingNumber !== undefined ? trackingNumber || null : before.tracking_number;
    const nextCourier = courierName?.trim() ? courierName.trim() : before.courier_name;
    const statusChanged = nextStatus !== before.order_status;
    const trackingChanged = nextTracking !== before.tracking_number;
    const courierChanged = nextCourier !== before.courier_name;
    if (!statusChanged && !trackingChanged && !courierChanged) {
      return success({ message: "Order updated successfully." });
    }

    fields.push("`updated_at` = ?");
    values.push(formatDate());
    values.push(orderId, before.order_status ?? null, before.tracking_number ?? null, before.courier_name ?? null);

    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE \`orders\` SET ${fields.join(", ")} WHERE \`id\` = ? AND CAST(order_status AS BINARY) <=> CAST(? AS BINARY) AND CAST(tracking_number AS BINARY) <=> CAST(? AS BINARY) AND CAST(courier_name AS BINARY) <=> CAST(? AS BINARY)`,
      values
    );

    if (result.affectedRows === 0) {
      return error("Order changed during the update. Refresh and try again.", 409);
    }

    {
      const { logAdminAction } = await import("@/lib/audit");
      void logAdminAction(
        session.customerId,
        "update_order",
        "orders",
        orderId,
        null,
        JSON.stringify({ status: orderStatus ?? null, tracking: trackingNumber ?? null, courier: courierName ?? null })
      );
    }

    // Only the winning real edit starts best-effort notifications.
    const shippingChanged = nextStatus === "shipped" && (statusChanged || trackingChanged || courierChanged);
    if (statusChanged || shippingChanged) {
      try {
        const [orderRows] = await db.query<RowDataPacket[]>(
          `SELECT o.order_ref, o.tracking_number, o.full_name, o.email, o.phone, o.source, o.lang,
                  COALESCE(NULLIF(TRIM(o.courier_name), ''), cr.name) AS courier_name
           FROM orders o
           LEFT JOIN couriers cr ON cr.id = o.courier_id
           WHERE o.id = ? LIMIT 1`,
          [orderId]
        )
        if (orderRows.length > 0) {
          const o = orderRows[0]
          if (o.email && (statusChanged || (shippingChanged && o.tracking_number))) {
            const locale = String(o.lang || "en");
            const sent = nextStatus === "shipped" && o.tracking_number
              ? await sendShippingNotification(o.email, {
                  orderRef: o.order_ref,
                  customerName: o.full_name,
                  trackingNumber: o.tracking_number,
                  courierName: o.courier_name ?? "Courier",
                }, locale)
              : await sendOrderStatusChanged(o.email, {
                  orderRef: o.order_ref,
                  customerName: o.full_name,
                  oldStatus: String(before.order_status ?? ""),
                  newStatus: String(nextStatus),
                }, locale);
            if (!sent) console.error("Order notification was not accepted.");
          }
          // Business-initiated WA messages cost money on the free tier (outside 24h window)
          // — gated behind wa_proactive_enabled in /hs/settings (default OFF).
          const { getSettingOrDefault } = await import('@/lib/queries/settings')
          const waProactive = await getSettingOrDefault('wa_proactive_enabled', '0')
          if (shippingChanged && waProactive === '1' && o.source === 'whatsapp' && o.phone && o.tracking_number) {
            const { sendText } = await import('@/lib/whatsapp/client')
            const lang = o.lang || 'en'
            let waMsg = `Your order ${o.order_ref} has been shipped! 🚚\n\nCourier: ${o.courier_name || 'Courier'}\nTracking Number: ${o.tracking_number}\n\nThank you for choosing Eastel!`
            if (lang === 'ms') {
              waMsg = `Pesanan ${o.order_ref} anda telah dihantar! 🚚\n\nKurier: ${o.courier_name || 'Kurier'}\nNo. Tracking: ${o.tracking_number}\n\nTerima kasih kerana memilih Eastel!`
            } else if (lang === 'zh') {
              waMsg = `您的订单 ${o.order_ref} 已发货！🚚\n\n快递公司: ${o.courier_name || '快递'}\n追踪单号: ${o.tracking_number}\n\n感谢您选择 Eastel！`
            }
            await sendText(o.phone, waMsg)
          }
        }
      } catch (err) {
        console.error("Order notification failed:", err)
      }
    }

    return success({ message: "Order updated successfully." });
  } catch (e) {
    console.error("Admin orders POST error:", e);
    return error("Failed to update order.", 500);
  }
}

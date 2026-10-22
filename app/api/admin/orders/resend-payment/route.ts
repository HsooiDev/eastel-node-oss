import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { requireAdminCsrf, success, error } from "../../_helpers";
import { sendText } from "@/lib/whatsapp/client";
import { logAdminAction } from "@/lib/audit";
import type { RowDataPacket } from "mysql2/promise";

// POST /api/admin/orders/resend-payment
// Re-sends the existing ToyyibPay payment link to the customer via WhatsApp.
// Does NOT create a new bill. Only works for pending WA orders with a bill_code.

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();
    const orderId = parseInt(body.orderId ?? body.order_id ?? "0", 10);
    if (!orderId) return error("Missing order_id.");

    // Fetch order
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT id, order_ref, phone, bill_code, total_amount, lang, payment_status, source FROM orders WHERE id = ? LIMIT 1",
      [orderId]
    );
    if (rows.length === 0) return error("Order not found.");
    const order = rows[0];

    if (order.source !== "whatsapp") return error("This action is only for WhatsApp orders.");
    if (!order.phone)               return error("Order has no phone number.");
    if (order.payment_status === "paid") return error("Order is already paid.");
    if (!order.bill_code)           return error("Order has no payment bill. Use Regenerate instead.");

    const baseUrl = process.env.TOYYIBPAY_BASE_URL || "https://dev.toyyibpay.com";
    const payUrl  = `${baseUrl}/${order.bill_code}`;
    const { buildPaymentMessage } = await import("@/lib/whatsapp/ai");
    const msg = buildPaymentMessage(order.lang || "en", payUrl, order.order_ref, parseFloat(order.total_amount));

    await sendText(order.phone, msg);

    void logAdminAction(session.customerId, "resend_payment_link", "orders", orderId, null, order.order_ref);

    return success({ message: "Payment link resent via WhatsApp.", pay_url: payUrl });
  } catch (e) {
    console.error("resend-payment error:", e);
    return error("Failed to resend payment link.", 500);
  }
}

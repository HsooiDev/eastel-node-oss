import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { formatDate } from "@/lib/db-helpers";
import { requireAdminCsrf, success, error } from "../../_helpers";
import { createBill } from "@/lib/toyyibpay";
import { sendText } from "@/lib/whatsapp/client";
import { logAdminAction } from "@/lib/audit";
import { SITE_URL } from "@/lib/site";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

// POST /api/admin/orders/regenerate-payment
// Creates a NEW ToyyibPay bill for an existing unpaid WA order,
// updates the order row with the new bill_code + order_ref, then sends the link.

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();
    const orderId = parseInt(body.orderId ?? body.order_id ?? "0", 10);
    if (!orderId) return error("Missing order_id.");

    // Fetch order
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT id, order_ref, bill_code, full_name, phone, email, total_amount, lang, payment_status, source FROM orders WHERE id = ? LIMIT 1",
      [orderId]
    );
    if (rows.length === 0) return error("Order not found.");
    const order = rows[0];

    if (order.source !== "whatsapp") return error("This action is only for WhatsApp orders.");
    if (!order.phone)               return error("Order has no phone number.");
    if (order.payment_status === "paid") return error("Order is already paid.");

    // Create a fresh ToyyibPay bill
    const newRef   = `WA-${order.phone}-${Date.now()}`;
    const siteUrl  = SITE_URL;
    const amountRM = parseFloat(order.total_amount);

    let billCode: string;
    let paymentUrl: string;
    try {
      const result = await createBill({
        billName: `Eastel SIM - ${order.full_name || order.phone}`,
        billDescription: `Eastel SIM Card Order ${newRef}`,
        billAmount: Math.round(amountRM * 100),
        billTo: order.full_name || order.phone,
        billEmail: order.email || "",
        billPhone: order.phone,
        billReturnUrl: `${siteUrl}/payment/success`,
        billCallbackUrl: `${siteUrl}/api/payment/callback`,
        billExternalReferenceNo: newRef,
      });
      billCode   = result.billCode;
      paymentUrl = result.paymentUrl;
    } catch (billErr) {
      console.error("regenerate-payment: createBill failed:", billErr);
      return error("Failed to create ToyyibPay bill. Check API credentials.");
    }

    // Do not overwrite a payment, replacement bill or changed bill details.
    const snapshotFields = ["order_ref", "bill_code", "payment_status", "total_amount", "source", "phone", "full_name", "email", "lang"] as const;
    const unchanged = snapshotFields.map((field) => `CAST(\`${field}\` AS BINARY) <=> CAST(? AS BINARY)`).join(" AND ");
    let upd: ResultSetHeader;
    try {
      [upd] = await db.execute<ResultSetHeader>(
        `UPDATE orders SET order_ref = ?, bill_code = ?, payment_status = 'pending', updated_at = ? WHERE id = ? AND ${unchanged}`,
        [newRef, billCode, formatDate(), orderId, ...snapshotFields.map((field) => order[field] ?? null)]
      );
    } catch (saveErr) {
      console.error("regenerate-payment: bill save failed:", saveErr);
      return error("A new bill was created, but saving it could not be confirmed. Refresh orders and review gateway bills before trying again.", 500);
    }
    if (upd.affectedRows === 0) {
      return error("A new bill was created, but the order changed before it could be attached. The new link was not sent. Refresh orders and review gateway bills before trying again.", 409);
    }

    void logAdminAction(session.customerId, "regenerate_payment_link", "orders", orderId, order.order_ref, newRef);

    // Send new link via WhatsApp
    const { buildPaymentMessage } = await import("@/lib/whatsapp/ai");
    const msg = buildPaymentMessage(order.lang || "en", paymentUrl, newRef, amountRM);

    let warnSend = false;
    try {
      await sendText(order.phone, msg);
    } catch (sendErr) {
      console.error("regenerate-payment: sendText failed:", sendErr);
      warnSend = true;
    }

    return success({
      status: warnSend ? "warning" : "success",
      message: warnSend
        ? `New bill created (${newRef}) but WhatsApp send failed. Copy the link manually.`
        : `New payment link sent via WhatsApp (${newRef}).`,
      pay_url: paymentUrl,
      order_ref: newRef,
      bill_code: billCode,
    });
  } catch (e) {
    console.error("regenerate-payment error:", e);
    return error("Failed to regenerate payment link.", 500);
  }
}

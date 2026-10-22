import { escapeHtml } from '@/lib/security'
import nodemailer from "nodemailer";
import db from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { verificationEmailTemplate, passwordResetTemplate, orderConfirmationTemplate, shippingNotificationTemplate, abandonedReminderTemplate, orderStatusChangedTemplate, type OrderStatusMail } from "./email-templates";
import { SITE_URL } from "@/lib/site";
import { getOrderPlanSnapshot, type OrderPlanSnapshot } from "@/lib/order-plan";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function appendNoReplyFooter(html: string, locale: string = "en"): string {
  if (html.includes("notification-only") || html.includes("pemberitahuan sahaja") || html.includes("请勿回复")) {
    return html
  }
  const footer = matchLocale(locale, {
    ms: "*E-mel ini dihantar daripada alamat pemberitahuan sahaja yang tidak dapat menerima e-mel masuk. Sila jangan balas mesej ini.",
    zh: "*此电子邮件是从仅用于通知的地址发送的，无法接收来信。请勿回复此邮件。",
    en: "*This e-mail was sent from a notification-only address that cannot accept incoming e-mails. Please do not reply to this message.",
  })
  const footerHtml = `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e0daf5;color:#9b8cb8;font-size:.7rem;text-align:center;line-height:1.5;">${footer}</div>`
  if (html.toLowerCase().includes("</body>")) {
    return html.replace(/<\/body>/i, `${footerHtml}\n</body>`)
  }
  return html + footerHtml
}

function matchLocale(locale: string, map: Record<string, string>): string {
  return map[locale] || map.en
}

export async function sendEmail(to: string, subject: string, html: string, locale: string = "en"): Promise<boolean> {
  try {
    locale = locale === "ms" || locale === "zh" ? locale : "en";
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@eastel.site"
    const finalHtml = fromEmail.toLowerCase().includes("noreply") ? appendNoReplyFooter(html, locale) : html
    await transporter.sendMail({
      from: `"Eastel Mobile" <${fromEmail}>`,
      to,
      subject,
      html: finalHtml,
      text: htmlToPlainText(finalHtml),
    });
    return true;
  } catch (e) {
    console.error("Email send error:", e);
    return false;
  }
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function sendVerificationCode(to: string, code: string, locale: string = "en", token?: string): Promise<boolean> {
  const subject = locale === "ms" ? "Kod Pengesahan Eastel Anda" : locale === "zh" ? "您的 Eastel 验证码" : "Your Eastel Verification Code";
  return sendEmail(to, subject, verificationEmailTemplate(code, locale, token), locale);
}

export async function sendPasswordReset(to: string, token: string, locale: string = "en"): Promise<boolean> {
  const subject = locale === "ms" ? "Set Semula Kata Laluan Eastel" : locale === "zh" ? "重置您的 Eastel 密码" : "Reset Your Eastel Password";
  return sendEmail(to, subject, passwordResetTemplate(token, locale), locale);
}

export async function sendAbandonedReminder(to: string, order: {
  orderRef: string;
  customerName: string;
  totalAmount: number;
  payUrl: string;
}, locale: string = "en"): Promise<boolean> {
  const subject = locale === "ms" ? `Pesanan Belum Selesai — ${order.orderRef}` : locale === "zh" ? `订单尚未完成付款 — ${order.orderRef}` : `Complete Your Order — ${order.orderRef}`;
  return sendEmail(to, subject, abandonedReminderTemplate(order, locale), locale);
}

export async function sendShippingNotification(to: string, order: {
  orderRef: string;
  customerName: string;
  trackingNumber: string;
  courierName: string;
}, locale: string = "en"): Promise<boolean> {
  const subject = locale === "ms" ? `Penghantaran Disahkan — ${order.orderRef}` : locale === "zh" ? `已发货 — ${order.orderRef}` : `Your Order Has Shipped — ${order.orderRef}`;
  return sendEmail(to, subject, shippingNotificationTemplate(order, locale), locale);
}

export async function sendOrderConfirmation(to: string, order: {
  orderRef: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  deliveryFee: number;
  totalAmount: number;
  shippingAddress: string;
  planSnapshot?: OrderPlanSnapshot | null;
  planFee?: number;
  voucherDiscount?: number;
  paymentStatus?: 'pending' | 'paid';
}, locale: string = "en"): Promise<boolean> {
  const subject = locale === "ms" ? `Pesanan Disahkan — ${order.orderRef}` : locale === "zh" ? `订单已确认 — ${order.orderRef}` : `Order Confirmed — ${order.orderRef}`;
  return sendEmail(to, subject, orderConfirmationTemplate(order, locale), locale);
}


export async function sendOrderStatusChanged(to: string, order: OrderStatusMail, locale: string = "en"): Promise<boolean> {
  const message = orderStatusChangedTemplate(order, locale);
  return sendEmail(to, message.subject, message.html, locale);
}

export async function sendOrderConfirmedOnce(billCode: string): Promise<boolean> {
  const [claimResult] = await db.execute(
    `UPDATE orders
        SET email_sent = 1
      WHERE bill_code = ?
        AND email_sent = 0
        AND payment_status = 'paid'`,
    [billCode]
  )

  if ((claimResult as unknown as { affectedRows: number }).affectedRows === 0) {
    return false
  }

  const [orders] = await db.query<RowDataPacket[]>(
    `SELECT o.order_ref, o.full_name, o.phone, o.delivery_address,
            o.postcode, o.zone, o.sim_fee, o.delivery_fee, o.total_amount,
            o.plan_snapshot, o.plan_fee, o.plan_fulfilled_at, o.voucher_discount,
            o.toyyibpay_ref, o.bill_code, o.customer_id,
            COALESCE(o.lang, 'en') AS lang,
            COALESCE(c.email, o.email) AS customer_email
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.bill_code = ?
      LIMIT 1`,
    [billCode]
  )

  if (orders.length === 0 || !orders[0].order_ref) {
    return false
  }

  const order = orders[0]
  const customerEmail = order.customer_email as string | null

  try {
    const locale = (order.lang as string) || 'en'
    let sentCustomer = false;
    if (customerEmail) {
      sentCustomer = await sendOrderConfirmation(customerEmail, {
        orderRef: order.order_ref,
        customerName: order.full_name,
        productName: 'Eastel SIM Card',
        quantity: 1,
        unitPrice: Number(order.sim_fee),
        deliveryFee: parseFloat(order.delivery_fee),
        totalAmount: parseFloat(order.total_amount),
        shippingAddress: `${order.delivery_address}, ${order.postcode}`,
        planSnapshot: getOrderPlanSnapshot(order.plan_snapshot),
        planFee: Number(order.plan_fee),
        voucherDiscount: Number(order.voucher_discount),
        paymentStatus: 'paid',
      }, locale)
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'support@eastel.site'
    const siteUrl = SITE_URL
    const adminSubject = `New Paid Order: ${order.order_ref}`
    const purchasedPlan = getOrderPlanSnapshot(order.plan_snapshot)
    const adminBody = `A new SIM card order has been paid.\n\n`
      + `Order Ref    : ${order.order_ref}\n`
      + `Customer     : ${order.full_name}\n`
      + `Email        : ${customerEmail || 'Guest'}\n`
      + `Phone        : ${order.phone}\n`
      + `Address      : ${order.delivery_address}\n`
      + `Zone         : ${order.zone}\n`
      + `SIM Fee      : RM${order.sim_fee}\n`
      + `Plan         : ${purchasedPlan?.plan.name || 'SIM only'}\n`
      + `Plan Fee     : RM${Number(order.plan_fee || 0).toFixed(2)}\n`
      + (purchasedPlan ? `Plan Purchase: ${order.plan_fulfilled_at ? 'Completed manually' : 'Pending manual purchase after customer SIM registration'}\n` : '')
      + `Delivery Fee : RM${order.delivery_fee}\n`
      + `Discount     : RM${Number(order.voucher_discount || 0).toFixed(2)} (SIM/delivery only)\n`
      + `Total        : RM${order.total_amount}\n`
      + `Bill Code    : ${billCode}\n`
      + `TXN ID       : ${order.toyyibpay_ref || 'N/A'}\n\n`
      + `Log in to admin panel: ${siteUrl}/hs/dashboard`

    await sendEmail(adminEmail, adminSubject, `<pre style="font-family:monospace;font-size:13px;">${escapeHtml(adminBody)}</pre>`, 'en')

    return sentCustomer
  } catch (e) {
    console.error('sendOrderConfirmedOnce error:', e)
    return false
  }
}

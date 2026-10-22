import { escapeHtml } from '@/lib/security'
import { SITE_URL } from '@/lib/site'
import type { OrderPlanSnapshot } from '@/lib/order-plan'

export function verificationEmailTemplate(code: string, locale: string, token?: string): string {
  const texts: Record<string, { subject: string; heading: string; body: string; button: string; expiry: string }> = {
    en: { subject: "Your Eastel Verification Code", heading: "Verify Your Email", body: "Your verification code is:", button: "Verify Email", expiry: "This code expires in 60 minutes." },
    ms: { subject: "Kod Pengesahan Eastel Anda", heading: "Sahkan Emel Anda", body: "Kod pengesahan anda ialah:", button: "Sahkan E-mel", expiry: "Kod ini tamat tempoh dalam 60 minit." },
    zh: { subject: "您的 Eastel 验证码", heading: "验证您的邮箱", body: "您的验证码是：", button: "验证邮箱", expiry: "此验证码将在 60 分钟后过期。" },
  };
  locale = locale === "ms" || locale === "zh" ? locale : "en";
  const t = texts[locale] || texts.en;
  const verifyUrl = token
    ? `${SITE_URL}/${locale}/account/verify-email?token=${encodeURIComponent(token)}`
    : '';
  const verifyLink = verifyUrl
    ? `<a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#9B7BFF;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:0 0 20px;">${t.button}</a>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
  <div style="background:#9B7BFF;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:20px;">EASTEL</h1>
  </div>
  <div style="padding:32px 24px;text-align:center;">
    <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:18px;">${t.heading}</h2>
    <p style="color:#666;margin:0 0 24px;font-size:14px;">${t.body}</p>
    ${verifyLink}
    <div style="background:#f8f7ff;border:2px dashed #9B7BFF;border-radius:8px;padding:20px;margin:0 0 24px;">
      <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a1a2e;">${code}</span>
    </div>
    <p style="color:#999;font-size:12px;margin:0;">${t.expiry}</p>
  </div>
  <div style="background:#f8f7ff;padding:16px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">Eastel Mobile &middot; Anchor Communications Sdn. Bhd.</p>
  </div>
</div></body></html>`;
}

export function passwordResetTemplate(token: string, locale: string): string {
  const texts: Record<string, { subject: string; heading: string; body: string; button: string; expiry: string }> = {
    en: { subject: "Reset Your Eastel Password", heading: "Reset Password", body: "Click the button below to reset your password.", button: "Reset Password", expiry: "This link expires in 1 hour. If you didn't request this, ignore this email." },
    ms: { subject: "Set Semula Kata Laluan Eastel", heading: "Set Semula Kata Laluan", body: "Klik butang di bawah untuk menetapkan semula kata laluan anda.", button: "Set Semula", expiry: "Pautan ini tamat tempoh dalam 1 jam. Jika anda tidak meminta ini, abaikan e-mel ini." },
    zh: { subject: "重置您的 Eastel 密码", heading: "重置密码", body: "点击下方按钮重置您的密码。", button: "重置密码", expiry: "此链接将在 1 小时后过期。如果您没有请求此操作，请忽略此邮件。" },
  };
  locale = locale === "ms" || locale === "zh" ? locale : "en";
  const t = texts[locale] || texts.en;
  const baseUrl = SITE_URL;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
  <div style="background:#9B7BFF;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:20px;">EASTEL</h1>
  </div>
  <div style="padding:32px 24px;text-align:center;">
    <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:18px;">${t.heading}</h2>
    <p style="color:#666;margin:0 0 24px;font-size:14px;">${t.body}</p>
    <a href="${escapeHtml(`${baseUrl}/${["en", "ms", "zh"].includes(locale) ? locale : "en"}/account/reset?token=${encodeURIComponent(token)}`)}" style="display:inline-block;background:#9B7BFF;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${t.button}</a>
    <p style="color:#999;font-size:12px;margin:24px 0 0;">${t.expiry}</p>
  </div>
  <div style="background:#f8f7ff;padding:16px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">Eastel Mobile &middot; Anchor Communications Sdn. Bhd.</p>
  </div>
</div></body></html>`;
}

export function abandonedReminderTemplate(order: {
  orderRef: string;
  customerName: string;
  totalAmount: number;
  payUrl: string;
}, locale: string): string {
  const texts: Record<string, { heading: string; body: string; amount: string; payBtn: string; note: string }> = {
    en: {
      heading: "Your Eastel SIM is waiting!",
      body: `Hi ${escapeHtml(String(order.customerName))}, your order ${escapeHtml(String(order.orderRef))} hasn't been paid yet. Complete your payment and we'll ship your SIM right away.`,
      amount: "Amount due",
      payBtn: "Complete Payment",
      note: "If you've already paid, please ignore this e-mail.",
    },
    ms: {
      heading: "SIM Eastel anda sedang menunggu!",
      body: `Hai ${escapeHtml(String(order.customerName))}, pesanan ${escapeHtml(String(order.orderRef))} anda masih belum dibayar. Lengkapkan pembayaran dan kami akan hantar SIM anda dengan segera.`,
      amount: "Jumlah perlu dibayar",
      payBtn: "Lengkapkan Pembayaran",
      note: "Jika anda sudah membuat pembayaran, sila abaikan e-mel ini.",
    },
    zh: {
      heading: "您的 Eastel SIM 卡还在等您！",
      body: `${escapeHtml(String(order.customerName))} 您好，您的订单 ${escapeHtml(String(order.orderRef))} 尚未完成付款。完成付款后我们会立即为您发货。`,
      amount: "应付金额",
      payBtn: "完成付款",
      note: "如果您已完成付款，请忽略此邮件。",
    },
  };
  locale = locale === "ms" || locale === "zh" ? locale : "en";
  const t = texts[locale] || texts.en;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
  <div style="background:#9B7BFF;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:20px;">EASTEL</h1>
  </div>
  <div style="padding:32px 24px;text-align:center;">
    <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:18px;">${t.heading}</h2>
    <p style="color:#666;margin:0 0 24px;font-size:14px;line-height:1.6;">${t.body}</p>
    <div style="background:#f8f7ff;border:2px dashed #9B7BFF;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="color:#999;font-size:12px;margin:0 0 4px;">${t.amount}</p>
      <span style="font-size:26px;font-weight:bold;color:#1a1a2e;">RM${order.totalAmount.toFixed(2)}</span>
    </div>
    <a href="${escapeHtml(order.payUrl)}" style="display:inline-block;background:#9B7BFF;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:14px 32px;border-radius:8px;margin:0 0 24px;">${t.payBtn}</a>
    <p style="color:#999;font-size:12px;margin:0;">${t.note}</p>
  </div>
  <div style="background:#f8f7ff;padding:16px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">Eastel Mobile &middot; Anchor Communications Sdn. Bhd.</p>
  </div>
</div></body></html>`;
}

export function shippingNotificationTemplate(order: {
  orderRef: string;
  customerName: string;
  trackingNumber: string;
  courierName: string;
}, locale: string): string {
  const texts: Record<string, { heading: string; body: string; trackBtn: string; ordersBtn: string; noReply: string }> = {
    en: {
      heading: "Your SIM card is on the way!",
      body: "Great news — your Eastel SIM card has been shipped.",
      trackBtn: "Track My Parcel",
      ordersBtn: "View My Orders",
      noReply: "*This e-mail was sent from a notification-only address that cannot accept incoming e-mails. Please do not reply to this message.",
    },
    ms: {
      heading: "Kad SIM anda sedang dalam perjalanan!",
      body: "Berita baik — kad SIM Eastel anda telah dihantar.",
      trackBtn: "Jejak Penghantaran",
      ordersBtn: "Lihat Pesanan",
      noReply: "*E-mel ini dihantar daripada alamat pemberitahuan sahaja yang tidak dapat menerima e-mel masuk. Sila jangan balas mesej ini.",
    },
    zh: {
      heading: "您的 SIM 卡正在路上！",
      body: "好消息 — 您的 Eastel SIM 卡已发货。",
      trackBtn: "追踪包裹",
      ordersBtn: "查看订单",
      noReply: "*此电子邮件是从仅用于通知的地址发送的，无法接收来信。请勿回复此邮件。",
    },
  };
  locale = locale === "ms" || locale === "zh" ? locale : "en";
  const t = texts[locale] || texts.en;
  const siteUrl = SITE_URL;
  const trackUrl = `https://app.easyparcel.com/tools/easytrack/summary/?awb=${encodeURIComponent(order.trackingNumber)}`;
  const ordersUrl = `${siteUrl}/${locale}/account/orders`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
  <div style="background:#9B7BFF;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:20px;">EASTEL</h1>
  </div>
  <div style="padding:32px 24px;">
    <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:18px;text-align:center;">${t.heading}</h2>
    <p style="color:#666;margin:0 0 24px;font-size:14px;text-align:center;">Hi ${escapeHtml(String(order.customerName))}, ${t.body}</p>
    <div style="background:#f8f7ff;border-radius:8px;padding:16px;margin:0 0 8px;">
      <p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;font-weight:700;">Order Reference</p>
      <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a2e;font-family:monospace;">${escapeHtml(String(order.orderRef))}</p>
    </div>
    <div style="background:#f8f7ff;border-radius:8px;padding:16px;margin:0 0 8px;">
      <p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;font-weight:700;">Courier</p>
      <p style="margin:0;font-size:14px;color:#1a1a2e;">${escapeHtml(String(order.courierName))}</p>
    </div>
    <div style="background:#f8f7ff;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;font-weight:700;">Tracking Number</p>
      <p style="margin:0;font-size:16px;font-weight:800;color:#9B7BFF;font-family:monospace;">${escapeHtml(String(order.trackingNumber))}</p>
    </div>
    <a href="${escapeHtml(trackUrl)}" style="display:block;text-align:center;background:#9B7BFF;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-bottom:8px;">${t.trackBtn} ↗</a>
    <a href="${escapeHtml(ordersUrl)}" style="display:block;text-align:center;background:#f8f7ff;color:#9B7BFF;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;border:1px solid #e0daf5;">${t.ordersBtn}</a>
    <p style="color:#bbb;font-size:11px;text-align:center;margin:20px 0 0;line-height:1.5;">${t.noReply}</p>
  </div>
  <div style="background:#f8f7ff;padding:16px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">Eastel Mobile &middot; Anchor Communications Sdn. Bhd.</p>
  </div>
</div></body></html>`;
}

export function orderConfirmationTemplate(order: {
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
}, locale: string): string {
  const texts: Record<string, { subject: string; heading: string; thankYou: string }> = {
    en: { subject: `Order Confirmed — ${escapeHtml(String(order.orderRef))}`, heading: "Order Confirmed!", thankYou: "Thank you for your order. We'll process it shortly." },
    ms: { subject: `Pesanan Disahkan — ${escapeHtml(String(order.orderRef))}`, heading: "Pesanan Disahkan!", thankYou: "Terima kasih atas pesanan anda. Kami akan memprosesnya tidak lama lagi." },
    zh: { subject: `订单已确认 — ${escapeHtml(String(order.orderRef))}`, heading: "订单已确认！", thankYou: "感谢您的订单。我们会尽快处理。" },
  };
  locale = locale === "ms" || locale === "zh" ? locale : "en";
  const t = texts[locale] || texts.en;

  const labels = ({
    en: { plan: 'Mobile plan purchase', simOnly: 'SIM only — no plan purchased', discount: 'Voucher discount (SIM/delivery)', pending: 'Payment pending', paid: 'Paid', manual: 'Your purchased plan will be bought manually by Eastel after you register your SIM in the app.', view: 'View order and invoice' },
    ms: { plan: 'Pembelian pelan mudah alih', simOnly: 'SIM sahaja — tiada pelan dibeli', discount: 'Diskaun baucar (SIM/penghantaran)', pending: 'Menunggu bayaran', paid: 'Telah dibayar', manual: 'Eastel akan membeli pelan anda secara manual selepas anda mendaftarkan SIM dalam aplikasi.', view: 'Lihat pesanan dan invois' },
    zh: { plan: '套餐代购', simOnly: '只买 SIM 卡 — 未购买套餐', discount: '优惠券折扣（SIM 卡／运费）', pending: '待付款', paid: '已付款', manual: '您在 App 注册 SIM 卡后，Eastel 将为您手动代购所选套餐。', view: '查看订单和 invoice' },
  } as const)[locale as 'en' | 'ms' | 'zh'] ?? ({ plan: 'Mobile plan purchase', simOnly: 'SIM only — no plan purchased', discount: 'Voucher discount (SIM/delivery)', pending: 'Payment pending', paid: 'Paid', manual: 'Eastel purchases the plan manually after SIM registration.', view: 'View order and invoice' })
  const plan = order.planSnapshot?.plan
  const language = ['en', 'ms', 'zh'].includes(locale) ? locale : 'en'
  const planRow = plan
    ? `<tr><td style="padding:8px 0;color:#666;">${labels.plan}: ${escapeHtml(plan.name)}<br/><small>${plan.dataGB} GB / ${plan.hotspotGB} GB hotspot / ${plan.roamingGB} GB roaming / ${plan.validityDays} days</small></td><td style="padding:8px 0;text-align:right;color:#1a1a2e;">RM ${Number(order.planFee ?? plan.price).toFixed(2)}</td></tr>`
    : `<tr><td colspan="2" style="padding:8px 0;color:#666;">${labels.simOnly}</td></tr>`
  const discountRow = Number(order.voucherDiscount || 0) > 0
    ? `<tr><td style="padding:8px 0;color:#666;">${labels.discount}</td><td style="padding:8px 0;text-align:right;color:#1a1a2e;">− RM ${Number(order.voucherDiscount).toFixed(2)}</td></tr>` : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
  <div style="background:#9B7BFF;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:20px;">EASTEL</h1>
  </div>
  <div style="padding:32px 24px;">
    <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:18px;text-align:center;">${t.heading}</h2>
    <p style="color:#666;margin:0 0 24px;font-size:14px;text-align:center;">${t.thankYou}</p>
    <div style="background:#f8f7ff;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 4px;font-size:12px;color:#999;">Order Ref</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a2e;font-family:monospace;">${escapeHtml(String(order.orderRef))}</p>
      <p style="margin:8px 0 0;font-size:13px;">${order.paymentStatus === 'paid' ? labels.paid : labels.pending}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#666;">Product</td><td style="padding:8px 0;text-align:right;color:#1a1a2e;">${escapeHtml(String(order.productName))}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Qty</td><td style="padding:8px 0;text-align:right;color:#1a1a2e;">${order.quantity}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Unit Price</td><td style="padding:8px 0;text-align:right;color:#1a1a2e;">RM ${order.unitPrice.toFixed(2)}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Delivery</td><td style="padding:8px 0;text-align:right;color:#1a1a2e;">RM ${order.deliveryFee.toFixed(2)}</td></tr>
      ${planRow}
      ${discountRow}
      <tr style="border-top:2px solid #9B7BFF;"><td style="padding:12px 0;font-weight:700;color:#1a1a2e;">Total</td><td style="padding:12px 0;text-align:right;font-weight:700;color:#9B7BFF;font-size:16px;">RM ${order.totalAmount.toFixed(2)}</td></tr>
    </table>
    ${plan ? `<p style="font-size:13px;color:#666;">${labels.manual}</p>` : ''}
    <p><a href="${SITE_URL}/${language}/account/orders" style="color:#6941c6;">${labels.view}</a></p>
    <div style="margin:16px 0 0;padding:12px;background:#f8f7ff;border-radius:8px;">
      <p style="margin:0 0 4px;font-size:12px;color:#999;">Ship to</p>
      <p style="margin:0;font-size:13px;color:#1a1a2e;">${escapeHtml(String(order.customerName))}<br/>${escapeHtml(String(order.shippingAddress))}</p>
    </div>
  </div>
  <div style="background:#f8f7ff;padding:16px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">Eastel Mobile &middot; Anchor Communications Sdn. Bhd.</p>
  </div>
</div></body></html>`;
}

export interface OrderStatusMail {
  orderRef: string;
  customerName: string;
  oldStatus: string;
  newStatus: string;
}

export function orderStatusChangedTemplate(order: OrderStatusMail, locale: string): { subject: string; html: string } {
  const language = locale === "ms" || locale === "zh" ? locale : "en";
  const labels = {
    en: { pending: "Pending", processing: "Processing", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" },
    ms: { pending: "Menunggu", processing: "Diproses", shipped: "Dihantar", delivered: "Dihantar", cancelled: "Dibatalkan" },
    zh: { pending: "待处理", processing: "处理中", shipped: "已发货", delivered: "已送达", cancelled: "已取消" },
  }[language];
  const copy = {
    en: { subject: "Order Update", greeting: "Hi", intro: "Your order status has been updated.", reference: "Order Reference", previous: "Previous Status", current: "New Status", button: "Track My Order" },
    ms: { subject: "Kemaskini Pesanan", greeting: "Hai", intro: "Status pesanan anda telah dikemaskini.", reference: "Rujukan Pesanan", previous: "Status Sebelumnya", current: "Status Baharu", button: "Jejak Pesanan Saya" },
    zh: { subject: "订单更新", greeting: "您好", intro: "您的订单状态已更新。", reference: "订单编号", previous: "之前状态", current: "新状态", button: "追踪我的订单" },
  }[language];
  const label = (status: string): string => Object.hasOwn(labels, status) ? labels[status as keyof typeof labels] : status;
  const ordersUrl = SITE_URL + "/" + language + "/account/orders";
  const html = [
    '<!DOCTYPE html><html lang="' + language + '"><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">',
    '<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;">',
    '<div style="background:#9B7BFF;padding:24px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:20px;">EASTEL</h1></div>',
    '<div style="padding:32px 24px;"><h2 style="font-size:20px;color:#1a1a2e;">' + copy.intro + '</h2>',
    '<p>' + copy.greeting + ' ' + escapeHtml(String(order.customerName)) + '</p>',
    '<table style="width:100%;font-size:14px;border-collapse:collapse;">',
    '<tr><th style="text-align:left;padding:12px 0;">' + copy.reference + '</th><td>' + escapeHtml(String(order.orderRef)) + '</td></tr>',
    '<tr><th style="text-align:left;padding:12px 0;">' + copy.previous + '</th><td>' + escapeHtml(label(order.oldStatus)) + '</td></tr>',
    '<tr><th style="text-align:left;padding:12px 0;">' + copy.current + '</th><td>' + escapeHtml(label(order.newStatus)) + '</td></tr>',
    '</table><p><a href="' + escapeHtml(ordersUrl) + '" style="color:#6941c6;">' + copy.button + '</a></p></div>',
    '<div style="background:#f8f7ff;padding:16px;text-align:center;color:#999;font-size:11px;">Eastel Mobile</div>',
    '</div></body></html>',
  ].join("");
  return { subject: copy.subject + " — " + label(order.newStatus) + " [" + order.orderRef + "]", html };
}

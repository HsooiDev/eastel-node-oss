import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { getSessionCookie } from "@/lib/cookies";
import { validateSession } from "@/lib/session";
import { isValidLocale } from "@/lib/i18n";
import { getOrderPlanSnapshot } from "@/lib/order-plan";
import db from "@/lib/db";
import { AccountCard } from "@/components/ui/account-card";
import { Badge } from "@/components/ui/badge";
import { PrintInvoice } from "@/components/orders/print-invoice";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Order Invoice — Eastel Mobile",
  robots: { index: false, follow: false },
};

interface InvoiceOrder extends RowDataPacket {
  id: number;
  order_ref: string;
  full_name: string;
  email: string | null;
  phone: string;
  delivery_address: string;
  postcode: string;
  state: string | null;
  sim_fee: string;
  plan_fee: string;
  plan_snapshot: unknown;
  plan_fulfilled_at: Date | string | null;
  delivery_fee: string;
  voucher_code: string | null;
  voucher_discount: string;
  total_amount: string;
  payment_status: string;
  order_status: string;
  courier_name: string | null;
  tracking_number: string | null;
  created_at: Date | string;
}

interface InvoicePageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) notFound();
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();

  const sessionId = await getSessionCookie();
  if (!sessionId) redirect(`/${locale}/account/login`);
  const session = await validateSession(sessionId);
  if (!session) redirect(`/${locale}/account/login`);

  // Both predicates are required: a guessed order ID cannot expose another customer's invoice.
  const [orders] = await db.query<InvoiceOrder[]>(
    `SELECT id, order_ref, full_name, email, phone, delivery_address, postcode, state,
            sim_fee, plan_fee, plan_snapshot, plan_fulfilled_at, delivery_fee,
            voucher_code, voucher_discount, total_amount, payment_status, order_status,
            courier_name, tracking_number, created_at
     FROM orders WHERE id = ? AND customer_id = ? LIMIT 1`,
    [Number(id), session.customerId]
  );
  if (orders.length === 0) notFound();
  const order = orders[0];
  const snapshot = getOrderPlanSnapshot(order.plan_snapshot);
  const hasPlanRecord = Number(order.plan_fee) > 0 || (order.plan_snapshot != null && order.plan_snapshot !== "");
  const paid = order.payment_status === "paid";
  const labels = locale === "zh" ? {
    title: "订单／Invoice", ref: "订单编号", date: "下单日期", customer: "顾客与收货资料", item: "项目", amount: "金额", sim: "Eastel 电话卡", plan: "已购买配套", simOnly: "仅购买电话卡，没有购买配套", delivery: "运费", discount: "优惠折扣", total: "订单总额", payment: "付款状态", paid: "已付款", unpaid: "未付款", failed: "付款失败", unpaidNotice: "这是订单明细；尚未确认收到付款，不是已付款收据。", status: "订单状态", activation: "配套代购状态", activated: "已代购开通", activationPending: "待代购开通", activationInfo: "请在收到电话卡后于您的 App 完成注册。Eastel 会在收到付款后，使用自己的 App 为您代购开通此配套。", data: "流量", days: "天", validity: "有效期", hotspot: "热点", shared: "共享热点", roaming: "漫游", terms: "以下配套资料按下单时保存，不受之后的配套价格修改影响。", shipping: "配送追踪", back: "返回订单", print: "打印／另存 PDF",
  } : locale === "ms" ? {
    title: "Pesanan / Invois", ref: "Rujukan pesanan", date: "Tarikh pesanan", customer: "Pelanggan & penghantaran", item: "Item", amount: "Amaun", sim: "Kad SIM Eastel", plan: "Pelan dibeli", simOnly: "Kad SIM sahaja; tiada pelan dibeli", delivery: "Penghantaran", discount: "Diskaun", total: "Jumlah pesanan", payment: "Status pembayaran", paid: "Dibayar", unpaid: "Belum dibayar", failed: "Pembayaran gagal", unpaidNotice: "Ini ialah butiran pesanan. Pembayaran belum disahkan; ini bukan resit pembayaran.", status: "Status pesanan", activation: "Status pengaktifan pelan", activated: "Diaktifkan", activationPending: "Menunggu pengaktifan", activationInfo: "Daftar SIM dalam aplikasi anda selepas menerimanya. Selepas menerima pembayaran, Eastel akan membeli dan mengaktifkan pelan ini menggunakan aplikasi kami.", data: "Data", days: "hari", validity: "Tempoh sah", hotspot: "Hotspot", shared: "Hotspot dikongsi", roaming: "Perayauan", terms: "Butiran pelan disimpan semasa pesanan dibuat dan tidak berubah apabila harga katalog berubah.", shipping: "Penjejakan penghantaran", back: "Kembali ke pesanan", print: "Cetak / simpan PDF",
  } : {
    title: "Order / Invoice", ref: "Order reference", date: "Order date", customer: "Customer & delivery", item: "Item", amount: "Amount", sim: "Eastel SIM card", plan: "Purchased plan", simOnly: "SIM card only; no plan purchased", delivery: "Delivery", discount: "Discount", total: "Order total", payment: "Payment status", paid: "Paid", unpaid: "Unpaid", failed: "Payment failed", unpaidNotice: "These are order details. Payment has not been confirmed; this is not a paid receipt.", status: "Order status", activation: "Plan activation status", activated: "Activated", activationPending: "Awaiting activation", activationInfo: "Register your SIM in your app after receiving it. Once payment is received, Eastel will purchase and activate this plan for you using our app.", data: "Data", days: "days", validity: "Validity", hotspot: "Hotspot", shared: "Shared hotspot", roaming: "Roaming", terms: "Plan details were saved when you ordered and are preserved if catalogue prices change.", shipping: "Delivery tracking", back: "Back to orders", print: "Print / save PDF",
  };
  const dateLocale = locale === "zh" ? "zh-MY" : locale === "ms" ? "ms-MY" : "en-MY";
  const formatDate = (value: Date | string) => new Date(value).toLocaleString(dateLocale, { timeZone: "Asia/Kuala_Lumpur" });
  const money = (value: string | number) => `RM ${Number(value).toFixed(2)}`;

  return (
    <div className="space-y-4">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link href={`/${locale}/account/orders`} className="text-sm text-cyan-600 underline underline-offset-4">{labels.back}</Link>
        <PrintInvoice label={labels.print} />
      </div>
      <div id="eastel-order-invoice"><AccountCard className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--acc-border)] pb-4">
          <div><p className="text-sm font-semibold text-[color:var(--acc-text)]">Eastel Mobile</p><h1 className="mt-1 text-2xl font-bold text-[color:var(--acc-text)]">{labels.title}</h1></div>
          <div className="text-sm text-[color:var(--acc-text-dim)]"><p>{labels.ref}: <strong className="font-mono text-[color:var(--acc-text)]">{order.order_ref}</strong></p><p className="mt-1">{labels.date}: {formatDate(order.created_at)}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[color:var(--acc-text-dim)]">{labels.payment}</span>
          <Badge variant={paid ? "success" : order.payment_status === "failed" ? "error" : "warning"}>{paid ? labels.paid : order.payment_status === "failed" ? labels.failed : labels.unpaid}</Badge>
          <span className="text-[color:var(--acc-text-dim)]">{labels.status}: {order.order_status}</span>
        </div>
        {!paid && <p className="rounded-lg border border-amber-500/40 p-3 text-sm text-[color:var(--acc-text)]">{labels.unpaidNotice}</p>}
        <section className="text-sm text-[color:var(--acc-text-dim)]"><h2 className="mb-2 font-semibold text-[color:var(--acc-text)]">{labels.customer}</h2><p>{order.full_name}</p>{order.email && <p className="break-all">{order.email}</p>}<p>{order.phone}</p><p className="mt-2 whitespace-pre-wrap">{order.delivery_address}</p><p>{[order.postcode, order.state].filter(Boolean).join(" ")}</p></section>
        <table className="w-full text-sm text-[color:var(--acc-text-dim)]">
          <thead><tr className="border-b border-[color:var(--acc-border)]"><th scope="col" className="py-2 text-left font-semibold">{labels.item}</th><th scope="col" className="py-2 text-right font-semibold">{labels.amount}</th></tr></thead>
          <tbody>
            <tr><td className="py-3">{labels.sim} × 1</td><td className="py-3 text-right whitespace-nowrap">{money(order.sim_fee)}</td></tr>
            {(snapshot || hasPlanRecord) && <tr><td className="py-3">{labels.plan}{snapshot ? <>: <strong className="text-[color:var(--acc-text)]">{snapshot.plan.name}</strong> × 1</> : ""}</td><td className="py-3 text-right whitespace-nowrap">{money(order.plan_fee)}</td></tr>}
            <tr><td className="py-3">{labels.delivery}</td><td className="py-3 text-right whitespace-nowrap">{money(order.delivery_fee)}</td></tr>
            {Number(order.voucher_discount) > 0 && <tr><td className="py-3">{labels.discount}{order.voucher_code ? ` (${order.voucher_code})` : ""}</td><td className="py-3 text-right whitespace-nowrap">−{money(order.voucher_discount)}</td></tr>}
          </tbody>
          <tfoot><tr className="border-t border-[color:var(--acc-border)] font-semibold text-[color:var(--acc-text)]"><th scope="row" className="pt-3 text-left">{labels.total}</th><td className="pt-3 text-right whitespace-nowrap">{money(order.total_amount)}</td></tr></tfoot>
        </table>
        {snapshot ? (
          <section className="space-y-3 rounded-lg border border-[color:var(--acc-border)] p-4 text-sm text-[color:var(--acc-text-dim)]">
            <h2 className="font-semibold text-[color:var(--acc-text)]">{labels.plan}: {snapshot.plan.name}</h2>
            <p>{labels.data}: {snapshot.plan.dataGB}GB · {labels.validity}: {snapshot.plan.validityDays} {labels.days} · {snapshot.plan.hotspotMode === "shared" ? labels.shared : `${labels.hotspot}: ${snapshot.plan.hotspotGB}GB`}{snapshot.plan.roamingGB > 0 ? ` · ${labels.roaming}: ${snapshot.plan.roamingGB}GB` : ""}</p>
            <p className="text-xs">{labels.terms}</p>
            <div className="flex flex-wrap items-center gap-2"><span>{labels.activation}</span><Badge variant={order.plan_fulfilled_at ? "success" : "warning"}>{order.plan_fulfilled_at ? labels.activated : labels.activationPending}</Badge>{order.plan_fulfilled_at && <span>{formatDate(order.plan_fulfilled_at)}</span>}</div>
            {!order.plan_fulfilled_at && <p>{labels.activationInfo}</p>}
          </section>
        ) : hasPlanRecord ? <p className="text-sm text-[color:var(--acc-text-dim)]">{locale === "zh" ? "已保存的配套详情暂时无法读取，请联系 Eastel 核实。" : locale === "ms" ? "Butiran pelan tersimpan tidak tersedia. Hubungi Eastel untuk pengesahan." : "Saved plan details are unavailable. Contact Eastel to verify them."}</p> : <p className="text-sm text-[color:var(--acc-text-dim)]">{labels.simOnly}</p>}
        {order.tracking_number && <section className="text-sm text-[color:var(--acc-text-dim)]"><h2 className="mb-2 font-semibold text-[color:var(--acc-text)]">{labels.shipping}</h2>{order.courier_name && <p>{order.courier_name}</p>}<p className="font-mono">{order.tracking_number}</p></section>}
      </AccountCard></div>
      <style>{`@media print { body * { visibility: hidden; } #eastel-order-invoice, #eastel-order-invoice * { visibility: visible; color: black !important; background: transparent !important; box-shadow: none !important; backdrop-filter: none !important; } #eastel-order-invoice { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; } }`}</style>
    </div>
  );
}

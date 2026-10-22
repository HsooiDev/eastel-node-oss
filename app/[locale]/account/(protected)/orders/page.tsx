import type { Metadata } from "next";
import Link from "next/link";
import { getSessionCookie } from "@/lib/cookies";
import { validateSession } from "@/lib/session";
import db from "@/lib/db";
import { redirect } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { isValidLocale } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { SITE_URL } from "@/lib/site";
import { Badge } from "@/components/ui/badge";
import { AccountCard } from "@/components/ui/account-card";
import PayNowButton from "./PayNowButton";
import PaymentReturnNotice from "./PaymentReturnNotice";
import { getOrderPlanSnapshot } from "@/lib/order-plan";
import type { RowDataPacket } from "mysql2/promise";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CustomerOrderRow extends RowDataPacket {
  id: number;
  order_ref: string;
  sim_fee: string;
  plan_fee: string;
  plan_snapshot: unknown;
  plan_fulfilled_at: Date | string | null;
  delivery_fee: string;
  voucher_discount: string;
  total_amount: string;
  payment_status: string;
  order_status: string;
  tracking_number: string | null;
  bill_code: string | null;
  created_at: Date | string;
}

interface OrdersPageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: OrdersPageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  return buildMetadata({
    title: t(translations, "orders.title", "My Orders — Eastel Mobile"),
    description: t(translations, "orders.desc", "View your Eastel Mobile order history and tracking."),
    locale,
    canonical: `${SITE_URL}/${locale}/account/orders`,
    noIndex: true,
  });
}

const statusVariant: Record<string, "success" | "warning" | "error" | "neutral"> = {
  delivered: "success",
  shipped: "warning",
  processing: "warning",
  cancelled: "error",
  pending: "neutral",
};

export default async function OrdersPage({ params, searchParams }: OrdersPageProps) {
  const { locale } = await params;
  if (!isValidLocale(locale)) redirect("/ms/account/orders");

  const sessionId = await getSessionCookie();
  if (!sessionId) redirect(`/${locale}/account/login`);
  const session = await validateSession(sessionId);
  if (!session) redirect(`/${locale}/account/login`);

  const translations = await getTranslations(locale as Locale);
  const labels = locale === "zh" ? {
    sim: "电话卡", plan: "已购买配套", delivery: "运费", discount: "优惠折扣", simOnly: "仅购买电话卡，没有购买配套", invoice: "查看订单／Invoice", activated: "配套已代购开通", pending: "配套待代购开通", activationInfo: "收到电话卡并在您的 App 完成注册后，Eastel 会为您代购开通已付款的配套。", data: "流量", days: "天", hotspot: "热点", shared: "共享热点", roaming: "漫游", paid: "已付款", unpaid: "未付款", failed: "付款失败",
  } : locale === "ms" ? {
    sim: "Kad SIM", plan: "Pelan dibeli", delivery: "Penghantaran", discount: "Diskaun", simOnly: "Kad SIM sahaja; tiada pelan dibeli", invoice: "Lihat pesanan / invois", activated: "Pelan telah diaktifkan", pending: "Pelan menunggu pengaktifan", activationInfo: "Selepas menerima SIM dan mendaftar dalam aplikasi anda, Eastel akan membeli dan mengaktifkan pelan yang telah dibayar.", data: "data", days: "hari", hotspot: "hotspot", shared: "Hotspot dikongsi", roaming: "perayauan", paid: "Dibayar", unpaid: "Belum dibayar", failed: "Pembayaran gagal",
  } : {
    sim: "SIM card", plan: "Purchased plan", delivery: "Delivery", discount: "Discount", simOnly: "SIM card only; no plan purchased", invoice: "View order / invoice", activated: "Plan activated", pending: "Awaiting plan activation", activationInfo: "After you receive your SIM and register it in your app, Eastel will purchase and activate your paid plan.", data: "data", days: "days", hotspot: "hotspot", shared: "Shared hotspot", roaming: "roaming", paid: "Paid", unpaid: "Unpaid", failed: "Payment failed",
  };

  const [orders] = await db.query<CustomerOrderRow[]>(
    "SELECT id, order_ref, sim_fee, plan_fee, plan_snapshot, plan_fulfilled_at, delivery_fee, voucher_discount, total_amount, payment_status, order_status, tracking_number, bill_code, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC",
    [session.customerId]
  );

  const query = (await searchParams) ?? {};
  const isReturn = query.status === "processing" || ["success", "failed", "error"].includes(typeof query.payment === "string" ? query.payment : "");
  // Only select from this customer's orders; URL values are never payment proof.
  const returnedOrder = typeof query.bill === "string"
    ? orders.find(order => order.bill_code === query.bill)
    : typeof query.order_ref === "string"
      ? orders.find(order => order.order_ref === query.order_ref)
      : undefined;
  const returnStatus = returnedOrder?.payment_status === "paid" ? "paid"
    : query.payment === "failed" && returnedOrder?.payment_status === "failed" ? "failed"
      : query.status === "processing" && returnedOrder ? "processing" : "unconfirmed";

  return (
    <div>
      <h1 className="text-2xl font-bold text-[color:var(--acc-text)] mb-6">
        {t(translations, "account.ordersTitle", "My Orders")}
      </h1>

      {isReturn && <PaymentReturnNotice
        key={returnedOrder?.bill_code || returnedOrder?.order_ref || "return"}
        locale={locale}
        status={returnStatus}
        orderRef={returnedOrder?.order_ref}
      />}

      {orders.length === 0 ? (
        <AccountCard className="text-center">
          <p className="text-[color:var(--acc-text-faint)]">{t(translations, "account.noOrders", "No orders yet.")}</p>
        </AccountCard>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const snapshot = getOrderPlanSnapshot(order.plan_snapshot);
            const hasPlanRecord = Number(order.plan_fee) > 0 || (order.plan_snapshot != null && order.plan_snapshot !== "");
            return (
            <AccountCard key={order.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-medium text-[color:var(--acc-text)]">{order.order_ref}</span>
                <Badge variant={statusVariant[order.order_status] || "neutral"}>
                  {order.order_status}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm text-[color:var(--acc-text-dim)]">
                <span>RM {Number(order.total_amount).toFixed(2)}</span>
                <span>{new Date(order.created_at).toLocaleDateString(locale === "zh" ? "zh-MY" : locale === "ms" ? "ms-MY" : "en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</span>
              </div>
              <div className="mt-3 space-y-2 border-t border-[color:var(--acc-border)] pt-3 text-sm text-[color:var(--acc-text-dim)]">
                <div className="flex justify-between gap-3"><span>{labels.sim}</span><span>RM {Number(order.sim_fee).toFixed(2)}</span></div>
                {snapshot ? (
                  <div className="space-y-1">
                    <div className="flex justify-between gap-3"><span>{labels.plan}: <strong className="text-[color:var(--acc-text)]">{snapshot.plan.name}</strong></span><span className="shrink-0">RM {Number(order.plan_fee).toFixed(2)}</span></div>
                    <p className="text-xs">{snapshot.plan.dataGB}GB {labels.data} · {snapshot.plan.validityDays} {labels.days} · {snapshot.plan.hotspotMode === "shared" ? labels.shared : `${snapshot.plan.hotspotGB}GB ${labels.hotspot}`}{snapshot.plan.roamingGB > 0 ? ` · ${snapshot.plan.roamingGB}GB ${labels.roaming}` : ""}</p>
                    <Badge variant={order.plan_fulfilled_at ? "success" : "warning"}>{order.plan_fulfilled_at ? labels.activated : labels.pending}</Badge>
                    {!order.plan_fulfilled_at && <p className="text-xs">{labels.activationInfo}</p>}
                  </div>
                ) : hasPlanRecord ? (
                  <div><div className="flex justify-between gap-3"><span>{labels.plan}</span><span>RM {Number(order.plan_fee).toFixed(2)}</span></div><p className="text-xs">{locale === "zh" ? "已保存的配套详情暂时无法读取，请联系 Eastel 核实。" : locale === "ms" ? "Butiran pelan tersimpan tidak tersedia. Hubungi Eastel untuk pengesahan." : "Saved plan details are unavailable. Contact Eastel to verify them."}</p></div>
                ) : <p>{labels.simOnly}</p>}
                <div className="flex justify-between gap-3"><span>{labels.delivery}</span><span>RM {Number(order.delivery_fee).toFixed(2)}</span></div>
                {Number(order.voucher_discount) > 0 && <div className="flex justify-between gap-3"><span>{labels.discount}</span><span>−RM {Number(order.voucher_discount).toFixed(2)}</span></div>}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <Badge variant={order.payment_status === "paid" ? "success" : order.payment_status === "failed" ? "error" : "warning"}>{order.payment_status === "paid" ? labels.paid : order.payment_status === "failed" ? labels.failed : labels.unpaid}</Badge>
                  <Link href={`/${locale}/account/orders/${order.id}/invoice`} className="font-medium text-cyan-600 underline underline-offset-4">{labels.invoice}</Link>
                </div>
              </div>
              {order.tracking_number && (
                <p className="mt-2 text-sm text-[color:var(--acc-text-dim)]">
                  Tracking: <span className="font-mono text-[color:var(--acc-text-muted)]">{order.tracking_number}</span>
                </p>
              )}
              {(order.payment_status === "pending" || order.payment_status === "failed") && order.bill_code && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-amber-400">
                    {order.payment_status === "failed"
                      ? (locale === "zh" ? "可使用原付款单重试" : locale === "ms" ? "Cuba semula bil pembayaran asal" : "Retry the original payment bill")
                      : t(translations, "account.paymentPending", "Payment pending")}
                  </span>
                  <PayNowButton
                    billCode={order.bill_code}
                    label={t(translations, "account.payNow", "Pay Now")}
                    busyLabel={t(translations, "account.payChecking", "Checking…")}
                  />
                </div>
              )}
            </AccountCard>
          );})}
        </div>
      )}
    </div>
  );
}

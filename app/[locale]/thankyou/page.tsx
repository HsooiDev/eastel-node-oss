import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionCookie } from "@/lib/cookies";
import { validateSession } from "@/lib/session";
import db from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { isValidLocale } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { SITE_URL } from "@/lib/site";
import { Badge } from "@/components/ui/badge";
import type { RowDataPacket } from "mysql2/promise";
import { getOrderPlanSnapshot } from "@/lib/order-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ThankYouPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string; status?: string }>;
}

export async function generateMetadata({ params }: ThankYouPageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  return buildMetadata({
    title: t(translations, "thankyou.title", "Order Confirmation — Eastel Mobile"),
    description: t(translations, "thankyou.desc", "Your Eastel Mobile order has been placed."),
    locale,
    canonical: `${SITE_URL}/${locale}/thankyou`,
    noIndex: true,
  });
}

const statusVariant: Record<
  string,
  "success" | "warning" | "error" | "neutral"
> = {
  paid: "success",
  pending: "warning",
  failed: "error",
};

export default async function ThankYouPage({
  params,
  searchParams,
}: ThankYouPageProps) {
  const { locale } = await params;
  if (!isValidLocale(locale)) redirect("/ms/thankyou");

  const resolvedLocale = locale as Locale;
  const translations = await getTranslations(resolvedLocale);
  const { ref } = await searchParams;

  if (!ref) {
    redirect(`/${locale}/plans`);
  }

  const sessionId = await getSessionCookie();
  if (!sessionId) redirect(`/${locale}/account/login`);
  const session = await validateSession(sessionId);
  if (!session) redirect(`/${locale}/account/login`);

  const [orders] = await db.query<RowDataPacket[]>(
    `SELECT id, order_ref, sim_fee, plan_fee, plan_snapshot, plan_fulfilled_at,
            delivery_fee, voucher_discount, total_amount, payment_status, order_status, created_at
     FROM orders
     WHERE order_ref = ? AND customer_id = ?
     LIMIT 1`,
    [ref, session.customerId]
  );

  if (orders.length === 0) {
    redirect(`/${locale}/account/orders`);
  }

  const order = orders[0];
  const snapshot = getOrderPlanSnapshot(order.plan_snapshot);
  const hasPlanRecord = Number(order.plan_fee) > 0 || (order.plan_snapshot != null && order.plan_snapshot !== "");
  const labels = locale === "zh" ? { sim: "电话卡", plan: "已购买配套", delivery: "运费", discount: "优惠折扣", simOnly: "仅购买电话卡，没有购买配套", activationInfo: "收到电话卡并在您的 App 注册后，Eastel 会为您代购开通已付款的配套。", activated: "配套已代购开通", pending: "配套待代购开通", invoice: "查看订单／Invoice" }
    : locale === "ms" ? { sim: "Kad SIM", plan: "Pelan dibeli", delivery: "Penghantaran", discount: "Diskaun", simOnly: "Kad SIM sahaja; tiada pelan dibeli", activationInfo: "Selepas menerima SIM dan mendaftar dalam aplikasi anda, Eastel akan membeli dan mengaktifkan pelan yang telah dibayar.", activated: "Pelan diaktifkan", pending: "Pelan menunggu pengaktifan", invoice: "Lihat pesanan / invois" }
      : { sim: "SIM card", plan: "Purchased plan", delivery: "Delivery", discount: "Discount", simOnly: "SIM card only; no plan purchased", activationInfo: "After receiving your SIM and registering it in your app, Eastel will purchase and activate your paid plan.", activated: "Plan activated", pending: "Awaiting plan activation", invoice: "View order / invoice" };

  return (
    <div className="container-narrow py-16 sm:py-20 text-center">
      <div className="mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-full bg-brand-subtle">
        {order.payment_status === "paid" ? (
          <svg
            className="h-10 w-10 text-brand"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : order.payment_status === "failed" ? (
          <svg
            className="h-10 w-10 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg
            className="h-10 w-10 text-yellow-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
      </div>

      <h1 className="text-[length:var(--text-3xl)] sm:text-[length:var(--text-display-sm)] font-extrabold tracking-tight text-text-primary mb-3">
        {order.payment_status === "paid"
          ? t(translations, "thankyou.titlePaid", "Payment Successful!")
          : order.payment_status === "failed"
            ? t(translations, "thankyou.titleFailed", "Payment Failed")
            : t(translations, "thankyou.titlePending", "Order Received")}
      </h1>

      <p className="text-foreground-muted mb-8">
        {order.payment_status === "paid"
          ? t(
              translations,
              "thankyou.descPaid",
              "Thank you for your purchase. Your order is being processed."
            )
          : order.payment_status === "failed"
            ? t(
                translations,
                "thankyou.descFailed",
                "Your payment could not be processed. Please try again."
              )
            : t(
                translations,
                "thankyou.descPending",
                "Your order has been placed. We will process it shortly."
              )}
      </p>

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 sm:p-7 text-left mb-8">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">{labels.sim}</span><span className="text-sm">RM {Number(order.sim_fee).toFixed(2)}</span>
          </div>
          {snapshot ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3"><span className="text-sm text-foreground-muted">{labels.plan}: <strong>{snapshot.plan.name}</strong></span><span className="shrink-0 text-sm">RM {Number(order.plan_fee).toFixed(2)}</span></div>
              <Badge variant={order.plan_fulfilled_at ? "success" : "warning"}>{order.plan_fulfilled_at ? labels.activated : labels.pending}</Badge>
              {!order.plan_fulfilled_at && <p className="text-sm text-foreground-muted">{labels.activationInfo}</p>}
            </div>
          ) : hasPlanRecord ? <div><div className="flex items-center justify-between"><span className="text-sm text-foreground-muted">{labels.plan}</span><span className="text-sm">RM {Number(order.plan_fee).toFixed(2)}</span></div><p className="text-sm text-foreground-muted">{locale === "zh" ? "已保存的配套详情暂时无法读取，请联系 Eastel 核实。" : locale === "ms" ? "Butiran pelan tersimpan tidak tersedia. Hubungi Eastel untuk pengesahan." : "Saved plan details are unavailable. Contact Eastel to verify them."}</p></div> : <p className="text-sm text-foreground-muted">{labels.simOnly}</p>}
          <div className="flex items-center justify-between"><span className="text-sm text-foreground-muted">{labels.delivery}</span><span className="text-sm">RM {Number(order.delivery_fee).toFixed(2)}</span></div>
          {Number(order.voucher_discount) > 0 && <div className="flex items-center justify-between"><span className="text-sm text-foreground-muted">{labels.discount}</span><span className="text-sm">−RM {Number(order.voucher_discount).toFixed(2)}</span></div>}

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">
              {t(translations, "thankyou.orderRef", "Order Reference")}
            </span>
            <span className="font-mono text-sm font-medium">
              {order.order_ref}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">
              {t(translations, "thankyou.total", "Total")}
            </span>
            <span className="font-medium">
              RM {Number(order.total_amount).toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">
              {t(translations, "thankyou.paymentStatus", "Payment")}
            </span>
            <Badge variant={statusVariant[order.payment_status] || "neutral"}>
              {order.payment_status}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">
              {t(translations, "thankyou.orderStatus", "Status")}
            </span>
            <Badge variant="neutral">{order.order_status}</Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">
              {t(translations, "thankyou.date", "Date")}
            </span>
            <span className="text-sm">
              {new Date(order.created_at).toLocaleDateString(
                locale === "ms" ? "ms-MY" : locale === "zh" ? "zh-CN" : "en-US",
                { year: "numeric", month: "long", day: "numeric" }
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href={`/${locale}/account/orders/${order.id}/invoice`} className="inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] border border-border-strong bg-surface px-6 text-sm font-semibold text-text-primary hover:bg-surface-raised transition-colors">{labels.invoice}</Link>
        <Link
          href={`/${locale}/account/orders`}
          className="inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] bg-brand px-6 text-sm font-semibold text-white shadow-[var(--shadow-sm)] hover:bg-brand-hover hover:shadow-[var(--shadow-glow-brand)] transition-all"
        >
          {t(translations, "thankyou.viewOrders", "View My Orders")}
        </Link>
        <Link
          href={`/${locale}/plans`}
          className="inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] border border-border-strong bg-surface px-6 text-sm font-semibold text-text-primary hover:bg-surface-raised transition-colors"
        >
          {t(translations, "thankyou.continue", "Continue Shopping")}
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

interface TrackedOrder {
  order_ref: string;
  order_status: string;
  payment_status: string;
  courier_name: string | null;
  tracking_number: string | null;
  created_at: string;
}

export default function TrackForm() {
  const { t } = useTranslation();
  const [orderRef, setOrderRef] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrorMsg("");
    setOrder(null);
    try {
      const res = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ref: orderRef, phone }),
      });
      const data = await res.json();
      if (data.status === "success" && data.order) {
        setOrder(data.order as TrackedOrder);
      } else {
        setErrorMsg(
          data.message ||
            t("track.notFound", "No order found for that reference and phone number.")
        );
      }
    } catch {
      setErrorMsg(t("track.notFound", "No order found for that reference and phone number."));
    } finally {
      setLoading(false);
    }
  }

  function statusLabel(value: string): string {
    return t(`track.st.${value}`, value);
  }
  function paymentLabel(value: string): string {
    return t(`track.pay.${value}`, value);
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-muted outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand/30";

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="track-ref" className="mb-1.5 block text-sm font-medium text-foreground">
            {t("track.refLabel", "Order Reference")}
          </label>
          <input
            id="track-ref"
            type="text"
            required
            maxLength={50}
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            placeholder={t("track.refPlaceholder", "Your order reference")}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="track-phone" className="mb-1.5 block text-sm font-medium text-foreground">
            {t("track.phoneLabel", "Phone Number")}
          </label>
          <input
            id="track-phone"
            type="tel"
            required
            maxLength={20}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0123456789"
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !orderRef.trim() || !phone.trim()}
          className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("track.searching", "Searching…") : t("track.submit", "Track Order")}
        </button>
      </form>

      {errorMsg && (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          {errorMsg}
        </p>
      )}

      {order && (
        <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">{t("track.refLabel", "Order Reference")}</dt>
            <dd className="font-semibold text-foreground">{order.order_ref}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">{t("track.result.status", "Order Status")}</dt>
            <dd className="font-semibold text-foreground">{statusLabel(order.order_status)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">{t("track.result.payment", "Payment")}</dt>
            <dd className="font-semibold text-foreground">{paymentLabel(order.payment_status)}</dd>
          </div>
          {order.courier_name && (
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">{t("track.result.courier", "Courier")}</dt>
              <dd className="font-semibold text-foreground">{order.courier_name}</dd>
            </div>
          )}
          {order.tracking_number && (
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">{t("track.result.tracking", "Tracking No.")}</dt>
              <dd className="break-all font-semibold text-foreground">{order.tracking_number}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">{t("track.result.date", "Order Date")}</dt>
            <dd className="font-semibold text-foreground">
              {new Date(order.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

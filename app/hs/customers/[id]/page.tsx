"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface CustomerData {
  id: number;
  name: string;
  email: string;
  phone: string;
  is_temp_pass: number;
  created_at: string;
}

interface OrderData {
  order_ref: string;
  total_amount: string;
  payment_status: string;
  order_status: string;
  courier_name: string | null;
  delivery_address: string | null;
  postcode: string | null;
  zone: string | null;
  tracking_number: string | null;
  created_at: string;
  product_name: string | null;
}

interface ReviewData {
  id: number;
  rating: number;
  comment: string | null;
  status: string;
  created_at: string;
  product_name: string | null;
}

interface VerifyCode {
  code: string;
  verified: number;
  expires_at: string;
  is_expired: boolean;
  is_verified: boolean;
}

const paymentBadge: Record<string, "success" | "warning" | "error" | "neutral"> = {
  paid: "success",
  pending: "warning",
  failed: "error",
};

const orderBadge: Record<string, "success" | "warning" | "error" | "neutral"> = {
  delivered: "success",
  shipped: "warning",
  processing: "warning",
  cancelled: "error",
};

function fmtDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AvatarChip({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const cls = size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${cls}`}
      style={{ background: "linear-gradient(135deg,#9b7bff,#60a5fa)" }}
    >
      {initial}
    </span>
  );
}

function VerifyCodeBlock({ vc }: { vc: VerifyCode | null }) {
  const [copied, setCopied] = useState(false);

  function copy(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  if (!vc) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-high p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
          Verification Code
        </p>
        <p className="text-sm text-on-surface-variant">No code requested</p>
      </div>
    );
  }

  const isActive = !vc.is_verified && !vc.is_expired;
  const digits = (vc.code || "------").toString().split("");

  let badge: React.ReactNode;
  let statusNode: React.ReactNode;
  if (vc.is_verified) {
    badge = (
      <span className="rounded-full bg-green-400/15 px-2 py-0.5 text-xs font-bold text-green-400">
        Verified
      </span>
    );
    statusNode = <span className="text-xs font-bold text-green-400">✓ Customer used this code</span>;
  } else if (isActive) {
    badge = (
      <span className="rounded-full bg-purple-400/15 px-2 py-0.5 text-xs font-bold text-purple-400">
        Active
      </span>
    );
    statusNode = (
      <span className="text-xs font-bold text-green-400">
        ⏱ Expires {new Date(vc.expires_at).toLocaleString("en-MY")}
      </span>
    );
  } else {
    badge = (
      <span className="rounded-full bg-yellow-400/15 px-2 py-0.5 text-xs font-bold text-yellow-400">
        Expired
      </span>
    );
    statusNode = (
      <span className="text-xs text-on-surface-variant">
        Expired {new Date(vc.expires_at).toLocaleString("en-MY")}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-high p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Verification Code
        </p>
        {badge}
      </div>
      <div className="mb-3 flex justify-center gap-1.5">
        {digits.map((d, i) => (
          <div
            key={i}
            className={`flex h-12 w-10 items-center justify-center rounded-lg border font-mono text-xl font-bold transition-colors ${
              vc.is_verified
                ? "border-teal-400/50 bg-teal-400/10 text-teal-400"
                : isActive
                ? "border-purple-400/50 bg-purple-400/10 text-purple-400"
                : "border-outline-variant bg-surface-container text-on-surface-variant"
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {statusNode}
        {isActive && (
          <button
            onClick={() => copy(vc.code)}
            className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface hover:border-purple-400 hover:text-purple-400 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [verifyCode, setVerifyCode] = useState<VerifyCode | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`);
      const data = await res.json();
      if (data.status === "success" && data.customer) {
        setCustomer(data.customer);
        setOrders(data.orders || []);
        setReviews(data.reviews || []);
        setVerifyCode(data.verify_code ?? null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <p className="text-on-surface-variant">Loading…</p>;
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-on-surface-variant mb-4">Customer not found.</p>
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-outline-variant px-4 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
        >
          ← Go Back
        </button>
      </div>
    );
  }

  // LTV: sum of paid non-cancelled orders
  const ltv = orders
    .filter(
      (o) =>
        o.payment_status === "paid" &&
        o.order_status !== "cancelled" &&
        o.order_status !== "failed"
    )
    .reduce((sum, o) => sum + parseFloat(o.total_amount || "0"), 0);

  // Latest address from most recent order that has one
  const latestWithAddr = orders.find((o) => o.delivery_address);

  return (
    <div className="space-y-6">
      {/* Back */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-on-surface">{customer.name}</h1>
      </div>

      {/* Hero card */}
      <div className="rounded-xl border border-outline-variant bg-surface-container p-5">
        <div className="flex items-start gap-4">
          <AvatarChip name={customer.name} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-on-surface">{customer.name || "—"}</p>
            <a
              href={`mailto:${customer.email}`}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors break-all"
            >
              {customer.email || "—"}
            </a>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Lifetime Value
            </p>
            <p className="text-xl font-bold text-green-400">RM {ltv.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Phone
              </p>
              {customer.phone ? (
                <a
                  href={`tel:${customer.phone}`}
                  className="font-semibold text-on-surface border-b border-dashed border-on-surface-variant/40 hover:border-on-surface transition-colors"
                >
                  {customer.phone}
                </a>
              ) : (
                <span className="font-semibold text-on-surface">—</span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Joined
              </p>
              <p className="font-semibold text-on-surface">{fmtDate(customer.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Password
              </p>
              {Number(customer.is_temp_pass) === 1 ? (
                <span className="rounded-full bg-yellow-400/15 px-2 py-0.5 text-xs font-bold text-yellow-400">
                  Temp — not changed
                </span>
              ) : (
                <span className="rounded-full bg-green-400/15 px-2 py-0.5 text-xs font-bold text-green-400">
                  Set
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Orders
              </p>
              <p className="text-xl font-bold text-teal-400">{orders.length}</p>
            </div>
          </div>
          {latestWithAddr && (
            <div className="mt-4 border-t border-outline-variant pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Recent Delivery Address
              </p>
              <p className="text-sm text-on-surface leading-relaxed">
                {latestWithAddr.delivery_address}
                <br />
                {latestWithAddr.postcode} {latestWithAddr.zone}
              </p>
            </div>
          )}
        </div>

        {/* Verify code */}
        <VerifyCodeBlock vc={verifyCode} />
      </div>

      {/* Order history */}
      <div className="rounded-xl border border-outline-variant bg-surface-container overflow-hidden">
        <div className="border-b border-outline-variant px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">
            Order History
          </h2>
        </div>
        {orders.length === 0 ? (
          <p className="p-6 text-center text-sm text-on-surface-variant">No orders yet</p>
        ) : (
          <div className="divide-y divide-outline-variant/50">
            {orders.map((o, i) => {
              const faded = o.order_status === "cancelled" || o.payment_status === "failed";
              return (
                <div
                  key={i}
                  className={`px-4 py-3 transition-opacity ${faded ? "opacity-50 hover:opacity-100" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-purple-400">
                      {o.order_ref}
                    </span>
                    <div className="flex gap-1.5">
                      <Badge variant={paymentBadge[o.payment_status] ?? "neutral"}>
                        {o.payment_status}
                      </Badge>
                      <Badge variant={orderBadge[o.order_status] ?? "neutral"}>
                        {o.order_status}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-on-surface-variant">
                    {o.courier_name || "—"} · RM{parseFloat(o.total_amount || "0").toFixed(2)} ·{" "}
                    {fmtDate(o.created_at)}
                    {o.tracking_number && (
                      <>
                        {" · "}
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(o.tracking_number)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-400 hover:underline"
                        >
                          {o.tracking_number} ↗
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface-container overflow-hidden">
          <div className="border-b border-outline-variant px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">
              Reviews ({reviews.length})
            </h2>
          </div>
          <div className="divide-y divide-outline-variant/50">
            {reviews.map((r) => (
              <div key={r.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={i < r.rating ? "text-yellow-400" : "text-on-surface-variant/30"}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface">{r.comment || "—"}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    {r.product_name || "—"} · {fmtDate(r.created_at)}
                  </p>
                </div>
                <Badge
                  variant={
                    r.status === "approved"
                      ? "success"
                      : r.status === "rejected"
                      ? "error"
                      : "warning"
                  }
                >
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

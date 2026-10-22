"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOrderPlanSnapshot } from "@/lib/order-plan-snapshot";

interface OrderRow {
  id: number;
  order_ref: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  delivery_address: string | null;
  postcode: string | null;
  zone: string | null;
  delivery_fee: string | number;
  sim_fee: string | number;
  plan_fee: string | number;
  plan_snapshot: unknown;
  plan_fulfilled_at: string | null;
  plan_fulfilled_by: number | null;
  voucher_code: string | null;
  voucher_discount: string | number;
  total_amount: string | number;
  payment_status: "pending" | "paid" | "failed";
  order_status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  tracking_number: string | null;
  bill_code: string | null;
  courier_name: string | null;
  lang: string;
  source: string | null;
  created_at: string;
  // customer account info (may be null for WA orders)
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
}

interface OrderSummary {
  total_orders: number;
  paid_orders: number;
  pending_payment: number;
  shipped_orders: number;
  paid_revenue: string;
  today_revenue: string;
}

const paymentBadge: Record<string, "success" | "warning" | "error" | "neutral"> = {
  paid: "success",
  pending: "warning",
  failed: "error",
};

const orderBadge: Record<string, "info" | "success" | "warning" | "error" | "neutral"> = {
  pending: "neutral",
  processing: "info",
  shipped: "warning",
  delivered: "success",
  cancelled: "error",
};

const UPDATABLE_ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)?.[1] ?? "";
}

async function adminPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": getCsrfToken(),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function OrdersPage() {
  return <Suspense fallback={<p className="text-on-surface-variant">Loading orders…</p>}><OrdersRoute /></Suspense>;
}
function OrdersRoute() {
  const params = useSearchParams();
  return <OrdersWorkspace key={params.toString()} initialStatus={params.get("status") || ""} initialPayment={params.get("paymentStatus") || ""} initialSearch={params.get("search") || ""} />;
}
function OrdersWorkspace({ initialStatus, initialPayment, initialSearch }: { initialStatus: string; initialPayment: string; initialSearch: string }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState(UPDATABLE_ORDER_STATUSES.includes(initialStatus as typeof UPDATABLE_ORDER_STATUSES[number]) ? initialStatus : "");
  const [paymentFilter, setPaymentFilter] = useState(["pending", "paid", "failed"].includes(initialPayment) ? initialPayment : "");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState(initialSearch);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [courierError, setCourierError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<OrderSummary>({
    total_orders: 0, paid_orders: 0, pending_payment: 0, shipped_orders: 0,
    paid_revenue: "0", today_revenue: "0",
  });
  const [couriers, setCouriers] = useState<string[]>([]);
  const orderRequest = useRef(0);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchOrders = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++orderRequest.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (paymentFilter) params.set("paymentStatus", paymentFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (searchFilter) params.set("search", searchFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/admin/orders?${params}`, { signal });
      const data = await res.json();
      if (!res.ok || data.status !== "success") throw new Error(data.message || "Failed to load orders.");
      if (signal?.aborted || requestId !== orderRequest.current) return;
      setOrders(data.orders ?? data.data?.orders ?? []);
      setTotalPages(data.pagination?.totalPages ?? data.data?.pagination?.totalPages ?? 1);
      setSummary(data.summary ?? { total_orders: 0, paid_orders: 0, pending_payment: 0, shipped_orders: 0, paid_revenue: "0", today_revenue: "0" });
      setLoadError("");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (signal?.aborted || requestId !== orderRequest.current) return;
      setLoadError(e instanceof Error ? e.message : "Failed to load orders.");
    } finally {
      if (!signal?.aborted && requestId === orderRequest.current) setLoading(false);
    }
  }, [page, statusFilter, paymentFilter, sourceFilter, searchFilter, startDate, endDate]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchOrders(controller.signal);
    return () => controller.abort();
  }, [fetchOrders]);

  useEffect(() => {
    async function fetchCouriers() {
      try {
        const response = await fetch("/api/admin/couriers");
        const data = await response.json();
        if (!response.ok || data.status !== "success") throw new Error(data.message || "Failed to load couriers.");
        setCouriers((data.couriers ?? []).filter((courier: { is_active: number }) => Number(courier.is_active) === 1).map((courier: { name: string }) => courier.name));
        setCourierError("");
      } catch (e) {
        setCourierError(e instanceof Error ? e.message : "Failed to load couriers.");
      }
    }
    void fetchCouriers();
  }, []);

  function buildQuery(format?: "csv") {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (paymentFilter) params.set("paymentStatus", paymentFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (searchFilter) params.set("search", searchFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (format) params.set("format", format);
    return params;
  }

  function clearFilters() {
    setStatusFilter(""); setPaymentFilter(""); setSourceFilter(""); setSearchFilter("");
    setStartDate(""); setEndDate(""); setPage(1);
  }

  async function exportCsv() {
    setExporting(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/admin/orders?${buildQuery("csv")}`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Could not export filtered orders.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `eastel-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not export filtered orders.");
    } finally {
      setExporting(false);
    }
  }

  async function updateOrder(order: OrderRow, newStatus: string, tracking: string, courierName: string) {
    const key = `upd-${order.id}`;
    setActionLoading((p) => ({ ...p, [key]: true }));
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
    const statusPayload = validStatuses.includes(newStatus) ? newStatus : undefined;
    try {
      const data = await adminPost("/api/admin/orders", {
        orderId: order.id,
        ...(statusPayload ? { orderStatus: statusPayload } : {}),
        trackingNumber: tracking,
        courierName,
      });
      if (data.status === "success") {
        showToast("Order updated ✓");
        void fetchOrders();
      } else {
        showToast(data.message || "Update failed", false);
      }
    } catch {
      showToast("Could not update order.", false);
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  }

  async function resendPayLink(order: OrderRow) {
    const key = `resend-${order.id}`;
    setActionLoading((p) => ({ ...p, [key]: true }));
    try {
      const data = await adminPost("/api/admin/orders/resend-payment", { orderId: order.id });
      if (data.status === "success") showToast("📤 Payment link resent via WhatsApp ✓");
      else showToast(data.message || "Resend failed", false);
    } catch {
      showToast("Could not resend payment link.", false);
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  }

  async function regenPayLink(order: OrderRow) {
    if (!confirm(`Create a NEW ToyyibPay bill for order ${order.order_ref}?`)) return;
    const key = `regen-${order.id}`;
    setActionLoading((p) => ({ ...p, [key]: true }));
    try {
      const data = await adminPost("/api/admin/orders/regenerate-payment", { orderId: order.id });
      if (data.status === "success" || data.status === "warning") {
        showToast(data.message || "New bill created ✓", data.status !== "warning");
        if (data.pay_url) navigator.clipboard?.writeText(data.pay_url).catch(() => {});
        setTimeout(() => fetchOrders(), 800);
      } else {
        showToast(data.message || "Failed", false);
      }
    } catch {
      showToast("Could not confirm bill creation. Refresh orders before trying again.", false);
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  }

  async function fulfillPlan(order: OrderRow) {
    const snapshot = getOrderPlanSnapshot(order.plan_snapshot);
    if (!snapshot || !confirm(`Have you completed ${snapshot.plan.name} (RM ${Number(order.plan_fee).toFixed(2)}) for ${order.order_ref} in your app after the customer registered their SIM? This only records completion; it does not buy or activate a plan.`)) return;
    const key = `plan-${order.id}`;
    setActionLoading((previous) => ({ ...previous, [key]: true }));
    try {
      const data = await adminPost("/api/admin/orders/fulfill-plan", { order_id: order.id });
      if (data.status !== "success") throw new Error(data.message || "Could not record plan activation.");
      showToast(data.already_fulfilled ? "Plan activation was already recorded." : "Plan activation recorded ✓");
      void fetchOrders();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not record plan activation.", false);
    } finally {
      setActionLoading((previous) => ({ ...previous, [key]: false }));
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_TOYYIBPAY_BASE_URL || "https://toyyibpay.com";

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed", top: 20, right: 20, zIndex: 9999,
            background: toast.ok ? "#166534" : "#7f1d1d",
            color: "#fff", padding: "10px 18px", borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,.4)", fontSize: ".9rem",
          }}
        >
          {toast.msg}
        </div>
      )}

      <div><h1>Orders</h1><p className="mt-2 text-sm text-on-surface-variant">Manage payments, delivery and fulfilment in one place.</p></div>
      {/* Header + filters */}
      <div className="admin-order-filters flex flex-wrap items-center gap-3" role="region" aria-label="Order filters">


        <select
          aria-label="Filter by order source"
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
        >
          <option value="">All Sources</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="website">Website</option>
        </select>

        <select
          aria-label="Filter by payment status"
          value={paymentFilter}
          onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
        >
          <option value="">All Payments</option>
          {(["pending", "paid", "failed"] as const).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <select
          aria-label="Filter by order status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
        >
          <option value="">All Statuses</option>
          {(["pending","processing","shipped","delivered","cancelled"] as const).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search name / ref / email / phone / address…"
          aria-label="Search orders"
          value={searchFilter}
          onChange={(e) => { setSearchFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface w-52"
        />
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          From <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-on-surface" />
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          To <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-on-surface" />
        </label>
        <Button variant="secondary" size="sm" onClick={clearFilters}>Clear</Button>
        <Button variant="secondary" size="sm" onClick={() => void fetchOrders()} loading={loading}>Refresh</Button>
        <Button variant="secondary" size="sm" onClick={() => void exportCsv()} loading={exporting}>Export CSV</Button>
      </div>

      {loadError && (
        <p role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">
          {loadError}{orders.length > 0 ? " Showing the last successfully loaded results." : ""}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-live="polite">
        <Card><CardContent><p className="text-xs text-on-surface-variant">Filtered orders</p><p className="text-lg font-semibold text-on-surface">{summary.total_orders}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-on-surface-variant">Paid orders</p><p className="text-lg font-semibold text-on-surface">{summary.paid_orders}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-on-surface-variant">Pending payment</p><p className="text-lg font-semibold text-on-surface">{summary.pending_payment}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-on-surface-variant">Shipped orders</p><p className="text-lg font-semibold text-on-surface">{summary.shipped_orders}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-on-surface-variant">Paid revenue · filtered</p><p className="text-lg font-semibold text-on-surface">RM {Number(summary.paid_revenue).toFixed(2)}</p><p className="text-xs text-on-surface-variant">Today: RM {Number(summary.today_revenue).toFixed(2)}</p></CardContent></Card>
      </div>
      {courierError && <p role="status" className="text-sm text-error">Courier choices could not be loaded: {courierError}</p>}

      <Card padding="none">
        <CardContent>
          {loading ? (
            orders.length > 0 ? <p className="p-3 text-center text-on-surface-variant">Refreshing…</p> : <p className="p-6 text-center text-on-surface-variant">Loading…</p>
          ) : orders.length === 0 ? (
            loadError ? <p className="p-6 text-center text-error">Orders could not be loaded.</p> : <p className="p-6 text-center text-on-surface-variant">No orders match these filters.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <p className="admin-table-scroll-note">Scroll across for payment, tracking and updates.</p>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Order Ref</TableHeaderCell>
                    <TableHeaderCell>Date</TableHeaderCell>
                    <TableHeaderCell>Source</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Email</TableHeaderCell>
                    <TableHeaderCell>Phone</TableHeaderCell>
                    <TableHeaderCell>Address</TableHeaderCell>
                    <TableHeaderCell>Zone</TableHeaderCell>
                    <TableHeaderCell align="right">SIM</TableHeaderCell>
                    <TableHeaderCell>Purchased Plan</TableHeaderCell>
                    <TableHeaderCell align="right">Delivery</TableHeaderCell>
                    <TableHeaderCell align="right">Total</TableHeaderCell>
                    <TableHeaderCell>Payment</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Payment Link</TableHeaderCell>
                    <TableHeaderCell>Tracking</TableHeaderCell>
                    <TableHeaderCell>Update</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((order) => (
                    <OrderTableRow
                      key={order.id}
                      order={order}
                      baseUrl={baseUrl}
                      actionLoading={actionLoading}
                      couriers={couriers}
                      onUpdate={updateOrder}
                      onResend={resendPayLink}
                      onRegen={regenPayLink}
                      onFulfillPlan={fulfillPlan}
                      paymentBadge={paymentBadge}
                      orderBadge={orderBadge}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-on-surface-variant">Page {page} of {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Order Row Component ───────────────────────────────────────

function OrderTableRow({
  order, baseUrl, actionLoading, couriers, onUpdate, onResend, onRegen, onFulfillPlan, paymentBadge, orderBadge,
}: {
  order: OrderRow;
  baseUrl: string;
  actionLoading: Record<string, boolean>;
  couriers: string[];
  onUpdate: (order: OrderRow, status: string, tracking: string, courierName: string) => void;
  onResend: (order: OrderRow) => void;
  onRegen: (order: OrderRow) => void;
  onFulfillPlan: (order: OrderRow) => void;
  paymentBadge: Record<string, "success" | "warning" | "error" | "neutral">;
  orderBadge: Record<string, "info" | "success" | "warning" | "error" | "neutral">;
}) {
  const [newStatus, setNewStatus] = useState<typeof UPDATABLE_ORDER_STATUSES[number]>(
    UPDATABLE_ORDER_STATUSES.includes(order.order_status as typeof UPDATABLE_ORDER_STATUSES[number])
      ? (order.order_status as typeof UPDATABLE_ORDER_STATUSES[number])
      : "pending"
  );
  const [tracking, setTracking] = useState(order.tracking_number ?? "");
  const [courierName, setCourierName] = useState(order.courier_name ?? "");

  useEffect(() => {
    setNewStatus(UPDATABLE_ORDER_STATUSES.includes(order.order_status as typeof UPDATABLE_ORDER_STATUSES[number])
      ? (order.order_status as typeof UPDATABLE_ORDER_STATUSES[number])
      : "pending");
    setTracking(order.tracking_number ?? "");
    setCourierName(order.courier_name ?? "");
  }, [order.order_status, order.tracking_number, order.courier_name]);

  const isWA = order.source === "whatsapp";
  const isPending = order.payment_status === "pending";
  const displayName = order.full_name || order.customer_name || "—";
  const snapshot = getOrderPlanSnapshot(order.plan_snapshot);
  const hasPlanRecord = Number(order.plan_fee) > 0 || (order.plan_snapshot != null && order.plan_snapshot !== "");

  return (
    <TableRow>
      {/* Order Ref */}
      <TableCell className="font-mono text-xs whitespace-nowrap">
        <button
          onClick={() => navigator.clipboard.writeText(order.order_ref).catch(() => {})}
          title="Click to copy"
          className="admin-order-action"
        >
          {order.order_ref}
        </button>
      </TableCell>

      {/* Date */}
      <TableCell className="text-on-surface-variant whitespace-nowrap text-xs">
        {new Date(order.created_at).toLocaleDateString("en-MY")}
      </TableCell>

      {/* Source badge */}
      <TableCell>
        {isWA ? (
          <span className="admin-order-source">WhatsApp</span>
        ) : (
          <span className="admin-order-source">Website</span>
        )}
      </TableCell>

      {/* Name */}
      <TableCell className="font-semibold">{displayName}</TableCell>

      {/* Phone */}
      <TableCell className="text-xs">{order.email || order.customer_email || "—"}</TableCell>

      {/* Phone */}
      <TableCell className="text-xs whitespace-nowrap">
        {order.phone || order.customer_phone || "—"}
      </TableCell>

      {/* Delivery address */}
      <TableCell className="max-w-64 text-xs">{[order.delivery_address, order.postcode].filter(Boolean).join(", ") || "—"}</TableCell>

      {/* Zone */}
      <TableCell className="text-xs">{order.zone || "—"}</TableCell>

      <TableCell align="right" className="text-xs whitespace-nowrap">RM {Number(order.sim_fee).toFixed(2)}</TableCell>

      <TableCell className="min-w-56 text-xs">
        {snapshot ? (
          <div className="space-y-2">
            <p className="font-semibold">{snapshot.plan.name} · RM {Number(order.plan_fee).toFixed(2)}</p>
            <p className="text-on-surface-variant">{snapshot.plan.dataGB}GB data · {snapshot.plan.validityDays} days · {snapshot.plan.hotspotMode === "shared" ? "Shared hotspot" : `${snapshot.plan.hotspotGB}GB hotspot`}{snapshot.plan.roamingGB > 0 ? ` · ${snapshot.plan.roamingGB}GB roaming` : ""}</p>
            <Badge variant={order.plan_fulfilled_at ? "success" : "warning"}>{order.plan_fulfilled_at ? "Activated" : "Awaiting activation"}</Badge>
            {order.plan_fulfilled_at ? (
              <p className="text-on-surface-variant">{new Date(order.plan_fulfilled_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}{order.plan_fulfilled_by ? ` · Admin #${order.plan_fulfilled_by}` : ""}</p>
            ) : (
              <>
                <p className="text-on-surface-variant">Activate in your app after the customer registers their SIM.</p>
                {order.payment_status === "paid" && order.order_status !== "cancelled" ? (
                  <button className="admin-order-action" disabled={!!actionLoading[`plan-${order.id}`]} onClick={() => onFulfillPlan(order)}>{actionLoading[`plan-${order.id}`] ? "Saving…" : "Mark plan activated"}</button>
                ) : <p className="text-on-surface-variant">{order.order_status === "cancelled" ? "Order cancelled" : "Awaiting payment"}</p>}
              </>
            )}
          </div>
        ) : hasPlanRecord ? (
          <div className="space-y-1"><p className="font-semibold">Plan fee · RM {Number(order.plan_fee).toFixed(2)}</p><p className="text-error">Saved plan details unavailable. Check the order record before activation.</p></div>
        ) : <span className="text-on-surface-variant">SIM only · no plan purchased</span>}
      </TableCell>

      {/* Total */}
      <TableCell align="right" className="text-xs">RM {Number(order.delivery_fee).toFixed(2)}</TableCell>

      {/* Total */}
      <TableCell align="right" className="font-bold">
        RM {Number(order.total_amount).toFixed(2)}
        {Number(order.voucher_discount) > 0 && <p className="mt-1 text-xs font-normal text-on-surface-variant">Discount: −RM {Number(order.voucher_discount).toFixed(2)}{order.voucher_code ? ` (${order.voucher_code})` : ""}</p>}
      </TableCell>

      {/* Payment status */}
      <TableCell>
        <Badge variant={paymentBadge[order.payment_status] ?? "neutral"}>
          {order.payment_status}
        </Badge>
      </TableCell>

      {/* Order status */}
      <TableCell>
        <Badge variant={orderBadge[order.order_status] ?? "neutral"}>
          {order.order_status}
        </Badge>
      </TableCell>

      {/* Payment link (WA orders only) */}
      <TableCell>
        {isWA && order.bill_code ? (
          <div className="admin-payment-actions">
            <a
              href={`${baseUrl}/${order.bill_code}`}
              target="_blank"
              rel="noreferrer"
              className="admin-order-link"
            >
              {order.bill_code} <ExternalLink size={14} aria-hidden="true" />
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(`${baseUrl}/${order.bill_code}`).catch(() => {})}
              className="admin-order-link"
            >
              <Copy size={14} aria-hidden="true" /> Copy link
            </button>
            {isPending && (
              <>
                <button
                  disabled={!!actionLoading[`resend-${order.id}`]}
                  onClick={() => onResend(order)}
                  className="admin-order-action"
                >
                  {actionLoading[`resend-${order.id}`] ? "…" : "Resend"}
                </button>
                <button
                  disabled={!!actionLoading[`regen-${order.id}`]}
                  onClick={() => onRegen(order)}
                  className="admin-order-action"
                >
                  {actionLoading[`regen-${order.id}`] ? "…" : "New bill"}
                </button>
              </>
            )}
          </div>
        ) : isWA && isPending ? (
          <button
            disabled={!!actionLoading[`regen-${order.id}`]}
            onClick={() => onRegen(order)}
            className="admin-order-action"
          >
            {actionLoading[`regen-${order.id}`] ? "…" : "Generate"}
          </button>
        ) : (
          <span style={{ color: "#6b7280", fontSize: ".72rem" }}>—</span>
        )}
      </TableCell>

      {/* Tracking */}
      <TableCell className="text-xs">
        {order.tracking_number ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <a
              href={`https://app.easyparcel.com/tools/easytrack/summary/?awb=${encodeURIComponent(order.tracking_number)}`}
              target="_blank"
              rel="noreferrer"
              className="admin-order-link"
            >
              {order.tracking_number} <ExternalLink size={14} aria-hidden="true" />
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(order.tracking_number!).catch(() => {})}
              className="admin-order-link"
              aria-label={`Copy tracking number for ${order.order_ref}`}
            >
              <Copy size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <span style={{ color: "#6b7280" }}>—</span>
        )}
      </TableCell>

      {/* Update actions */}
      <TableCell>
        <div className="admin-order-actions">
          <input
            type="text"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            aria-label={`Tracking number for ${order.order_ref}`}
            placeholder="Tracking no."

          />
          <select
            aria-label={`Courier for ${order.order_ref}`}
            value={courierName}
            onChange={(e) => setCourierName(e.target.value)}

          >
            <option value="">Keep courier</option>
            {courierName && !couriers.includes(courierName) && <option value={courierName}>{courierName}</option>}
            {couriers.map((courier) => <option key={courier} value={courier}>{courier}</option>)}
          </select>
          <select
            aria-label={`Fulfilment status for ${order.order_ref}`}
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as typeof UPDATABLE_ORDER_STATUSES[number])}

          >
            {UPDATABLE_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            disabled={!!actionLoading[`upd-${order.id}`]}
            onClick={() => onUpdate(order, newStatus, tracking, courierName)}

          >
            {actionLoading[`upd-${order.id}`] ? "…" : "Update"}
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

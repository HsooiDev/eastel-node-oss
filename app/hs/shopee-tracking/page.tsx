"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getRefreshableShopeeOrders, refreshShopeeOrdersSequentially, requestShopeeTrackingScan } from "@/lib/shopee-tracking-batch";

interface ShopeeOrder {
  id: number;
  tracking_number: string;
  shopee_order_id: string | null;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  notes: string | null;
  tracking_data: string | null; // JSON events string
  created_at: string;
  updated_at: string;
}

export default function ShopeeTrackingPage() {
  const [orders, setOrders] = useState<ShopeeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ tracking_number: "", shopee_order_id: "", status: "pending", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  // Edit states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ shopee_order_id: "", status: "pending", notes: "" });

  // Fetching states
  const [fetchingIds, setFetchingIds] = useState<Record<number, boolean>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshStates, setRefreshStates] = useState<Record<number, { state: "fetching" | "success" | "error"; message: string }>>({});
  const [refreshSummary, setRefreshSummary] = useState("");

  const fetchOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch("/api/admin/shopee-tracking?action=get_shopee_orders");
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch {}
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function handleAddOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.tracking_number.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/shopee-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_shopee_order", ...formData }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setShowAddModal(false);
        setFormData({ tracking_number: "", shopee_order_id: "", status: "pending", notes: "" });
        fetchOrders();
      } else {
        alert(data.message || "Failed to add order.");
      }
    } catch {}
    setSubmitting(false);
  }

  async function handleUpdateOrder(id: number) {
    try {
      const res = await fetch("/api/admin/shopee-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_shopee_order", id, ...editForm }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setEditingId(null);
        fetchOrders();
      } else {
        alert(data.message || "Failed to update order.");
      }
    } catch {}
  }

  async function handleDeleteOrder(id: number) {
    if (!confirm("Are you sure you want to delete this tracking entry?")) return;
    try {
      const res = await fetch("/api/admin/shopee-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_shopee_order", id }),
      });
      const data = await res.json();
      if (data.status === "success") {
        fetchOrders();
      }
    } catch {}
  }

  async function handleScanOrder(id: number, trackingNumber: string) {
    if (refreshingAll) return;
    setFetchingIds((prev) => ({ ...prev, [id]: true }));
    setRefreshStates((prev) => ({ ...prev, [id]: { state: "fetching", message: "Refreshing tracking…" } }));
    try {
      const result = await requestShopeeTrackingScan({ id, tracking_number: trackingNumber });
      if (result.ok) {
        setRefreshStates((prev) => ({ ...prev, [id]: { state: "success", message: result.message } }));
        setOrders((prev) => prev.map((order) => order.id === id
          ? { ...order, status: result.orderStatus || order.status, tracking_data: result.trackingData ?? order.tracking_data }
          : order));
        void fetchOrders(false);
      } else {
        setRefreshStates((prev) => ({ ...prev, [id]: { state: "error", message: result.message || "No tracking updates found yet." } }));
      }
    } catch (cause) {
      const message = cause instanceof Error && (cause.name === "AbortError" || cause.name === "TimeoutError")
        ? "Tracking request timed out. Try again."
        : cause instanceof Error ? cause.message : "Tracking refresh failed.";
      setRefreshStates((prev) => ({ ...prev, [id]: { state: "error", message } }));
    } finally {
      setFetchingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function handleRefreshAll() {
    if (refreshingAll || Object.values(fetchingIds).some(Boolean)) return;

    const activeOrders = getRefreshableShopeeOrders(orders);
    setRefreshSummary("");
    if (activeOrders.length === 0) {
      setRefreshSummary("No active orders to refresh.");
      return;
    }

    setRefreshingAll(true);
    setRefreshStates({});
    let completed = 0;
    try {
      const results = await refreshShopeeOrdersSequentially(activeOrders, async (order) => {
        setRefreshStates((prev) => ({ ...prev, [order.id]: { state: "fetching", message: "Refreshing tracking…" } }));
        try {
          const result = await requestShopeeTrackingScan(order);
          if (!result.ok) return result;
          setOrders((prev) => prev.map((current) => current.id === order.id
            ? { ...current, status: result.orderStatus || current.status, tracking_data: result.trackingData ?? current.tracking_data }
            : current));
          return result;
        } catch (cause) {
          const message = cause instanceof Error && (cause.name === "AbortError" || cause.name === "TimeoutError")
            ? "Tracking request timed out. Try again."
            : cause instanceof Error ? cause.message : "Tracking refresh failed.";
          return { ok: false, message };
        }
      }, ({ order, result }) => {
        completed += 1;
        setRefreshStates((prev) => ({ ...prev, [order.id]: { state: result.ok ? "success" : "error", message: result.message } }));
        setRefreshSummary(`Refreshing ${completed} of ${activeOrders.length}…`);
      });
      const updated = results.filter(({ result }) => result.ok).length;
      const failed = results.length - updated;
      setRefreshSummary(`Refresh All complete: ${updated} updated, ${failed} failed.`);
      void fetchOrders(false);
    } finally {
      setRefreshingAll(false);
    }
  }

  function startEdit(o: ShopeeOrder) {
    setEditingId(o.id);
    setEditForm({
      shopee_order_id: o.shopee_order_id || "",
      status: o.status,
      notes: o.notes || "",
    });
  }

  // Stats calculation
  const stats = orders.reduce(
    (acc, o) => {
      acc.total++;
      acc[o.status]++;
      return acc;
    },
    { total: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 }
  );

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.tracking_number.toLowerCase().includes(search.toLowerCase()) ||
      (o.shopee_order_id && o.shopee_order_id.toLowerCase().includes(search.toLowerCase())) ||
      (o.notes && o.notes.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = filterStatus === "all" || o.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Shopee Order Tracking</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleRefreshAll} loading={refreshingAll} disabled={Object.values(fetchingIds).some(Boolean) || orders.every((order) => order.status === "delivered" || order.status === "cancelled")}>
            Refresh All
          </Button>
          <Button onClick={() => setShowAddModal(true)} disabled={refreshingAll}>Add Shopee Order</Button>
        </div>
      </div>
      {refreshSummary && <p className="text-sm text-on-surface-variant" role="status" aria-live="polite">{refreshSummary}</p>}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card onClick={() => setFilterStatus("all")} className={`cursor-pointer transition-all ${filterStatus === "all" ? "ring-2 ring-primary bg-primary/5" : ""}`}>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-primary">{stats.total}</p>
            <p className="text-xs text-on-surface-variant">Total Tracked</p>
          </CardContent>
        </Card>
        <Card onClick={() => setFilterStatus("pending")} className={`cursor-pointer transition-all ${filterStatus === "pending" ? "ring-2 ring-primary bg-primary/5" : ""}`}>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
            <p className="text-xs text-on-surface-variant">Pending</p>
          </CardContent>
        </Card>
        <Card onClick={() => setFilterStatus("processing")} className={`cursor-pointer transition-all ${filterStatus === "processing" ? "ring-2 ring-primary bg-primary/5" : ""}`}>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-blue-500">{stats.processing}</p>
            <p className="text-xs text-on-surface-variant">Processing</p>
          </CardContent>
        </Card>
        <Card onClick={() => setFilterStatus("shipped")} className={`cursor-pointer transition-all ${filterStatus === "shipped" ? "ring-2 ring-primary bg-primary/5" : ""}`}>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-purple-500">{stats.shipped}</p>
            <p className="text-xs text-on-surface-variant">Shipped</p>
          </CardContent>
        </Card>
        <Card onClick={() => setFilterStatus("delivered")} className={`cursor-pointer transition-all ${filterStatus === "delivered" ? "ring-2 ring-primary bg-primary/5" : ""}`}>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-500">{stats.delivered}</p>
            <p className="text-xs text-on-surface-variant">Delivered</p>
          </CardContent>
        </Card>
        <Card onClick={() => setFilterStatus("cancelled")} className={`cursor-pointer transition-all ${filterStatus === "cancelled" ? "ring-2 ring-primary bg-primary/5" : ""}`}>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-red-500">{stats.cancelled}</p>
            <p className="text-xs text-on-surface-variant">Cancelled</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex gap-4">
        <Input
          placeholder="Search tracking, order ID, or notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {loading ? (
          <p className="text-center py-8 text-on-surface-variant">Loading Shopee orders...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-center py-8 text-on-surface-variant">No orders match your search.</p>
        ) : (
          filteredOrders.map((o) => {
            const trackingEvents: Array<{ desc: string; time: string }> = o.tracking_data
              ? JSON.parse(o.tracking_data)
              : [];

            const isEditing = editingId === o.id;

            return (
              <Card key={o.id} className="overflow-hidden">
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg">{o.tracking_number}</span>
                        <Badge
                          variant={
                            o.status === "delivered"
                              ? "success"
                              : o.status === "shipped"
                              ? "primary"
                              : o.status === "processing"
                              ? "info"
                              : o.status === "cancelled"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {o.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-xs text-on-surface-variant mt-1 space-x-3">
                        <span>🆔 Order ID: <strong className="font-mono text-on-surface">{o.shopee_order_id || "—"}</strong></span>
                        <span>Added: {new Date(o.created_at).toLocaleString("en-MY")}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleScanOrder(o.id, o.tracking_number)}
                        loading={fetchingIds[o.id]}
                        disabled={refreshingAll}
                      >
                        Scan AWB
                      </Button>
                      {!isEditing && (
                        <Button size="sm" variant="secondary" onClick={() => startEdit(o)} disabled={refreshingAll}>
                          Edit
                        </Button>
                      )}
                      <Button size="sm" variant="danger" onClick={() => handleDeleteOrder(o.id)} disabled={refreshingAll}>
                        Delete
                      </Button>
                    </div>
                  </div>

                  {refreshStates[o.id] && (
                    <p
                      className={`text-sm ${refreshStates[o.id].state === "error" ? "text-red-600" : refreshStates[o.id].state === "success" ? "text-green-700" : "text-on-surface-variant"}`}
                      role="status"
                      aria-live="polite"
                    >
                      {refreshStates[o.id].message}
                    </p>
                  )}

                  {/* Edit Panel */}
                  {isEditing && (
                    <div className="border border-outline-variant bg-surface-container/50 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Shopee Order ID"
                          value={editForm.shopee_order_id}
                          onChange={(e) => setEditForm({ ...editForm, shopee_order_id: e.target.value })}
                        />
                        <div>
                          <label className="block text-sm font-medium text-on-surface mb-1">Status</label>
                          <select
                            value={editForm.status}
                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                            className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
                          >
                            <option value="pending">Pending</option>
                            <option value="processing">Processing</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                      <Input
                        label="Admin Notes"
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                        <Button size="sm" onClick={() => handleUpdateOrder(o.id)}>Save Changes</Button>
                      </div>
                    </div>
                  )}

                  {/* Notes (Read-only) */}
                  {!isEditing && o.notes && (
                    <p className="text-xs text-on-surface bg-surface-container px-3 py-2 rounded-lg border border-outline-variant">
                      📝 <span className="italic">{o.notes}</span>
                    </p>
                  )}

                  {/* Tracking Log */}
                  {trackingEvents.length > 0 && (
                    <div className="border border-outline-variant/60 rounded-xl p-4 bg-surface-container-lowest space-y-2">
                      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Tracking Activity</p>
                      <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                        {trackingEvents.map((evt, idx) => (
                          <div key={idx} className="flex gap-3 text-xs">
                            <span className="text-on-surface-variant font-mono shrink-0">{evt.time}</span>
                            <span className="text-on-surface shrink-1">{evt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Add Shopee Order Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-surface-container">
            <CardHeader><CardTitle>Add Shopee Order</CardTitle></CardHeader>
            <form onSubmit={handleAddOrder}>
              <CardContent className="space-y-4">
                <Input
                  label="Tracking Number (AWB)"
                  placeholder="e.g. MY266674001802L"
                  value={formData.tracking_number}
                  onChange={(e) => setFormData({ ...formData, tracking_number: e.target.value })}
                  required
                />
                <Input
                  label="Shopee Order ID"
                  placeholder="Order reference from Shopee"
                  value={formData.shopee_order_id}
                  onChange={(e) => setFormData({ ...formData, shopee_order_id: e.target.value })}
                />
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
                  >
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <Input
                  label="Admin Notes"
                  placeholder="Internal notes/remarks"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </CardContent>
              <div className="p-6 border-t border-outline-variant flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
                <Button type="submit" loading={submitting}>Add Order</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

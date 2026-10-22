"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────

interface Summary {
  total_orders: number;
  total_revenue: string;
  avg_order_value: string;
}

interface RevenueRow {
  period_label: string;
  order_count: number;
  revenue: string;
}

interface TopProduct {
  product_id: number | null;
  product_name: string;
  total_qty: number;
  total_revenue: string;
}

interface TopCustomer {
  customer_id: number;
  name: string;
  email: string;
  order_count: number;
  total_spent: string;
  last_order_at: string;
}

interface NewCustomer {
  period_label: string;
  new_count: number;
}

interface BestSeller {
  product_id: number | null;
  product_name: string;
  price: string;
  total_qty_sold: number;
  total_revenue: string;
  order_count: number;
}

interface StockLevel {
  id: number;
  name: string;
  price: string;
  stock_quantity: number;
  is_active: number;
}

interface GroupMetric {
  label: string;
  total_orders: number;
  paid_orders: number;
  paid_revenue: string;
  avg_delivery_fee: string;
}

interface MonthlyOrdersRow {
  period_label: string;
  total_orders: number;
  paid_orders: number;
  revenue: string;
  avg_paid_order: string;
}

interface StatusRow { order_status: string; count: number }
interface ReportReview {
  id?: number;
  created_at: string;
  order_ref: string | null;
  rating: number;
  comment: string | null;
  display_mode: string | null;
  display_name: string | null;
  customer_name: string | null;
}

type TabId = "overview" | "orders" | "revenue" | "products" | "customers" | "couriers" | "zones" | "reviews";

// ── CSV Export Helper ────────────────────────────────────────

function exportToCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const numericKey = /(amount|revenue|fee|price|count|orders|quantity|qty|rating|spent|total|average|avg|paid|stock|id)$/i;
  const cell = (value: unknown, key: string) => {
    let text = value == null ? "" : String(value);
    const numeric = typeof value === "number" || (numericKey.test(key) && text !== "" && Number.isFinite(Number(text)));
    if (numeric) return text;
    if (/^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [
    headers.map((key) => cell(key, "")).join(","),
    ...rows.map((row) =>
      headers
        .map((h) => cell(row[h], h))
        .join(",")
    ),
  ].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Component ────────────────────────────────────────────────

export default function ReportPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [periodType, setPeriodType] = useState("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [exportError, setExportError] = useState("");
  const [loadedReportKey, setLoadedReportKey] = useState("");
  const reportRequest = useRef(0);

  // Revenue data
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [feeSummary, setFeeSummary] = useState<Record<string, number | string> | null>(null);
  const [monthlyRevenueBreakdown, setMonthlyRevenueBreakdown] = useState<Record<string, number | string>[]>([]);

  // Customer data
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [newCustomers, setNewCustomers] = useState<NewCustomer[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);

  // Product data
  const [bestSellers, setBestSellers] = useState<BestSeller[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [overviewSummary, setOverviewSummary] = useState<Record<string, number | string> | null>(null);
  const [statusRows, setStatusRows] = useState<StatusRow[]>([]);
  const [ordersByMonth, setOrdersByMonth] = useState<MonthlyOrdersRow[]>([]);
  const [courierRows, setCourierRows] = useState<GroupMetric[]>([]);
  const [zoneRows, setZoneRows] = useState<GroupMetric[]>([]);
  const [reviewSummary, setReviewSummary] = useState<Record<string, number | string> | null>(null);
  const [ratingDistribution, setRatingDistribution] = useState<{ rating: number; count: number }[]>([]);
  const [recentReviews, setRecentReviews] = useState<ReportReview[]>([]);

  const fetchActiveReport = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++reportRequest.current;
    const requestKey = JSON.stringify([activeTab, periodType, startDate, endDate]);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      let endpoint = "";
      if (activeTab === "revenue") {
        params.set("type", periodType);
        endpoint = `/api/admin/reports?${params}`;
      } else if (activeTab === "products") {
        endpoint = `/api/admin/reports/products?${params}`;
      } else if (activeTab === "customers") {
        endpoint = `/api/admin/reports/customers?${params}`;
      } else {
        params.set("view", activeTab);
        endpoint = `/api/admin/reports?${params}`;
      }
      const requests = activeTab === "revenue"
        ? await Promise.all([
          fetch(endpoint, { signal }),
          fetch(`/api/admin/reports?${new URLSearchParams({ view: "revenue", ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) })}`, { signal }),
        ])
        : [await fetch(endpoint, { signal })];
      const dataList = await Promise.all(requests.map(async (response) => {
        const result = await response.json();
        if (!response.ok || result.status !== "success") throw new Error(result.message || "Failed to load reports.");
        return result;
      }));
      const data = dataList[0];
      if (signal?.aborted || requestId !== reportRequest.current) return;
      if (activeTab === "revenue") {
        setSummary(data.summary);
        setRevenue(data.revenue ?? []);
        setTopProducts(data.topProducts ?? []);
        setFeeSummary(dataList[1].summary ?? {});
        setMonthlyRevenueBreakdown(dataList[1].monthlyRevenue ?? []);
      } else if (activeTab === "products") {
        setBestSellers(data.bestSellers ?? []);
        setStockLevels(data.stockLevels ?? []);
      } else if (activeTab === "customers") {
        setTopCustomers(data.topCustomers ?? []);
        setNewCustomers(data.newCustomers ?? []);
        setTotalCustomers(data.totalCustomers ?? 0);
      } else if (activeTab === "overview") {
        setOverviewSummary(data.summary ?? {});
        setStatusRows(data.statuses ?? []);
      } else if (activeTab === "orders") {
        setOrdersByMonth(data.ordersByMonth ?? []);
      } else if (activeTab === "couriers") {
        setCourierRows(data.rows ?? []);
      } else if (activeTab === "zones") {
        setZoneRows(data.rows ?? []);
      } else if (activeTab === "reviews") {
        setReviewSummary(data.summary ?? {});
        setRatingDistribution(data.ratingDistribution ?? []);
        setRecentReviews(data.recentReviews ?? []);
      }
      setLoadedReportKey(requestKey);
      setLoadError("");
    } catch (e) {
      if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError") || requestId !== reportRequest.current) return;
      setLoadError(e instanceof Error ? e.message : "Failed to load reports.");
    } finally {
      if (!signal?.aborted && requestId === reportRequest.current) setLoading(false);
    }
  }, [activeTab, periodType, startDate, endDate]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchActiveReport(controller.signal);
    return () => controller.abort();
  }, [fetchActiveReport]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders" },
    { id: "revenue", label: "Revenue" },
    { id: "couriers", label: "Couriers" },
    { id: "zones", label: "Zones" },
    { id: "reviews", label: "Reviews" },
    { id: "products", label: "Products" },
    { id: "customers", label: "Customers" },
  ];

  const handleExport = () => {
    if (loading || loadError || loadedReportKey !== JSON.stringify([activeTab, periodType, startDate, endDate])) return;
    if (["overview", "orders", "reviews"].includes(activeTab)) {
      setExporting(true);
      setExportError("");
      const params = new URLSearchParams({ view: activeTab, format: "csv" });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      void fetch(`/api/admin/reports?${params}`)
        .then(async (response) => {
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.message || "Could not export this report.");
          }
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = `eastel-report-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
          link.click();
          URL.revokeObjectURL(objectUrl);
        })
        .catch((e) => setExportError(e instanceof Error ? e.message : "Could not export this report."))
        .finally(() => setExporting(false));
      return;
    }
    if (activeTab === "revenue") {
      exportToCsv("paid-revenue-by-month.csv", monthlyRevenueBreakdown);
    } else if (activeTab === "products") {
      exportToCsv("best-sellers.csv", bestSellers as unknown as Record<string, unknown>[]);
    } else if (activeTab === "customers") {
      exportToCsv("top-customers.csv", topCustomers as unknown as Record<string, unknown>[]);
    } else if (activeTab === "overview") {
      exportToCsv("orders-overview.csv", statusRows as unknown as Record<string, unknown>[]);
    } else if (activeTab === "orders") {
      exportToCsv("orders-by-month.csv", ordersByMonth as unknown as Record<string, unknown>[]);
    } else if (activeTab === "couriers") {
      exportToCsv("orders-by-courier.csv", courierRows as unknown as Record<string, unknown>[]);
    } else if (activeTab === "zones") {
      exportToCsv("orders-by-zone.csv", zoneRows as unknown as Record<string, unknown>[]);
    } else if (activeTab === "reviews") {
      exportToCsv("recent-approved-reviews.csv", recentReviews.map((review) => ({
        created_at: review.created_at,
        order_ref: review.order_ref,
        rating: review.rating,
        comment: review.comment,
        customer_name: review.display_mode === "private"
          ? "Anonymous Customer"
          : review.display_name || review.customer_name || "—",
      })));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-on-surface">Reports</h1>
        <div className="flex items-center gap-2">
          <Link href="/hs/reports"><Button variant="secondary">Overview</Button></Link>
          <Button variant="secondary" onClick={() => void fetchActiveReport()} loading={loading}>Refresh</Button>
          <Button variant="secondary" onClick={handleExport} loading={exporting} disabled={loading || exporting || !!loadError || loadedReportKey !== JSON.stringify([activeTab, periodType, startDate, endDate])}>Export CSV</Button>
        </div>
      </div>

      {/* Date Range Picker */}
      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm text-on-surface-variant mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-on-surface-variant mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
              />
            </div>
            {activeTab === "revenue" && (
              <div className="flex-1">
                <label className="block text-sm text-on-surface-variant mb-1">
                  Period
                </label>
                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value)}
                  className="w-full rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              Clear
            </Button>
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">Date range: {startDate || endDate ? `${startDate || "earliest"} to ${endDate || "latest available"}` : "All dates"}. Empty dates include all available history.</p>
        </CardContent>
      </Card>

      {loadError && <p role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">{loadError} Showing the last successfully loaded report data where available.</p>}
      {exportError && <p role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">{exportError}</p>}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-outline-variant">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-sm text-on-surface-variant">Loading...</p>
      )}

      {activeTab === "overview" && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              ["Total orders", overviewSummary?.total_orders ?? 0],
              ["Paid orders", overviewSummary?.paid_orders ?? 0],
              ["Paid revenue", `RM ${Number(overviewSummary?.total_revenue ?? 0).toFixed(2)}`],
              ["Shipped", overviewSummary?.shipped_orders ?? 0],
              ["Delivered", overviewSummary?.delivered_orders ?? 0],
              ["Cancelled", overviewSummary?.cancelled_orders ?? 0],
            ].map(([label, value]) => <Card key={String(label)}><CardContent><p className="text-xs text-on-surface-variant">{label}</p><p className="mt-1 text-xl font-semibold text-on-surface">{value}</p></CardContent></Card>)}
          </div>
          <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Order Status Breakdown</CardTitle></CardHeader><CardContent><Table>
            <TableHead><TableRow><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell align="right">Orders</TableHeaderCell></TableRow></TableHead>
            <TableBody>{statusRows.length ? statusRows.map((row) => <TableRow key={row.order_status}><TableCell className="capitalize">{row.order_status}</TableCell><TableCell align="right">{row.count}</TableCell></TableRow>) : <TableRow><TableCell colSpan={2} align="center">No orders for this date range.</TableCell></TableRow>}</TableBody>
          </Table></CardContent></Card>
        </div>
      )}

      {activeTab === "orders" && !loading && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Orders by Month</CardTitle></CardHeader><CardContent><Table>
          <TableHead><TableRow><TableHeaderCell>Month</TableHeaderCell><TableHeaderCell align="right">All orders</TableHeaderCell><TableHeaderCell align="right">Paid</TableHeaderCell><TableHeaderCell align="right">Paid revenue</TableHeaderCell><TableHeaderCell align="right">Avg paid order</TableHeaderCell></TableRow></TableHead>
          <TableBody>{ordersByMonth.length ? ordersByMonth.map((row) => <TableRow key={row.period_label}><TableCell>{row.period_label}</TableCell><TableCell align="right">{row.total_orders}</TableCell><TableCell align="right">{row.paid_orders}</TableCell><TableCell align="right">RM {Number(row.revenue).toFixed(2)}</TableCell><TableCell align="right">RM {Number(row.avg_paid_order).toFixed(2)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} align="center">No orders for this date range.</TableCell></TableRow>}</TableBody>
        </Table></CardContent></Card>
      )}

      {(activeTab === "couriers" || activeTab === "zones") && !loading && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>{activeTab === "couriers" ? "Orders by Courier" : "Orders by Delivery Zone"}</CardTitle></CardHeader><CardContent><Table>
          <TableHead><TableRow><TableHeaderCell>{activeTab === "couriers" ? "Courier" : "Zone"}</TableHeaderCell><TableHeaderCell align="right">Orders</TableHeaderCell><TableHeaderCell align="right">Paid</TableHeaderCell><TableHeaderCell align="right">Paid revenue</TableHeaderCell><TableHeaderCell align="right">Avg delivery fee · all orders</TableHeaderCell></TableRow></TableHead>
          <TableBody>{(activeTab === "couriers" ? courierRows : zoneRows).length ? (activeTab === "couriers" ? courierRows : zoneRows).map((row) => <TableRow key={row.label}><TableCell>{row.label}</TableCell><TableCell align="right">{row.total_orders}</TableCell><TableCell align="right">{row.paid_orders}</TableCell><TableCell align="right">RM {Number(row.paid_revenue).toFixed(2)}</TableCell><TableCell align="right">RM {Number(row.avg_delivery_fee).toFixed(2)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} align="center">No orders for this date range.</TableCell></TableRow>}</TableBody>
        </Table></CardContent></Card>
      )}

      {activeTab === "reviews" && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["All reviews", reviewSummary?.total_reviews ?? 0],
              ["Approved", reviewSummary?.approved_reviews ?? 0],
              ["Pending", reviewSummary?.pending_reviews ?? 0],
              ["Rejected", reviewSummary?.rejected_reviews ?? 0],
              ["Approved average", Number(reviewSummary?.approved_reviews ?? 0) > 0 ? `${Number(reviewSummary?.approved_average_rating).toFixed(1)} ★` : "—"],
            ].map(([label, value]) => <Card key={String(label)}><CardContent><p className="text-xs text-on-surface-variant">{label}</p><p className="mt-1 text-xl font-semibold text-on-surface">{value}</p></CardContent></Card>)}
          </div>
          <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Approved Rating Distribution</CardTitle></CardHeader><CardContent><Table>
            <TableHead><TableRow><TableHeaderCell>Rating</TableHeaderCell><TableHeaderCell align="right">Reviews</TableHeaderCell></TableRow></TableHead>
            <TableBody>{ratingDistribution.length ? ratingDistribution.map((row) => <TableRow key={row.rating}><TableCell>{"★".repeat(row.rating)}</TableCell><TableCell align="right">{row.count}</TableCell></TableRow>) : <TableRow><TableCell colSpan={2} align="center">No approved ratings for this date range.</TableCell></TableRow>}</TableBody>
          </Table></CardContent></Card>
          <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Recent Approved Reviews · up to 20</CardTitle></CardHeader><CardContent><Table>
            <TableHead><TableRow><TableHeaderCell>Date</TableHeaderCell><TableHeaderCell>Order</TableHeaderCell><TableHeaderCell>Customer</TableHeaderCell><TableHeaderCell>Rating</TableHeaderCell><TableHeaderCell>Review</TableHeaderCell></TableRow></TableHead>
            <TableBody>{recentReviews.length ? recentReviews.map((row, index) => <TableRow key={`${row.order_ref ?? "review"}-${index}`}><TableCell className="whitespace-nowrap">{new Date(row.created_at).toLocaleDateString("en-MY")}</TableCell><TableCell className="font-mono text-xs">{row.order_ref || "—"}</TableCell><TableCell>{row.display_mode === "private" ? "Anonymous" : row.display_name || row.customer_name || "—"}</TableCell><TableCell>{"★".repeat(row.rating)}</TableCell><TableCell className="max-w-lg whitespace-normal">{row.comment || "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} align="center">No approved reviews for this date range.</TableCell></TableRow>}</TableBody>
          </Table></CardContent></Card>
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === "revenue" && !loading && (
        <div className="space-y-6">
          {summary && feeSummary && (
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              <Card>
                <CardContent>
                  <p className="text-sm text-on-surface-variant">Paid orders</p>
                  <p className="text-2xl font-bold text-on-surface">
                    {Number(feeSummary.paid_orders ?? summary.total_orders).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-sm text-on-surface-variant">Total Revenue</p>
                  <p className="text-2xl font-bold text-on-surface">
                    RM{" "}
                    {Number(feeSummary.total_revenue ?? summary.total_revenue).toLocaleString("en-MY", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-sm text-on-surface-variant">
                    Avg per Paid Order
                  </p>
                  <p className="text-2xl font-bold text-on-surface">
                    RM{" "}
                    {Number(feeSummary.avg_paid_order ?? summary.avg_order_value).toLocaleString("en-MY", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </CardContent>
              </Card>
              <Card><CardContent><p className="text-sm text-on-surface-variant">SIM fee revenue</p><p className="text-2xl font-bold text-on-surface">RM {Number(feeSummary.sim_fee_revenue ?? 0).toFixed(2)}</p></CardContent></Card>
              <Card><CardContent><p className="text-sm text-on-surface-variant">Delivery fee revenue</p><p className="text-2xl font-bold text-on-surface">RM {Number(feeSummary.delivery_fee_revenue ?? 0).toFixed(2)}</p></CardContent></Card>
            </div>
          )}

          <Card padding="none">
            <CardHeader className="px-6 pt-6">
              <CardTitle>
                Revenue by{" "}
                {periodType === "daily"
                  ? "Day"
                  : periodType === "weekly"
                  ? "Week"
                  : "Month"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Period</TableHeaderCell>
                    <TableHeaderCell align="center">Orders</TableHeaderCell>
                    <TableHeaderCell align="right">Revenue</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {revenue.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <span className="text-on-surface-variant">
                          No data for this period.
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    revenue.map((row) => (
                      <TableRow key={row.period_label}>
                        <TableCell>{row.period_label}</TableCell>
                        <TableCell align="center">{row.order_count}</TableCell>
                        <TableCell align="right">
                          RM {Number(row.revenue).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Paid Revenue by Month</CardTitle></CardHeader><CardContent><Table>
            <TableHead><TableRow><TableHeaderCell>Month</TableHeaderCell><TableHeaderCell align="right">Revenue</TableHeaderCell><TableHeaderCell align="right">SIM fees</TableHeaderCell><TableHeaderCell align="right">Delivery fees</TableHeaderCell><TableHeaderCell align="right">Paid orders</TableHeaderCell></TableRow></TableHead>
            <TableBody>{monthlyRevenueBreakdown.length ? monthlyRevenueBreakdown.map((row, index) => <TableRow key={String(row.period_label ?? index)}><TableCell>{String(row.period_label)}</TableCell><TableCell align="right">RM {Number(row.revenue).toFixed(2)}</TableCell><TableCell align="right">RM {Number(row.sim_fee_revenue).toFixed(2)}</TableCell><TableCell align="right">RM {Number(row.delivery_fee_revenue).toFixed(2)}</TableCell><TableCell align="right">{Number(row.paid_orders)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} align="center">No paid orders for this date range.</TableCell></TableRow>}</TableBody>
          </Table></CardContent></Card>

          <Card padding="none">
            <CardHeader className="px-6 pt-6">
              <CardTitle>Stored SIM Fee by Order Type</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-on-surface-variant">Historical order fees are used. Orders are not attributed to the current product catalogue.</p>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Product</TableHeaderCell>
                    <TableHeaderCell align="center">Qty Sold</TableHeaderCell>
                    <TableHeaderCell align="right">SIM fees</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <span className="text-on-surface-variant">
                          No data.
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    topProducts.map((row) => (
                      <TableRow key={row.product_name}>
                        <TableCell>{row.product_name}</TableCell>
                        <TableCell align="center">{row.total_qty}</TableCell>
                        <TableCell align="right">
                          RM {Number(row.total_revenue).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Products Tab */}
      {activeTab === "products" && !loading && (
        <div className="space-y-6">
          <Card padding="none">
            <CardHeader className="px-6 pt-6">
              <CardTitle>Stored SIM Fees</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-on-surface-variant">Historical orders are grouped as single-SIM orders because they do not store a product foreign key.</p>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Product</TableHeaderCell>
                    <TableHeaderCell align="right">Price</TableHeaderCell>
                    <TableHeaderCell align="center">Qty Sold</TableHeaderCell>
                    <TableHeaderCell align="center">Orders</TableHeaderCell>
                    <TableHeaderCell align="right">SIM fees</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bestSellers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <span className="text-on-surface-variant">
                          No sales data.
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    bestSellers.map((row) => (
                      <TableRow key={row.product_name}>
                        <TableCell>{row.product_name}</TableCell>
                        <TableCell align="right">
                          RM {Number(row.price).toFixed(2)}
                        </TableCell>
                        <TableCell align="center">
                          {row.total_qty_sold}
                        </TableCell>
                        <TableCell align="center">{row.order_count}</TableCell>
                        <TableCell align="right">
                          RM {Number(row.total_revenue).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card padding="none">
            <CardHeader className="px-6 pt-6">
              <CardTitle>Stock Levels</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Product</TableHeaderCell>
                    <TableHeaderCell align="right">Price</TableHeaderCell>
                    <TableHeaderCell align="center">Stock</TableHeaderCell>
                    <TableHeaderCell align="center">Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stockLevels.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <span className="text-on-surface-variant">
                          No products.
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    stockLevels.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell align="right">
                          RM {Number(row.price).toFixed(2)}
                        </TableCell>
                        <TableCell align="center">
                          {row.stock_quantity === -1 ? "∞" : row.stock_quantity}
                        </TableCell>
                        <TableCell align="center">
                          <span
                            className={
                              row.stock_quantity === -1
                                ? "text-green-500"
                                : row.stock_quantity <= 0
                                ? "text-red-500 font-medium"
                                : row.stock_quantity <= 10
                                ? "text-yellow-500 font-medium"
                                : "text-green-500"
                            }
                          >
                            {row.stock_quantity === -1
                              ? "Unlimited"
                              : row.stock_quantity <= 0
                              ? "Out of Stock"
                              : row.stock_quantity <= 10
                              ? "Low Stock"
                              : "In Stock"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customers Tab */}
      {activeTab === "customers" && !loading && (
        <div className="space-y-6">
          <Card>
            <CardContent>
              <p className="text-sm text-on-surface-variant">
                Total Customers
              </p>
              <p className="text-2xl font-bold text-on-surface">
                {totalCustomers.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card padding="none">
            <CardHeader className="px-6 pt-6">
              <CardTitle>Top Customers by Spend</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Customer</TableHeaderCell>
                    <TableHeaderCell>Email</TableHeaderCell>
                    <TableHeaderCell align="center">Orders</TableHeaderCell>
                    <TableHeaderCell align="right">Total Spent</TableHeaderCell>
                    <TableHeaderCell>Last Order</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <span className="text-on-surface-variant">
                          No customer data.
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    topCustomers.map((row) => (
                      <TableRow key={row.customer_id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell align="center">{row.order_count}</TableCell>
                        <TableCell align="right">
                          RM {Number(row.total_spent).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {row.last_order_at
                            ? new Date(row.last_order_at).toLocaleDateString()
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card padding="none">
            <CardHeader className="px-6 pt-6">
              <CardTitle>New Customers by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Month</TableHeaderCell>
                    <TableHeaderCell align="center">
                      New Customers
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {newCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} align="center">
                        <span className="text-on-surface-variant">
                          No data.
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    newCustomers.map((row) => (
                      <TableRow key={row.period_label}>
                        <TableCell>{row.period_label}</TableCell>
                        <TableCell align="center">{row.new_count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

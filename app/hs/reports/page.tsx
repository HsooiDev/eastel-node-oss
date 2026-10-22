"use client";

import { useState, useEffect } from "react";
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
}

interface NewCustomer {
  period_label: string;
  new_count: number;
}

interface BestSeller {
  product_id: number | null;
  product_name: string;
  total_qty_sold: number;
  total_revenue: string;
}

interface ProductSummary {
  total: number;
  active: number;
  out_of_stock: number;
  low_stock: number;
}

// ── Bar Chart (CSS-based) ────────────────────────────────────

function SimpleBarChart({
  data,
  labelKey,
  valueKey,
  maxBars = 12,
}: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  maxBars?: number;
}) {
  const sliced = data.slice(-maxBars);
  const maxValue = Math.max(
    ...sliced.map((d) => Number(d[valueKey]) || 0),
    1
  );

  return (
    <div className="space-y-2">
      {sliced.map((item, i) => {
        const value = Number(item[valueKey]) || 0;
        const pct = Math.round((value / maxValue) * 100);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant w-20 shrink-0 truncate">
              {String(item[labelKey])}
            </span>
            <div className="flex-1 bg-surface-container-high rounded-full h-5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-on-surface w-24 text-right shrink-0">
              {typeof item[valueKey] === "number"
                ? item[valueKey].toLocaleString()
                : String(item[valueKey])}
            </span>
          </div>
        );
      })}
      {sliced.length === 0 && (
        <p className="text-sm text-on-surface-variant text-center py-4">
          No data available.
        </p>
      )}
    </div>
  );
}

// ── Page Component ───────────────────────────────────────────

export default function ReportsDashboardPage() {
  const [loading, setLoading] = useState(true);

  // Revenue
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState<RevenueRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  // Products
  const [bestSellers, setBestSellers] = useState<BestSeller[]>([]);
  const [productSummary, setProductSummary] = useState<ProductSummary | null>(
    null
  );

  // Customers
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [newCustomers, setNewCustomers] = useState<NewCustomer[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [revenueRes, productsRes, customersRes] = await Promise.all([
          fetch("/api/admin/reports?type=monthly"),
          fetch("/api/admin/reports/products"),
          fetch("/api/admin/reports/customers"),
        ]);

        const [revenueData, productsData, customersData] = await Promise.all([
          revenueRes.json(),
          productsRes.json(),
          customersRes.json(),
        ]);

        if (revenueData.status === "success") {
          setSummary(revenueData.summary);
          setMonthlyRevenue(revenueData.revenue ?? []);
          setTopProducts(revenueData.topProducts ?? []);
        }
        if (productsData.status === "success") {
          setBestSellers(productsData.bestSellers ?? []);
          setProductSummary(productsData.productSummary);
        }
        if (customersData.status === "success") {
          setTopCustomers(customersData.topCustomers ?? []);
          setNewCustomers(customersData.newCustomers ?? []);
          setTotalCustomers(customersData.totalCustomers ?? 0);
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-on-surface">
          Reports Dashboard
        </h1>
        <p className="text-on-surface-variant">Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-on-surface">
          Reports Dashboard
        </h1>
        <Link href="/hs/report">
          <Button variant="secondary">Detailed Reports</Button>
        </Link>
      </div>

      {/* ── Summary Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-sm text-on-surface-variant">Total Revenue</p>
            <p className="text-2xl font-bold text-on-surface">
              RM{" "}
              {Number(summary?.total_revenue ?? 0).toLocaleString("en-MY", {
                minimumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-on-surface-variant">Paid Orders</p>
            <p className="text-2xl font-bold text-on-surface">
              {(summary?.total_orders ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-on-surface-variant">Total Customers</p>
            <p className="text-2xl font-bold text-on-surface">
              {totalCustomers.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-on-surface-variant">Products</p>
            <p className="text-2xl font-bold text-on-surface">
              {productSummary?.active ?? 0}
              <span className="text-sm font-normal text-on-surface-variant">
                {" "}
                active
              </span>
            </p>
            {productSummary && productSummary.low_stock > 0 && (
              <p className="text-xs text-yellow-500 mt-1">
                {productSummary.low_stock} low stock
              </p>
            )}
            {productSummary && productSummary.out_of_stock > 0 && (
              <p className="text-xs text-red-500">
                {productSummary.out_of_stock} out of stock
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Revenue Chart ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart
            data={monthlyRevenue.map((r) => ({
              label: r.period_label,
              value: Number(r.revenue),
            }))}
            labelKey="label"
            valueKey="value"
          />
        </CardContent>
      </Card>

      {/* ── Customer Acquisition Chart ──────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>New Customer Acquisition</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart
            data={newCustomers.map((c) => ({
              label: c.period_label,
              value: c.new_count,
            }))}
            labelKey="label"
            valueKey="value"
          />
        </CardContent>
      </Card>

      {/* ── Two Column: Top Products + Top Customers ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Sellers */}
        <Card padding="none">
          <CardHeader className="px-6 pt-6">
            <CardTitle>SIM Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Product</TableHeaderCell>
                  <TableHeaderCell align="center">Sold</TableHeaderCell>
                  <TableHeaderCell align="right">Revenue</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bestSellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      <span className="text-on-surface-variant">No data.</span>
                    </TableCell>
                  </TableRow>
                ) : (
                  bestSellers.slice(0, 10).map((row) => (
                    <TableRow key={row.product_name}>
                      <TableCell>{row.product_name}</TableCell>
                      <TableCell align="center">
                        {row.total_qty_sold}
                      </TableCell>
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

        {/* Top Customers */}
        <Card padding="none">
          <CardHeader className="px-6 pt-6">
            <CardTitle>Top Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Customer</TableHeaderCell>
                  <TableHeaderCell align="center">Orders</TableHeaderCell>
                  <TableHeaderCell align="right">Spent</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      <span className="text-on-surface-variant">No data.</span>
                    </TableCell>
                  </TableRow>
                ) : (
                  topCustomers.slice(0, 10).map((row) => (
                    <TableRow key={row.customer_id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{row.name}</span>
                          <span className="block text-xs text-on-surface-variant">
                            {row.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="center">{row.order_count}</TableCell>
                      <TableCell align="right">
                        RM {Number(row.total_spent).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Revenue by Period Table ─────────────────────────── */}
      <Card padding="none">
        <CardHeader className="px-6 pt-6">
          <CardTitle>Monthly Revenue Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Month</TableHeaderCell>
                <TableHeaderCell align="center">Orders</TableHeaderCell>
                <TableHeaderCell align="right">Revenue</TableHeaderCell>
                <TableHeaderCell align="right">Avg Order</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {monthlyRevenue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <span className="text-on-surface-variant">
                      No revenue data.
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                monthlyRevenue.map((row) => (
                  <TableRow key={row.period_label}>
                    <TableCell>{row.period_label}</TableCell>
                    <TableCell align="center">{row.order_count}</TableCell>
                    <TableCell align="right">
                      RM {Number(row.revenue).toFixed(2)}
                    </TableCell>
                    <TableCell align="right">
                      RM{" "}
                      {row.order_count > 0
                        ? (Number(row.revenue) / row.order_count).toFixed(2)
                        : "0.00"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

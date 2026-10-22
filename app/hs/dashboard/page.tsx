import type { Metadata } from "next";
import { query } from "@/lib/db";
import { DashboardOverview, type DashboardData } from "@/components/admin/dashboard-overview";
import type { RowDataPacket } from "mysql2/promise";

export const metadata: Metadata = {
  title: { absolute: "Admin Overview — Eastel Mobile" },
  description: "Eastel Mobile admin overview.",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const [[orders], [customers], [products], [recentOrders]] = await Promise.all([
    query<(RowDataPacket & { total: number; revenue: string; awaiting: number; ready: number })[]>(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END), 0) AS awaiting,
      COALESCE(SUM(CASE WHEN payment_status = 'paid' AND order_status = 'pending' THEN 1 ELSE 0 END), 0) AS ready FROM orders`),
    query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM customers"),
    query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM products WHERE is_active = 1"),
    query<(RowDataPacket & DashboardData["recentOrders"][number])[]>(`SELECT o.id, o.order_ref,
      COALESCE(NULLIF(o.full_name, ''), c.name, '') AS customer, o.total_amount, o.payment_status, o.order_status
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id ORDER BY o.created_at DESC, o.id DESC LIMIT 6`),
  ]);
  return <DashboardOverview data={{
    totalOrders: Number(orders[0]?.total ?? 0), totalRevenue: Number(orders[0]?.revenue ?? 0),
    totalCustomers: Number(customers[0]?.total ?? 0), totalProducts: Number(products[0]?.total ?? 0),
    awaitingPayment: Number(orders[0]?.awaiting ?? 0), readyToFulfil: Number(orders[0]?.ready ?? 0), recentOrders,
  }} />;
}

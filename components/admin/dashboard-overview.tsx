import Link from "next/link";
import { ArrowRight, Package, Truck, Smartphone, ChartNoAxesCombined, Palette, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface DashboardData {
  totalOrders: number; totalRevenue: number; totalCustomers: number; totalProducts: number;
  awaitingPayment: number; readyToFulfil: number;
  recentOrders: { id: number; order_ref: string; customer: string; total_amount: string | number; payment_status: string; order_status: string }[];
}
const paymentVariants = { paid: "success", pending: "warning", failed: "error" } as const;
const fulfilmentVariants = { pending: "neutral", processing: "warning", shipped: "info", delivered: "success", cancelled: "error" } as const;
const money = (amount: number) => `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DashboardOverview({ data }: { data: DashboardData }) {
  const figures = [["Paid revenue", money(data.totalRevenue)], ["Total orders", data.totalOrders.toLocaleString("en-MY")], ["Customers", data.totalCustomers.toLocaleString("en-MY")], ["Active products", data.totalProducts.toLocaleString("en-MY")]];
  const quickLinks = [{ href: "/hs/products", label: "Products", icon: Smartphone }, { href: "/hs/report", label: "Reports", icon: ChartNoAxesCombined }, { href: "/hs/marketing-design", label: "Design Studio", icon: Palette }, { href: "/hs/settings", label: "Settings", icon: Settings }];
  return <div>
    <div className="admin-overview-heading"><div><h1>Overview</h1><p>Your store, at a glance.</p></div><Link href="/hs/orders" className="admin-primary-link">View orders <ArrowRight size={18} aria-hidden="true" /></Link></div>
    <dl className="admin-overview-metrics">{figures.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="admin-overview-grid">
      <section className="admin-overview-panel" aria-labelledby="recent-orders-title">
        <div className="admin-section-header"><h2 id="recent-orders-title">Recent orders</h2><Link href="/hs/orders">View all orders <ArrowRight size={16} aria-hidden="true" /></Link></div>
        {data.recentOrders.length ? <table className="admin-recent-orders"><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Total</th><th scope="col">Payment</th><th scope="col">Fulfilment</th></tr></thead><tbody>
          {data.recentOrders.map(order => <tr key={order.id}><td><Link href={`/hs/orders?search=${encodeURIComponent(order.order_ref)}`}>{order.order_ref}</Link></td><td>{order.customer || "—"}</td><td className="admin-amount">{money(Number(order.total_amount))}</td><td><Badge variant={paymentVariants[order.payment_status as keyof typeof paymentVariants] || "neutral"}>{order.payment_status}</Badge></td><td><Badge variant={fulfilmentVariants[order.order_status as keyof typeof fulfilmentVariants] || "neutral"}>{order.order_status}</Badge></td></tr>)}
        </tbody></table> : <div className="admin-overview-empty"><Package size={28} aria-hidden="true" /><p>No orders yet.</p><p>New website and WhatsApp orders will appear here.</p><Link href="/hs/products">Check your product catalogue</Link></div>}
      </section>
      <section className="admin-overview-panel admin-work-links" aria-labelledby="attention-title">
        <div className="admin-attention-links">
        <div className="admin-section-header"><h2 id="attention-title">Needs attention</h2></div>
        <Link href="/hs/orders?paymentStatus=pending" className="admin-work-link"><Package size={20} aria-hidden="true" /><span><strong>{data.awaitingPayment}</strong> awaiting payment</span><ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/hs/orders?paymentStatus=paid&status=pending" className="admin-work-link"><Truck size={20} aria-hidden="true" /><span><strong>{data.readyToFulfil}</strong> ready to fulfil</span><ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="admin-quick-links"><h2>Quick links</h2>{quickLinks.map(link => <Link key={link.href} href={link.href} className="admin-work-link"><link.icon size={20} aria-hidden="true" /><span>{link.label}</span><ArrowRight size={16} aria-hidden="true" /></Link>)}</div>
      </section>
    </div>
    <p className="admin-period-note">All-time totals · Revenue includes paid orders only.</p>
  </div>;
}

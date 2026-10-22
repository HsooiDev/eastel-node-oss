"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, Smartphone, Users, Star, Truck, ChartNoAxesCombined, Bot, Search, ShieldCheck, Cloud, KeyRound, TriangleAlert, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";

type Tab =
  | "orders"
  | "products"
  | "customers"
  | "reviews"
  | "couriers"
  | "reports"
  | "bots"
  | "google"
  | "security"
  | "cloudflare";

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: "orders", label: "Orders", icon: Package },
  { key: "products", label: "Products", icon: Smartphone },
  { key: "customers", label: "Customers", icon: Users },
  { key: "reviews", label: "Reviews", icon: Star },
  { key: "couriers", label: "Couriers & Zones", icon: Truck },
  { key: "reports", label: "Reports", icon: ChartNoAxesCombined },
  { key: "bots", label: "Bots", icon: Bot },
  { key: "google", label: "Google", icon: Search },
  { key: "security", label: "Security", icon: ShieldCheck },
  { key: "cloudflare", label: "Cloudflare", icon: Cloud },
];

interface GuideSection {
  icon: LucideIcon;
  title: string;
  desc: string;
  actions: string[];
  warnings: string[];
  links: { label: string; href: string }[];
}

const SECTIONS: Record<Tab, GuideSection> = {
  orders: {
    icon: Package,
    title: "Orders",
    desc: "Main operational hub. View every customer SIM card order, update statuses, assign couriers, and track payment.",
    actions: [
      "Filter by status (pending, paid, shipped, completed, cancelled), courier, or date range",
      "Search by order ID, customer name, or phone number",
      "Click an order row to view full details — customer info, items, delivery address",
      "Update the order status once dispatched or completed",
      "Assign a courier and enter the tracking number",
      "Print a receipt / packing slip from the order detail view",
    ],
    warnings: [
      "Status changes can trigger automated emails — double-check before saving",
      "At least one active courier must exist before assigning (see Couriers & Zones)",
      "Cancelled orders cannot be uncancelled — use with care",
      "Orders with payment_status = pending have NOT been paid — do not ship until confirmed",
    ],
    links: [{ label: "Open Orders", href: "/hs/orders" }],
  },
  products: {
    icon: Smartphone,
    title: "Products",
    desc: "Manage SIM card plans listed in the store. Changes take effect immediately on the public-facing store.",
    actions: [
      "Add a new plan with name, price, weight, and description",
      "Upload product images shown in the store listing",
      "Edit existing plans — update pricing or description at any time",
      "Toggle a product active / inactive to hide it without deleting",
      "Delete a product that is no longer offered",
    ],
    warnings: [
      "Price changes are live immediately — customers see the new price on next visit",
      "Deleting a product does NOT delete existing orders referencing it — historical data preserved",
      "Product weight affects shipping cost via the postcode zone system — set it accurately",
      "Inactive products are hidden from customers but remain visible in admin searches",
    ],
    links: [{ label: "Open Products", href: "/hs/products" }],
  },
  customers: {
    icon: Users,
    title: "Customers",
    desc: "View and manage registered customer accounts. Access full order history and profile details per customer.",
    actions: [
      "Search by name, email, or phone number",
      "Click a customer row to view their full profile and order history",
      "See total spend, order count, and registration date per customer",
      "Reset a customer's password (sends an email with a reset link)",
      "View linked WhatsApp / Telegram conversations from the customer detail page",
    ],
    warnings: [
      "Customer data includes personal info (name, phone, address) — handle with care",
      "Deleting a customer account will not delete their order records",
      "Customers with is_temp_pass = 1 are prompted to change password on next login",
    ],
    links: [
      { label: "Open Customers", href: "/hs/customers" },
    ],
  },
  reviews: {
    icon: Star,
    title: "Reviews",
    desc: "Moderate customer reviews before they appear publicly. Approve, hide, or delete submissions.",
    actions: [
      "View all submitted reviews with rating, text, and attached photos",
      "Approve a review to make it visible on the public website",
      "Hide an approved review without deleting it",
      "Delete a review and all associated photos permanently",
      "Filter by rating (1–5 stars) or approval status",
    ],
    warnings: [
      "Only approved reviews appear on the public-facing website",
      "Deleted reviews and photos cannot be recovered",
      "Customers can only submit one review per order",
    ],
    links: [{ label: "Open Reviews", href: "/hs/reviews" }],
  },
  couriers: {
    icon: Truck,
    title: "Couriers & Zones",
    desc: "Configure delivery providers and postcode-based shipping fee zones. Both must be set up for orders to work.",
    actions: [
      "Add a courier with name, tracking URL template, and active status",
      "Edit or deactivate existing couriers",
      "Create postcode zones — group postcodes into regions with a flat fee",
      "Assign a shipping fee to each zone (used in order checkout calculation)",
      "Delete zones that are no longer needed",
    ],
    warnings: [
      "At least one active courier is required before orders can be assigned",
      "If no zone matches a customer's postcode, the order form will show 'Postcode not found' and log a postcode inquiry",
      "Zone fee changes apply to new orders only — existing orders keep the original fee",
      "Deactivating a courier does NOT affect orders already assigned to it",
    ],
    links: [
      { label: "Open Couriers", href: "/hs/couriers" },
      { label: "Open Zones", href: "/hs/zones" },
      { label: "Postcode Inquiries", href: "/hs/postcode-inquiries" },
    ],
  },
  reports: {
    icon: ChartNoAxesCombined,
    title: "Reports",
    desc: "Revenue summaries, order volume charts, and product sales breakdowns. Export data as CSV for offline analysis.",
    actions: [
      "View monthly revenue trend chart",
      "See top-selling products by order count and revenue",
      "Filter by date range to scope the analysis period",
      "Export full order data or customer data as CSV",
      "View the reports dashboard for a visual revenue and order summary",
    ],
    warnings: [
      "Export includes personal data (names, addresses) — store downloaded files securely",
      "Report data is live from the database — no caching, large exports may be slow",
    ],
    links: [
      { label: "Open Reports Dashboard", href: "/hs/reports" },
      { label: "Open Detailed Report", href: "/hs/report" },
    ],
  },
  bots: {
    icon: Bot,
    title: "Bots",
    desc: "Manage the WhatsApp AI bot and Telegram bot. Configure AI models, active hours, rate limits, and escalation rules.",
    actions: [
      "Toggle the WhatsApp AI bot on or off globally",
      "Select the Gemini model (Flash, Pro) for AI replies",
      "Set active hours so the bot only replies during business hours",
      "Configure daily message rate limits per phone number",
      "View and search all WhatsApp conversation history",
      "Send a test message to verify the bot is responding",
      "Set up escalation rules — keyword or time-based triggers to pause the bot and notify admin",
      "Manage Telegram bot settings and view conversation history",
      "Use the Marketing Design Studio to generate AI-powered promotional posters",
    ],
    warnings: [
      "Turning the bot off means ALL incoming WhatsApp messages get no automated reply",
      "Gemini Pro costs significantly more than Flash — monitor daily usage in the stats panel",
      "Escalation rules run in order — the first matching rule wins",
      "WhatsApp phone numbers must be stored without the + prefix (e.g. 60123456789)",
      "The debounce queue batches rapid messages — replies may be delayed up to 1 minute",
    ],
    links: [
      { label: "Open WhatsApp", href: "/hs/whatsapp" },
      { label: "Open Telegram", href: "/hs/telegram" },
      { label: "Design Studio", href: "/hs/marketing-design" },
    ],
  },
  google: {
    icon: Search,
    title: "Google",
    desc: "Google Analytics 4 traffic data and Google Search Console search performance. Both use service account authentication.",
    actions: [
      "View GA4 real-time and historical traffic metrics — sessions, users, pageviews",
      "See top pages by traffic and compare date ranges",
      "View GSC search performance — impressions, clicks, CTR, average position",
      "Filter GSC data by query, page, country, or device",
      "Export GSC data for SEO analysis",
    ],
    warnings: [
      "Both GA4 and GSC require a Google service account JSON key — stored in .env.local",
      "GA4 data has a 24–48 hour processing delay — real-time data may differ from reports",
      "GSC data reflects performance for the verified domain only",
      "If credentials expire or are revoked, both dashboards will show a 401 error",
    ],
    links: [
      { label: "Open GA4", href: "/hs/ga4" },
      { label: "Open GSC", href: "/hs/gsc" },
    ],
  },
  security: {
    icon: ShieldCheck,
    title: "Security",
    desc: "Monitor failed login attempts, Cloudflare Turnstile verifications, and admin session activity.",
    actions: [
      "View all failed admin and customer login attempts with IP address and timestamp",
      "Review Turnstile CAPTCHA verification logs — distinguish legitimate failures from bot probes",
      "Identify suspicious IPs with repeated failures and block them via Cloudflare IP Access rules",
      "Run the cleanup job to prune old login attempt records",
    ],
    warnings: [
      "Login attempts are rate-limited by IP — after 10 failures, the IP is temporarily blocked",
      "Turnstile verification is required on login, register, forgot password, and order forms",
      "Admin accounts use scrypt hashing (Node.js) — PHP bcrypt hashes are handled via verifyBcryptLegacy",
      "There is no server-side session invalidation — JWT logout only clears the cookie",
    ],
    links: [{ label: "Open Security", href: "/hs/security" }],
  },
  cloudflare: {
    icon: Cloud,
    title: "Cloudflare",
    desc: "Full Cloudflare zone management — DNS, WAF, cache, firewall, SSL, analytics, and more. 21 sub-tabs covering every Cloudflare feature.",
    actions: [
      "Overview — zone status, nameservers, plan info",
      "DNS — view and manage DNS records",
      "Firewall — configure firewall rules and IP blocking",
      "WAF — Web Application Firewall rules and OWASP managed rules",
      "SSL/TLS — certificate mode, HSTS, minimum TLS version",
      "Cache — cache level, browser TTL, Always Online, purge cache",
      "IP Access — allow/block specific IPs or CIDR ranges",
      "Workers — list deployed Cloudflare Workers",
      "Bots — bot fight mode and bot analytics",
      "Web Vitals — Core Web Vitals from Cloudflare Observatory",
      "Turnstile — manage Turnstile widgets and view analytics",
      "Rate Limits — configure rate limiting rules",
      "Page Rules — URL-based caching and redirect rules",
      "Health Checks — uptime monitoring configuration",
      "Notifications — alert policies for zone events",
      "Audit Log — Cloudflare account audit trail",
      "Email — Email Routing configuration",
      "Analytics — zone-level traffic and threat analytics",
      "HTTP — HTTP/2, HTTP/3, compression settings",
      "Settings — zone-level miscellaneous settings",
      "Information — CF Token Permissions reference guide",
    ],
    warnings: [
      "Changes to DNS records propagate globally in 1–5 minutes — plan carefully",
      "Purging the entire cache will temporarily slow the site for all visitors",
      "Dev Mode bypasses cache — remember to turn it off after testing",
      "WAF rule changes take effect immediately — a wrong rule can block legitimate traffic",
      "The Cloudflare API token requires specific permissions — see the Information tab for the full list",
    ],
    links: [{ label: "Open Cloudflare", href: "/hs/cloudflare" }],
  },
};

export default function AdminGuidePage() {
  const [tab, setTab] = useState<Tab>("orders");
  const section = SECTIONS[tab];
  const SectionIcon = section.icon;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Admin User Guide</h1>
        <p className="text-sm text-on-surface-variant mt-1">How to operate every section of this admin panel.</p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-outline-variant pb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            <t.icon size={16} aria-hidden="true" className="inline-block mr-2" />{t.label}
          </button>
        ))}
      </div>

      {/* Section card */}
      <div className="rounded-xl border border-outline-variant overflow-hidden bg-surface-container-low animate-fade-in">
        {/* Header */}
        <div className="flex items-start gap-4 p-5 border-b border-outline-variant bg-surface-container">
          <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xl shrink-0">
            <SectionIcon size={22} aria-hidden="true" />
          </div>
          <div>
            <div className="text-base font-bold text-on-surface">{section.title}</div>
            <div className="text-sm text-on-surface-variant mt-0.5 leading-relaxed">{section.desc}</div>
          </div>
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {/* Actions */}
          <div className="p-5 sm:border-r border-outline-variant">
            <div className="text-xs font-bold uppercase tracking-widest text-primary mb-3"><KeyRound size={16} aria-hidden="true" className="inline-block mr-2" />Key Actions</div>
            <ul className="space-y-2">
              {section.actions.map((a, i) => (
                <li key={i} className="text-sm text-on-surface-variant leading-relaxed flex gap-2">
                  <span className="text-on-surface-variant/40 text-xs mt-0.5 shrink-0"><ArrowRight size={14} aria-hidden="true" /></span>
                  <span dangerouslySetInnerHTML={{ __html: a.replace(/`([^`]+)`/g, '<code class="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">$1</code>') }} />
                </li>
              ))}
            </ul>
          </div>

          {/* Warnings */}
          <div className="p-5 border-t sm:border-t-0 border-outline-variant">
            <div className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-3"><TriangleAlert size={16} aria-hidden="true" className="inline-block mr-2" />Watch Out For</div>
            <ul className="space-y-2">
              {section.warnings.map((w, i) => (
                <li key={i} className="text-sm text-on-surface-variant leading-relaxed flex gap-2">
                  <span className="text-amber-500/60 text-xs mt-0.5 shrink-0"><ArrowRight size={14} aria-hidden="true" /></span>
                  <span dangerouslySetInnerHTML={{ __html: w.replace(/`([^`]+)`/g, '<code class="font-mono text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">$1</code>') }} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Links footer */}
        <div className="flex flex-wrap gap-3 items-center px-5 py-4 bg-surface-container border-t border-outline-variant">
          {section.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:opacity-85 transition-opacity"
            >
              {l.label}<ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

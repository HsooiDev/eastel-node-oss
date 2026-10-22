"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

const topItems: NavItem[] = [
  { href: "/hs/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/hs/orders", label: "Orders", icon: "📦" },
  { href: "/hs/shopee-tracking", label: "Shopee Tracking", icon: "🧡" },
  { href: "/hs/vouchers", label: "Vouchers", icon: "🎟️" },
  { href: "/hs/products", label: "Products", icon: "📱" },
  { href: "/hs/customers", label: "Customers", icon: "👥" },
  { href: "/hs/reviews", label: "Reviews", icon: "⭐" },
  { href: "/hs/couriers", label: "Couriers", icon: "🚚" },
  { href: "/hs/zones", label: "Postcode Zones", icon: "📮" },
  { href: "/hs/report", label: "Reports", icon: "📊" },
];

const bottomItems: NavItem[] = [
  { href: "/hs/security", label: "Security", icon: "🔒" },
  { href: "/hs/settings", label: "Settings", icon: "⚙️" },
  { href: "/hs/guide", label: "User Guide", icon: "📖" },
];

const navGroups: NavGroup[] = [
  {
    key: "design",
    label: "Design",
    items: [
      { href: "/hs/marketing-design", label: "Design Studio", icon: "🎨" },
      { href: "/hs/promo-graphic", label: "Promo Graphic", icon: "💎" },
      { href: "/hs/product-listing-photos", label: "Product Listing Generator", icon: "📸" },
      { href: "/hs/video-generator", label: "Video Generator", icon: "🎬" },
      { href: "/hs/video-recording", label: "Video Recorder", icon: "⏺" },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    items: [
      { href: "/hs/whatsapp", label: "WhatsApp", icon: "💬" },
      { href: "/hs/telegram", label: "Telegram", icon: "✈️" },
      { href: "/hs/cloudflare", label: "Cloudflare", icon: "☁️" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    items: [
      { href: "/hs/ga4", label: "GA4", icon: "📈" },
      { href: "/hs/gsc", label: "GSC", icon: "🔍" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (pathname.startsWith(href + "/")) return true;
  return false;
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function PostcodeInquiriesNavLink() {
  const pathname  = usePathname()
  const [newCount, setNewCount] = useState(0)
  const active = isActive(pathname, '/hs/postcode-inquiries')

  useEffect(() => {
    fetch('/api/admin/postcode-inquiries?status=new&per_page=1')
      .then(r => r.json())
      .then((d: { status: string; total?: number }) => {
        if (d.status === 'success') setNewCount(d.total ?? 0)
      })
      .catch(() => { /* swallow */ })
  }, [])

  return (
    <Link
      href="/hs/postcode-inquiries"
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <span>📍</span>
      <span>Postcode Inquiries</span>
      {newCount > 0 && (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 leading-none">
          {newCount > 99 ? '99+' : newCount}
        </span>
      )}
    </Link>
  )
}

function CollapsibleGroup({
  group,
  initialCollapsed,
}: {
  group: NavGroup;
  initialCollapsed: boolean;
}) {
  const pathname = usePathname();
  const storageKey = `sidebar-group-${group.key}`;

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return initialCollapsed;
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === "true" : initialCollapsed;
  });

  // Auto-expand when a child is active
  useEffect(() => {
    const hasActiveChild = group.items.some((item) => isActive(pathname, item.href));
    if (hasActiveChild && collapsed) {
      setCollapsed(false);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(storageKey, String(next));
  }

  const groupIsActive = group.items.some((item) => isActive(pathname, item.href));

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className={`flex w-full items-center gap-2 px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
          groupIsActive
            ? "text-primary/70"
            : "text-on-surface-variant/60 hover:text-on-surface-variant"
        }`}
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>{group.label}</span>
      </button>
      {!collapsed && (
        <div className="space-y-1 mt-1">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminSidebar() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function signOut() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.message || "Sign out failed.");
      router.replace("/hs/login");
      router.refresh();
    } catch (e) {
      setLogoutError(e instanceof Error ? e.message : "Sign out failed.");
      setLoggingOut(false);
    }
  }

  return (
    <aside className="w-64 shrink-0 border-r border-outline-variant bg-surface-container h-screen sticky top-0 overflow-y-auto flex flex-col">
      <div className="p-4 border-b border-outline-variant">
        <h2 className="text-lg font-bold text-primary">Eastel Admin</h2>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {topItems.slice(0, 2).map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <PostcodeInquiriesNavLink />
        {topItems.slice(2).map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        {navGroups.map((group) => (
          <CollapsibleGroup
            key={group.key}
            group={group}
            initialCollapsed={true}
          />
        ))}
        <div className="pt-4 border-t border-outline-variant" />
        {bottomItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <button
          onClick={() => document.documentElement.classList.toggle("dark")}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors mt-2"
        >
          <span>🌓</span>
          <span>Toggle Theme</span>
        </button>
        {logoutError && <p role="alert" className="px-3 py-1 text-xs text-error">{logoutError}</p>}
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-60"
        >
          <span>↪</span><span>{loggingOut ? "Signing out…" : "Sign Out"}</span>
        </button>
      </nav>
    </aside>
  );
}

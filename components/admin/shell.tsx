"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Package, MapPin, ShoppingBag, Ticket, Smartphone, Users, Star, Truck, Map, ChartNoAxesCombined, Palette, Gem, Images, Video, CircleDot, MessageCircle, Send, Cloud, Search, ShieldCheck, Settings, BookOpen, LogOut, Moon, Sun, Menu, X, ChevronDown, PanelLeft, ExternalLink, type LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon };
const core: Item[] = [
  { href: "/hs/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/hs/orders", label: "Orders", icon: Package },
  { href: "/hs/customers", label: "Customers", icon: Users },
  { href: "/hs/products", label: "Products", icon: Smartphone },
  { href: "/hs/vouchers", label: "Vouchers", icon: Ticket },
  { href: "/hs/shopee-tracking", label: "Shopee Tracking", icon: ShoppingBag },
  { href: "/hs/postcode-inquiries", label: "Postcode Inquiries", icon: MapPin },
  { href: "/hs/reviews", label: "Reviews", icon: Star },
  { href: "/hs/report", label: "Reports", icon: ChartNoAxesCombined },
];
const groups = [
  { key: "delivery", label: "Delivery", items: [{ href: "/hs/couriers", label: "Couriers", icon: Truck }, { href: "/hs/zones", label: "Postcode Zones", icon: Map }] },
  { key: "design", label: "Marketing", items: [{ href: "/hs/marketing-design", label: "Design Studio", icon: Palette }, { href: "/hs/promo-graphic", label: "Promo Graphic", icon: Gem }, { href: "/hs/product-listing-photos", label: "Product Listing Generator", icon: Images }, { href: "/hs/video-generator", label: "Video Generator", icon: Video }, { href: "/hs/video-recording", label: "Video Recorder", icon: CircleDot }] },
  { key: "integrations", label: "Integrations", items: [{ href: "/hs/whatsapp", label: "WhatsApp", icon: MessageCircle }, { href: "/hs/telegram", label: "Telegram", icon: Send }, { href: "/hs/cloudflare", label: "Cloudflare", icon: Cloud }] },
  { key: "analytics", label: "Analytics", items: [{ href: "/hs/ga4", label: "Google Analytics", icon: ChartNoAxesCombined }, { href: "/hs/gsc", label: "Search Console", icon: Search }] },
];
const system: Item[] = [{ href: "/hs/security", label: "Security", icon: ShieldCheck }, { href: "/hs/settings", label: "Settings", icon: Settings }, { href: "/hs/guide", label: "User Guide", icon: BookOpen }];
const allItems = [...core, ...groups.flatMap(group => group.items), ...system];
const activeAt = (path: string, href: string) => path === href || path.startsWith(href + "/");

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener("eastel-admin-nav", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("eastel-admin-nav", callback); };
}
function NavLink({ item, path, onNavigate, count = 0 }: { item: Item; path: string; onNavigate: () => void; count?: number }) {
  return <Link href={item.href} onClick={onNavigate} className="admin-nav-link" aria-label={count > 0 ? `${item.label}, ${count} new inquiries` : item.label} title={item.label} aria-current={activeAt(path, item.href) ? "page" : undefined}><item.icon size={19} strokeWidth={1.75} aria-hidden="true" /><span className="admin-nav-label">{item.label}</span>{count > 0 && <span className="admin-nav-count" aria-label={`${count} new inquiries`}>{count > 99 ? "99+" : count}</span>}</Link>;
}
function Group({ group, path, onNavigate, prefix }: { group: typeof groups[number]; path: string; onNavigate: () => void; prefix: string }) {
  const key = `sidebar-group-${group.key}`;
  const stored = useSyncExternalStore(subscribeStorage, () => { try { return localStorage.getItem(key); } catch { return null; } }, () => null);
  const [fallback, setFallback] = useState(false);
  const expanded = group.items.some(item => activeAt(path, item.href)) || (stored !== null ? stored === "false" : fallback);
  function toggle() { setFallback(!expanded); try { localStorage.setItem(key, String(expanded)); } catch {} window.dispatchEvent(new Event("eastel-admin-nav")); }
  return <div className="admin-nav-group"><button type="button" onClick={toggle} aria-expanded={expanded} aria-controls={`${prefix}-${group.key}`}><span>{group.label}</span><ChevronDown size={15} aria-hidden="true" className={expanded ? "is-expanded" : ""} /></button><div id={`${prefix}-${group.key}`} hidden={!expanded}>{group.items.map(item => <NavLink key={item.href} item={item} path={path} onNavigate={onNavigate} />)}</div></div>;
}
function SidebarContent({ path, name, count, onNavigate, onClose, onSignOut, loggingOut, logoutError, prefix, compact = false, onToggle, onSearchExpand }: { path: string; name: string; count: number; onNavigate: () => void; onClose?: () => void; onSignOut: () => void; loggingOut: boolean; logoutError: string; prefix: string; compact?: boolean; onToggle?: () => void; onSearchExpand?: () => void }) {
  const [search, setSearch] = useState("");
  const matches = allItems.filter(item => item.label.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <div className={`admin-brand${onToggle ? " admin-sidebar-heading" : ""}`}>
      {onToggle && <button type="button" className="admin-brand-control" onClick={onToggle} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} title={compact ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!compact} aria-controls={`${prefix}-navigation`}><PanelLeft size={21} strokeWidth={1.75} aria-hidden="true" /></button>}
      {!compact && <Link href="/hs/dashboard" onClick={onNavigate} aria-label="Eastel Admin overview"><strong className="admin-brand-wordmark">eastel</strong><span className="admin-brand-label">Admin</span></Link>}
      {onClose && <button type="button" className="admin-brand-control" onClick={onClose} aria-label="Close menu"><X size={19} strokeWidth={1.75} aria-hidden="true" /></button>}
    </div>
    {compact ? <button type="button" onClick={onSearchExpand} className="admin-rail-search" aria-label="Find an admin page" title="Find an admin page"><Search size={20} aria-hidden="true" /></button> : <label className="admin-nav-search"><Search size={17} aria-hidden="true" /><input type="search" placeholder="Find a page…" aria-label="Find an admin page" value={search} onChange={event => setSearch(event.target.value)} /></label>}
    <nav id={`${prefix}-navigation`} className="admin-nav" aria-label="Admin navigation">{compact ? allItems.map(item => <NavLink key={item.href} item={item} path={path} onNavigate={onNavigate} count={item.href === "/hs/postcode-inquiries" ? count : 0} />) : search.trim() ? <><p className="admin-search-status" role="status">{matches.length} pages found</p>{matches.map(item => <NavLink key={item.href} item={item} path={path} onNavigate={onNavigate} />)}</> : <>{core.map(item => <NavLink key={item.href} item={item} path={path} onNavigate={onNavigate} count={item.href === "/hs/postcode-inquiries" ? count : 0} />)}{groups.map(group => <Group key={group.key} group={group} path={path} onNavigate={onNavigate} prefix={prefix} />)}<div className="admin-nav-system">{system.map(item => <NavLink key={item.href} item={item} path={path} onNavigate={onNavigate} />)}</div></>}</nav>
    <div className="admin-sidebar-account"><span className="admin-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span><span><strong>{name}</strong><small>Administrator</small></span><button type="button" onClick={onSignOut} disabled={loggingOut} aria-label={loggingOut ? "Signing out" : "Sign out"} title="Sign out"><LogOut size={19} /></button>{logoutError && <p role="alert">{logoutError}</p>}</div>
  </>;
}
function subscribeTheme(callback: () => void) { const observer = new MutationObserver(callback); observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); return () => observer.disconnect(); }

/** Presentation-only table labels; existing React rows and action handlers stay intact. */
function useMobileTableLabels(workspace: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = workspace.current; if (!root) return;
    function labelTables() {
      root!.querySelectorAll("table").forEach(table => {
        if (table.closest("[data-admin-artwork]") || table.dataset.mobileLayout === "scroll") return;
        const headers = Array.from(table.querySelectorAll("thead tr:last-child th"));
        if (!headers.length || headers.some(header => (header as HTMLTableCellElement).colSpan !== 1)) return;
        table.dataset.mobileCards = "true";
        table.querySelectorAll("tbody tr").forEach(row => {
          let column = 0;
          Array.from(row.children).forEach(cell => { if (!(cell instanceof HTMLTableCellElement)) return; if (cell.colSpan === 1) cell.dataset.label = headers[column]?.textContent?.trim() || "Details"; column += cell.colSpan; });
        });
      });
    }
    labelTables(); const observer = new MutationObserver(labelTables); observer.observe(root, { childList: true, subtree: true }); return () => observer.disconnect();
  }, [workspace]);
}

export function AdminShell({ children, name = "Admin" }: { children: ReactNode; name?: string }) {
  const path = usePathname(); const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null); const workspace = useRef<HTMLElement>(null); const sidebar = useRef<HTMLElement>(null);
  const focusSearch = useRef(false);
  const savedCollapsed = useSyncExternalStore(subscribeStorage, () => { try { return localStorage.getItem("eastel-admin-sidebar-collapsed"); } catch { return null; } }, () => null);
  const [fallbackCollapsed, setFallbackCollapsed] = useState(false);
  const collapsed = savedCollapsed !== null ? savedCollapsed === "true" : fallbackCollapsed;
  const [menuOpen, setMenuOpen] = useState(false); const [count, setCount] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false); const [logoutError, setLogoutError] = useState("");
  const dark = useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === "dark", () => false);
  const current = allItems.find(item => activeAt(path, item.href));
  useMobileTableLabels(workspace);
  function setSidebarCollapsed(value: boolean) { setFallbackCollapsed(value); try { localStorage.setItem("eastel-admin-sidebar-collapsed", String(value)); } catch {} window.dispatchEvent(new Event("eastel-admin-nav")); }
  useEffect(() => { if (!collapsed && focusSearch.current) { sidebar.current?.querySelector<HTMLInputElement>("input[type='search']")?.focus(); focusSearch.current = false; } }, [collapsed]);
  function closeMenu() { dialog.current?.close(); setMenuOpen(false); }
  function openMenu() { dialog.current?.showModal(); setMenuOpen(true); }
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    const media = window.matchMedia("(min-width: 1024px)"); const closeAtDesktop = () => { if (media.matches) dialog.current?.close(); }; media.addEventListener("change", closeAtDesktop);
    return () => { document.body.style.overflow = previous; media.removeEventListener("change", closeAtDesktop); };
  }, [menuOpen]);
  useEffect(() => { const controller = new AbortController(); fetch("/api/admin/postcode-inquiries?status=new&per_page=1", { signal: controller.signal }).then(response => response.json()).then(data => { if (data.status === "success") setCount(data.total ?? 0); }).catch(() => {}); return () => controller.abort(); }, []);
  function toggleTheme() { const theme = dark ? "light" : "dark"; document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle("dark", theme === "dark"); try { localStorage.setItem("eastel-theme", theme); } catch {} }
  async function signOut() {
    setLoggingOut(true); setLogoutError("");
    try { const response = await fetch("/api/auth/logout", { method: "POST" }); const data = await response.json(); if (!response.ok || data.status !== "success") throw new Error(data.message || "Sign out failed. Please try again."); router.replace("/hs/login"); router.refresh(); }
    catch (error) { setLogoutError(error instanceof Error ? error.message : "Sign out failed."); setLoggingOut(false); }
  }
  const props = { path, name, count, loggingOut, logoutError, onSignOut: () => void signOut() };
  const primaryMobile = core.slice(0, 3);
  return <div className="admin-shell" lang="en" data-sidebar-collapsed={collapsed}>
    <a href="#admin-workspace" className="admin-skip-link">Skip to content</a>
    <aside ref={sidebar} className={`admin-sidebar${collapsed ? " is-collapsed" : ""}`}><SidebarContent {...props} prefix="desktop" compact={collapsed} onToggle={() => setSidebarCollapsed(!collapsed)} onSearchExpand={() => { focusSearch.current = true; setSidebarCollapsed(false); }} onNavigate={() => {}} /></aside>
    <div className="admin-stage"><header className="admin-toolbar"><Link href="/hs/dashboard" className="admin-mobile-brand" aria-label="Eastel overview">eastel<span>Admin</span></Link><div className="admin-toolbar-title">{current?.label || "Admin"}</div><div className="admin-toolbar-actions"><Link href="/en" target="_blank" rel="noopener noreferrer" className="admin-website-link" aria-label="View website"><ExternalLink size={16} aria-hidden="true" /><span>View website</span></Link><button type="button" onClick={toggleTheme} aria-label={dark ? "Use light theme" : "Use dark theme"} className="admin-icon-button">{dark ? <Sun size={20} /> : <Moon size={20} />}</button><span className="admin-toolbar-user"><span className="admin-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>{name}</span><button type="button" className="admin-icon-button admin-menu-button" onClick={openMenu} aria-label="Open admin menu" aria-haspopup="dialog" aria-expanded={menuOpen}><Menu size={23} /></button></div></header><main ref={workspace} id="admin-workspace" tabIndex={-1} className={`admin-workspace admin-page-${path.split("/")[2] || "dashboard"}`}>{children}</main></div>
    <nav className="admin-mobile-nav" aria-label="Quick navigation">{primaryMobile.map(item => <Link key={item.href} href={item.href} aria-current={activeAt(path, item.href) ? "page" : undefined}><item.icon size={21} strokeWidth={1.75} aria-hidden="true" /><span>{item.label}</span></Link>)}<button type="button" onClick={openMenu} aria-haspopup="dialog" aria-expanded={menuOpen} className={!primaryMobile.some(item => activeAt(path, item.href)) ? "is-current" : ""}><Menu size={22} aria-hidden="true" /><span>Menu</span></button></nav>
    <dialog ref={dialog} className="admin-drawer" aria-label="Admin menu" onClose={() => setMenuOpen(false)} onClick={event => { if (event.target === event.currentTarget) closeMenu(); }}><div className="admin-drawer-content"><SidebarContent {...props} prefix="mobile" onNavigate={closeMenu} onClose={closeMenu} /></div></dialog>
  </div>;
}

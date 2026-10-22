"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Zone {
  id: string; name: string; status: string; plan: string;
  nameServers: string[]; paused: boolean; devMode: boolean;
  type: string; created_on: string; modified_on: string;
}

type Tab = "overview" | "analytics" | "dns" | "firewall" | "ssl" | "cache" | "waf" | "ip_access" | "workers" | "settings" | "http" | "bots" | "webvitals" | "turnstile" | "healthchecks" | "notifications" | "audit_log" | "email" | "rate_limits" | "page_rules" | "information";

export default function CloudflareAdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchAction = useCallback(async (action: string) => {
    setLoading(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/cloudflare?action=${action}`);
      const d = await res.json();
      if (d.status === "success") {
        if (action === "overview" && d.zone) setZone(d.zone);
        setData((prev) => ({ ...prev, [action]: d }));
      } else { setMsg({ type: "error", text: d.message || "Failed." }); }
    } catch { setMsg({ type: "error", text: "Network error." }); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAction(tab); }, [tab, fetchAction]);

  async function doPost(action: string, extra: Record<string, unknown> = {}) {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/cloudflare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const d = await res.json();
      setMsg({ type: d.status === "success" ? "success" : "error", text: d.message || d.data?.message || "Done." });
      if (d.status === "success") fetchAction(tab);
    } catch { setMsg({ type: "error", text: "Network error." }); }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" }, { key: "analytics", label: "Analytics" }, { key: "dns", label: "DNS" },
    { key: "firewall", label: "Firewall" }, { key: "ssl", label: "SSL/TLS" }, { key: "cache", label: "Cache" },
    { key: "waf", label: "WAF" }, { key: "ip_access", label: "IP Access" }, { key: "workers", label: "Workers" },
    { key: "http", label: "HTTP" }, { key: "bots", label: "Bots" }, { key: "webvitals", label: "Web Vitals" },
    { key: "turnstile", label: "Turnstile" }, { key: "rate_limits", label: "Rate Limits" },
    { key: "page_rules", label: "Page Rules" }, { key: "healthchecks", label: "Health Checks" },
    { key: "notifications", label: "Notifications" }, { key: "audit_log", label: "Audit Log" },
    { key: "email", label: "Email" }, { key: "settings", label: "Settings" }, { key: "information", label: "Information" },
  ];

  const cd = (data[tab] as Record<string, unknown>) || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Cloudflare</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => doPost("purge_cache")}>Purge Cache</Button>
          <Button variant={zone?.devMode ? "danger" : "secondary"} size="sm" onClick={() => doPost("toggle_dev_mode")}>{zone?.devMode ? "Dev Mode OFF" : "Dev Mode ON"}</Button>
        </div>
      </div>
      {msg && <div className={`rounded-lg border p-4 text-sm ${msg.type === "success" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>{msg.text}</div>}

      <div className="flex gap-1 border-b border-outline-variant overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg ${tab === t.key ? "bg-surface-container text-on-surface border border-outline-variant border-b-transparent -mb-px" : "text-on-surface-variant hover:text-on-surface"}`}>{t.label}</button>
        ))}
      </div>

      {loading && <p className="text-on-surface-variant text-sm">Loading...</p>}

      {/* Overview */}
      {!loading && tab === "overview" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[{ l: "Zone", v: zone?.name }, { l: "Status", v: <Badge variant={zone?.status === "active" ? "success" : "warning"}>{zone?.status}</Badge> }, { l: "Plan", v: zone?.plan }, { l: "Type", v: zone?.type }, { l: "Dev Mode", v: <Badge variant={zone?.devMode ? "warning" : "neutral"}>{zone?.devMode ? "ON" : "OFF"}</Badge> }, { l: "Created", v: zone?.created_on ? new Date(zone.created_on).toLocaleDateString("en-MY") : "—" }].map((o) => (
            <Card key={o.l}><CardHeader><CardTitle className="text-sm text-on-surface-variant">{o.l}</CardTitle></CardHeader><CardContent><div className="text-on-surface">{o.v || "—"}</div></CardContent></Card>
          ))}
          <Card className="col-span-2"><CardHeader><CardTitle className="text-sm text-on-surface-variant">Nameservers</CardTitle></CardHeader><CardContent><div className="space-y-1">{zone?.nameServers?.map((ns: string) => <div key={ns} className="font-mono text-xs text-on-surface-variant bg-surface-container-high rounded px-2 py-1">{ns}</div>) || "—"}</div></CardContent></Card>
        </div>
      )}

      {/* Analytics */}
      {!loading && tab === "analytics" && (
        <Card><CardHeader><CardTitle>Traffic (7 days)</CardTitle></CardHeader><CardContent>
          {cd.dashboard ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[{ l: "Requests", v: (cd.dashboard as { totals?: { requests?: { all?: number } } })?.totals?.requests?.all }, { l: "Bandwidth", v: fmtBytes((cd.dashboard as { totals?: { bandwidth?: { all?: number } } })?.totals?.bandwidth?.all) }, { l: "Unique Visitors", v: (cd.dashboard as { totals?: { uniques?: { all?: number } } })?.totals?.uniques?.all }, { l: "Threats", v: (cd.dashboard as { totals?: { threats?: { all?: number } } })?.totals?.threats?.all }].map((s) => (
                <div key={s.l}><p className="text-xs text-on-surface-variant">{s.l}</p><p className="text-xl font-bold text-on-surface">{s.v ?? "—"}</p></div>
              ))}
            </div>
          ) : <p className="text-on-surface-variant text-sm">No data.</p>}
        </CardContent></Card>
      )}

      {/* DNS */}
      {!loading && tab === "dns" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>DNS Records</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.records) && (cd.records as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Name</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Content</th><th className="text-left py-3 px-4">TTL</th><th className="text-left py-3 px-4">Proxy</th></tr></thead>
              <tbody>{(cd.records as Array<Record<string, unknown>>).map((r, i) => (
                <tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 font-mono text-xs">{String(r.name)}</td><td className="py-2 px-4"><Badge variant="info">{String(r.type)}</Badge></td><td className="py-2 px-4 font-mono text-xs text-on-surface-variant truncate max-w-[200px]">{String(r.content)}</td><td className="py-2 px-4">{String(r.ttl)}</td><td className="py-2 px-4">{r.proxied ? "Yes" : "No"}</td></tr>
              ))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No records.</p>}
        </CardContent></Card>
      )}

      {/* Firewall */}
      {!loading && tab === "firewall" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Firewall Rules</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.rules) && (cd.rules as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Description</th><th className="text-left py-3 px-4">Action</th><th className="text-left py-3 px-4">Active</th></tr></thead>
              <tbody>{(cd.rules as Array<Record<string, unknown>>).map((r, i) => (
                <tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4">{String(r.description || r.id)}</td><td className="py-2 px-4"><Badge variant="warning">{String(r.action)}</Badge></td><td className="py-2 px-4">{r.paused ? "No" : "Yes"}</td></tr>
              ))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No rules.</p>}
        </CardContent></Card>
      )}

      {/* SSL */}
      {!loading && tab === "ssl" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardHeader><CardTitle className="text-sm text-on-surface-variant">SSL Setting</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-on-surface">{String((cd.settings as Record<string, unknown>)?.value || "—")}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-on-surface-variant">Certificates</CardTitle></CardHeader><CardContent>{Array.isArray(cd.packs) && (cd.packs as Array<Record<string, unknown>>).length > 0 ? (cd.packs as Array<Record<string, unknown>>).map((p, i) => <Badge key={i} variant="success" className="mr-1">{String(p.type)}</Badge>) : <p className="text-sm text-on-surface-variant">—</p>}</CardContent></Card>
        </div>
      )}

      {/* Cache */}
      {!loading && tab === "cache" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[{ l: "Cache Level", v: (cd.cacheLevel as Record<string, unknown>)?.value, a: "toggle_cache_level", o: ["standard","aggressive","simplified"] }, { l: "Browser Cache TTL", v: `${(cd.browserCache as Record<string, unknown>)?.value || 0}s`, a: "toggle_browser_cache", o: [0, 1800, 3600, 7200, 14400, 28800, 43200, 86400] }, { l: "Always Online", v: (cd.alwaysOnline as Record<string, unknown>)?.value, a: "toggle_always_online", o: ["on","off"] }].map((item) => (
            <Card key={item.l}><CardHeader><CardTitle className="text-sm text-on-surface-variant">{item.l}</CardTitle></CardHeader><CardContent className="space-y-2">
              <p className="font-mono text-on-surface">{String(item.v || "—")}</p>
              <select className="w-full rounded border border-outline-variant bg-surface-container px-2 py-1 text-xs" onChange={(e) => { if (e.target.value) doPost(item.a, item.a === "toggle_browser_cache" ? { value: Number(e.target.value) } : { value: e.target.value }); }} defaultValue=""><option value="">Change...</option>{item.o.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* WAF */}
      {!loading && tab === "waf" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>WAF Rules</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.rules) && (cd.rules as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">ID</th><th className="text-left py-3 px-4">Description</th><th className="text-left py-3 px-4">Mode</th></tr></thead>
              <tbody>{(cd.rules as Array<Record<string, unknown>>).map((r, i) => (
                <tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 font-mono text-xs">{String(r.id)}</td><td className="py-2 px-4">{String(r.description)}</td><td className="py-2 px-4"><Badge variant={r.mode === "on" ? "success" : "warning"}>{String(r.mode)}</Badge></td></tr>
              ))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No rules.</p>}
        </CardContent></Card>
      )}

      {/* IP Access */}
      {!loading && tab === "ip_access" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>IP Access Rules</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.rules) && (cd.rules as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Target</th><th className="text-left py-3 px-4">Action</th><th className="text-left py-3 px-4">Notes</th></tr></thead>
              <tbody>{(cd.rules as Array<Record<string, unknown>>).map((r, i) => (
                <tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 font-mono text-xs">{String((r.configuration as Record<string, unknown>)?.target)}: {String((r.configuration as Record<string, unknown>)?.value)}</td><td className="py-2 px-4"><Badge variant={r.mode === "block" ? "error" : "warning"}>{String(r.mode)}</Badge></td><td className="py-2 px-4 text-xs">{String(r.notes || "—")}</td></tr>
              ))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No rules.</p>}
        </CardContent></Card>
      )}

      {/* Workers */}
      {!loading && tab === "workers" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Worker Routes</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.routes) && (cd.routes as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Pattern</th><th className="text-left py-3 px-4">Script</th></tr></thead>
              <tbody>{(cd.routes as Array<Record<string, unknown>>).map((r, i) => (
                <tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 font-mono text-xs">{String(r.pattern)}</td><td className="py-2 px-4 text-xs">{String(r.script || "—")}</td></tr>
              ))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No routes.</p>}
        </CardContent></Card>
      )}

      {/* Settings */}
      {/* HTTP */}
      {!loading && tab === "http" && (
        <Card><CardHeader><CardTitle>HTTP Analytics (7 days)</CardTitle></CardHeader><CardContent>
          {cd.data ? <pre className="text-xs text-on-surface-variant whitespace-pre-wrap max-h-96 overflow-y-auto">{JSON.stringify(cd.data, null, 2)}</pre> : <p className="text-on-surface-variant text-sm">No data.</p>}
        </CardContent></Card>
      )}
      {/* Bots */}
      {!loading && tab === "bots" && (
        <Card><CardHeader><CardTitle>Bot Analytics (7 days)</CardTitle></CardHeader><CardContent>
          {cd.data ? <pre className="text-xs text-on-surface-variant whitespace-pre-wrap max-h-96 overflow-y-auto">{JSON.stringify(cd.data, null, 2)}</pre> : <p className="text-on-surface-variant text-sm">No data.</p>}
        </CardContent></Card>
      )}
      {/* Web Vitals */}
      {!loading && tab === "webvitals" && (
        <Card><CardHeader><CardTitle>Web Vitals</CardTitle></CardHeader><CardContent>
          {cd.data ? <pre className="text-xs text-on-surface-variant whitespace-pre-wrap">{JSON.stringify(cd.data, null, 2)}</pre> : <p className="text-on-surface-variant text-sm">No data.</p>}
        </CardContent></Card>
      )}
      {/* Turnstile */}
      {!loading && tab === "turnstile" && (
        <Card><CardHeader><CardTitle>Turnstile Analytics</CardTitle></CardHeader><CardContent>
          {cd.data ? <pre className="text-xs text-on-surface-variant whitespace-pre-wrap">{JSON.stringify(cd.data, null, 2)}</pre> : <p className="text-on-surface-variant text-sm">No data.</p>}
        </CardContent></Card>
      )}
      {/* Rate Limits */}
      {!loading && tab === "rate_limits" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Rate Limiting Rules</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.rules) && (cd.rules as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Description</th><th className="text-left py-3 px-4">Match</th><th className="text-left py-3 px-4">Threshold</th><th className="text-left py-3 px-4">Period</th><th className="text-left py-3 px-4">Action</th></tr></thead>
              <tbody>{(cd.rules as Array<Record<string, unknown>>).map((r, i) => (<tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 text-sm">{String((r as Record<string, unknown>).description || "—")}</td><td className="py-2 px-4 font-mono text-xs">{String((r.match as { request?: { path?: string } })?.request?.path || "—")}</td><td className="py-2 px-4">{String((r as Record<string, unknown>).threshold || "—")}</td><td className="py-2 px-4">{String((r as Record<string, unknown>).period || "—")}s</td><td className="py-2 px-4"><Badge variant="warning">{String((r as Record<string, unknown>).action || "—")}</Badge></td></tr>))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No rate limit rules.</p>}
        </CardContent></Card>
      )}
      {/* Page Rules */}
      {!loading && tab === "page_rules" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Page Rules</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.rules) && (cd.rules as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Target</th><th className="text-left py-3 px-4">Actions</th><th className="text-left py-3 px-4">Status</th></tr></thead>
              <tbody>{(cd.rules as Array<Record<string, unknown>>).map((r, i) => (<tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 font-mono text-xs">{String(((r.targets as Array<{ constraint?: { value?: string } }>)?.[0])?.constraint?.value || "—")}</td><td className="py-2 px-4 text-xs">{String((r.actions as Array<Record<string, unknown>>)?.map((a: Record<string, unknown>) => String(a.id || "")).join(", ") || "—")}</td><td className="py-2 px-4"><Badge variant={r.status === "active" ? "success" : "neutral"}>{String(r.status)}</Badge></td></tr>))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No page rules.</p>}
        </CardContent></Card>
      )}
      {/* Health Checks */}
      {!loading && tab === "healthchecks" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Health Checks</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.checks) && (cd.checks as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Name</th><th className="text-left py-3 px-4">Address</th><th className="text-left py-3 px-4">Status</th><th className="text-left py-3 px-4">Interval</th></tr></thead>
              <tbody>{(cd.checks as Array<Record<string, unknown>>).map((r, i) => (<tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 text-sm">{String(r.name || "—")}</td><td className="py-2 px-4 font-mono text-xs">{String(r.address || "—")}</td><td className="py-2 px-4"><Badge variant={r.status === "healthy" ? "success" : "warning"}>{String(r.status)}</Badge></td><td className="py-2 px-4">{String(r.interval || "—")}s</td></tr>))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No health checks.</p>}
        </CardContent></Card>
      )}
      {/* Notifications */}
      {!loading && tab === "notifications" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Notification Policies</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.policies) && (cd.policies as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Name</th><th className="text-left py-3 px-4">Alert Type</th><th className="text-left py-3 px-4">Enabled</th></tr></thead>
              <tbody>{(cd.policies as Array<Record<string, unknown>>).map((r, i) => (<tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 text-sm">{String(r.name || "—")}</td><td className="py-2 px-4 text-xs">{String(r.alert_type || "—")}</td><td className="py-2 px-4"><Badge variant={r.enabled ? "success" : "neutral"}>{r.enabled ? "Yes" : "No"}</Badge></td></tr>))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No notification policies.</p>}
        </CardContent></Card>
      )}
      {/* Audit Log */}
      {!loading && tab === "audit_log" && (
        <Card padding="none"><CardHeader className="px-6 pt-6"><CardTitle>Audit Log</CardTitle></CardHeader><CardContent className="px-6 pb-6">
          {Array.isArray(cd.logs) && (cd.logs as Array<Record<string, unknown>>).length > 0 ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">When</th><th className="text-left py-3 px-4">Action</th><th className="text-left py-3 px-4">Actor</th></tr></thead>
              <tbody>{(cd.logs as Array<Record<string, unknown>>).slice(0, 50).map((r, i) => (<tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 text-xs">{String(r.when || "—")}</td><td className="py-2 px-4 text-sm">{String((r.action as Record<string, unknown>)?.result ? ((r.action as Record<string, unknown>).result as Record<string, unknown>)?.name : (r.action as Record<string, unknown>)?.type || "—")}</td><td className="py-2 px-4 text-xs text-on-surface-variant">{String((r.actor as Record<string, unknown>)?.email || "—")}</td></tr>))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No audit log entries.</p>}
        </CardContent></Card>
      )}
      {/* Email */}
      {!loading && tab === "email" && (
        <Card><CardHeader><CardTitle>Email Routing</CardTitle></CardHeader><CardContent>
          {cd.rules ? <pre className="text-xs text-on-surface-variant whitespace-pre-wrap">{JSON.stringify(cd.rules, null, 2)}</pre> : <p className="text-on-surface-variant text-sm">No email routing rules.</p>}
        </CardContent></Card>
      )}
      {/* Settings */}
      {!loading && tab === "settings" && (
        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="text-sm text-on-surface-variant">Security Level</CardTitle></CardHeader><CardContent><select className="rounded border border-outline-variant bg-surface-container px-3 py-1.5 text-sm" onChange={(e) => doPost("toggle_security_level", { value: e.target.value })} defaultValue=""><option value="">Change...</option><option value="essentially_off">Essentially Off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="under_attack">Under Attack</option></select></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-on-surface-variant">SSL/TLS Mode</CardTitle></CardHeader><CardContent><select className="rounded border border-outline-variant bg-surface-container px-3 py-1.5 text-sm" onChange={(e) => doPost("toggle_ssl", { value: e.target.value })} defaultValue=""><option value="">Change...</option><option value="off">Off</option><option value="flexible">Flexible</option><option value="full">Full</option><option value="strict">Strict</option></select></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-on-surface-variant">Purge URL</CardTitle></CardHeader><CardContent><form onSubmit={(e) => { e.preventDefault(); const inp = (e.target as HTMLFormElement).querySelector("input"); if (inp) { doPost("purge_url", { urls: [inp.value] }); inp.value = ""; } }} className="flex gap-2"><input placeholder="https://eastel.site/page" className="flex-1 rounded border border-outline-variant bg-surface-container px-3 py-1.5 text-sm" /><Button type="submit" size="sm">Purge</Button></form></CardContent></Card>
        </div>
      )}

      {/* Information */}
      {!loading && tab === "information" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-on-surface tracking-tight">Token Permissions Reference Guide</h2>
            <p className="text-on-surface-variant text-sm">Every permission required to run this admin panel — organised by token scope, with explanations for why the architecture is split the way it is.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-blue-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="info">🌐</Badge> Token 1 — Zone Scope (CF_API_TOKEN)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-on-surface-variant mb-4">Zone scoped · eastel.site · 10 permissions</p>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-3 font-semibold text-xs uppercase tracking-wider text-on-surface-variant pb-2 border-b border-outline-variant">
                    <div>Permission</div><div>Level</div><div>Used By</div>
                  </div>
                  {[
                    { name: 'Zone', level: 'Read', used: 'SSL Status, Zone Analytics' },
                    { name: 'Analytics', level: 'Read', used: 'Zone Analytics, HTTP Analytics, Firewall Events' },
                    { name: 'DNS', level: 'Edit', used: 'DNS Records' },
                    { name: 'Firewall Services', level: 'Edit', used: 'IP Access Rules, Firewall Events, Rate Limiting' },
                    { name: 'Page Rules', level: 'Edit', used: 'Page Rules' },
                    { name: 'Cache Purge', level: 'Purge', used: 'Cache Purge' },
                    { name: 'SSL and Certificates', level: 'Read', used: 'SSL Status' },
                    { name: 'Email Routing Rules', level: 'Read', used: 'Email Routing' },
                    { name: 'Zone Settings', level: 'Edit', used: 'Zone Settings' },
                    { name: 'Health Checks', level: 'Edit', used: 'Health Checks (Pro)' },
                  ].map((p, i) => (
                    <div key={i} className="grid grid-cols-3 py-1 border-b border-outline-variant/30">
                      <div className="font-mono text-xs">{p.name}</div>
                      <div><Badge variant="neutral">{p.level}</Badge></div>
                      <div className="text-xs text-on-surface-variant">{p.used}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-amber-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="warning">🏢</Badge> Token 2 — Account Scope (CF_ACCOUNT_TOKEN)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-on-surface-variant mb-4">Account scoped · Your account · 4 permissions</p>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-3 font-semibold text-xs uppercase tracking-wider text-on-surface-variant pb-2 border-b border-outline-variant">
                    <div>Permission</div><div>Level</div><div>Used By</div>
                  </div>
                  {[
                    { name: 'Account Analytics', level: 'Read', used: 'Web Vitals / RUM' },
                    { name: 'Cloudflare Turnstile', level: 'Edit', used: 'Turnstile Analytics' },
                    { name: 'Workers Scripts', level: 'Read', used: 'Workers Scripts' },
                    { name: 'Notifications', level: 'Edit', used: 'Notifications & Alerts' },
                  ].map((p, i) => (
                    <div key={i} className="grid grid-cols-3 py-1 border-b border-outline-variant/30">
                      <div className="font-mono text-xs">{p.name}</div>
                      <div><Badge variant="neutral">{p.level}</Badge></div>
                      <div className="text-xs text-on-surface-variant">{p.used}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader><CardTitle>Environment Variables</CardTitle></CardHeader>
            <CardContent>
              <pre className="p-4 rounded-lg bg-[#0d1117] text-gray-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
{`# ── Token 1 · Zone scoped · eastel.site ─────────────────────
CLOUDFLARE_API_TOKEN="your-zone-token-here"

# ── Token 2 · Account scoped · Web Vitals + Turnstile ────────
CLOUDFLARE_ACCOUNT_TOKEN="your-account-token-here"

# ─────────────────────────────────────────────────────────────

# Zone ID — CF Dashboard → eastel.site → Overview → right sidebar
CLOUDFLARE_ZONE_ID="your-zone-id-here"

# Account ID — visible in the Cloudflare dashboard URL
CLOUDFLARE_ACCOUNT_ID="your-account-id-here"`}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function fmtBytes(b: number | undefined): string {
  if (!b || !Number.isFinite(b)) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(1)} GB`;
}

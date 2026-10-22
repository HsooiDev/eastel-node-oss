"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DashboardData {
  configured: boolean;
  message?: string;
  startDate?: string;
  endDate?: string;
  overview?: { rows: Array<Record<string, string | number>>; totals: Array<string[]> };
  topPages?: { rows: Array<Record<string, string | number>> };
  devices?: { rows: Array<Record<string, string | number>> };
  geo?: { rows: Array<Record<string, string | number>> };
}

export default function GA4AdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ga4?days=${days}`);
      setData(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="space-y-6"><h1 className="text-2xl font-bold text-on-surface">Google Analytics 4</h1><p className="text-on-surface-variant">Loading...</p></div>;
  if (!data?.configured) return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-on-surface">Google Analytics 4</h1>
      <Card><CardContent className="pt-6"><p className="text-on-surface-variant">{data?.message || "Not configured."}</p></CardContent></Card>
    </div>
  );

  const overview = data.overview?.rows?.[0] || {};
  const totals = data.overview?.totals?.[0] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Google Analytics 4</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm">
          <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
        </select>
      </div>

      <p className="text-xs text-on-surface-variant">{data.startDate} – {data.endDate}</p>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { l: "Sessions", v: overview.sessions || totals[0] || "—" },
          { l: "Users", v: overview.totalUsers || totals[1] || "—" },
          { l: "Page Views", v: overview.screenPageViews || totals[2] || "—" },
          { l: "Avg Duration", v: overview.averageSessionDuration ? `${Number(overview.averageSessionDuration).toFixed(0)}s` : "—" },
          { l: "Bounce Rate", v: overview.bounceRate ? `${(Number(overview.bounceRate) * 100).toFixed(1)}%` : "—" },
        ].map((s) => (
          <Card key={s.l}><CardHeader><CardTitle className="text-sm text-on-surface-variant">{s.l}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-on-surface">{String(s.v)}</p></CardContent></Card>
        ))}
      </div>

      {/* Top Pages */}
      <Card padding="none">
        <CardHeader className="px-6 pt-6"><CardTitle>Top Pages</CardTitle></CardHeader>
        <CardContent className="px-6 pb-6">
          {data.topPages?.rows?.length ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Page</th><th className="text-right py-3 px-4">Views</th></tr></thead>
              <tbody>{data.topPages.rows.map((r, i) => (
                <tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 font-mono text-xs truncate max-w-[300px]">{String(r.pagePath)}</td><td className="py-2 px-4 text-right font-medium">{String(r.screenPageViews)}</td></tr>
              ))}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No data.</p>}
        </CardContent>
      </Card>

      {/* Devices & Geography */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="none">
          <CardHeader className="px-6 pt-6"><CardTitle>By Device</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6">
            {data.devices?.rows?.length ? (
              <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Device</th><th className="text-right py-3 px-4">Sessions</th></tr></thead>
                <tbody>{data.devices.rows.map((r, i) => (
                  <tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4">{String(r.deviceCategory)}</td><td className="py-2 px-4 text-right font-medium">{String(r.sessions)}</td></tr>
                ))}</tbody></table>
            ) : <p className="text-on-surface-variant text-sm">No data.</p>}
          </CardContent>
        </Card>

        <Card padding="none">
          <CardHeader className="px-6 pt-6"><CardTitle>By Country</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6">
            {data.geo?.rows?.length ? (
              <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Country</th><th className="text-right py-3 px-4">Sessions</th></tr></thead>
                <tbody>{data.geo.rows.map((r, i) => (
                  <tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4">{String(r.country)}</td><td className="py-2 px-4 text-right font-medium">{String(r.sessions)}</td></tr>
                ))}</tbody></table>
            ) : <p className="text-on-surface-variant text-sm">No data.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

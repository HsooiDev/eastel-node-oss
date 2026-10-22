"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface DashboardData {
  configured: boolean;
  message?: string;
  startDate?: string;
  endDate?: string;
  queries?: GscRow[];
  pages?: GscRow[];
  countries?: GscRow[];
  overview?: GscRow[];
}

function formatRow(r: GscRow) {
  return {
    label: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: (r.ctr * 100).toFixed(1) + "%",
    position: r.position.toFixed(1),
  };
}

export default function GSCAdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/gsc?days=${days}`);
      setData(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="space-y-6"><h1 className="text-2xl font-bold text-on-surface">Google Search Console</h1><p className="text-on-surface-variant">Loading...</p></div>;
  if (!data?.configured) return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-on-surface">Google Search Console</h1>
      <Card><CardContent className="pt-6"><p className="text-on-surface-variant">{data?.message || "Not configured."}</p></CardContent></Card>
    </div>
  );

  // Compute totals from overview (daily data)
  const totalClicks = data.overview?.reduce((s, r) => s + r.clicks, 0) || 0;
  const totalImpressions = data.overview?.reduce((s, r) => s + r.impressions, 0) || 0;
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "0.0";
  const avgPos = data.overview?.length ? (data.overview.reduce((s, r) => s + r.position, 0) / data.overview.length).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Google Search Console</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm">
          <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
        </select>
      </div>

      <p className="text-xs text-on-surface-variant">{data.startDate} – {data.endDate} (GSC data lags ~3 days)</p>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { l: "Total Clicks", v: totalClicks.toLocaleString() },
          { l: "Impressions", v: totalImpressions.toLocaleString() },
          { l: "Avg CTR", v: avgCtr + "%" },
          { l: "Avg Position", v: avgPos },
        ].map((s) => (
          <Card key={s.l}><CardHeader><CardTitle className="text-sm text-on-surface-variant">{s.l}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-on-surface">{String(s.v)}</p></CardContent></Card>
        ))}
      </div>

      {/* Top Queries */}
      <Card padding="none">
        <CardHeader className="px-6 pt-6"><CardTitle>Top Queries</CardTitle></CardHeader>
        <CardContent className="px-6 pb-6">
          {data.queries?.length ? (
            <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Query</th><th className="text-right py-3 px-4">Clicks</th><th className="text-right py-3 px-4">Impressions</th><th className="text-right py-3 px-4">CTR</th><th className="text-right py-3 px-4">Pos</th></tr></thead>
              <tbody>{data.queries.map((r, i) => {
                const f = formatRow(r);
                return (<tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 truncate max-w-[250px]">{f.label}</td><td className="py-2 px-4 text-right">{f.clicks}</td><td className="py-2 px-4 text-right">{f.impressions}</td><td className="py-2 px-4 text-right">{f.ctr}</td><td className="py-2 px-4 text-right">{f.position}</td></tr>);
              })}</tbody></table>
          ) : <p className="text-on-surface-variant text-sm">No data.</p>}
        </CardContent>
      </Card>

      {/* Top Pages & Countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="none">
          <CardHeader className="px-6 pt-6"><CardTitle>Top Pages</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6">
            {data.pages?.length ? (
              <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Page</th><th className="text-right py-3 px-4">Clicks</th><th className="text-right py-3 px-4">Impr.</th></tr></thead>
                <tbody>{data.pages.map((r, i) => {
                  const f = formatRow(r);
                  return (<tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4 font-mono text-xs truncate max-w-[200px]">{f.label}</td><td className="py-2 px-4 text-right">{f.clicks}</td><td className="py-2 px-4 text-right">{f.impressions}</td></tr>);
                })}</tbody></table>
            ) : <p className="text-on-surface-variant text-sm">No data.</p>}
          </CardContent>
        </Card>

        <Card padding="none">
          <CardHeader className="px-6 pt-6"><CardTitle>By Country</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6">
            {data.countries?.length ? (
              <table className="w-full text-sm"><thead><tr className="border-b border-outline-variant"><th className="text-left py-3 px-4">Country</th><th className="text-right py-3 px-4">Clicks</th><th className="text-right py-3 px-4">Impr.</th></tr></thead>
                <tbody>{data.countries.map((r, i) => {
                  const f = formatRow(r);
                  return (<tr key={i} className="border-b border-outline-variant/50"><td className="py-2 px-4">{f.label}</td><td className="py-2 px-4 text-right">{f.clicks}</td><td className="py-2 px-4 text-right">{f.impressions}</td></tr>);
                })}</tbody></table>
            ) : <p className="text-on-surface-variant text-sm">No data.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

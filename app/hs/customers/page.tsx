"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface CustomerRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  is_temp_pass: number;
  order_count: number;
  created_at: string;
}

function fmtDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AvatarChip({ name }: { name: string }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: "var(--admin-blue)" }}
    >
      {initial}
    </span>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container p-4">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}

export default function CustomersPage() {
  const [all, setAll] = useState<CustomerRow[]>([]);
  const [filtered, setFiltered] = useState<CustomerRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/customers?all=1");
      const data = await res.json();
      const rows: CustomerRow[] = data.customers ?? [];
      setAll(rows);
      setFiltered(rows);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function applyFilters(status: string, q: string, rows: CustomerRow[]) {
    let out = rows;
    if (status === "temp") out = out.filter((c) => Number(c.is_temp_pass) === 1);
    if (status === "orders") out = out.filter((c) => Number(c.order_count) > 0);
    if (status === "no_orders") out = out.filter((c) => Number(c.order_count) === 0);
    if (q) {
      const lq = q.toLowerCase();
      out = out.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(lq) ||
          (c.email || "").toLowerCase().includes(lq) ||
          (c.phone || "").toLowerCase().includes(lq)
      );
    }
    setFiltered(out);
  }

  function handleStatus(v: string) {
    setStatusFilter(v);
    applyFilters(v, search, all);
  }

  function handleSearch(v: string) {
    setSearch(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => applyFilters(statusFilter, v, all), 280);
  }

  function clearFilters() {
    setStatusFilter("");
    setSearch("");
    setFiltered(all);
  }

  // Stats
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);
  const stats = {
    total: all.length,
    withOrders: all.filter((c) => Number(c.order_count) > 0).length,
    temp: all.filter((c) => Number(c.is_temp_pass) === 1).length,
    newMonth: all.filter((c) => c.created_at?.startsWith(thisMonth)).length,
    today: all.filter((c) => c.created_at?.startsWith(today)).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Customers</h1>
          <p className="text-sm text-on-surface-variant">All registered customer accounts.</p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard value={stats.total} label="Total Accounts" color="text-purple-400" />
        <StatCard value={stats.withOrders} label="With Orders" color="text-green-400" />
        <StatCard value={stats.temp} label="Temp Password" color="text-yellow-400" />
        <StatCard value={stats.newMonth} label="New This Month" color="text-blue-400" />
        <StatCard value={stats.today} label="Joined Today" color="text-teal-400" />
      </div>

      {/* Filters + table */}
      <div className="rounded-xl border border-outline-variant bg-surface-container overflow-hidden">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-variant">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatus(e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-sm text-on-surface"
            >
              <option value="">All</option>
              <option value="temp">Temp Password</option>
              <option value="orders">Has Orders</option>
              <option value="no_orders">No Orders</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-variant">Search:</label>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Name / email / phone…"
              className="rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 w-44"
            />
          </div>
          {(statusFilter || search) && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Clear
            </button>
          )}
          {!loading && (
            <span className="ml-auto text-xs text-on-surface-variant">
              Showing {filtered.length} of {all.length}
            </span>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-xs text-on-surface-variant">
                <th className="px-4 py-3 text-left font-semibold">#</th>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Orders</th>
                <th className="px-4 py-3 text-left font-semibold">Joined</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">
                    ⏳ Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">
                    👥 No customers found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-outline-variant/50 hover:bg-surface-container-high transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-on-surface-variant">#{c.id}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <AvatarChip name={c.name} />
                        <div>
                          <div className="font-semibold text-on-surface">{c.name || "—"}</div>
                          <div className="text-xs text-on-surface-variant">{c.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{c.phone || "—"}</td>
                    <td className="px-4 py-3">
                      {Number(c.is_temp_pass) === 1 ? (
                        <span className="inline-block rounded-full bg-yellow-400/15 px-2 py-0.5 text-xs font-bold text-yellow-400">
                          Temp Password
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-green-400/15 px-2 py-0.5 text-xs font-bold text-green-400">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          Number(c.order_count) > 0
                            ? "font-bold text-teal-400"
                            : "text-on-surface-variant"
                        }
                      >
                        {c.order_count || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                      {fmtDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/hs/customers/${c.id}`}
                        className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface hover:border-purple-400 hover:text-purple-400 transition-colors"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

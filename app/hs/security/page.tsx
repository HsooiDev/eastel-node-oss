"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LoginAttemptRow {
  id: number;
  ip_address: string;
  email: string;
  attempt_type: string;
  attempted_at: string;
}

interface AuditRow {
  id: number;
  admin_id: number | null;
  admin_name: string | null;
  action: string;
  target_table: string | null;
  target_id: number | null;
  new_value: string | null;
  ip_address: string | null;
  created_at: string;
}

export default function SecurityPage() {
  const [attempts, setAttempts] = useState<LoginAttemptRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [attemptType, setAttemptType] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [attemptFailure, setAttemptFailure] = useState("");
  const [showPrivate, setShowPrivate] = useState(false);
  const attemptRequest = useRef(0);

  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFailure, setAuditFailure] = useState("");
  const auditRequest = useRef(0);

  const fetchAttempts = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++attemptRequest.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "50" });
      if (attemptType) params.set("attempt_type", attemptType);
      if (ipFilter.trim()) params.set("ip", ipFilter.trim());
      const res = await fetch(`/api/admin/security?${params}`, { signal });
      const data = await res.json();
      if (!res.ok || data.status !== "success") throw new Error(data.message || "Failed to load login attempts.");
      if (signal?.aborted || requestId !== attemptRequest.current) return;
      setAttempts(data.attempts ?? []);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setAttemptFailure("");
    } catch (e) {
      if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError") || requestId !== attemptRequest.current) return;
      setAttemptFailure(e instanceof Error ? e.message : "Failed to load login attempts.");
    } finally {
      if (!signal?.aborted && requestId === attemptRequest.current) setLoading(false);
    }
  }, [page, attemptType, ipFilter]);

  const fetchAudit = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++auditRequest.current;
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/admin/security?action=audit&page=${auditPage}&perPage=50`, { signal });
      const data = await res.json();
      if (!res.ok || data.status !== "success") throw new Error(data.message || "Failed to load admin actions.");
      if (signal?.aborted || requestId !== auditRequest.current) return;
      setAudit(data.entries ?? []);
      setAuditTotalPages(data.pagination?.totalPages ?? 1);
      setAuditFailure("");
    } catch (e) {
      if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError") || requestId !== auditRequest.current) return;
      setAuditFailure(e instanceof Error ? e.message : "Failed to load admin actions.");
    } finally {
      if (!signal?.aborted && requestId === auditRequest.current) setAuditLoading(false);
    }
  }, [auditPage]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAttempts(controller.signal);
    return () => controller.abort();
  }, [fetchAttempts]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAudit(controller.signal);
    return () => controller.abort();
  }, [fetchAudit]);

  function clearAttemptFilters() {
    setAttemptType(""); setIpFilter(""); setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto"><h1 className="text-2xl font-bold text-on-surface">Security</h1><p className="mt-1 text-sm text-on-surface-variant">Privacy mode is on by default for IP, email, and audit details.</p></div>
        <Button variant="secondary" size="sm" onClick={() => setShowPrivate((visible) => !visible)}>{showPrivate ? "Hide private values" : "Reveal private values"}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-semibold text-on-surface">Login Attempts</h2>
        <select aria-label="Filter by attempt type" value={attemptType} onChange={(e) => { setAttemptType(e.target.value); setPage(1); }} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface">
          <option value="">All types</option><option value="CUSTOMER_WRONG_PASSWORD">Customer wrong password</option><option value="WRONG_PASSWORD">Other wrong password</option><option value="HONEYPOT">Honeypot</option><option value="LOCKED_OUT">Locked out</option><option value="SUCCESS">Success</option>
        </select>
        <input aria-label="Filter by IP address" value={ipFilter} onChange={(e) => { setIpFilter(e.target.value); setPage(1); }} placeholder="Search IP…" className="w-48 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface" />
        <Button variant="secondary" size="sm" onClick={clearAttemptFilters}>Clear</Button>
        <Button variant="secondary" size="sm" onClick={() => void fetchAttempts()} loading={loading}>Refresh</Button>
      </div>
      {attemptFailure && <p role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">{attemptFailure}{attempts.length > 0 ? " Showing the last successfully loaded records." : ""}</p>}
      <Card padding="none">
        <CardContent>
          {loading ? (
            <p className="p-6 text-center text-on-surface-variant">Loading...</p>
          ) : attempts.length === 0 && attemptFailure ? (
            <p className="p-6 text-center text-error">Login attempts could not be loaded.</p>
          ) : attempts.length === 0 ? (
            <p className="p-6 text-center text-on-surface-variant">No login attempts found.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>IP Address</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Attempted At</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {attempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell className="font-mono text-xs">
                      {showPrivate ? attempt.ip_address : "••••••••"}
                    </TableCell>
                    <TableCell>{showPrivate ? attempt.email : "••••••••"}</TableCell>
                    <TableCell className="font-mono text-xs">{attempt.attempt_type}</TableCell>
                    <TableCell className="text-on-surface-variant">
                      {new Date(attempt.attempted_at).toLocaleString("en-MY")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-on-surface-variant">
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* ── Admin Action Audit Log (shared admin_audit_log table with PHP) ── */}
      <div className="flex items-center gap-3"><h2 className="mr-auto text-lg font-semibold text-on-surface">Admin Action Log</h2><Button variant="secondary" size="sm" onClick={() => void fetchAudit()} loading={auditLoading}>Refresh log</Button></div>
      {auditFailure && <p role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">{auditFailure}{audit.length > 0 ? " Showing the last successfully loaded records." : ""}</p>}
      <Card padding="none">
        <CardContent>
          {auditLoading ? (
            <p className="p-6 text-center text-on-surface-variant">Loading...</p>
          ) : audit.length === 0 && auditFailure ? (
            <p className="p-6 text-center text-error">Admin actions could not be loaded.</p>
          ) : audit.length === 0 ? (
            <p className="p-6 text-center text-on-surface-variant">No admin actions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Time</TableHeaderCell>
                    <TableHeaderCell>Admin</TableHeaderCell>
                    <TableHeaderCell>Action</TableHeaderCell>
                    <TableHeaderCell>Target</TableHeaderCell>
                    <TableHeaderCell>Details</TableHeaderCell>
                    <TableHeaderCell>IP</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {audit.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-on-surface-variant">
                        {new Date(row.created_at).toLocaleString("en-MY")}
                      </TableCell>
                      <TableCell>{row.admin_name || (row.admin_id ? `#${row.admin_id}` : "—")}</TableCell>
                      <TableCell className="font-mono text-xs">{row.action}</TableCell>
                      <TableCell className="text-on-surface-variant">
                        {row.target_table ? `${row.target_table}${row.target_id ? ` #${row.target_id}` : ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-on-surface-variant">
                        <span className="block max-w-[280px] truncate" title={row.new_value ?? ""}>
                          {showPrivate ? row.new_value || "—" : row.new_value ? "••••••••" : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{showPrivate ? row.ip_address || "—" : row.ip_address ? "••••••••" : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {auditTotalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={auditPage <= 1} onClick={() => setAuditPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-on-surface-variant">
            Page {auditPage} of {auditTotalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={auditPage >= auditTotalPages} onClick={() => setAuditPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

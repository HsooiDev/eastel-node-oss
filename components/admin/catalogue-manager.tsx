"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminDialog as Modal } from "@/components/admin/dialog";
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

type Kind = "products" | "couriers" | "zones";
type Row = Record<string, string | number | null> & { id: number };
type Field = { key: string; label: string; type: "text" | "number" | "textarea" | "select"; required?: boolean; maxLength?: number; step?: string; min?: number; max?: number; options?: { value: string; label: string }[] };
const active: Field = { key: "is_active", label: "Status", type: "select", options: [{ value: "1", label: "Active" }, { value: "0", label: "Inactive" }] };
const sort: Field = { key: "sort_order", label: "Sort order", type: "number", required: true, min: 0, step: "1" };
const settings: Record<Kind, { title: string; singular: string; fields: Field[] }> = {
  products: { title: "Products", singular: "Product", fields: [
    { key: "name", label: "Name", type: "text", required: true, maxLength: 150 },
    { key: "price", label: "Price (RM)", type: "number", required: true, min: 0, step: "0.01" },
    { key: "description", label: "Description", type: "textarea", maxLength: 500 }, sort, active,
  ] },
  couriers: { title: "Couriers", singular: "Courier", fields: [
    { key: "name", label: "Name", type: "text", required: true, maxLength: 100 },
    { key: "wm_fee", label: "WM fee (RM)", type: "number", required: true, min: 0, step: "0.01" },
    { key: "em_fee", label: "EM fee (RM)", type: "number", required: true, min: 0, step: "0.01" },
    { key: "labuan_fee", label: "Labuan fee (RM)", type: "number", required: true, min: 0, step: "0.01" }, sort, active,
  ] },
  zones: { title: "Postcode Zones", singular: "Zone", fields: [
    { key: "postcode_start", label: "Postcode start", type: "number", required: true, min: 1, max: 99999, step: "1" },
    { key: "postcode_end", label: "Postcode end", type: "number", required: true, min: 1, max: 99999, step: "1" },
    { key: "zone", label: "Zone", type: "select", options: [{ value: "WM", label: "West Malaysia (WM)" }, { value: "EM", label: "East Malaysia (EM)" }, { value: "Labuan", label: "Labuan" }] },
    { key: "description", label: "Description", type: "text", maxLength: 100 },
  ] },
};
const controlClass = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-brand";

export function CatalogueManager({ kind }: { kind: Kind }) {
  const config = settings[kind];
  const endpoint = `/api/admin/${kind}`;
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [zoneFilter, setZoneFilter] = useState("");
  const [zoneSearch, setZoneSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${endpoint}?page=${page}&perPage=20`);
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.message || "Failed to load records.");
      setRows(data[kind] ?? []);
      setTotalPages(Math.max(1, data.pagination?.totalPages ?? 1));
      if (kind === "products" && page > Math.max(1, data.pagination?.totalPages ?? 1)) setPage(Math.max(1, data.pagination?.totalPages ?? 1));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Failed to load records.");
    } finally { setLoading(false); }
  }, [endpoint, kind, page]);
  useEffect(() => { void load(); }, [load]);

  async function mutate(method: string, body?: Record<string, unknown>, id?: number) {
    const response = await fetch(id ? `${endpoint}?id=${id}` : endpoint, {
      method, headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok || data.status !== "success") throw new Error(data.message || "Could not save changes.");
    return data;
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    for (const field of config.fields) {
      const value = String(form.get(field.key) ?? "").trim();
      body[field.key] = field.type === "number" || field.key === "is_active" ? Number(value) : value;
    }
    if (editing) body.id = editing.id;
    setSaving(true); setFailure(""); setNotice("");
    try {
      const data = await mutate(editing ? "PUT" : "POST", body);
      setEditing(undefined); setNotice(data.message); await load();
    } catch (e) { setFailure(e instanceof Error ? e.message : "Could not save changes."); }
    finally { setSaving(false); }
  }
  async function toggle(row: Row) {
    if (saving) return;
    setSaving(true); setFailure(""); setNotice("");
    try {
      const data = await mutate("PUT", { id: row.id, is_active: Number(row.is_active) === 1 ? 0 : 1 });
      setNotice(data.message); await load();
    } catch (e) { setFailure(e instanceof Error ? e.message : "Could not update status."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!deleting || saving) return;
    setSaving(true); setFailure(""); setNotice("");
    try {
      const data = await mutate("DELETE", undefined, deleting.id);
      setDeleting(null); setNotice(data.message); await load();
    } catch (e) { setFailure(e instanceof Error ? e.message : "Could not delete record."); }
    finally { setSaving(false); }
  }
  function close() { if (!saving) { setEditing(undefined); setDeleting(null); setFailure(""); } }
  function display(row: Row, field: Field) {
    const value = row[field.key];
    if (field.key.includes("fee") || field.key === "price") return `RM ${Number(value).toFixed(2)}`;
    if (field.key.startsWith("postcode_")) return String(value).padStart(5, "0");
    return value || value === 0 ? String(value) : "—";
  }
  const visibleRows = kind === "zones" ? rows.filter(row => {
    if (zoneFilter && row.zone !== zoneFilter) return false;
    const query = zoneSearch.trim().toLowerCase();
    if (!query) return true;
    const start = String(row.postcode_start ?? "");
    const end = String(row.postcode_end ?? "");
    const searchable = [
      start,
      end,
      start.padStart(5, "0"),
      end.padStart(5, "0"),
      String(row.description ?? ""),
    ];
    return searchable.some(value => value.toLowerCase().includes(query));
  }) : rows;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{config.title}</h1>
        {kind === "zones" && <p className="mt-1 text-sm text-on-surface-variant">Define postcode ranges and their delivery zones. Ranges must not overlap.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {kind === "zones" && <Button variant="secondary" disabled={loading || saving} onClick={() => { setFailure(""); void load(); }}>Refresh</Button>}
        <Button disabled={saving} onClick={() => { setFailure(""); setEditing(null); }}>Add {config.singular}</Button>
      </div>
    </div>
    {kind === "products" && <p className="text-sm text-on-surface-variant">SIM checkout uses the first active product by sort order. Orders retain the price charged at purchase.</p>}
    {failure && editing === undefined && !deleting && <p role="alert" className="text-red-500">{failure}</p>}
    {notice && <p role="status" className="text-green-600">{notice}</p>}
    <Card padding="none"><CardContent>
      {kind === "zones" && <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-end">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-on-surface">Zone</span>
          <select value={zoneFilter} onChange={event => setZoneFilter(event.target.value)} className={controlClass}>
            <option value="">All zones</option>
            <option value="WM">WM · West Malaysia</option>
            <option value="EM">EM · East Malaysia</option>
            <option value="Labuan">Labuan</option>
          </select>
        </label>
        <label className="block min-w-0 flex-1 space-y-1 text-sm">
          <span className="font-medium text-on-surface">Search</span>
          <input type="search" value={zoneSearch} onChange={event => setZoneSearch(event.target.value)} placeholder="Start / End / Description…" className={controlClass} />
        </label>
        <Button type="button" variant="secondary" onClick={() => { setZoneFilter(""); setZoneSearch(""); }}>Clear</Button>
      </div>}
      {loading ? <p className="p-6 text-center">Loading...</p> : visibleRows.length === 0 ? <p className="p-6 text-center">{failure ? "Records could not be loaded." : kind === "zones" && rows.length > 0 ? "No postcode zones match those filters." : `No ${kind} found.`}</p> : <Table>
        <TableHead><TableRow>{config.fields.map(field => <TableHeaderCell key={field.key}>{field.label}</TableHeaderCell>)}<TableHeaderCell>Actions</TableHeaderCell></TableRow></TableHead>
        <TableBody>{visibleRows.map(row => <TableRow key={row.id}>
          {config.fields.map(field => <TableCell key={field.key} className={field.key === "description" ? "max-w-xs whitespace-normal" : ""}>
            {field.key === "is_active" ? <Button variant="ghost" size="sm" disabled={saving} aria-label={`${Number(row.is_active) === 1 ? "Deactivate" : "Activate"} ${row.name}`} onClick={() => void toggle(row)}>{Number(row.is_active) === 1 ? "Active" : "Inactive"}</Button> : display(row, field)}
          </TableCell>)}
          <TableCell><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={saving} onClick={() => { setFailure(""); setEditing(row); }}>Edit</Button><Button variant="ghost" size="sm" disabled={saving} onClick={() => { setFailure(""); setDeleting(row); }}>Delete</Button></div></TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </CardContent></Card>
    {kind === "products" && totalPages > 1 && <div className="flex items-center justify-center gap-3"><Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button variant="secondary" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>Next</Button></div>}
    <Modal open={editing !== undefined} onClose={close} canDismiss={!saving} title={`${editing ? "Edit" : "Add"} ${config.singular}`}>
      <form onSubmit={save} className="space-y-4" key={editing?.id ?? "new"}>
        {config.fields.map(field => {
          const value = editing?.[field.key] ?? (field.key === "is_active" ? 1 : field.type === "number" ? 0 : field.options?.[0]?.value ?? "");
          return <label className="block space-y-1 text-sm" key={field.key}><span className="font-medium">{field.label}</span>
            {field.type === "select" ? <select name={field.key} defaultValue={String(value)} disabled={saving} className={controlClass}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea name={field.key} defaultValue={String(value)} maxLength={field.maxLength} disabled={saving} rows={3} className={controlClass} /> : <input name={field.key} type={field.type} defaultValue={String(value)} required={field.required} maxLength={field.maxLength} min={field.min} max={field.max} step={field.step} disabled={saving} className={controlClass} />}
          </label>;
        })}
        {failure && <p role="alert" className="text-red-500">{failure}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" loading={saving}>Save {config.singular}</Button></div>
      </form>
    </Modal>
    <Modal open={!!deleting} onClose={close} canDismiss={!saving} title={`Delete ${config.singular}`}>
      <p>This permanently deletes {deleting?.name || (deleting ? `${String(deleting.postcode_start).padStart(5, "0")} – ${String(deleting.postcode_end).padStart(5, "0")}` : "this record")}. Existing order records will remain.</p>
      {failure && <p role="alert" className="mt-3 text-red-500">{failure}</p>}
      <div className="mt-5 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={close}>Cancel</Button><Button variant="danger" loading={saving} onClick={() => void remove()}>Delete {config.singular}</Button></div>
    </Modal>
  </div>;
}

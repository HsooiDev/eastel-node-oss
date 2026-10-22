'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Inquiry {
  id: number
  session_id: string
  postcode: string
  full_name: string | null
  email: string | null
  phone: string | null
  alt_phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  status: 'new' | 'contacted' | 'resolved' | 'no_action'
  wa_opened: number
  ip_address: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
}

interface Counts {
  new: number
  contacted: number
  resolved: number
  no_action: number
  total: number
}

interface ApiResponse {
  status: string
  data?: Inquiry[]
  total?: number
  page?: number
  per_page?: number
  counts?: Counts
}

const STATUS_OPTIONS = ['new', 'contacted', 'resolved', 'no_action'] as const
const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  resolved: 'Resolved',
  no_action: 'No Action',
}

const STATUS_SELECT_CLS: Record<string, string> = {
  new:       'bg-blue-500/15 text-blue-400 border border-blue-500/40',
  contacted: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40',
  resolved:  'bg-green-500/15 text-green-400 border border-green-500/40',
  no_action: 'bg-surface-container text-on-surface-variant border border-outline-variant',
}

const STAT_CARDS = [
  { key: '',           label: 'Total',     dot: 'bg-on-surface-variant/50' },
  { key: 'new',        label: 'New',       dot: 'bg-blue-400' },
  { key: 'contacted',  label: 'Contacted', dot: 'bg-cyan-400' },
  { key: 'resolved',   label: 'Resolved',  dot: 'bg-green-400' },
] as const

export default function PostcodeInquiriesPage() {
  const [rows, setRows]         = useState<Inquiry[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [counts, setCounts]     = useState<Counts>({ new: 0, contacted: 0, resolved: 0, no_action: 0, total: 0 })

  const [selected, setSelected]         = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus]     = useState<string>('contacted')
  const [bulkLoading, setBulkLoading]   = useState(false)

  const [noteTexts, setNoteTexts]       = useState<Record<number, string>>({})
  const [noteSaveStatus, setNoteSaveStatus] = useState<Record<number, 'idle' | 'saving' | 'saved'>>({})

  // Filters
  const [fStatus,   setFStatus]   = useState('')
  const [fPostcode, setFPostcode] = useState('')
  const [fEmail,    setFEmail]    = useState('')
  const [fPhone,    setFPhone]    = useState('')
  const [fCity,     setFCity]     = useState('')
  const [fState,    setFState]    = useState('')
  const [fDateFrom, setFDateFrom] = useState('')
  const [fDateTo,   setFDateTo]   = useState('')
  const [fWaOpened, setFWaOpened] = useState('')

  const PER_PAGE = 20

  const buildQuery = useCallback((p: number) => {
    const q = new URLSearchParams()
    if (fStatus)   q.set('status',    fStatus)
    if (fPostcode) q.set('postcode',  fPostcode)
    if (fEmail)    q.set('email',     fEmail)
    if (fPhone)    q.set('phone',     fPhone)
    if (fCity)     q.set('city',      fCity)
    if (fState)    q.set('state',     fState)
    if (fDateFrom) q.set('date_from', fDateFrom)
    if (fDateTo)   q.set('date_to',   fDateTo)
    if (fWaOpened) q.set('wa_opened', fWaOpened)
    q.set('page',     String(p))
    q.set('per_page', String(PER_PAGE))
    return q.toString()
  }, [fStatus, fPostcode, fEmail, fPhone, fCity, fState, fDateFrom, fDateTo, fWaOpened])

  const loadData = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin/postcode-inquiries?${buildQuery(p)}`)
      const data = await res.json() as ApiResponse
      if (data.status === 'success') {
        const newRows = data.data ?? []
        setRows(newRows)
        setTotal(data.total ?? 0)
        setPage(p)
        setSelected(new Set())
        if (data.counts) setCounts(data.counts)
        const notesInit: Record<number, string> = {}
        newRows.forEach(r => { notesInit[r.id] = r.admin_notes ?? '' })
        setNoteTexts(notesInit)
        setNoteSaveStatus({})
      }
    } catch { /* swallow */ }
    finally { setLoading(false) }
  }, [buildQuery])

  useEffect(() => { void loadData(1) }, [loadData])

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map(r => r.id)))
  }

  async function bulkUpdate() {
    if (selected.size === 0) return
    setBulkLoading(true)
    try {
      await fetch('/api/admin/postcode-inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], status: bulkStatus }),
      })
      await loadData(page)
    } catch { /* swallow */ }
    finally { setBulkLoading(false) }
  }

  async function updateStatus(id: number, status: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: status as Inquiry['status'] } : r))
    try {
      await fetch(`/api/admin/postcode-inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await loadData(page)
    } catch { /* swallow */ }
  }

  async function saveNotes(id: number) {
    const row     = rows.find(r => r.id === id)
    const current = noteTexts[id] ?? ''
    const original = row?.admin_notes ?? ''
    if (current === original) return
    setNoteSaveStatus(prev => ({ ...prev, [id]: 'saving' }))
    try {
      await fetch(`/api/admin/postcode-inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: current }),
      })
      setRows(prev => prev.map(r => r.id === id ? { ...r, admin_notes: current } : r))
      setNoteSaveStatus(prev => ({ ...prev, [id]: 'saved' }))
      setTimeout(() => setNoteSaveStatus(prev => ({ ...prev, [id]: 'idle' })), 1800)
    } catch {
      setNoteSaveStatus(prev => ({ ...prev, [id]: 'idle' }))
    }
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Postcode Inquiries</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Customers who couldn&apos;t find their postcode in the delivery zone list.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => loadData(page)} disabled={loading}>
          {loading ? '…' : '↻ Refresh'}
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {STAT_CARDS.map(card => {
          const val = card.key === '' ? counts.total : counts[card.key as keyof Counts]
          const active = fStatus === card.key
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setFStatus(card.key)}
              className={`text-left rounded-xl border p-4 transition-all ${
                active
                  ? 'border-primary bg-primary/5 shadow-[0_0_0_3px_oklch(var(--color-primary)/0.12)]'
                  : 'border-outline-variant bg-surface-container hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${card.dot}`} />
                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-on-surface-variant">
                  {card.label}
                </span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight tabular-nums text-on-surface leading-none">
                {val}
              </div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <select
              value={fStatus}
              onChange={e => setFStatus(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <input placeholder="Postcode" value={fPostcode} onChange={e => setFPostcode(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface placeholder:text-on-surface-variant" />
            <input placeholder="Email" value={fEmail} onChange={e => setFEmail(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface placeholder:text-on-surface-variant" />
            <input placeholder="Phone" value={fPhone} onChange={e => setFPhone(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface placeholder:text-on-surface-variant" />
            <input placeholder="City" value={fCity} onChange={e => setFCity(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface placeholder:text-on-surface-variant" />
            <input placeholder="State" value={fState} onChange={e => setFState(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface placeholder:text-on-surface-variant" />
            <input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface" />
            <input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface" />
            <select value={fWaOpened} onChange={e => setFWaOpened(e.target.value)}
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface">
              <option value="">WA: any</option>
              <option value="1">WA: tapped</option>
              <option value="0">WA: not tapped</option>
            </select>
            <div className="flex gap-2 col-span-2 md:col-span-1">
              <Button size="sm" onClick={() => loadData(1)} disabled={loading} className="flex-1">
                {loading ? '…' : 'Search'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setFStatus(''); setFPostcode(''); setFEmail(''); setFPhone('')
                setFCity(''); setFState(''); setFDateFrom(''); setFDateTo(''); setFWaOpened('')
              }}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium text-on-surface">{selected.size} selected</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
            className="h-8 rounded-lg border border-outline-variant bg-surface-container px-2 text-sm text-on-surface">
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <Button size="sm" onClick={bulkUpdate} disabled={bulkLoading}>
            {bulkLoading ? '…' : 'Apply'}
          </Button>
          <button type="button" onClick={() => setSelected(new Set())}
            className="text-xs text-on-surface-variant underline ml-auto">Clear selection</button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-alt">
                  <th className="px-4 py-3 text-left">
                    <input type="checkbox"
                      checked={selected.size === rows.length && rows.length > 0}
                      onChange={toggleAll} />
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-on-surface-variant text-xs">#</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Postcode</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Customer</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Location</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">WA</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant min-w-[180px]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-on-surface-variant">
                      {loading ? 'Loading…' : 'No inquiries found.'}
                    </td>
                  </tr>
                )}
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-outline-variant hover:bg-surface-container-alt transition-colors align-top">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
                    </td>
                    <td className="px-3 py-3 text-xs text-on-surface-variant tabular-nums whitespace-nowrap">#{row.id}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap leading-relaxed tabular-nums">
                      {new Date(row.created_at).toLocaleDateString('en-MY', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                      <br />
                      <span className="text-on-surface-variant/60">
                        {new Date(row.created_at).toLocaleTimeString('en-MY', {
                          hour: '2-digit', minute: '2-digit', hour12: true
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-on-surface text-base">{row.postcode}</td>
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-on-surface text-sm">
                        {row.full_name ?? <span className="text-on-surface-variant font-normal">Anonymous</span>}
                      </span>
                      {row.phone && (
                        <a href={`tel:${row.phone}`} className="text-xs text-primary hover:underline">
                          {row.phone}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">
                      {[row.city, row.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.wa_opened ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-bold bg-green-500/15 text-green-400 border border-green-500/40">
                          ✓ Opened
                        </span>
                      ) : (
                        <span className="text-on-surface-variant text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={row.status}
                        onChange={e => updateStatus(row.id, e.target.value)}
                        className={`rounded-full px-3 py-1 text-[0.7rem] font-bold cursor-pointer outline-none transition-opacity hover:opacity-80 ${STATUS_SELECT_CLS[row.status]}`}
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        value={noteTexts[row.id] ?? ''}
                        placeholder="Add a note…"
                        rows={1}
                        onChange={e => {
                          const val = e.target.value
                          setNoteTexts(prev => ({ ...prev, [row.id]: val }))
                          e.target.style.height = 'auto'
                          e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                        }}
                        onFocus={e => {
                          e.target.style.height = 'auto'
                          e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                        }}
                        onBlur={() => saveNotes(row.id)}
                        className="w-full min-h-[34px] max-h-[120px] rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 placeholder:italic resize-none overflow-hidden transition-colors hover:border-outline-variant hover:bg-surface-container focus:border-primary focus:bg-surface-container focus:outline-none focus:overflow-auto"
                      />
                      {noteSaveStatus[row.id] === 'saving' && (
                        <span className="block text-[0.62rem] text-on-surface-variant px-2 mt-0.5">Saving…</span>
                      )}
                      {noteSaveStatus[row.id] === 'saved' && (
                        <span className="block text-[0.62rem] text-green-400 px-2 mt-0.5">✓ Saved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="px-4 py-2.5 text-xs text-on-surface-variant border-t border-outline-variant">
              {total === rows.length
                ? `${total} entr${total === 1 ? 'y' : 'ies'}`
                : `Showing ${rows.length} of ${total}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-on-surface-variant">
            Page {page} of {totalPages} · {total} results
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => loadData(page - 1)}>← Prev</Button>
            <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => loadData(page + 1)}>Next →</Button>
          </div>
        </div>
      )}
    </div>
  )
}

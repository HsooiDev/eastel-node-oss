"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ReviewPhoto { id: number; url: string }

interface ReviewRow {
  id: number;
  customer_name: string | null;
  product_name: string;
  order_ref: string | null;
  display_mode: "public" | "private" | null;
  display_name: string | null;
  rating: number;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  photos: ReviewPhoto[];
  created_at: string;
}

const statusBadge: Record<string, "warning" | "success" | "error" | "neutral"> = {
  pending: "warning", approved: "success", rejected: "error",
};

function csrfToken() {
  return typeof document === "undefined" ? "" : document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)?.[1] ?? "";
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<ReviewPhoto | null>(null);
  const reviewRequest = useRef(0);

  const fetchReviews = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++reviewRequest.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (ratingFilter) params.set("rating", ratingFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/admin/reviews?${params}`, { signal });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.message || "Failed to load reviews.");
      if (signal?.aborted || requestId !== reviewRequest.current) return;
      setReviews(data.reviews ?? []);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setFailure("");
    } catch (e) {
      if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError") || requestId !== reviewRequest.current) return;
      setFailure(e instanceof Error ? e.message : "Failed to load reviews.");
    } finally {
      if (!signal?.aborted && requestId === reviewRequest.current) setLoading(false);
    }
  }, [page, statusFilter, ratingFilter, search]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchReviews(controller.signal);
    return () => controller.abort();
  }, [fetchReviews]);

  async function updateStatus(reviewId: number, action: "approve" | "reject" | "set_pending") {
    setSaving(reviewId);
    setFailure("");
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ reviewId, action }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.message || "Could not moderate review.");
      await fetchReviews();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not moderate review.");
    } finally {
      setSaving(null);
    }
  }

  async function deleteReview(reviewId: number) {
    if (!window.confirm("Permanently delete this review?")) return;
    setSaving(reviewId);
    setFailure("");
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ reviewId, action: "delete" }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.message || "Could not delete review.");
      await fetchReviews();
      if (data.cleanupWarning) setFailure(data.message || "Review deleted, but photo cleanup was incomplete.");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not delete review.");
    } finally {
      setSaving(null);
    }
  }

  function clearFilters() {
    setStatusFilter(""); setRatingFilter(""); setSearch(""); setPage(1);
  }

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < rating ? "text-yellow-400" : "text-on-surface-variant/30"}>★</span>
    ));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold text-on-surface">Reviews</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Moderate customer feedback before it appears publicly.</p>
        </div>
        <select aria-label="Filter reviews by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface">
          <option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <select aria-label="Filter reviews by rating" value={ratingFilter} onChange={(e) => { setRatingFilter(e.target.value); setPage(1); }} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface">
          <option value="">All ratings</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
        </select>
        <input aria-label="Search reviews" placeholder="Search name, order, or review…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-56 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface" />
        <Button variant="secondary" size="sm" onClick={clearFilters}>Clear</Button>
        <Button variant="secondary" size="sm" onClick={() => void fetchReviews()} loading={loading}>Refresh</Button>
      </div>
      {failure && <p role="alert" className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">{failure}{reviews.length > 0 ? " Showing the last successfully loaded reviews." : ""}</p>}

      <Card padding="none">
        <CardContent>
          {loading && reviews.length === 0 ? <p className="p-6 text-center text-on-surface-variant">Loading reviews…</p>
            : failure && reviews.length === 0 ? <p className="p-6 text-center text-error">Reviews could not be loaded.</p>
            : reviews.length === 0 ? <p className="p-6 text-center text-on-surface-variant">No reviews match these filters.</p>
            : <div className="overflow-x-auto">
              <Table>
                <TableHead><TableRow>
                  <TableHeaderCell>Order Ref</TableHeaderCell><TableHeaderCell>Customer</TableHeaderCell><TableHeaderCell>Product</TableHeaderCell>
                  <TableHeaderCell align="center">Rating</TableHeaderCell><TableHeaderCell>Comment</TableHeaderCell><TableHeaderCell>Photos</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Date</TableHeaderCell><TableHeaderCell>Actions</TableHeaderCell>
                </TableRow></TableHead>
                <TableBody>{reviews.map((review) => {
                  const displayName = review.display_mode === "private" ? "Anonymous Customer" : review.display_name || review.customer_name || "—";
                  return <TableRow key={review.id}>
                    <TableCell className="font-mono text-xs">{review.order_ref || "—"}</TableCell>
                    <TableCell>{displayName}</TableCell>
                    <TableCell className="font-medium">{review.product_name}</TableCell>
                    <TableCell align="center"><span className="text-sm">{renderStars(review.rating)}</span></TableCell>
                    <TableCell className="max-w-md whitespace-normal">{review.comment || "—"}</TableCell>
                    <TableCell>{review.photos?.length ? <div className="flex gap-1">{review.photos.map((photo) => <button key={photo.id} type="button" aria-label="Preview review photo" onClick={() => setSelectedPhoto(photo)} className="block h-9 w-9 overflow-hidden rounded border border-outline-variant hover:ring-2 hover:ring-primary/50"><img src={photo.url} alt="Review attachment" className="h-full w-full object-cover" /></button>)}</div> : <span className="text-xs text-on-surface-variant">—</span>}</TableCell>
                    <TableCell><Badge variant={statusBadge[review.status] ?? "neutral"}>{review.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-on-surface-variant">{new Date(review.created_at).toLocaleDateString("en-MY")}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">
                      {review.status !== "approved" && <Button variant="primary" size="sm" disabled={saving !== null} onClick={() => void updateStatus(review.id, "approve")}>Approve</Button>}
                      {review.status !== "rejected" && <Button variant="danger" size="sm" disabled={saving !== null} onClick={() => void updateStatus(review.id, "reject")}>Reject</Button>}
                      {review.status !== "pending" && <Button variant="secondary" size="sm" disabled={saving !== null} onClick={() => void updateStatus(review.id, "set_pending")}>Pending</Button>}
                      <Button variant="danger" size="sm" disabled={saving !== null} onClick={() => void deleteReview(review.id)}>{saving === review.id ? "Working…" : "Delete"}</Button>
                    </div></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>}
        </CardContent>
      </Card>

      {totalPages > 1 && <div className="flex items-center justify-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <span className="text-sm text-on-surface-variant">Page {page} of {totalPages}</span>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>}

      {selectedPhoto && <div role="dialog" aria-modal="true" aria-label="Review photo preview" onClick={() => setSelectedPhoto(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <button type="button" aria-label="Close photo preview" onClick={() => setSelectedPhoto(null)} className="absolute right-5 top-5 rounded-full bg-black/60 px-3 py-2 text-white">Close</button>
        <img src={selectedPhoto.url} alt="Review photo preview" onClick={(event) => event.stopPropagation()} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
      </div>}
    </div>
  );
}

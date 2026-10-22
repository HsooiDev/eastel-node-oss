"use client";

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AccountCard } from "@/components/ui/account-card";
import { useTranslation } from "@/hooks/useTranslation";
import { TurnstileWidget } from "@/components/turnstile-widget";

interface Order {
  id: number;
  order_ref: string;
  order_status: string;
  total_amount: string;
  created_at: string;
}

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const { t } = useTranslation(locale as any);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadReviewableOrders() {
      try {
        const available = new Map<number, Order>();
        let page = 1;
        let totalPages = 1;
        do {
          const response = await fetch(`/api/orders/my?reviewable=1&per_page=50&page=${page}`, { signal: controller.signal });
          const data = await response.json();
          if (!response.ok || data.status !== "success") throw new Error(data.message || "Failed to load orders.");
          for (const order of data.orders) available.set(order.id, order);
          totalPages = data.meta.total_pages;
          page++;
        } while (page <= totalPages);
        if (!controller.signal.aborted) setOrders([...available.values()]);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Failed to load orders.");
      } finally {
        if (!controller.signal.aborted) setLoadingOrders(false);
      }
    }
    void loadReviewableOrders();
    return () => controller.abort();
  }, []);

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t("revPhotoErrType", "Photo must be JPG, PNG, or WebP."));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t("revPhotoErrSize", "Photo must be under 5MB."));
      return;
    }
    setError("");
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setPhoto(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!orderId) {
      setError(t("revErrOrder", "Please select an order to review."));
      return;
    }
    if (rating < 1 || rating > 5) {
      setError(t("revErrRating", "Please select a rating."));
      return;
    }
    if (comment.trim().length < 10 || comment.trim().length > 1000) {
      setError(t("revErrLength", "Please write a review of 10 to 1000 characters."));
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl: string | null = null;

      if (photo) {
        const formData = new FormData();
        formData.append("file", photo);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.status !== "success") {
          setError(uploadData.message || t("revErrSubmit", "Photo upload failed."));
          setSubmitting(false);
          return;
        }
        photoUrl = uploadData.url;
      }

      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          rating,
          comment: comment.trim() || undefined,
          photo_url: photoUrl || undefined,
          display_mode: anonymous ? "private" : "public",
          turnstileToken,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setSuccess(true);
      } else {
        setError(data.message || t("revErrSubmit", "Failed to submit review."));
        setTurnstileToken("");
        setCaptchaVersion((value) => value + 1);
      }
    } catch {
      setError(t("revErrSubmit", "Failed to submit review. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-bold text-[color:var(--acc-text)] mb-4">{t("revSuccessTitle", "Review Submitted")}</h1>
        <p className="text-[color:var(--acc-text-dim)] mb-6">
          {t("revSuccessMsg", "Your review has been submitted and will appear after moderation.")}
        </p>
        <Button onClick={() => router.push(`/${locale}/account/orders`)}>{t("revBackBtn", "Back to Orders")}</Button>
      </div>
    );
  }

  if (loadingOrders) {
    return <div className="text-[color:var(--acc-text-faint)]">{t("ordLoading", "Loading...")}</div>;
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-[color:var(--acc-text)] mb-6">{t("revTitle", "Write a Review")}</h1>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {orders.length === 0 ? (
        <AccountCard className="text-center">
          <p className="text-[color:var(--acc-text-dim)] mb-4">
            {t("revNoDeliveredOrders", "You don't have any delivered orders to review yet.")}
          </p>
          <Button onClick={() => router.push(`/${locale}/account/orders`)}>{t("revViewOrders", "View Orders")}</Button>
        </AccountCard>
      ) : (
        <AccountCard>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Order selection */}
            <div>
              <label className="block text-sm font-medium text-[color:var(--acc-text-muted)] mb-2">{t("revSelectOrder", "Select Order")}</label>
              <select
                value={orderId ?? ""}
                onChange={(e) => setOrderId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-xl border border-[color:var(--acc-border-strong)] bg-[color:var(--acc-input-bg)] px-3 py-2.5 text-sm text-[color:var(--acc-text)] focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                required
              >
                <option value="">{t("revSelectOrderDefault", "-- Select an order --")}</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_ref} — RM {Number(order.total_amount).toFixed(2)} ({new Date(order.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Star rating */}
            <div>
              <label className="block text-sm font-medium text-[color:var(--acc-text-muted)] mb-2">{t("revRatingLabel", "Rating")}</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    className={`text-3xl transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 ${
                      star <= rating ? "text-yellow-400" : "text-[color:var(--acc-text-faint)] hover:text-yellow-300"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="block text-sm font-medium text-[color:var(--acc-text-muted)] mb-2">
                {t("revBodyLabel", "Comment")}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                minLength={10}
                required
                rows={4}
                className="w-full rounded-xl border border-[color:var(--acc-border-strong)] bg-[color:var(--acc-input-bg)] px-3 py-2.5 text-sm text-[color:var(--acc-text)] placeholder:text-[color:var(--acc-text-faint)] focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-none"
                placeholder={t("revBodyPh", "Share your experience...")}
              />
              <p className="text-xs text-[color:var(--acc-text-faint)] mt-1">{comment.length}/1000</p>
            </div>

            {/* Photo upload */}
            <div>
              <label className="block text-sm font-medium text-[color:var(--acc-text-muted)] mb-2">
                {t("revPhotoLabel", "Photo")} <span className="text-[color:var(--acc-text-faint)]">{t("revPhotoHint", "(optional, max 5MB)")}</span>
              </label>
              {photoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-32 h-32 rounded-xl object-cover border border-[color:var(--acc-border-strong)]"
                  />
                  <button
                    type="button"
                    onClick={removePhoto}
                    aria-label="Remove photo"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  className="block w-full text-sm text-[color:var(--acc-text-faint)] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[color:var(--acc-surface-hover)] file:text-[color:var(--acc-text-muted)] hover:file:bg-[color:var(--acc-surface)]"
                />
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-[color:var(--acc-text-muted)]"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />{t("revAnonymous", "Display my review anonymously")}</label>
            <TurnstileWidget key={captchaVersion} onToken={setTurnstileToken} />
            <Button type="submit" loading={submitting} disabled={!turnstileToken} fullWidth>
              {t("revSubmitBtn", "Submit Review")}
            </Button>
          </form>
        </AccountCard>
      )}
    </div>
  );
}

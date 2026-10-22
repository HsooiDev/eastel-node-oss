"use client";

import { useState, useEffect, useRef } from "react";
import type { Review } from "@/lib/reviews-data";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Filled star SVG — matches Hero.html star color */
function StarSVG() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/** Single review card — faithful to Hero.html `.review` styles */
function ReviewCard({ review }: { review: Review }) {
  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(180deg, var(--hp-glass-bg), var(--hp-glass-bg-3))",
        border: "1px solid var(--hp-line-2)",
        borderRadius: "18px",
        padding: "32px 28px",
        display: "flex",
        flexDirection: "column",
        gap: "22px",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Large decorative quote mark — top-right, very faint */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "24px",
          right: "28px",
          fontFamily: "var(--font-sans),'Geist',serif",
          fontSize: "64px",
          lineHeight: 1,
          color: "var(--hp-accent-soft)",
          opacity: 0.18,
          fontWeight: 700,
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        &ldquo;
      </span>

      {/* Stars */}
      <div
        style={{
          display: "flex",
          gap: "3px",
          color: "var(--hp-head-2-b)",
        }}
      >
        {Array.from({ length: review.rating }).map((_, i) => (
          <StarSVG key={i} />
        ))}
      </div>

      {/* Review text */}
      <p
        style={{
          fontSize: "15.5px",
          lineHeight: 1.55,
          color: "var(--hp-ink)",
          flexGrow: 1,
          margin: 0,
        }}
      >
        {review.text}
      </p>

      {/* Person row — border-top separator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          paddingTop: "18px",
          borderTop: "1px solid var(--hp-line)",
        }}
      >
        {/* Gradient avatar */}
        <div
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "50%",
            background: "linear-gradient(145deg, var(--hp-accent-a), var(--hp-accent-b))",
            border: "1px solid var(--hp-line-2)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-sans),'Geist',sans-serif",
            fontWeight: 600,
            fontSize: "14px",
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {initials(review.name)}
        </div>

        <div>
          <div
            style={{
              fontFamily: "var(--font-sans),'Geist',sans-serif",
              fontSize: "14.5px",
              fontWeight: 600,
              color: "var(--hp-ink)",
              letterSpacing: "-0.01em",
            }}
          >
            {review.name}
          </div>
          {/* Date in JetBrains Mono, uppercase — matches `.role` style */}
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: "11px",
              color: "var(--hp-ink-fine)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginTop: "2px",
            }}
          >
            {review.date}
          </div>
        </div>
      </div>
    </div>
  );
}

const PER_PAGE = 3;

export function HomeReviewsCarousel({ reviews: initialReviews }: { reviews: Review[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function loadPublishedReviews() {
      try {
        const response = await fetch('/api/reviews/public?limit=12', { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || data.status !== 'success' || data.source === 'fallback' || !data.reviews?.length) return;
        const published = data.reviews.map((review: { id: number; customer_name: string; rating: number; comment: string; created_at: string }) => ({
          id: review.id, name: review.customer_name, text: review.comment, rating: review.rating,
          date: new Date(review.created_at).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' }),
        }));
        if (!controller.signal.aborted) { setReviews(published); setPage(0); }
      } catch { /* Keep the initial reviews if the public endpoint is unavailable. */ }
    }
    void loadPublishedReviews();
    return () => controller.abort();
  }, []);
  const totalPages = Math.ceil(reviews.length / PER_PAGE);
  const current = reviews.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  // Lock grid to tallest page height so layout doesn't shift on page change
  const gridRef = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState(0);

  useEffect(() => {
    if (!gridRef.current) return;
    const h = gridRef.current.offsetHeight;
    setMinHeight((prev) => Math.max(prev, h));
  }, [page]);

  const navBtnStyle = (enabled: boolean): React.CSSProperties => ({
    width: "40px",
    height: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "1px solid var(--hp-line-2)",
    background: enabled ? "var(--hp-ghost-hover)" : "transparent",
    color: enabled ? "var(--hp-ink)" : "var(--hp-ink-mute)",
    cursor: enabled ? "pointer" : "default",
    transition: "border-color 200ms, color 200ms, background 200ms",
    flexShrink: 0,
  });

  return (
    <>
      {/* Desktop: paginated 3-column grid */}
      <div className="hidden lg:block">
        <div
          ref={gridRef}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
            alignItems: "stretch",
            minHeight: minHeight > 0 ? `${minHeight}px` : undefined,
          }}
        >
          {current.map((review, index) => (
            <ReviewCard key={review.id ?? `${review.name}-${review.date}-${index}`} review={review} />
          ))}
        </div>

        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
              marginTop: "2rem",
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!canPrev}
              style={navBtnStyle(canPrev)}
              aria-label="Previous reviews"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  style={{
                    width: i === page ? "24px" : "8px",
                    height: "8px",
                    borderRadius: "4px",
                    background:
                      i === page
                        ? "var(--hp-accent-b)"
                        : "var(--hp-line-2)",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    transition: "width 300ms, background 300ms",
                  }}
                  aria-label={`Page ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={!canNext}
              style={navBtnStyle(canNext)}
              aria-label="Next reviews"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Mobile/tablet: horizontal scroll with snap */}
      <div
        className="flex lg:hidden"
        style={{
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          scrollBehavior: "smooth",
          gap: "16px",
          paddingBottom: "0.75rem",
          msOverflowStyle: "none",
        } as React.CSSProperties}
      >
        {reviews.map((review, index) => (
          <div
            key={review.id ?? `${review.name}-${review.date}-${index}`}
            style={{
              flexShrink: 0,
              width: "clamp(280px, 78vw, 360px)",
              scrollSnapAlign: "start",
            }}
          >
            <ReviewCard review={review} />
          </div>
        ))}
      </div>
    </>
  );
}

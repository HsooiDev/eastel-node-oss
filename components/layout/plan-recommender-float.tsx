"use client";

import { useEffect, useRef, useState } from "react";
import { PlanRecommender } from "@/components/plan-recommender";
import { useTranslation } from "@/hooks/useTranslation";

export function PlanRecommenderFloat() {
  const { t, locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousActive && document.contains(previousActive)) previousActive.focus();
    };
  }, [isOpen]);

  const floatLabel = t("recommender.floatLabel", "Find my plan");
  const modalTitle = t("recommender.modalTitle", "Find the plan that fits you");
  const closeLabel = t("recommender.close", "Close plan recommender");

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2"
        style={{
          position: "fixed",
          right: "1.5rem",
          bottom: "6rem",
          zIndex: 40,
          width: "3.5rem",
          height: "3.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "9999px",
          backgroundColor: "var(--color-brand, #9b7bff)",
          color: "#fff",
          boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
        }}
        aria-label={floatLabel}
        aria-controls="plan-recommender-modal"
        aria-expanded={isOpen}
        title={floatLabel}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m12 3-1.4 4.6a2 2 0 0 1-1.3 1.3L4.7 10.3l4.6 1.4a2 2 0 0 1 1.3 1.3L12 17.7l1.4-4.7a2 2 0 0 1 1.3-1.3l4.6-1.4-4.6-1.4a2 2 0 0 1-1.3-1.3L12 3Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19 16-.5 1.5L17 18l1.5.5L19 20l.5-1.5L21 18l-1.5-.5L19 16Z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          id="plan-recommender-modal"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-recommender-modal-title"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
              <h2 id="plan-recommender-modal-title" className="text-base font-bold text-foreground">
                {modalTitle}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-alt text-foreground transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                aria-label={closeLabel}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="px-3 pb-3 sm:px-6 sm:pb-6">
              <PlanRecommender locale={locale} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

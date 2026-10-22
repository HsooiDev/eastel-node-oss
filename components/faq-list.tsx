"use client";

import { useState, useMemo } from "react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

interface FaqCategory {
  id: string;
  icon: string;
  title: string;
  items: FaqItem[];
}

export function FaqList({ categories, labels }: { categories: FaqCategory[]; labels: { search: string; all: string; noResults: string } }) {
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return activeCat
        ? categories.filter((c) => c.id === activeCat)
        : categories;
    }
    const q = search.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (i) =>
            i.question.toLowerCase().includes(q) ||
            i.answer.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [search, activeCat, categories]);

  return (
    <div>
      {/* Search */}
      <div className="relative mb-8">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveCat(null);
          }}
          placeholder={labels.search}
          aria-label={labels.search}
          className="faq-search-input w-full py-3 pl-10 pr-4 text-sm outline-none"
        />
        <svg
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Category pills */}
      <div className="faq-pills-row mb-8 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCat(null)}
          className={`faq-pill-btn rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            !activeCat && !search
              ? "faq-pill-btn-active"
              : ""
          }`}
        >
          {labels.all}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCat(activeCat === cat.id ? null : cat.id);
              setSearch("");
            }}
            className={`faq-pill-btn flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCat === cat.id
                ? "faq-pill-btn-active"
                : ""
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.title}</span>
            <span className="ml-0.5 opacity-70">({cat.items.length})</span>
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-foreground-muted py-8">
          {labels.noResults}
        </p>
      ) : (
        <div className="space-y-6">
          {filtered.map((cat) => (
            <section key={cat.id} aria-labelledby={`faq-category-${cat.id}`}>
              <h2 id={`faq-category-${cat.id}`} className="mb-3 px-5 py-4 text-base font-semibold text-foreground">
                <span aria-hidden="true">{cat.icon}</span> {cat.title}
              </h2>
              {cat.items.map((item) => (
                <details key={item.id} className="faq-item-card" open={search.trim() ? true : undefined}>
                  <summary className="faq-item-trigger cursor-pointer px-5 py-4">
                    <h3 className="inline text-inherit font-inherit">{item.question}</h3>
                  </summary>
                  <div
                    className="faq-item-answer px-5 py-4 text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-accent [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: item.answer }}
                  />
                </details>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

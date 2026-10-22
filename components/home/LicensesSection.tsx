'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LICENSES } from '@/lib/reviews-data';
import { t } from '@/lib/i18n';

interface Props {
  translations: Record<string, string>;
}

const ICONS: Record<string, React.ReactNode> = {
  shield: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
    </svg>
  ),
  radio: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  ),
  star: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
};

const FOCUSABLE_SELECTORS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const mapIconToId: Record<string, string> = {
  shield: 'nsp',
  radio: 'asp',
  star: 'shariah',
};

export function LicensesSection({ translations }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setActive(null), []);

  useEffect(() => {
    if (active === null) return;

    const previouslyFocused = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    const card = cardRef.current;
    if (card) {
      const first = card.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
      first?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab' || !card) return;

      const focusable = Array.from(
        card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      ).filter(el => !el.hasAttribute('disabled'));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, [active, close]);

  const activeLic = active !== null ? LICENSES[active] : null;
  let activeTitle = '';
  if (activeLic) {
    const activeId = mapIconToId[activeLic.icon] || activeLic.icon;
    activeTitle = t(translations, `licenses.${activeId}.title`, activeLic.title);
  }

  return (
    <>
      <div className="hp-section-divider" />
      <section className="hp-section" id="certs">
        <div className="hp-section-head">
          <div className="hp-section-meta">
            <span className="hp-eyebrow-lbl">{t(translations, 'home.licenses.eyebrow', 'Trust')}</span>
            <h2>{t(translations, 'home.licenses.title', 'Licenses & Certifications.')}</h2>
            <p className="hp-lede">{t(translations, 'home.licenses.desc', 'Browse Eastel brand documents and certificates.')}</p>
          </div>
        </div>

        <div className="hp-certs-grid">
          {LICENSES.map((lic, i) => {
            const id = mapIconToId[lic.icon] || lic.icon;
            const translatedTitle = t(translations, `licenses.${id}.title`, lic.title);
            const translatedDesc = t(translations, `licenses.${id}.desc`, lic.description);
            const viewText = t(translations, 'home.licenses.view', 'View certificate');

            return (
              <div key={lic.title} className="hp-cert">
                {lic.image ? (
                  <button
                    className="hp-cert-img-wrap lc-img-btn"
                    onClick={() => setActive(i)}
                    aria-label={`${viewText}: ${translatedTitle}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={lic.image}
                      alt={translatedTitle}
                      className="hp-cert-img"
                      loading="lazy"
                    />
                    <span className="lc-img-overlay" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="lc-zoom-ico">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                      </svg>
                      <span className="lc-view-lbl">{viewText}</span>
                    </span>
                    <span className="lc-corner-hint" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                        <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                      </svg>
                    </span>
                  </button>
                ) : (
                  <div className="hp-cert-ico-lg">
                    {ICONS[lic.icon]}
                  </div>
                )}
                <h3 className="hp-cert-h3">{translatedTitle}</h3>
                <p className="hp-cert-p">{translatedDesc}</p>
                <div className="hp-cert-stamp">
                  <span className="hp-stamp-dot" />
                  {lic.issuer}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {activeLic && activeLic.image && (
        <div
          className="lc-backdrop"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={activeTitle}
        >
          <div className="lc-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
            <button className="lc-close" onClick={close} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div className="lc-lb-img-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeLic.image}
                alt={activeTitle}
                className="lc-lb-img"
              />
            </div>
            <div className="lc-lb-info">
              <p className="lc-lb-title">{activeTitle}</p>
              <div className="lc-lb-stamp">
                <span className="hp-stamp-dot" />
                {activeLic.issuer}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ── image button reset + hover ───────────────────────────────── */
        .lc-img-btn {
          position: relative;
          cursor: pointer;
          border: none;
          padding: 0;
          display: block;
          text-align: left;
          transition: border-color 0.22s ease;
        }
        .lc-img-btn:hover,
        .lc-img-btn:focus-visible {
          border-color: rgba(255,255,255,0.28);
          outline: none;
        }
        .lc-img-btn:focus-visible {
          box-shadow: 0 0 0 2px rgba(138,114,255,0.5);
        }

        /* hover overlay */
        .lc-img-overlay {
          position: absolute;
          inset: 0;
          border-radius: 10px;
          background: rgba(0,0,0,0);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          color: rgba(255,255,255,0);
          transition: background 0.25s ease, color 0.25s ease;
          pointer-events: none;
        }
        .lc-img-btn:hover .lc-img-overlay,
        .lc-img-btn:focus-visible .lc-img-overlay {
          background: rgba(0,0,0,0.52);
          color: rgba(255,255,255,1);
        }
        .lc-zoom-ico {
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
          flex-shrink: 0;
        }
        .lc-view-lbl {
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          filter: drop-shadow(0 1px 4px rgba(0,0,0,0.5));
        }

        /* always-visible expand hint (top-right corner) */
        .lc-corner-hint {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 26px;
          height: 26px;
          border-radius: 7px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.14);
          display: grid;
          place-items: center;
          color: rgba(255,255,255,0.45);
          transition: background 0.2s, color 0.2s;
          pointer-events: none;
        }
        .lc-img-btn:hover .lc-corner-hint,
        .lc-img-btn:focus-visible .lc-corner-hint {
          background: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.9);
        }

        /* ── lightbox backdrop ────────────────────────────────────────── */
        .lc-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(7,8,13,0.88);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: lcFadeIn 0.2s ease-out;
        }
        @keyframes lcFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── lightbox card ────────────────────────────────────────────── */
        .lc-card {
          position: relative;
          background: linear-gradient(180deg, rgba(20,22,32,0.97) 0%, rgba(12,14,22,0.99) 100%);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 20px;
          padding: 28px;
          max-width: 860px;
          width: 100%;
          max-height: calc(100vh - 48px);
          overflow-y: auto;
          box-shadow:
            0 40px 100px rgba(0,0,0,0.65),
            0 0 0 1px rgba(255,255,255,0.05),
            inset 0 1px 0 rgba(255,255,255,0.07);
          animation: lcCardIn 0.22s ease-out;
        }
        @keyframes lcCardIn {
          from { transform: scale(0.96) translateY(8px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);   opacity: 1; }
        }

        /* ── close button ─────────────────────────────────────────────── */
        .lc-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.6);
          display: grid;
          place-items: center;
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
          z-index: 1;
          flex-shrink: 0;
        }
        .lc-close:hover {
          background: rgba(255,255,255,0.13);
          color: #fff;
          transform: scale(1.05);
        }
        .lc-close:focus-visible {
          outline: 2px solid rgba(138,114,255,0.6);
          outline-offset: 2px;
        }

        /* ── lightbox image ───────────────────────────────────────────── */
        .lc-lb-img-wrap {
          width: 100%;
          border-radius: 12px;
          overflow: hidden;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .lc-lb-img {
          width: 100%;
          height: auto;
          max-height: 70vh;
          object-fit: contain;
          display: block;
        }

        /* ── lightbox info bar ────────────────────────────────────────── */
        .lc-lb-info {
          margin-top: 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-right: 44px;
        }
        .lc-lb-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--hp-ink);
          letter-spacing: -0.01em;
          margin: 0;
          line-height: 1.3;
        }
        .lc-lb-stamp {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          color: var(--hp-ink-fine);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          display: flex;
          align-items: center;
          gap: 7px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        @media (max-width: 480px) {
          .lc-card { padding: 20px 16px; border-radius: 16px; }
          .lc-lb-info { flex-direction: column; align-items: flex-start; padding-right: 44px; }
        }
      `}</style>
    </>
  );
}

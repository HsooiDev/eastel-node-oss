/* NEW-DESIGN: MD3 tokens + GridCanvas mouse effect — contact info only */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicPageJsonLd } from "@/components/json-ld";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { SITE_URL } from "@/lib/site";
import { GridCanvas } from "@/components/plans/grid-canvas";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  return buildMetadata({
    title: t(translations, "contact.title", "Contact Us — Eastel Mobile"),
    description: t(translations, "contact.desc", "Have questions? We're here to help."),
    locale,
    canonical: `${SITE_URL}/${locale}/contact`,
  });
}

export default async function ContactPage({ params }: PageProps) {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const waText = encodeURIComponent(
    t(translations, "contact.waText", "Hi, I'd like to know more about Eastel.")
  );
  const waHref = `https://wa.me/601175999733?text=${waText}`;

  return (
    <>
      <PublicPageJsonLd translations={translations} locale={locale} path="contact"
        title={t(translations, "contact.title")} description={t(translations, "contact.desc")} nonce={nonce} />
      <ContactStyles />

      {/* Full-page wrapper — GridCanvas attaches to this element */}
      <div className="ct-page">
        <GridCanvas />
        <div className="ct-aurora" aria-hidden="true" />
        <div className="ct-grid-mask" aria-hidden="true" />

        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="ct-hero" aria-labelledby="contact-heading">
          <span className="ct-eyebrow" aria-hidden="true">Contact</span>
          <h1 id="contact-heading" className="ct-h1">
            {t(translations, "contact.heading", "Contact Us")}
          </h1>
          <p className="ct-sub">
            {t(translations, "contact.desc", "Have questions? We're here to help.")}
          </p>
        </section>

        {/* ── Divider ───────────────────────────────────────────── */}
        <div className="ct-divider" aria-hidden="true" />

        {/* ── Cards ─────────────────────────────────────────────── */}
        <section className="ct-cards-section">
          <div className="ct-cards-grid">

            {/* WhatsApp */}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="ct-card ct-card-link"
              aria-label={`WhatsApp: ${t(translations, "contact.whatsappVal", "011-75999733")}`}
            >
              <div className="ct-card-ico">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <span className="ct-card-label">{t(translations, "contact.whatsapp", "WhatsApp")}</span>
              <span className="ct-card-value">{t(translations, "contact.whatsappVal", "011-75999733")}</span>
              <span className="ct-card-note">{t(translations, "contact.hoursVal", "8:00am – 8:00pm daily")}</span>
              <span className="ct-card-action" aria-hidden="true">
                {t(translations, "contact.chatNow", "Chat now")}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </a>

            {/* Email */}
            <a
              href={`mailto:${t(translations, "contact.emailVal", "support@eastel.site")}`}
              className="ct-card ct-card-link"
              aria-label={`Email: ${t(translations, "contact.emailVal", "support@eastel.site")}`}
            >
              <div className="ct-card-ico">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="ct-card-label">{t(translations, "contact.email", "Email")}</span>
              <span className="ct-card-value ct-email">{t(translations, "contact.emailVal", "support@eastel.site")}</span>
              <span className="ct-card-note">{t(translations, "contact.emailNote", "Response within 24 hours")}</span>
              <span className="ct-card-action" aria-hidden="true">
                {t(translations, "contact.sendEmail", "Send email")}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </a>

            {/* Operating Hours */}
            <div className="ct-card">
              <div className="ct-card-ico ct-card-ico-clock">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
              </div>
              <span className="ct-card-label">{t(translations, "contact.hours", "Operating Hours")}</span>
              <span className="ct-card-value">{t(translations, "contact.hoursVal", "8:00am – 8:00pm")}</span>
              <span className="ct-card-note">{t(translations, "contact.hoursNote", "7 days including public holidays")}</span>
              <span className="ct-stamp">
                <span className="ct-stamp-dot" aria-hidden="true" />
                {t(translations, "contact.whatsapp", "WhatsApp")} + {t(translations, "contact.email", "Email")}
              </span>
            </div>

          </div>
        </section>
      </div>
    </>
  );
}

function ContactStyles() {
  return (
    <style>{`
      /* ═══ PAGE WRAPPER ══════════════════════════════════════════════════════ */
      .ct-page {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        min-height: calc(100vh - 64px);
      }

      /* ═══ AURORA OVERLAY ════════════════════════════════════════════════════ */
      /* Sits above the GridCanvas (z-index 0), below content (z-index 1) */
      .ct-aurora {
        position: absolute;
        inset: -10% -10% 60% -10%;
        z-index: 1;
        pointer-events: none;
        background:
          radial-gradient(60% 55% at 25% 40%, rgba(66,76,216,0.28), transparent 65%),
          radial-gradient(50% 45% at 75% 55%, rgba(66,76,216,0.18), transparent 70%),
          radial-gradient(40% 35% at 50% 10%, rgba(190,194,255,0.12), transparent 60%);
        filter: blur(28px);
      }
      .ct-grid-mask {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        background: linear-gradient(
          180deg,
          var(--color-background) 0%,
          transparent 14%,
          transparent 86%,
          var(--color-background) 100%
        );
      }

      /* ═══ HERO ══════════════════════════════════════════════════════════════ */
      .ct-hero {
        position: relative;
        z-index: 2;
        max-width: 700px;
        margin: 0 auto;
        padding: 96px 40px 80px;
        text-align: center;
      }
      .ct-eyebrow {
        display: inline-block;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--color-primary);
        margin-bottom: 20px;
      }
      .ct-h1 {
        font-size: clamp(36px, 5vw, 64px);
        line-height: 1.05;
        letter-spacing: -0.03em;
        font-weight: 700;
        color: var(--color-on-surface);
        text-wrap: balance;
        margin: 0 0 18px;
      }
      .ct-sub {
        font-size: 17px;
        line-height: 1.55;
        color: var(--color-on-surface-variant);
        max-width: 440px;
        margin: 0 auto;
        text-wrap: pretty;
      }

      /* ═══ DIVIDER ═══════════════════════════════════════════════════════════ */
      .ct-divider {
        position: relative;
        z-index: 2;
        height: 1px;
        max-width: 1440px;
        margin: 0 auto;
        background: linear-gradient(
          90deg,
          transparent 0%,
          var(--color-outline-variant) 20%,
          var(--color-outline-variant) 80%,
          transparent 100%
        );
        opacity: 0.5;
      }

      /* ═══ CARDS SECTION ═════════════════════════════════════════════════════ */
      .ct-cards-section {
        position: relative;
        z-index: 2;
        padding: 80px 64px 120px;
      }
      .ct-cards-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        align-items: stretch;
        max-width: 1040px;
        margin: 0 auto;
      }

      /* ═══ CARD ══════════════════════════════════════════════════════════════ */
      .ct-card {
        position: relative;
        background: var(--color-surface-container);
        border: 1px solid var(--color-outline-variant);
        border-radius: 6px;
        padding: 32px 28px;
        display: flex;
        flex-direction: column;
        transition:
          border-color 350ms cubic-bezier(.22, 1, .36, 1),
          transform 250ms cubic-bezier(.22, 1, .36, 1),
          box-shadow 350ms cubic-bezier(.22, 1, .36, 1);
        text-decoration: none;
        color: inherit;
      }
      .ct-card-link:hover {
        border-color: color-mix(in oklab, var(--color-primary) 70%, var(--color-outline-variant));
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(0,0,0,0.3);
      }

      /* ═══ CARD CONTENT ══════════════════════════════════════════════════════ */
      .ct-card-ico {
        width: 48px;
        height: 48px;
        border-radius: 4px;
        display: grid;
        place-items: center;
        flex-shrink: 0;
        background: color-mix(in oklab, var(--color-primary) 14%, var(--color-surface-container));
        border: 1px solid color-mix(in oklab, var(--color-primary) 30%, var(--color-outline-variant));
        color: var(--color-primary);
        margin-bottom: 24px;
      }
      .ct-card-ico-clock {
        background: color-mix(in oklab, var(--color-secondary) 12%, var(--color-surface-container));
        border-color: color-mix(in oklab, var(--color-secondary) 25%, var(--color-outline-variant));
        color: var(--color-secondary);
      }
      .ct-card-label {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--color-on-surface-variant);
        margin-bottom: 10px;
      }
      .ct-card-value {
        font-size: 26px;
        line-height: 1.1;
        letter-spacing: -0.02em;
        font-weight: 600;
        color: var(--color-on-surface);
        margin-bottom: 8px;
      }
      .ct-email {
        font-size: 17px;
        word-break: break-all;
        letter-spacing: 0;
      }
      .ct-card-note {
        font-size: 14px;
        color: var(--color-on-surface-variant);
        line-height: 1.5;
        flex-grow: 1;
      }
      .ct-card-action {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--color-primary);
        padding-top: 20px;
        border-top: 1px solid var(--color-outline-variant);
        margin-top: 22px;
        transition: gap 200ms ease;
      }
      .ct-card-link:hover .ct-card-action { gap: 10px; }
      .ct-stamp {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        color: var(--color-on-surface-variant);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        display: flex;
        align-items: center;
        gap: 8px;
        padding-top: 20px;
        border-top: 1px solid var(--color-outline-variant);
        margin-top: 22px;
      }
      .ct-stamp-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        background: var(--color-secondary);
        box-shadow: 0 0 8px var(--color-secondary);
      }

      /* ═══ RESPONSIVE ════════════════════════════════════════════════════════ */
      @media (max-width: 900px) {
        .ct-cards-section { padding: 64px 40px 96px; }
        .ct-cards-grid { grid-template-columns: 1fr; max-width: 460px; }
      }
      @media (max-width: 768px) {
        .ct-hero { padding: 72px 24px 56px; }
        .ct-h1 { font-size: clamp(28px, 8vw, 42px); }
        .ct-sub { font-size: 15.5px; }
        .ct-cards-section { padding: 48px 20px 72px; }
        .ct-cards-grid { max-width: 100%; }
        .ct-card { padding: 24px 20px; }
      }
      @media (max-width: 480px) {
        .ct-hero { padding: 56px 16px 44px; }
        .ct-card-value { font-size: 22px; }
        .ct-email { font-size: 15px; }
      }
    `}</style>
  );
}

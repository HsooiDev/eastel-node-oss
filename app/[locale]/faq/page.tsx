import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageJsonLd } from "@/components/json-ld";
import { headers } from "next/headers";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { SITE_URL } from "@/lib/site";
import { FAQ_CATEGORIES } from "@/lib/plans-data";
import { FaqList } from "@/components/faq-list";
import { GridCanvas } from "@/components/plans/grid-canvas";
import "../plans/plans.css";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);

  return buildMetadata({
    title: t(translations, "faq.title", "FAQ — Eastel Mobile"),
    description: t(
      translations,
      "faq.desc",
      "Find answers to common questions about Eastel Mobile plans, services, and more."
    ),
    locale,
    canonical: `${SITE_URL}/${locale}/faq`,
  });
}

function FaqStyles() {
  return (
    <style>{`
      .faq-container {
        position: relative;
        z-index: 10;
      }
      .faq-search-input {
        background: var(--color-surface-container);
        border: 1px solid var(--color-outline-variant);
        color: var(--color-on-surface);
        border-radius: 8px;
        transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .faq-search-input:focus {
        border-color: var(--color-primary);
        box-shadow: 0 0 16px rgba(var(--grid-glow), 0.15);
      }
      .faq-pill-btn {
        background: var(--color-surface-container);
        border: 1px solid var(--color-outline-variant);
        color: var(--color-on-surface-variant);
        border-radius: 6px;
        transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .faq-pill-btn:hover {
        color: var(--color-on-surface);
        border-color: var(--color-outline);
        background: color-mix(in oklab, var(--color-on-surface) 4%, var(--color-surface-container));
      }
      .faq-pill-btn-active,
      .faq-pill-btn-active:hover {
        background: var(--color-primary) !important;
        border-color: var(--color-primary) !important;
        color: var(--color-on-primary) !important;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(var(--grid-glow), 0.22);
      }
      .faq-item-card {
        background: var(--color-surface-container);
        border: 1px solid var(--color-outline-variant);
        color: var(--color-on-surface);
        border-radius: 8px;
        margin-bottom: 8px;
        transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        overflow: hidden;
      }
      .faq-item-card:hover {
        border-color: color-mix(in oklab, var(--color-primary) 50%, var(--color-outline-variant));
        transform: translateY(-1px);
        box-shadow: 0 8px 24px -12px rgba(var(--grid-glow), 0.25);
      }
      .faq-item-trigger {
        color: var(--color-on-surface);
        font-weight: 600;
        font-size: 15px;
        transition: color 0.2s ease, background-color 0.2s ease;
      }
      .faq-item-trigger:hover {
        color: var(--color-primary);
        background-color: color-mix(in oklab, var(--color-on-surface) 2%, transparent);
      }
      .faq-item-trigger-open {
        color: var(--color-primary) !important;
        background-color: color-mix(in oklab, var(--color-on-surface) 3%, transparent);
      }
      .faq-item-answer {
        border-top: 1px solid var(--color-outline-variant) !important;
        color: var(--color-on-surface-variant);
        background: color-mix(in oklab, var(--color-on-surface) 1.5%, transparent);
      }
    `}</style>
  );
}

export default async function FaqPage({ params }: PageProps) {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const categories = FAQ_CATEGORIES.map((cat) => ({
    id: cat.id, icon: cat.icon, title: t(translations, cat.titleKey),
    items: cat.items.map((item) => ({
      id: item.questionKey, question: t(translations, item.questionKey),
      answer: t(translations, item.answerKey),
    })),
  }));

  return (
    <>
      <PublicPageJsonLd translations={translations} locale={locale} path="faq"
        title={t(translations, "faq.title")} description={t(translations, "faq.desc")}
        questions={categories.flatMap((cat) => cat.items)} nonce={nonce} />
      <FaqStyles />

      <section className="plans-section min-h-screen">
        <GridCanvas />
        <div className="plans-grid-mask" aria-hidden />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "80px 24px 80px" }}>
            {/* Status ticker */}
            <div className="plans-ticker mb-10 flex justify-center">
              <span className="dot" aria-hidden />
              EAS/MY · HELP CENTER · FAQ
            </div>

            {/* Hero heading */}
            <div className="text-center mb-12">
              <h1
                style={{
                  fontWeight: 700,
                  lineHeight: 1.08,
                  letterSpacing: "-0.03em",
                  color: "var(--color-on-surface)",
                  fontSize: "clamp(36px, 6vw, 72px)",
                  marginBottom: "16px",
                }}
              >
                {t(translations, "faq.heading", "Frequently Asked Questions")}
              </h1>
              <p
                className="plans-mono-label"
                style={{ fontSize: "14px", maxWidth: "640px", margin: "0 auto", lineHeight: "1.6" }}
              >
                {t(
                  translations,
                  "faq.desc",
                  "Find answers to common questions about Eastel Mobile plans, services, and more."
                )}
              </p>
            </div>

            {/* FAQ List Content */}
            <div className="faq-container">
              <FaqList categories={categories} labels={{
                search: t(translations, "faq.search"), all: t(translations, "faq.all"),
                noResults: t(translations, "faq.noResults"),
              }} />
              <nav className="mt-8 flex flex-wrap gap-4 text-sm text-accent underline" aria-label={t(translations, "seo.help")}>
                <Link href={`/${locale}/order`}>{t(translations, "seo.buy")}</Link>
                <Link href={`/${locale}/track`}>{t(translations, "track.heading", "Order tracking")}</Link>
                <Link href={`/${locale}/contact`}>{t(translations, "seo.contact")}</Link>
                <Link href={`/${locale}/plans`}>{t(translations, "nav.plans", "Mobile plans")}</Link>
                <Link href={`/${locale}/roaming`}>{t(translations, "nav.roaming", "Roaming")}</Link>
              </nav>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}



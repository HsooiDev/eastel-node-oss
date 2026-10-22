import "../plans/plans.css";
import "./roaming.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicPageJsonLd } from "@/components/json-ld";
import Link from "next/link";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { SITE_URL } from "@/lib/site";
import { GridCanvas } from "@/components/plans/grid-canvas";
import { RoamingCard } from "@/components/roaming-card";
import { FREE_ROAMING_PLANS, ROAMING_PLANS } from "@/lib/roaming-data";

interface PageProps {
  params: Promise<{ locale: string }>;
}

const roamingVoiceSmsNoteKey = "roaming.voiceSmsNote";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  return buildMetadata({
    title: t(translations, "roaming.title", "Roaming Passes — Eastel Mobile"),
    description: t(
      translations,
      "roaming.desc",
      "Choose an Eastel roaming pass with high-speed data and full hotspot support across selected destinations."
    ),
    locale,
    canonical: `${SITE_URL}/${locale}/roaming`,
  });
}

export default async function RoamingPage({ params }: PageProps) {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <section className="plans-section min-h-screen">
      <PublicPageJsonLd translations={translations} locale={locale} path="roaming"
        title={t(translations, "roaming.title")} description={t(translations, "roaming.desc")} nonce={nonce} />
      <GridCanvas />
      <div className="plans-grid-mask" aria-hidden />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: "1440px", margin: "0 auto", padding: "80px 24px" }}>
          <div className="plans-ticker mb-10">
            <span className="dot" aria-hidden />
            {t(translations, "roaming.ticker", "EASTEL MOBILE · INTERNATIONAL ROAMING")}
          </div>

          <h1
            style={{
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "var(--color-on-surface)",
              fontSize: "clamp(36px, 6vw, 72px)",
              marginBottom: "8px",
            }}
          >
            {t(translations, "roaming.h1", "Roam with confidence.")}
          </h1>
          <p className="plans-mono-label" style={{ fontSize: "11px", marginBottom: "16px" }}>
            {t(translations, "roaming.sub", "Travel-ready data across selected destinations.")}
          </p>
          <div className="roaming-plans-grid">
            {ROAMING_PLANS.map((plan, index) => (
              <RoamingCard
                key={plan.id}
                plan={plan}
                index={index}
                translations={translations}
              />
            ))}
          </div>

          <p className="roaming-terms">
            <span aria-hidden="true">†</span>{" "}
            {t(
              translations,
              roamingVoiceSmsNoteKey,
              "Voice calls and SMS are not included. Pay-per-use rates apply."
            )}
          </p>

          <section className="roaming-free">
            <div className="roaming-free-head">
              <p className="plans-mono-label roaming-free-label">
                {t(translations, "roaming.freeTitle", "Free roaming with selected monthly plans")}
              </p>
              <div className="roaming-free-plans">
                {FREE_ROAMING_PLANS.map((plan) => (
                  <span key={plan.name} className="roaming-free-plan">
                    {plan.name} · {plan.data}{t(translations, "roaming.perMonth", "/ month")}
                  </span>
                ))}
              </div>
            </div>

            <details className="roaming-free-details">
              <summary>
                {t(translations, "roaming.freeDetails", "Where it applies")}
              </summary>
              <p>
                {t(
                  translations,
                  "roaming.freeDesc",
                  "Selected monthly plans include roaming data in Indonesia, Singapore and Thailand."
                )}
              </p>
            </details>
          </section>

          <div className="roaming-actions">
            <Link href={`/${locale}/plans`} className="plan-btn primary roaming-action">
              {t(translations, "roaming.viewPlans", "View mobile plans")} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

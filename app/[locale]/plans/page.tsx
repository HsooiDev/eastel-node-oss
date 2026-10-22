import './plans.css';
import type { Metadata } from 'next';
import { PublicPageJsonLd } from '@/components/json-ld';
import { headers } from "next/headers";
import { getTranslations } from '@/lib/i18n-server';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buildMetadata } from '@/components/seo-head';
import { SITE_URL } from '@/lib/site';
import { BOOSTER_PLANS } from '@/lib/plans-data';
import { PlansTabs } from '@/components/plans-tabs';
import { GridCanvas } from '@/components/plans/grid-canvas';

interface PageProps {
  params: Promise<{ locale: string }>;
}

const BOOSTER_COPY: Record<string, {
  descriptionKey: string;
  descriptionFallback: string;
  eligibilityKey: string;
  eligibilityFallback: string;
}> = {
  ezplus: {
    descriptionKey: 'plans.boosterEzplusDesc',
    descriptionFallback: '30GB high-speed data, valid for 10 days.',
    eligibilityKey: 'plans.boosterEzplusEligibility',
    eligibilityFallback: 'Available in Eastel App',
  },
  ezroamplus: {
    descriptionKey: 'plans.boosterEzroamplusDesc',
    descriptionFallback: '10GB roaming data with shared hotspot. Follows the roaming end date.',
    eligibilityKey: 'plans.boosterEzroamplusEligibility',
    eligibilityFallback: 'Only works with a Roaming Pass',
  },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  return buildMetadata({
    title: t(translations, 'plans.title', 'Mobile Plans — Eastel Mobile'),
    description: t(
      translations,
      'plans.desc',
      'Compare Eastel plans. Monthly plans include unlimited calls (FUP 1000 mins); one-time plans include 30-minute calls.'
    ),
    locale,
    canonical: `${SITE_URL}/${locale}/plans`,
  });
}

export default async function PlansPage({ params }: PageProps) {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;


  return (
    <>
      <PublicPageJsonLd translations={translations} locale={locale} path="plans"
        title={t(translations, 'plans.title')} description={t(translations, 'plans.desc')} nonce={nonce} />

      <section className="plans-section">
        <GridCanvas />
        <div className="plans-grid-mask" aria-hidden />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '80px 24px 80px' }}>

            {/* Status ticker */}
            <div className="plans-ticker mb-10">
              <span className="dot" aria-hidden />
              {t(translations, 'plans.tickerText', 'EASTEL MOBILE · NATIONWIDE 5G COVERAGE')}
            </div>

            {/* Hero heading */}
            <h1
              style={{
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                color: 'var(--color-on-surface)',
                fontSize: 'clamp(36px, 6vw, 72px)',
                marginBottom: '8px',
              }}
            >
              {t(translations, 'plans.h1', 'Pick a plan.')}
            </h1>
            <p
              className="plans-mono-label"
              style={{ fontSize: '11px', marginBottom: '48px' }}
            >
              {t(translations, 'plans.sub', 'Stay connected.')}
            </p>

            {/* Tab switcher + card grid */}
            <PlansTabs translations={translations} locale={locale} />

            {/* Booster add-on cards */}
            {BOOSTER_PLANS.map((booster) => {
              const copy = BOOSTER_COPY[booster.id] ?? BOOSTER_COPY.ezplus;
              return (
                <div className="booster-card" key={booster.id}>
                  <div>
                    <p
                      className="plans-mono-label"
                      style={{ fontSize: '12px', marginBottom: '6px' }}
                    >
                      {t(translations, 'plans.boosterEyebrow', 'Add-On')}
                    </p>
                    <p
                      style={{
                        color: 'var(--color-on-surface)',
                        fontWeight: 600,
                        fontSize: '18px',
                        marginBottom: '6px',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      {booster.name}
                    </p>
                    <p
                      style={{
                        color: 'var(--color-on-surface-variant)',
                        fontSize: '13px',
                        maxWidth: '420px',
                        lineHeight: 1.5,
                      }}
                    >
                      {t(translations, copy.descriptionKey, copy.descriptionFallback)}
                    </p>
                    <p
                      className="plans-mono-label"
                      style={{ fontSize: '11px', marginTop: '8px' }}
                    >
                      {t(translations, copy.eligibilityKey, copy.eligibilityFallback)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontFeatureSettings: '"tnum" 1',
                        fontSize: '36px',
                        fontWeight: 600,
                        color: 'var(--color-on-surface)',
                        lineHeight: 1,
                        letterSpacing: '-0.03em',
                      }}
                    >
                      {booster.price}
                    </p>
                    <p
                      className="plans-mono-label"
                      style={{ fontSize: '12px', marginTop: '6px' }}
                    >
                      {booster.data} DATA
                    </p>
                  </div>
                </div>
              );
            })}

          </div>
        </div>
      </section>
    </>
  );
}

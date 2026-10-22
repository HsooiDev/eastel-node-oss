import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicPageJsonLd } from "@/components/json-ld";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { SITE_URL } from "@/lib/site";
import TrackForm from "./TrackForm";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  return buildMetadata({
    title: t(translations, "track.seoTitle", "Track Your Order — Eastel Mobile"),
    description: t(
      translations,
      "track.seoDesc",
      "Check your Eastel SIM card order status with your order reference and phone number — no login needed."
    ),
    locale,
    canonical: `${SITE_URL}/${locale}/track`,
  });
}

export default async function TrackPage({ params }: PageProps) {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="flex min-h-screen items-start justify-center px-4 pb-24 pt-32">
      <PublicPageJsonLd translations={translations} locale={locale} path="track"
        title={t(translations, "track.seoTitle")} description={t(translations, "track.seoDesc")} nonce={nonce} />
      <div className="w-full max-w-md">
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-brand">
          {t(translations, "track.eyebrow", "Order Tracking")}
        </p>
        <h1 className="mt-3 text-center text-3xl font-bold text-foreground">
          {t(translations, "track.title", "Track Your Order")}
        </h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-foreground-muted">
          {t(
            translations,
            "track.desc",
            "Enter your order reference and the phone number you used when ordering."
          )}
        </p>
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <TrackForm />
        </div>
      </div>
    </div>
  );
}

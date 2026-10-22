import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { PublicPageJsonLd } from "@/components/json-ld";
import { SITE_URL } from "@/lib/site";

interface PageProps { params: Promise<{ locale: string }> }
const policy = "privacy";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  return buildMetadata({ title: t(translations, `${policy}.title`), description: t(translations, `${policy}.desc`),
    locale, canonical: `${SITE_URL}/${locale}/${policy}` });
}

export default async function PolicyPage({ params }: PageProps) {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <PublicPageJsonLd translations={translations} locale={locale} path={policy}
        title={t(translations, `${policy}.title`)} description={t(translations, `${policy}.desc`)} nonce={nonce} />
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t(translations, `${policy}.heading`)}</h1>
      <p className="mt-3 text-sm text-foreground-muted">{t(translations, `${policy}.lastUpdated`)}</p>
      <div className="mt-10 rounded-3xl border border-outline-variant bg-surface-container p-6 sm:p-12">
        {[1, 2, 3, 4].map((section) => (
          <section key={section} className="mb-8 last:mb-0">
            <h2 className="mb-3 text-xl font-bold text-foreground">{t(translations, `${policy}.section${section}.heading`)}</h2>
            <p className="text-sm leading-relaxed text-foreground-muted">{t(translations, `${policy}.section${section}.body`)}</p>
          </section>
        ))}
        <nav className="mt-10 flex flex-wrap gap-4 text-sm text-accent underline" aria-label={t(translations, "seo.help")}>
          <Link href={`/${locale}/order`}>{t(translations, "seo.buy")}</Link>
          <Link href={`/${locale}/delivery`}>{t(translations, "delivery.heading")}</Link>
          <Link href={`/${locale}/contact`}>{t(translations, "seo.contact")}</Link>
        </nav>
      </div>
    </div>
  );
}

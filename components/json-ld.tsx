import { buildPageSchema, serializeJsonLd } from "@/lib/structured-data";
import { SITE_URL } from "@/lib/site";
import { t } from "@/lib/i18n";

export function JsonLd({ data, nonce }: { data: unknown; nonce?: string }) {
  return <script type="application/ld+json" nonce={nonce}
    dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

export function PublicPageJsonLd({ translations, locale, path, title, description, nonce, questions }: {
  translations: Record<string, string>; locale: string; path: string;
  title: string; description: string; nonce?: string;
  questions?: { question: string; answer: string }[];
}) {
  return <JsonLd nonce={nonce} data={buildPageSchema({
    origin: SITE_URL, locale, path, title, description,
    homeLabel: t(translations, "seo.home"),
    ...(questions ? { type: "FAQPage" as const, questions } : {}),
  })} />;
}

import type { Metadata } from "next";
import { SITE_INDEXABLE, SITE_URL } from "@/lib/site";
import { publicPage, languageAlternates } from "@/lib/seo-policy";

interface SeoHeadProps {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  locale?: string;
  siteName?: string;
  keywords?: string[];
  noIndex?: boolean;
}

export const SITE_NAME = "eastel.site";
const DEFAULT_DESCRIPTION = "Buy an Eastel physical SIM card in Malaysia and check your SIM order. Mobile plans and roaming information are provided for reference.";

/** The existing Metadata API builder is the only page SEO system. */
export function buildMetadata({
  title, description = DEFAULT_DESCRIPTION,
  ogImage = `${SITE_URL}/images/og-banner.png`, canonical,
  locale = "ms", siteName = SITE_NAME, keywords, noIndex = false,
}: SeoHeadProps = {}): Metadata {
  const absolute = title || siteName;
  const url = canonical ? new URL(canonical, SITE_URL) : undefined;
  if (url && url.origin !== SITE_URL) throw new Error("Canonical must use the configured site origin");
  const page = url ? publicPage(url.pathname) : null;
  const index = SITE_INDEXABLE && !noIndex && !!page;
  const canonicalUrl = page && !noIndex ? `${SITE_URL}/${page.locale}${page.suffix}` : undefined;
  return {
    title: { absolute }, description, ...(keywords?.length ? { keywords } : {}),
    robots: {
      index, follow: !noIndex,
      googleBot: { index, follow: !noIndex, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
    },
    ...(canonicalUrl && page ? { alternates: { canonical: canonicalUrl, languages: languageAlternates(SITE_URL, page.suffix) } } : {}),
    openGraph: {
      title: absolute, description, siteName,
      locale: locale === "ms" ? "ms_MY" : locale === "zh" ? "zh_MY" : "en_MY",
      type: "website", ...(canonicalUrl ? { url: canonicalUrl } : {}),
      images: [{ url: ogImage, width: 1200, height: 630, alt: absolute }],
    },
    twitter: { card: "summary_large_image", title: absolute, description, images: [ogImage] },
  };
}

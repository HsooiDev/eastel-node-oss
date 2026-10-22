import type { MetadataRoute } from "next";
import { SITE_INDEXABLE, SITE_URL } from "@/lib/site";
import { PUBLIC_PAGE_PATHS, SEO_LOCALES, languageAlternates } from "@/lib/seo-policy";

// No fabricated per-request lastModified. Add one only when the actual content
// revision date is available. Staging advertises no indexable URLs.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_INDEXABLE) return [];
  return PUBLIC_PAGE_PATHS.flatMap(page => SEO_LOCALES.map(locale => ({
    url: `${SITE_URL}/${locale}${page}`,
    alternates: { languages: languageAlternates(SITE_URL, page) },
  })));
}

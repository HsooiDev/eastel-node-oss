import type { MetadataRoute } from "next";
import { SITE_INDEXABLE, SITE_URL } from "@/lib/site";
import { ROBOTS_PRIVATE_PATHS, SEARCH_CRAWLERS, TRAINING_CRAWLERS } from "@/lib/seo-policy";

// One route owns /robots.txt. Public previews stay crawlable so bots can read
// noindex. Authentication, never robots, protects private customer information.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: TRAINING_CRAWLERS, disallow: "/" },
      { userAgent: ["*", ...SEARCH_CRAWLERS, "facebookexternalhit", "TelegramBot"], allow: "/", disallow: ROBOTS_PRIVATE_PATHS },
    ],
    ...(SITE_INDEXABLE ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}

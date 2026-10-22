// Only real public routes participate in canonical/hreflang/sitemap. Tracking
// renders an empty lookup form; customer results stay behind the private API.
export const SEO_LOCALES = ["ms", "en", "zh"] as const;
export const PUBLIC_PAGE_PATHS = ["", "/plans", "/roaming", "/faq", "/contact", "/eastelpreneurs", "/order", "/track", "/delivery", "/privacy", "/terms"] as const;

export function publicPage(pathname: string): { locale: string; suffix: string } | null {
  const match = /^\/(ms|en|zh)(\/.*)?$/.exec(pathname.replace(/\/$/, ""));
  if (!match || !(PUBLIC_PAGE_PATHS as readonly string[]).includes(match[2] || "")) return null;
  return { locale: match[1], suffix: match[2] || "" };
}

export const ROBOTS_PRIVATE_PATHS = [
  "/api/", "/account/", "/hs", "/payment/", "/thankyou.html", "/uploads/",
  ...SEO_LOCALES.flatMap(locale => [`/${locale}/account/`, `/${locale}/thankyou`]),
];
export const SEARCH_CRAWLERS = ["Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User"];
export const TRAINING_CRAWLERS = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Applebot-Extended", "Bytespider", "Cohere-ai", "meta-externalagent"];

export function languageAlternates(origin: string, suffix: string): Record<string, string> {
  return {
    ...Object.fromEntries(SEO_LOCALES.map(locale => [locale, `${origin}/${locale}${suffix}`])),
    "x-default": `${origin}/ms${suffix}`,
  };
}

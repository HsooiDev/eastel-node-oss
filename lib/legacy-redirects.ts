import { sanitizeLocalRedirect } from "./safe-redirect";

// Legacy public URL compatibility is exercised by the local route fixtures.
// Keep this finite: an unknown .php/.html URL must remain a real 404.
const LEGACY_LOCALES = ["en", "ms", "zh"] as const;
const SHARED_PUBLIC_PAGES: Record<string, string> = {
  "/order.html": "/order",
  "/delivery-policy.html": "/delivery",
  "/privacy-policy.html": "/privacy",
  "/terms.html": "/terms",
};
const LOCALIZED_PUBLIC_PAGES: Record<string, string> = {
  "index.php": "",
  "index.html": "",
  "plans.php": "/plans",
  "plans.html": "/plans",
  "roaming.php": "/roaming",
  "faq.html": "/faq",
  "contact.html": "/contact",
  "eastelpreneurs.html": "/eastelpreneurs",
};

interface LegacyRedirect {
  source: string;
  destination: string;
  permanent: true;
  has?: { type: "query"; key: string; value: string }[];
}

/** Public SEO migrations only. Next.js emits 308 for permanent redirects. */
export function getLegacyRedirects(): LegacyRedirect[] {
  const redirects: LegacyRedirect[] = [
    // The PHP root/index aliases used English, independently of Next's / → /ms.
    { source: "/index.php", destination: "/en", permanent: true },
    { source: "/index.html", destination: "/en", permanent: true },
    // Historical route recorded in PROJECT_AUDIT.md; localized clean roaming
    // routes from the latest PHP sitemap already match Next and need no redirect.
    { source: "/roaming", destination: "/en/roaming", permanent: true },
  ];

  for (const locale of LEGACY_LOCALES) {
    for (const [legacy, clean] of Object.entries(LOCALIZED_PUBLIC_PAGES)) {
      redirects.push({ source: `/${locale}/${legacy}`, destination: `/${locale}${clean}`, permanent: true });
    }
  }

  for (const [source, clean] of Object.entries(SHARED_PUBLIC_PAGES)) {
    // Query-language rules must precede the fallback. These are real indexed
    // alternatives in the PHP sitemap, not invented duplicate landing pages.
    for (const locale of LEGACY_LOCALES) {
      redirects.push({ source, destination: `/${locale}${clean}`, permanent: true, has: [{ type: "query", key: "lang", value: locale }] });
    }
    redirects.push({ source, destination: `/en${clean}`, permanent: true });
  }

  // Preserve the existing exact admin bookmark. This is never a sitemap entry.
  redirects.push({ source: "/hs/zones.php", destination: "/hs/zones", permanent: true });
  redirects.push({ source: "/hs/index.php", destination: "/hs/login", permanent: true });
  return redirects;
}

function legacyLocale(query: URLSearchParams): string {
  const locale = query.get("lang");
  return LEGACY_LOCALES.some((value) => value === locale) ? locale! : "en";
}

function normalizeReturnPath(value: string | null, fallback: string): string {
  const safe = sanitizeLocalRedirect(value, fallback);
  const url = new URL(safe, "https://legacy.invalid");
  const suffix = SHARED_PUBLIC_PAGES[url.pathname];
  if (suffix) {
    const destination = `/${legacyLocale(url.searchParams)}${suffix}`;
    url.searchParams.delete("lang");
    return `${destination}${url.search}${url.hash}`;
  }
  const match = url.pathname.match(/^\/(en|ms|zh)\/([^/]+)$/);
  if (match && Object.hasOwn(LOCALIZED_PUBLIC_PAGES, match[2])) {
    return `/${match[1]}${LOCALIZED_PUBLIC_PAGES[match[2]]}${url.search}${url.hash}`;
  }
  return safe;
}

/**
 * Explicit private bookmark compatibility. The caller MUST use a temporary
 * redirect with private/no-store, noindex and Referrer-Policy: no-referrer.
 * No request hostname is accepted here. Payment callbacks are deliberately not
 * redirected: their signed parameters and HTTP methods need a separate audit.
 */
export function resolveLegacyPrivateRedirect(pathname: string, query: URLSearchParams): string | null {
  const locale = legacyLocale(query);
  if (pathname === "/thankyou.html" || pathname === "/thankyou.html/") {
    // Old PHP uses order_ref/billcode/status; Next requires a customer session
    // and ref. Do not replay untrusted payment status or leak identifiers.
    return `/${locale}/track`;
  }

  const match = pathname.match(/^\/account\/(login|register|forgot|reset|verify-email|orders|profile|password|review)\.html\/?$/);
  if (!match) return null;

  const page = match[1];
  const destination = `/${locale}/account/${page}`;
  const output = new URLSearchParams();
  if (page === "reset" || page === "verify-email") {
    const token = query.get("token");
    // Both audited PHP issuers generate 32 random bytes encoded as hex.
    if (token && /^[a-f0-9]{64}$/i.test(token)) output.set("token", token);
  }
  if (page === "login" || page === "register" || page === "verify-email") {
    const fallback = `/${locale}/account/orders`;
    const next = normalizeReturnPath(query.get("redirect"), fallback);
    if (next !== fallback) output.set("redirect", next);
  }
  return output.size ? `${destination}?${output}` : destination;
}

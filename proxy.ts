import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applySecurityHeaders, checkRateLimit, addRateLimitHeaders, secureNext } from "@/middleware-security";
import { clientIp } from "@/lib/client-ip";
import { SITE_CONFIG, SITE_URL, classifySiteHost } from "@/lib/site";
import { publicPage } from "@/lib/seo-policy";
import { resolveLegacyPrivateRedirect } from "@/lib/legacy-redirects";

const LOCALES = ["en", "ms", "zh"] as const;
const DEFAULT_LOCALE = "ms";
const AUTH_PATHS = ["/account/login", "/account/register", "/account/forgot", "/account/reset"];
const NON_LOCALIZED_PATHS = ["/hs", "/payment"];

function getLocaleFromHeaders(request: NextRequest): string {
  const languages = (request.headers.get("accept-language") || "").split(",").map((entry, order) => {
    const [tag, ...params] = entry.trim().toLowerCase().split(";");
    const quality = params.find(part => part.trim().startsWith("q="));
    return { locale: tag.split("-")[0], q: quality ? Number(quality.trim().slice(2)) : 1, order };
  }).filter(item => item.q > 0 && Number.isFinite(item.q)).sort((a, b) => b.q - a.q || a.order - b.order);
  return languages.find(item => (LOCALES as readonly string[]).includes(item.locale))?.locale || DEFAULT_LOCALE;
}
function extractLocale(pathname: string): string | null {
  return LOCALES.find(locale => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) || null;
}

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = classifySiteHost(request.headers.get("host"));
  if (host === "reject") {
    return privateResponse(new NextResponse("Misdirected Request", { status: 421 }));
  }
  if (host === "www") {
    // Fixed authority; a path beginning // must never become a redirect host.
    const target = new URL(SITE_URL);
    target.pathname = pathname;
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 308);
  }
  const productionHost = SITE_CONFIG.indexable && host === "site";
  const protect = (response: NextResponse) => {
    const publicAsset = pathname.startsWith("/_next/static/") ||
      pathname.startsWith("/images/") || pathname.startsWith("/fonts/") ||
      ["/robots.txt", "/sitemap.xml", "/favicon.ico", "/manifest.json"].includes(pathname);
    if (productionHost && publicAsset) return response;
    if (!productionHost || !publicPage(pathname)) privateResponse(response);
    // Dynamic HTML/CSP is private; immutable assets and generated discovery files
    // above retain Next.js caching on the sole allowed production hostname.
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  const legacy = resolveLegacyPrivateRedirect(pathname, request.nextUrl.searchParams);
  if (legacy) {
    const target = new URL(SITE_URL);
    const localTarget = new URL(legacy, SITE_URL);
    target.pathname = localTarget.pathname;
    target.search = localTarget.search;
    const response = privateResponse(NextResponse.redirect(target, 307));
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  // These routes still receive the environment/host guard and private headers.
  if (pathname.startsWith("/_next/") || pathname === "/api" || pathname.startsWith("/api/") || pathname.includes(".")) {
    return protect(secureNext(request, { productionHost: productionHost && !!publicPage(pathname) }));
  }

  const nonce = crypto.randomUUID();
  const locale = extractLocale(pathname);
  const nonLocalized = NON_LOCALIZED_PATHS.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!locale && !nonLocalized) {
    const target = new URL(SITE_URL);
    target.pathname = `/${getLocaleFromHeaders(request)}${pathname}`;
    target.search = request.nextUrl.search;
    return protect(NextResponse.redirect(target));
  }
  const withoutLocale = locale ? pathname.slice(locale.length + 1) : "";
  if (locale && AUTH_PATHS.some(path => withoutLocale === path || withoutLocale.startsWith(`${path}/`))) {
    const rl = checkRateLimit(`auth_${clientIp(request)}`, 5, 60 * 1000);
    if (!rl.success) {
      return protect(applySecurityHeaders(addRateLimitHeaders(new NextResponse("Too Many Requests", { status: 429 }), rl.remaining, rl.resetAt), { nonce }));
    }
  }
  // Session checks remain in their existing server layouts and API handlers.
  return protect(secureNext(request, { nonce, locale: locale ?? undefined, productionHost: productionHost && !!publicPage(pathname) }));
}

export const config = { matcher: ["/:path*"] };

// Origins are configuration, never request input. next.config.ts freezes these
// two fields into each build. Environment switches require a clean rebuild.
export const PRODUCTION_ORIGIN = "https://eastel.site";
export const STAGING_ORIGIN = "https://staging.example.test";

export type SiteEnvironment = "staging" | "production" | "development";
export interface SiteConfig {
  environment: SiteEnvironment;
  origin: string;
  indexable: boolean;
}

export function resolveSiteConfig(env: Record<string, string | undefined>): SiteConfig {
  const environment = env.SITE_ENV || "staging";
  if (!["staging", "production", "development"].includes(environment)) {
    throw new Error("Invalid SITE_ENV; use staging, production or development");
  }
  const raw = env.NEXT_PUBLIC_SITE_URL || (environment === "development" ? "http://localhost:3000" : STAGING_ORIGIN);
  let origin: URL;
  try { origin = new URL(raw); } catch { throw new Error("Invalid NEXT_PUBLIC_SITE_URL"); }
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an origin without credentials, path, query or fragment");
  }
  if (environment === "production" && origin.origin !== PRODUCTION_ORIGIN) {
    throw new Error("Production requires NEXT_PUBLIC_SITE_URL=https://eastel.site");
  }
  if (environment === "staging" && origin.origin !== STAGING_ORIGIN) {
    throw new Error("Staging requires NEXT_PUBLIC_SITE_URL=https://staging.example.test");
  }
  if (environment === "development" && !(
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    ["http:", "https:"].includes(origin.protocol)
  )) throw new Error("Development requires a loopback NEXT_PUBLIC_SITE_URL");
  return { environment: environment as SiteEnvironment, origin: origin.origin, indexable: environment === "production" };
}

export const SITE_CONFIG = resolveSiteConfig({
  SITE_ENV: process.env.SITE_ENV,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
export const SITE_URL = SITE_CONFIG.origin;
export const SITE_INDEXABLE = SITE_CONFIG.indexable;

// Exact authorities only. Forwarded hosts are not trusted. Loopback is for local
// checks and never enables GA4 or HTTP indexing.
export function classifySiteHost(host: string | null, config: SiteConfig = SITE_CONFIG): "site" | "www" | "local" | "reject" {
  if (!host || host.length > 255 || /[\s,/@\\?#]/.test(host)) return "reject";
  const authority = host.toLowerCase();
  if (authority === new URL(config.origin).host) return "site";
  if (config.indexable && authority === "www.eastel.site") return "www";
  if (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(authority)) return "local";
  return "reject";
}

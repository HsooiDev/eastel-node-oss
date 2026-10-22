import type { NextConfig } from "next";
import { SITE_CONFIG } from "./lib/site";
import { getLegacyRedirects } from "./lib/legacy-redirects";
import { getLegacyAssetRewrites } from "./lib/legacy-assets";

const nextConfig: NextConfig = {
  output: "standalone",
  // Shared hosting exposes many CPUs but limits process/thread capacity.
  experimental: { cpus: 2 },
  trailingSlash: false,
  // Freeze origin and SEO mode in the same artifact as metadata and client URLs.
  env: { SITE_ENV: SITE_CONFIG.environment, NEXT_PUBLIC_SITE_URL: SITE_CONFIG.origin },

  turbopack: {
    root: process.cwd(),
  },

  images: {
    unoptimized: true,
  },

  poweredByHeader: false,

  reactStrictMode: true,

  // ── Redirects ──────────────────────────────────────────────
  async redirects() {
    return [
      // Root → default language (Malay).
      // No favicon redirect — favicon.ico is served directly by nginx from public/.
      // No cookie condition — project uses URL-based locale routing, not Next.js i18n cookies.
      {
        source: "/",
        destination: "/ms",
        permanent: true,
      },

      ...getLegacyRedirects(),
    ];
  },

  // Existing PHP bills retain their original callback/return URLs after cutover.
  // Internal rewrites preserve POST bodies and the payment handler's checks.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/uploads/:path*", destination: "/api/review-images/:path*" },
        // Copied legacy WA files must pass admin authentication before static files.
        { source: "/media/wa/:path*", destination: "/api/media?path=media/wa/:path*" },
        { source: "/api/media.php", destination: "/api/media" },
        ...getLegacyAssetRewrites(),
      ],
      afterFiles: [
        // Existing provider registrations and issued WA bills keep their PHP URLs.
        { source: "/api/whatsapp.php", destination: "/api/whatsapp/webhook" },
        { source: "/api/telegram.php", destination: "/api/telegram/webhook" },
        { source: "/api/whatsapp-payment-callback.php", destination: "/api/payment/callback" },
        {
          source: "/api/payment.php",
          has: [{ type: "query", key: "action", value: "callback" }],
          destination: "/api/payment/callback",
        },
        { source: "/api/payment_return.php", destination: "/api/payment/return" },
      ],
      fallback: [],
    };
  },

  // ── Security Headers + Cache ───────────────────────────────
  async headers() {
    return [
      // HTML already uses per-request CSP nonces and a request-aware layout.
      // Do not shared-cache a nonce or authenticated shell at the CDN.
      {
        source: "/:locale(en|ms|zh)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      ...(!SITE_CONFIG.indexable ? [{
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      }] : []),
      // Explicitly prevent edge caching on sensitive auth and API routes
      {
        source: "/:locale(en|ms|zh)/account/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "payment=(self)",
              "usb=()",
            ].join(", "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },

        ],
      },
      // Customer-owned order confirmation data must never be shared-cached or indexed.
      {
        source: "/:locale(en|ms|zh)/thankyou",
        headers: [
          { key: "Cache-Control", value: "private, no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;

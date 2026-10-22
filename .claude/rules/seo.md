# SEO Rules

## URL Structure

- Preserve existing URL structure exactly: `/{locale}/plans`, `/{locale}/faq`, etc.
- Legacy PHP URLs (`.html`, `.php` extensions) must redirect to new clean URLs via `next.config.ts` rewrites/redirects.
- Never create client-side-only pages for SEO-critical content — use Server Components.

## Metadata Parity

- Every public page must have: `<title>`, `<meta name="description">`, Open Graph tags.
- Check the original PHP page's `<head>` section and replicate all meta tags.
- Use `components/seo-head.tsx` or Next.js `generateMetadata()` for consistency.

## Multilingual Routing

- Three locales: `en`, `ms`, `zh` — served via `app/[locale]/` dynamic segment.
- Translations in `locales/*.json` — never hardcode user-facing strings.
- Canonical tags must point to the correct locale URL.
- `hreflang` alternate links for all three languages on every page.

## Structured Data

- Plans page must serve JSON-LD structured data (from `lib/plans-data.ts`).
- Use `application/ld+json` script tags in page components.

## Sitemap & Robots

- `app/sitemap.ts` generates sitemap dynamically — update when adding new pages.
- `public/robots.txt` is the static source of truth for robots.txt — edit it directly; don't block important paths. (`app/robots.ts` was deleted 2026-07-11 — it was shadowed by the static file. Cloudflare injects managed rules on top.)

## Verification

After any public page change:
- [ ] Check page title and description match PHP version
- [ ] Check Open Graph tags present
- [ ] Check canonical URL correct
- [ ] Check hreflang alternates present
- [ ] Check sitemap includes the page

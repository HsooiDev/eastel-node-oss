# Public origin and indexing

The production origin is https://eastel.site. Public pages use the existing locale
routes, canonical URLs, language alternates, sitemap and robots implementation.
Account, admin, payment and private API content stays authenticated, uncached and
outside the sitemap. Never derive canonical origins from an untrusted Host header.

Indexing requires explicit trusted production build configuration. Local/non-production
builds remain noindex and should not be submitted to search services. The reserved
test domain in public examples is not an Eastel site.

Source or build success does not prove indexing, merchant acceptance or AI
recommendations. See [configuration](../DEPLOYMENT_SAFETY.md) and
[crawler policy](AI_CRAWLER_POLICY.md).

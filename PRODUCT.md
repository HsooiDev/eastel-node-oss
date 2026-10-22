# Product

## Admin workspace scope

Eastel staff use the Next.js /hs workspace for orders, customers, products, vouchers, delivery, marketing, integrations, reports and settings. The owner requested a complete admin redesign and selected A / Cobalt Grid after reviewing visual alternatives on 2026-10-08. Phone and desktop operation have equal priority. Success means finding the required task, reading its state and completing its existing operation without losing fields, actions or authorization. The admin surface brief is MIGRATION_STATUS.md; the consumer website commitments below remain scoped to the public site. Concept and local-preview data are illustrative; connected behavior and production data require separate verification.

## Register

brand

## Users

Two equal-priority user groups browse eastel.site:

**Malaysian SIM buyers** comparing Eastel information and purchasing a physical SIM card. They may buy SIM only or choose paid plan purchasing assistance. They need separate SIM/plan/delivery charges, registration and manual-fulfillment guidance, and reliable order lookup. The merchant does not operate the network or provide automatic monthly renewal.

**Visitors researching Eastelpreneur information** need current official program terms and a clear separation between illustrative calculations, official eligibility and this merchant's SIM sales. Do not promise earnings or authorized partner status without evidence.

Both groups need direct answers within this website. Keep evidence/source URLs in internal documentation, not public outbound references. Prices, coverage, eligibility and business relationships must be confirmed rather than inferred from old copy or calculator examples.

## Product Purpose

This website primarily sells Eastel physical SIM cards and provides order tracking. The owner confirmed retaining optional paid plan purchasing assistance on 2026-10-15. Checkout records the selected plan and separate fee; fulfillment is manual after the required customer SIM registration. Plan/roaming reference pages and recommendations do not confirm purchase or activation. The merchant does not operate the network or provide automatic monthly renewal. Do not publish business-identity disclaimers or an Organization/LocalBusiness/seller entity, and never replace them with unsupported operator or authorized-agent claims.

The Next.js application serves `https://eastel.site`; non-production examples in this source use reserved test domains.

Merchant legal identity, authorized-brand relationship, actual product photography, return eligibility and shipping commitments require owner confirmation before a shopping feed or merchant policy schema is enabled. See [SEO operations](docs/SEO_OPERATIONS.md).

Success: a visitor understands what the merchant sells, distinguishes the SIM fee from optional plan-assistance and delivery charges, checks delivery and starts the existing SIM checkout or finds order help. No ranking, AI citation or sales result is promised.

## Brand Personality

**Trustworthy, reliable, simple.** Like a utility — clean, professional, gets out of the way. The focus is on clear plans and easy purchase.

The public voice is practical and direct: compare, order, track and get help within this website. Do not add business-identity statements or send visitors to external Eastel web pages.

## Anti-references

- **AI-generated SaaS templates**: No gradient text, glassmorphism cards, purple-to-cyan gradients, Inter/Roboto fonts, hero-metric stat pills, identical icon-heading-desc card grids, tiny uppercase tracked kickers on every section.
- **Big telco corporate (Maxis, Celcom, Digi)**: No stock photos of people smiling at phones, no overwhelming red/corporate branding, no cluttered mega-menus with dozens of links. No "unlimited everything" hyperbolic claims without substance.
- **Editorial-magazine aesthetics**: No display serif headings, numbered sections, ruled separators, drop caps. This is a telco, not a literary magazine.
- **Crypto/neon/acid aesthetics**: No neon-on-black, no terminal-green, no overstimulating motion.

The goal: a useful Malaysian SIM sales website with an accurate merchant identity and clear operator references. Preserve the established public design.

## Design Principles

1. **Clarity over persuasion.** Plans and prices should be scannable in seconds. No marketing paragraphs between the user and the information they need.

2. **Trust through transparency.** Show real prices, real caps, real license certificates. No fine-print gotchas buried in footnotes. The credentials section is prominent because it matters.

3. **Accessible to everyone.** Malaysian users span wide device, connection, and literacy ranges. Fast on 3G. Readable at 16px+. Works on a RM300 phone.

4. **Local, not global.** The design should feel at home in Malaysia. Not a US/European SaaS template translated to BM and Chinese. Typography, spacing, imagery — all should feel like they belong here.

5. **One surface, one job.** Every page has one primary action. Plans → compare and buy. Eastelpreneurs → understand earning potential. FAQ → find answers. No multi-purpose pages that try to do everything.

## Accessibility & Inclusion

- WCAG 2.2 Level AA minimum
- All three languages (EN, BM, ZH) must render correctly with equal visual quality
- Touch targets ≥ 44×44px for Malaysia's mobile-first audience
- Focus indicators visible for keyboard navigation
- `prefers-reduced-motion` respected
- Works on low-end Android devices and patchy 3G/4G connections common in Malaysian suburbs

## Public content direction — owner confirmation, 2026-10-15

Delete business-identity statements everywhere in public EN/MS/ZH content, including FAQ, policies, footer, metadata/hydration copy and JSON-LD. Remove eastel.com.my links and equivalent directions to external Eastel web pages. Keep browsing, plan comparison, order, tracking and contact navigation on the current locale’s website. The PHP PR #34 removal of repeated notices is the UI baseline; the owner’s newer instruction is stricter and also excludes retained identity content. Preserve real activation/registration instructions, paid plan fulfillment and payment/security behavior. Required payment, verification and existing support services remain functional; do not promise all transactions can occur without banks or App registration.

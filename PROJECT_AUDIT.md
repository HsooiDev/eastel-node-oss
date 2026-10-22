> **Current status (owner-confirmed, 2026-10-22):** Next.js is live at `https://eastel.site`; PHP is retired from the main production site. Read [PROJECT_STATUS.md](PROJECT_STATUS.md). Older dated deployment/cutover statements below are historical and do not override this status; their unverified operational checks are not automatically marked complete.

> Detailed historical execution reports are outside this repository. Public links below point to the concise security/verification summary, not private run logs.

# PROJECT_AUDIT — Full System Map

## Security admission addition — 2026-10-22

- lib/guest-otp-budget.ts reserves OTP mail admission in existing login_attempts
  under a database-scoped lock, including imported layouts without success.
  No new schema, environment variable or scheduler.
- scripts/verify-guest-otp-admission.mjs runs actual route/verifier/budget SQL
  with private SQLite and intercepted services, joining test:security. Core,
  payment and checkout UI regressions cover the other three security repairs.


- Subsequent PR #18 records the 2026-10-22 merge/deployment and synthetic MariaDB checks; see the dated follow-up in `MIGRATION_STATUS.md`. This cleanup preserves that evidence and all remaining real-business/Cron limitations without re-running it.

## Existing provider callback URLs — 2026-10-19

- Preserve exact PHP /api/whatsapp.php and /api/telegram.php registrations with
  internal rewrites to the existing Node webhook handlers. Preserve issued WA
  bills at /api/whatsapp-payment-callback.php using the existing verified payment
  callback, including its idempotency and notification gates. No new table/schema.
- Paid WA callback logs the successful provider message ID, exact confirmation,
  recipient/contact and local date only after send success and the winning paid
  transition. Failed sends are not logged as delivered; log failure never retries
  sending. Four offline actual-handler cases join test:core.
- Built-server checks cover query/challenge preservation, wrong verify token,
  unsigned POST rejection, exact payment callback POST and unknown-path404.
  Telegram GET405 proves route mapping without DB/service calls. Real provider
  delivery and missing Telegram webhook secret remain cutover verification gaps.


Generated from scanning both PHP and Node.js projects.
AI should reference this instead of guessing what exists.

## Focused upgrade/parity additions — 2026-10-16

- 2026-10-18 return screen: new account/orders/PaymentReturnNotice.tsx renders
  EN/MS/ZH saved-state notices selected only from the current customer's orders.
  Refreshes the authenticated server page every2s, capped at20; paid/unmount
  stops, timeout stays unresolved. Manual refresh/support controls are44px.
  Existing payment return now validates saved orders.lang for local redirects.
  New scripts/verify-payment-return-ui.mjs joins test:core; payment-resolution
  and actual order-page SQLite/SSR fixtures cover language/query/ownership.
  No new route/table/schema, gateway check or send. Signed-out context recovery,
  missed-callback reconciliation and hosted/browser acceptance remain open.

- 2026-10-18 payment results: query/return use current saved bill state for
  definitive results. Missing/unavailable state stays unresolved; a provider-paid/
  old-failed conflict cannot show failed. Return scans for successful attempts
  before failed/pending retries, retaining timeout/config. Static WA landing no
  longer claims verified payment/message delivery. New18 source/SQL-model/action/
  React SSR cases join core; independent review closes the retry-state finding.
  No schema/amount/provider configuration change. Account processing notices and
  locale are addressed in the follow-up above; provider reconciliation remains. See
  MIGRATION_STATUS.md for backup and evidence boundaries.

- 2026-10-18 payment state races: regenerate uses nine-field binary/null-safe
  conditional UPDATE to preserve intervening payment/bill/contact changes. Lost
  write409 and uncertain-save500 stop before link send/audit and require review.
  Failed callback additionally binds exact bill code before existing side effects.
  Existing14 plus9 new source/pause-gate/SQL-model cases pass; full local checks
  and independent review pass. No schema/config/provider/stock/TTL changes.
  External create idempotency, detached bills and old-bill settlement remain open.
  See MIGRATION_STATUS.md for backup and precise boundaries.

- 2026-10-18 admin payment links: regenerate success uses success instead of
  overriding the shared envelope with ok, matching the existing page consumer.
  Both page actions now catch request/JSON failures and always clear their own
  loading key; unknown bill result asks to refresh, without automatic retry.
  Warning/manual link retained; absent/rejected clipboard does not block refresh.
  New14 source/SQL-model/provider-client/page-action cases join test:core; full
  local regressions and independent review pass. No payment/SQL/schema/provider
  config changes. See MIGRATION_STATUS.md for backup and
  existing concurrency/idempotency/provider acceptance boundaries.

- 2026-10-18 order notifications: actual status edits now send localized
  previous/new-status mail; shipped+tracking selects shipping, other transitions
  use status mail. Prior-value binary/null-safe update comparison returns409 on
  a competing edit; identical saves avoid write/audit/mail. Existing access,
  courier and WA controls retained. Paid confirmation reports customer-send bool,
  preserving single-attempt claim/no-retry policy. New15 source/MIME cases plus
  full local regressions and independent review pass. No schema/version/hosted
  changes. See MIGRATION_STATUS.md for policy differences,
  delivery limitations, backup and acceptance boundaries.

- 2026-10-18 mail locale: existing helper/template functions now preserve locale
  in reset/order notices and shipping account links; localized verification CTA,
  case-insensitive noreply and safe English fallback. Abandoned forwarding is
  unchanged. scripts/verify-email-locales.mjs adds10 real-source/in-memory MIME
  cases to password interop; receipt/security checks and independent review pass.
  No route/schema/transport/configuration/price/claim changes. See report
  MIGRATION_STATUS.md; real delivery/client acceptance not claimed.


- 2026-10-18 dependencies: Nodemailer10.1.2/Lucide1.59.0 exact; app/API/template/
  schema/layout unchanged. Strict install and clean install pass, only two package
  lock blocks/root specs change.121 icon imports compare identically and24 real
  local MIME compositions pass with no SMTP/DB calls. Independent review clear.
  ESLint10.13/TS7 strict candidate peer conflicts and five High dev-chain affected
  packages remain; Node24 types retained. See MIGRATION_STATUS.md.


- 2026-10-17 durable admin: lib/admin-login-attempts.ts adds existing-table
  WRONG_PASSWORD IP15min/10 plus retained email5min/5 checks. New withDatabaseLocks
  in database-lock.ts hashes/sorts/deduplicates scopes on one connection; previous
  single-key callers keep their existing contract. Both counts, active-admin read,
  password verification and masked DB NOW log share that connection. Sessions
  borrow after release. No success-column dependency, schema or Cron changes.
  17 dedicated source/model/process tests pass and independent review is clear;
  actual MariaDB and legacy cross-stack policy remain release boundaries. See
  MIGRATION_STATUS.md.

- 2026-10-17 admin entry: shared clientIp now feeds quota, CAPTCHA, logs, audit and
  sessions; fixed SITE_URL hostname/admin_login action binds API and widget.
  Both honeypot aliases reject without30-second timers after quota. UI resets
  tokens on each attempt and requires explicit HTTP/status success. Bad DB lock
  counts fail closed. Nine source tests plus full legacy admin session chain are
  in test:security. No new tables/routes/layout. Durable IP admission was completed
  in the follow-up above; PHP browser-vs-Node email policy still differs.
  See MIGRATION_STATUS.md for backup, evidence and boundaries.

- 2026-10-17 durable login: lib/customer-login-attempts.ts coordinates a DB+IP
  lock, counts only CUSTOMER_WRONG_PASSWORD over DB NOW's fifteen-minute window
  and writes fixed masked attempts, using the same connection as authentication.
  Login releases it before session creation; existing hash CAS/flags remain.
  Admin security reader/filter consumes the new type with no password projection.
  No success-column dependency, schema mutation, cleanup or Cron.17 dedicated
  tests exercise source SQL/locks with SQLite/FS models and real child workers;
  hosted MariaDB and legacy PHP marker handover remain release gates. See report.

- 2026-10-17: customer login/register/forgot now pair fixed widget actions with
  build-origin validation and per-attempt token refresh. register/forgot send
  locale to the mail handoff; register trims name before nonempty validation.
  Clients require HTTP+status success. Forgot response copy is conditional request
  acceptance. Verification resend accepts optional allowlisted locale while keeping
  session email/verified/rate guards; verification page checks explicit success
  and rotates new proof. verify-auth-entry-flows.mjs adds25 offline cases to
  test:security. PHP action is a log label; Node metadata checks are hardening.
  No account/widget/key/schema/version operation. See AUTH_ENTRY_FOLLOWUP report.
  Customer durable failed-attempt logging/shared limit is now locally implemented
  by the follow-up above; historical marker handover and hosted proof remain open.

- Existing update-profile/update-password routes/pages now use action/domain-bound
  Turnstile and refresh their own tokens after attempts. Profile transaction also
  synchronizes this customer's public review names/pending status, matching PHP;
  private/other-customer rows remain untouched. Only missing legacy reviews table
  is optional; other errors roll back. Names trim before nonempty validation.
  Profile failed initial loads now block editing and support localized retry.
  verify-account-mutations.mjs adds18 actual-handler/SQL/hook cases to test:security,
  including public visibility/authorized approval and real Argon2/CAS/session tests.
  No new endpoint, schema, dependency version or provider key/account operation.
  See MIGRATION_STATUS.md for backup and acceptance boundaries.

- Reset follows PHP's mailbox side effect: valid reset changes email_verified0 to1
  inside the password/token/session transaction. The page/API now require the
  existing Turnstile widget's reset_password action and the build's SITE_URL host.
  Optional helper expectations preserve other callers; token/type/time bounds and
  fail-closed provider errors apply. Reset retries clear token/reset own widget.
  verify-reset-turnstile.mjs adds15 offline helper/route/form/widget cases to
  test:security; the original suite now has37 including actual Argon2 login/session
  after reset. No new endpoint/schema/key/widget provisioning. Hosted/browser
  acceptance remains pending. See MIGRATION_STATUS.md.

- Dependency follow-up adopts Next/eslint-config-next16.4.2, Lucide1.58.0 and
  TypeScript6.0.3 after isolated compiler checks. Seed removes undeclared dotenv
  autoload and requires explicitly supplied test env; existing production guards
  remain. ESLint10/TS7 strict installs are blocked by transitive peers. No hosted
  operation is implied. See MIGRATION_STATUS.md.

- scripts/audit-legacy-media.mjs is an offline, read-only aggregate reconciliation
  CLI for explicit private snapshots/reference exports, with optional restored-copy
  SHA comparison; it has no environment/DB/network/write dependency. Ten synthetic
  cases are in verify-legacy-media-audit.mjs. verify-email-interop.mjs adds ten
  real local PHP/actual Node issuer/handler scenarios without changing auth policy.
  PHP helper fixture is byte-identical to c49077c5. See EMAIL_MEDIA_PREFLIGHT report
  for hosted metadata SELECTs, distinct media counts and remaining acceptance gates.

- lib/legacy-assets.ts defines three internal public image aliases, also used by
  the authenticated site gallery. Eight valid missing public PHP images are
  copied unchanged; ASP licence has a canonical AVIF copy. Site gallery permits
  AVIF while poster/review sources retain their raster restrictions. The fixture
  and verify-legacy-assets.mjs preserve all 22 PHP paths plus lowercase ASP;
  verify-seo-build.mjs tests built GET/HEAD bytes/MIME without redirects.
- Fresh whatsapp_logs CREATE includes media_path VARCHAR(500) DEFAULT NULL.
  No existing-table ALTER is added. verify-auth-migration.mjs exercises fresh,
  imported and existing-table preservation with a synthetic in-memory SQL model.
  See MIGRATION_STATUS.md for backup and hosted limits.

- lib/whatsapp/media-storage.ts implements private persistent attachment admission,
  atomic publication, duplicate reuse and legacy path reads. Webhook writes the existing
  whatsapp_logs.media_path column after save; failures return retryable 503.
- WHATSAPP_MEDIA_DIR is a new release/start requirement. GET /api/media supports private
  legacy-path/range reads; beforeFiles protects /media/wa/* and /api/media.php. No new
  table/schema, automatic retention, scheduled job or provider message was added.
  See MIGRATION_STATUS.md for quotas, source backup and acceptance gaps.

- scripts/create-admin.js reuses lib/auth.ts Argon2id and hashes before DB access.
  scripts/verify-create-admin.mjs covers offline create/update/failure/PHP verification.
  No schema, route or account changed by that CLI fix. Hosted inventory and the
  remaining WhatsApp acceptance gates are in MIGRATION_STATUS.md.

- lib/review-upload-path.ts resolves persistent + legacy upload roots, safe image reads and
  post-commit admin cleanup. lib/upload-storage.ts resolves those roots per request for upload/quota.
  GET /api/review-images/[...segments] serves raster data; a beforeFiles rewrite preserves
  existing /uploads/... URLs. REVIEW_UPLOAD_DIR is required in hosted release/start preflight.
  No DB schema or review moderation/public-URL permission change; tests use temporary files only.

- lib/marketing-gallery.ts merges poster/site/Node-review/PHP-review images for the existing
  admin posters GET, sorts newest-first and returns at most 50. New admin-only
  GET /api/admin/marketing-images/[source]/[filename] serves fixed sources at request time.
  No database tables are involved; static site assets and existing review-upload files are read only.

- Poster upload/list/file-read and AI-image save resolve MARKETING_POSTER_DIR through
  lib/marketing-share-path.ts. Hosted start/release rejects absent or in-release paths;
  scripts/verify-marketing-posters.mjs covers real handlers with synthetic local storage,
  including upload in one release and reading after switching to another release.

- Follow-up adds lib/marketing-share-path.ts, release/start preflight configuration,
  real PHP/Node password interop fixtures and actual-page editor interaction checks.
  Native Argon2id writes retain legacy reads; successful customer login rehashes
  scrypt with CAS. See MIGRATION_STATUS.md for hosted/rollback gates.

- Reset routes and customer query helpers share `hashPasswordResetToken` from
  `lib/auth.ts`. `customers.reset_token` stores PHP-compatible SHA-256; the reset
  handler retains its transaction and customer-only session revocation and now
  throttles anonymous work before scrypt. Old unmarked Node raw tokens require
  fresh issuance; no schema or real-token migration is performed.
- `lib/marketing-editor-model.ts` supports editor history, snapping, fit and
  chroma operations. The existing `/hs/marketing-design` owns the UI. Admin/CSRF
  `POST /api/admin/marketing-shares` stores bounded PNG/JPEG marketing exports
  through `lib/marketing-share-storage.ts`; public
  `GET /api/marketing-shares/[filename]` only resolves random raster filenames.
  The filesystem `storage/marketing-shares` needs persistent hosted storage and
  a controlled maintenance policy; it is not a customer-data/share API.
- Marketing template GET now returns the existing `layout_json` column decoded
  from MariaDB LONGTEXT. Both marketing-design and promo-graphic consumers are
  covered: old PHP/Node editor layouts normalize without dropping layers, while
  promo fields remain available as an object. Malformed JSON becomes null; the
  existing admin authorization and schema are unchanged.
- `lib/shopee-tracking-batch.ts` sequences the existing authenticated single-row
  endpoint for manual Refresh All. Browser requests have a timeout and per-row
  outcomes. No new cron, provider credential, shared table or order-expiry route.
- Focused synthetic suites are `test:marketing-editor`, `test:tracking` and the
  expanded `test:security`. [Delivery record](MIGRATION_STATUS.md)
  separates local evidence from unperformed hosted/business acceptance.

## AI commerce interface — 2026-10-13

New Node-only integration: official `@modelcontextprotocol/sdk` implements stateless `POST /api/mcp`. Public tools `eastel_get_catalogue`, `eastel_recommend_plan`, and `eastel_prepare_checkout` share `lib/ai-commerce.ts` with REST `/api/ai/catalogue`, `/api/ai/recommend`, `/api/ai/checkout`, and generated `/api/ai/openapi`. The live catalogue still comes from the existing settings row; physical SIM/courier data come from `products` and `couriers` via `lib/storefront.ts` and `/api/storefront/checkout`.

Website orders support SIM-only or SIM plus a mobile plan the merchant purchases manually after customer registration. `lib/order-plan.ts` resolves available catalogue IDs; the browser-safe `lib/order-plan-snapshot.ts` parses immutable saved terms. Four additive order columns store snapshot, plan fee and fulfillment timestamp/admin. The gateway total includes the server-priced plan; vouchers retain the SIM/shipping base. Admin Orders/CSV, customer orders/confirmation, emails and owned private `/[locale]/account/orders/[id]/invoice` display the saved charges and terms. Authenticated/CSRF-protected `POST /api/admin/orders/fulfill-plan` atomically records a paid active order's manual fulfillment and audit, idempotently; it does not contact the carrier. Historic zero-fee/null-snapshot rows stay SIM-only. No new database tables.

`lib/ai-checkout-details.ts` encrypts optional customer-authorized contact/shipping drafts using domain-separated `JWT_SECRET`, issuer/audience validation and a 15-minute expiry. Private fragments are removed before browser draft exchange (`POST /api/ai/checkout-details`, excluded from AI discovery). Drafts confer no session/OTP/payment rights. Website mode requires no customer details in the tool. Default assisted mode fills forms; final checkout, email/security checks and FPX authorization still happen on the website/bank pages. `OrderForm` now uses live SIM/courier information and the actual auth-check customer contract. The theme provider keeps a stable child tree during hydration.

Read [docs/AI_COMMERCE.md](docs/AI_COMMERCE.md) for connection details, privacy limits and test commands. These tools have no order/payment side effects and do not establish marketplace publication or native in-chat payment. Production credentials, provider account connection and real-payment verification remain separate release gates.

> Verification note (2026-08-15): this is a static system map. It does not by itself prove production parity. Local Batch 3–5 source/test work is recorded here, while real environment, deployment, and post-CDN evidence remain release gates.

---

## 1. Public Routes

Security boundary additions (2026-10-10): `lib/database-lock.ts` serializes bounded
operations using MariaDB named locks; `lib/email-verification.ts` provides shared
persistent verification attempt limits; `lib/ai/public-budget.ts` provides durable
website/Telegram AI reservations; `lib/upload-storage.ts` bounds streamed bodies
and cumulative storage. `lib/cron-auth.ts`, `lib/client-ip.ts`, and `lib/csv.ts`
centralize nonempty maintenance authorization, trusted forwarding identity, and
spreadsheet-safe text respectively. Focused source-executing coverage lives in
`scripts/verify-security-regressions.mjs`; operational limits and real-environment
proof gaps are documented in `DEPLOYMENT_SAFETY.md`.

| Page | PHP Source | Node.js Route | Status |
|---|---|---|---|
| Home / Landing | `/en/index.php`, `/ms/index.php`, `/zh/index.php` | `app/[locale]/page.tsx` | ✅ Done |
| Plans | `/en/plans.php`, `/ms/plans.php`, `/zh/plans.php` | `app/[locale]/plans/page.tsx` | ✅ Done |
| Roaming | `/roaming/` | `app/[locale]/roaming/page.tsx` | ✅ Local catalog; live purchase/API parity remains a release gate |
| Eastelpreneurs | `/en/eastelpreneurs.html` (×3 langs) | `app/[locale]/eastelpreneurs/page.tsx` | ✅ Done |
| FAQ | `/en/faq.html` (×3 langs) | `app/[locale]/faq/page.tsx` | ✅ Done |
| Contact | `/en/contact.html` (×3 langs) | `app/[locale]/contact/page.tsx` | ✅ Done |
| Order Form | `/order.html` | `app/[locale]/order/page.tsx` | ✅ Done |
| Thank You | `/thankyou.html` | `app/[locale]/thankyou/page.tsx` | ✅ Done |
| Delivery Policy | `/delivery-policy.html` | `app/[locale]/delivery/page.tsx` | ✅ Done |
| Privacy Policy | `/privacy-policy.html` | `app/[locale]/privacy/page.tsx` | ✅ Done |
| Terms | `/terms.html` | `app/[locale]/terms/page.tsx` | ✅ Done |
| 404 Page | `/404.html` | `app/not-found.tsx` (branded) | ✅ Done |
| Error pages (500) | (no PHP equivalent) | `app/[locale]/error.tsx` + `app/global-error.tsx` (branded boundaries) | ✅ Done |
| Payment Success (WA orders) | (no PHP equivalent) | `app/payment/success/page.tsx` — landing for WA-bot ToyyibPay `billReturnUrl` | ✅ Done |
| Guest Order Tracking | (no PHP equivalent) | `app/[locale]/track/page.tsx` + `TrackForm.tsx` | ✅ Done |

**Multilingual:** PHP uses `/en/`, `/ms/`, `/zh/` directories. Node.js uses `app/[locale]/` dynamic segment with `locales/*.json` translation files.

---

## 2. Customer Portal

| Page | PHP Source | Node.js Route | Status |
|---|---|---|---|
| Login | `/account/login.html` | `app/[locale]/account/(auth)/login/page.tsx` | ✅ Done |
| Register | `/account/register.html` | `app/[locale]/account/(auth)/register/page.tsx` | ✅ Done |
| Forgot Password | `/account/forgot.html` | `app/[locale]/account/(auth)/forgot/page.tsx` | ✅ Done |
| Reset Password | `/account/reset.html` | `app/[locale]/account/(auth)/reset/page.tsx` | ✅ Done |
| Verify Email | `/account/verify-email.html` | `app/[locale]/account/(auth)/verify-email/page.tsx` | ✅ Done |
| My Orders | `/account/orders.html` | `app/[locale]/account/orders/page.tsx` | ✅ Done |
| My Profile | `/account/profile.html` | `app/[locale]/account/profile/page.tsx` | ✅ Done |
| Change Password | `/account/password.html` | `app/[locale]/account/password/page.tsx` | ✅ Done |
| Submit Review | `/account/review.html` | `app/[locale]/account/review/page.tsx` | ✅ Done |

---

## 3. Admin Panel

Admin pages live at `/hs/*`. Login uses route group `app/(admin-auth)/hs/login/` for a minimal layout; all other pages use `app/hs/` with the full sidebar layout (`app/hs/layout.tsx`).

| Page | PHP Source | Node.js Route | Status |
|---|---|---|---|
| Admin Login | `hs/index.php` | `app/(admin-auth)/hs/login/page.tsx` | ✅ Done |
| Admin Sign Out | PHP admin navigation | `components/admin/sidebar.tsx` + `app/api/auth/logout/route.ts` | ✅ Session revoke + cookie clear |
| Admin Entry | `/hs/` | `app/hs/page.tsx` → `/hs/dashboard` (authenticated layout sends guests to `/hs/login`) | ✅ Explicit route added 2026-10-07 |
| Dashboard | `hs/dashboard.php` | `app/hs/dashboard/page.tsx` | ✅ Done |
| Orders | `hs/orders.php` | `app/hs/orders/page.tsx` | ✅ Filtered summary/CSV and fulfillment edits; PHP summary cards are global, Node's explicitly filtered |
| Customers | `hs/customers.php` | `app/hs/customers/page.tsx` | ✅ Done |
| Customer Detail | (inline in customers) | `app/hs/customers/[id]/page.tsx` | ✅ Done |
| Products | `hs/products.php` | `app/hs/products/page.tsx` | ✅ Done |
| Reviews | `hs/reviews.php` | `app/hs/reviews/page.tsx` | ✅ Filters, three moderation states, photo preview/delete |
| Couriers | `hs/couriers.php` | `app/hs/couriers/page.tsx` | ✅ Done |
| Postcode Zones | `hs/zones.php` | `app/hs/zones/page.tsx` | ✅ Filters/search/Clear/Refresh; exact legacy redirect |
| Reports (detailed) | `hs/report.php` | `app/hs/report/page.tsx` | ✅ All six PHP tabs plus existing Products/Customers |
| Reports Dashboard | (no PHP equivalent) | `app/hs/reports/page.tsx` | ✅ Done |
| Security | `hs/security.php` | `app/hs/security/page.tsx` | ✅ Done |
| Settings | `hs/settings.php` | `app/hs/settings/page.tsx` | ✅ Refresh and visible load/save errors |
| WhatsApp Dashboard | `hs/whatsapp.php` | `app/hs/whatsapp/page.tsx` | ✅ Done |
| WhatsApp Chat | `hs/whatsapp_chat.php` | (integrated in whatsapp page) | ✅ Done |
| Telegram | `hs/telegram.php` | `app/hs/telegram/page.tsx` | ✅ Done |
| Cloudflare | `hs/cloudflare/` (multiple tabs) | `app/hs/cloudflare/page.tsx` | ✅ Done |
| GA4 Analytics | `hs/ga4.php` | `app/hs/ga4/page.tsx` | ✅ Done |
| GSC Search Console | `hs/gsc.php` | `app/hs/gsc/page.tsx` | ✅ Done |
| GA4 OAuth Setup | `hs/ga4-oauth-setup.php` | (service account, no UI needed) | ⏭️ Skipped |
| GSC OAuth Setup | `hs/gsc-oauth-setup.php` | (service account, no UI needed) | ⏭️ Skipped |
| Postcode Inquiries | `hs/postcode_inquiries.php` | `app/hs/postcode-inquiries/page.tsx` | ✅ Done |
| Marketing Design | `hs/marketing_design.php` | `app/hs/marketing-design/page.tsx` | Advanced editor local implementation; see 2026-10-16 report; hosted/AI acceptance pending |
| Cache Management | `hs/cache.php` (0 bytes, empty) | (Cache tab inside Cloudflare page) | ✅ Done |
| Admin User Guide | `hs/guide.php` | `app/hs/guide/page.tsx` | ✅ Done |
| Maintenance / Migration | `hs/maintenance.php` | `lib/migrate.ts` (auto-run on startup) | ✅ Done |
| Vouchers | `hs/vouchers.php` | `app/hs/vouchers/page.tsx` | ✅ Done |
| Shopee Tracking | `hs/shopee_tracking.php` | `app/hs/shopee-tracking/page.tsx` | Manual CRUD + Refresh All local/mock verified; automatic first-load/after-add scans remain different; real provider NOT RUN |
| Product Listing Photos | `hs/product-listing-photos.php` | `app/hs/product-listing-photos/page.tsx` | ✅ Done |
| Promo Graphic | (no PHP equivalent) | `app/hs/promo-graphic/page.tsx` | ✅ Done |
| Video Generator | `hs/video-generator.php` | `app/hs/video-generator/page.tsx` | ✅ Done |
| Video Recording | `hs/video-recorder.php` | `app/hs/video-recording/page.tsx` | ✅ Done |

---

## 4. API Endpoints

### Auth APIs

| PHP Endpoint | Node.js Route | Status |
|---|---|---|
| `POST api/auth.php?action=register` | `POST app/api/auth/register/route.ts` | ✅ Done |
| `POST api/auth.php?action=login` | `POST app/api/auth/login/route.ts` | ✅ Done |
| `POST api/auth.php?action=logout` | `POST app/api/auth/logout/route.ts` | ✅ Done |
| `POST api/auth.php?action=forgot` | `POST app/api/auth/forgot/route.ts` | ✅ Done |
| `POST api/auth.php?action=reset` | `POST app/api/auth/reset/route.ts` | ✅ Done |
| `GET api/auth.php?action=check` | `GET app/api/auth/check/route.ts` | ✅ Done |
| `POST api/auth.php?action=update_profile` | `POST app/api/auth/update-profile/route.ts` | ✅ Done |
| `POST api/auth.php?action=update_password` | `POST app/api/auth/update-password/route.ts` | ✅ Done |
| `POST api/email-verify.php?action=verify` | `POST app/api/auth/verify-email/route.ts` | ✅ Done |
| `POST api/email-verify.php?action=resend` | `POST app/api/auth/resend-code/route.ts` | ✅ Done |
| `GET api/auth.php?action=profile` | `GET app/api/auth/profile/route.ts` | ✅ Done |

### Order & Payment APIs

| PHP Endpoint | Node.js Route | Status |
|---|---|---|
| `POST api/payment.php` (create order + bill) | `POST app/api/orders/create/route.ts` | ✅ Done |
| `GET api/orders.php?action=my_orders` | `GET app/api/orders/my/route.ts` | ✅ Done |
| `POST api/payment_return.php` (ToyyibPay callback) | `POST app/api/payment/callback/route.ts` | ✅ Done |
| `GET api/payment_return.php` (browser return) | `GET app/api/payment/return/route.ts` | ✅ Done |

Cutover compatibility (2026-10-10): PHP-created bills use
`POST /api/payment.php?action=callback` and `GET /api/payment_return.php`.
`next.config.ts` now rewrites these internally to the existing payment handlers,
preserving method, body and query parameters. Other legacy payment actions are
not forwarded. `/hs/index.php` redirects to `/hs/login`. Real old-bill settlement
against MariaDB and the gateway remains a cutover acceptance gate.

### Review APIs

| PHP Endpoint | Node.js Route | Status |
|---|---|---|
| `GET api/reviews.php?action=list` (public) | `GET app/api/reviews/public/route.ts` | ✅ Done |
| `POST api/reviews.php?action=submit` | `POST app/api/reviews/submit/route.ts` | ✅ Done |
| `GET api/reviews.php?action=my` | `GET app/api/reviews/my/route.ts` | ✅ Done |
| `GET api/reviews.php?id=X` | `GET app/api/reviews/[id]/route.ts` | ✅ Done |

### Admin APIs

| PHP Endpoint | Node.js Route | Status |
|---|---|---|
| `POST api/admin.php?action=login` | `POST app/api/admin/login/route.ts` | ✅ Done |
| `api/admin.php` (orders listing + update_tracking) | `app/api/admin/orders/route.ts` | ✅ Shared filters/count/summary/full CSV; courier save preserves amounts |
| `api/admin.php` (customers CRUD) | `app/api/admin/customers/route.ts` | ✅ Done |
| `api/admin.php` (customer detail) | `app/api/admin/customers/[id]/route.ts` | ✅ Done |
| `api/admin.php` (products CRUD) | `app/api/admin/products/route.ts` | ✅ Done |
| `api/admin.php` (reviews CRUD) | `app/api/admin/reviews/route.ts` | ✅ Filters, three status transitions, transactional local-photo cleanup |
| `api/admin.php` (couriers CRUD) | `app/api/admin/couriers/route.ts` | ✅ Done |
| `api/admin.php` (zones CRUD) | `app/api/admin/zones/route.ts` | ✅ Done |
| `api/settings-admin.php` | `app/api/admin/settings/route.ts` | ✅ Done |
| `api/dashboard-admin.php` | `app/api/admin/dashboard/route.ts` | ✅ Done |
| `api/marketing-admin.php` (generate_text, generate_image) | `app/api/admin/marketing-ai/route.ts` | ✅ Done |
| `api/marketing-admin.php` (get/save/delete templates) | `app/api/admin/marketing-templates/route.ts` + `marketing-templates/[id]/route.ts` | ✅ Done |
| `api/marketing-admin.php` (view_poster, list_images, upload_image) | `app/api/admin/posters/[filename]/route.ts` | ✅ Done |
| `api/postcode-inquiries-admin.php` | `app/api/admin/postcode-inquiries/route.ts` | ✅ Done |
| `api/admin.php` + `hs/security.php` | `app/api/admin/security/route.ts` | ✅ Type/IP filters; explicit field projection excludes password_tried |
| (no PHP equivalent) | `app/api/admin/cleanup/route.ts` | ✅ Done |
| `hs/report.php` + `api/admin.php` list actions | `app/api/admin/reports/route.ts` | ✅ 8 report views; authenticated full order/review CSV exports |
| (no PHP equivalent) | `app/api/admin/reports/export/route.ts` | ✅ Done |
| (no PHP equivalent) | `app/api/admin/reports/customers/route.ts` | ✅ Done |
| (no PHP equivalent) | `app/api/admin/reports/products/route.ts` | ✅ Done |

### Integration APIs

| PHP Endpoint | Node.js Route | Status |
|---|---|---|
| `api/whatsapp.php` (webhook) | `app/api/whatsapp/webhook/route.ts` | ✅ Done |
| `api/whatsapp-admin.php` | `app/api/admin/whatsapp/route.ts` | ✅ Done |
| `api/whatsapp-queue.php` (debounce cron) | `app/api/whatsapp/debounce/route.ts` | ✅ Done |
| `cron-missed.php` | `app/api/whatsapp/missed/route.ts` | ✅ Done |
| `api/telegram.php` (webhook) | `app/api/telegram/webhook/route.ts` | ✅ Done |
| `api/telegram-admin.php` | `app/api/admin/telegram/route.ts` | ✅ Done |
| `api/cloudflare.php` | `app/api/admin/cloudflare/route.ts` | ✅ Done |
| `api/purge-cache.php` | `app/api/cloudflare/purge/route.ts` | ✅ Done |
| `api/ga4.php` | `app/api/admin/ga4/route.ts` | ✅ Done |
| `api/gsc.php` | `app/api/admin/gsc/route.ts` | ✅ Done |
| `api/media.php` (upload) | `app/api/upload/route.ts` | ✅ Done |
| `api/media.php` (serve WhatsApp files) | `app/api/media/route.ts` | ✅ Done |

### Other APIs

| PHP Endpoint | Node.js Route | Status |
|---|---|---|
| `api/plans-schema.php` (JSON-LD) | `lib/plans-data.ts` (inline) | ✅ Done |
| (chat via WhatsApp) | `app/api/chat/route.ts` | ✅ Done |
| (no PHP equivalent) | `app/api/translations/route.ts` | ✅ Done |
| (no PHP equivalent) | `app/api/health/route.ts` (readiness), `app/api/health/live/route.ts` (liveness) | ✅ Local fix; live DB proof pending |
| `GET api/auth.php?action=check_email` | `GET app/api/auth/check-email/route.ts` | ✅ Done |
| `POST api/email-verify.php?action=send_code` | `POST app/api/auth/send-otp/route.ts` | ✅ Done |
| `POST api/email-verify.php?action=verify_code` | `POST app/api/auth/verify-otp/route.ts` | ✅ Done |
| `GET api/payment.php?action=get_zone` | `GET app/api/orders/zone/route.ts` | ✅ Done |
| `api/postcode-inquiry-submit.php` | `POST app/api/orders/postcode-inquiry/route.ts` | ✅ Done |
| (no PHP equivalent) | `PATCH app/api/orders/postcode-inquiry/[id]/route.ts` | ✅ Done |
| `api/postcode-inquiries-admin.php` | `GET/PATCH app/api/admin/postcode-inquiries/route.ts` | ✅ Done |
| `api/postcode-inquiries-admin.php` | `PATCH app/api/admin/postcode-inquiries/[id]/route.ts` | ✅ Done |
| (vouchers admin CRUD) | `app/api/admin/vouchers/route.ts` | ✅ Done |
| (public voucher validate/claim) | `app/api/vouchers/route.ts` | ✅ Done |
| (Shopee tracking admin) | `app/api/admin/shopee-tracking/route.ts` | ✅ Done |
| (payment status poll) | `app/api/payment/check-payment/route.ts` | ✅ Done |
| (DuitNow QR payment check) | `app/api/payment/check-dnqr/route.ts` | ✅ Done |
| `cron-media-cleanup.php` | `POST app/api/media/cleanup/route.ts` (cron daily 2 AM, x-cron-secret) | ✅ Done |
| (no PHP equivalent) | `POST app/api/orders/track/route.ts` — guest order lookup (rate-limited) | ✅ Done |
| (no PHP equivalent) | `POST app/api/orders/abandoned-reminder/route.ts` — hourly cron, toggles in settings | ✅ Done |
| (no PHP equivalent) | `instrumentation.ts` — onRequestError → Telegram server-error alerts | ✅ Done |
| (customer retry payment) | `app/api/payment/pay-again/route.ts` | ✅ Done |
| (admin regenerate ToyyibPay bill) | `app/api/admin/orders/regenerate-payment/route.ts` | ✅ Done |
| (admin resend payment link) | `app/api/admin/orders/resend-payment/route.ts` | ✅ Done |

---

## 5. Shared Libraries

| PHP Source | Node.js Equivalent | Status |
|---|---|---|
| `api/lib/wa-client.php` (542 lines) | `lib/whatsapp/client.ts` (350 lines, 20 functions) | ✅ Done |
| `api/lib/gemini-client.php` | `lib/ai/gemini.ts` (shared across WA/TG/chat) | ✅ Done |
| `api/lib/telegram-client.php` | `lib/telegram/client.ts` (26 functions) | ✅ Done |
| `api/lib/gsc-client.php` | `lib/google/gsc.ts` | ✅ Done |
| `api/config.php` | `.env.local` + `lib/db.ts` | ✅ Done |
| `api/email-helper.php` | `lib/email.ts` + `lib/email-templates.ts` | ✅ Done |
| `js/main.js` (translations) | `locales/*.json` + `lib/i18n.ts` + `lib/i18n-server.ts` + `lib/i18n-types.ts` | ✅ Done |
| `js/config.js` | `.env.local` + inline config | ✅ Done |
| `hs/maintenance.php` (schema) | `lib/migrate.ts` | ✅ Done |
| `api/orders.php` (zone logic) | `lib/db-helpers.ts` | ✅ Done |
| `api/reviews.php` (data) | `lib/reviews-data.ts` | ✅ Done |
| (no PHP equivalent) | `lib/queries/customers.ts` — customer CRUD queries | ✅ Done |
| (no PHP equivalent) | `lib/queries/orders.ts` — order CRUD queries | ✅ Done |
| (no PHP equivalent) | `lib/admin-order-filters.ts` — shared, validated admin filter/date predicates | ✅ Local PHP-column parity |
| (no PHP equivalent) | `lib/admin-report-filters.ts` — strict report date range and inclusive SQL bounds | ✅ Local tests |
| (no PHP equivalent) | `lib/queries/products.ts` — product CRUD queries | ✅ Done |
| (no PHP equivalent) | `lib/queries/settings.ts` — settings queries | ✅ Done |
| (no PHP equivalent) | `lib/cookies.ts` — cookie helpers (thin wrappers over next/headers) | ✅ Done |
| (no PHP equivalent) | `lib/rate-limit.ts` — in-memory sliding-window rate limiter | ✅ Done |
| (no PHP equivalent) | `lib/security.ts` — HTML sanitization, CSRF, security helpers | ✅ Done |
| (n/a — design system v2) | `components/layout/container.tsx` (Container width tokens) | ✅ Done |
| (n/a — design system v2) | `components/layout/section.tsx` (Section + SectionHeader primitives) | ✅ Done |
| (n/a — shared UI) | `components/layout/plan-recommender-float.tsx` (lazy modal launcher above the chat widget) | ✅ Done |
| (n/a — slow-network shell) | `app/layout.tsx` + shared floating controls; PHP `components/critical-shell.php` and early component bootstrap | ✅ Local hardening; production proof pending |
| (n/a — design system v2) | `components/ui/auth-shell.tsx` (AuthShell wrapper for login/register/forgot/reset/verify-email) | ✅ Done |
| (n/a — migration safety) | `lib/account-verification.ts` + `lib/safe-redirect.ts` | ✅ Local fix |
| (n/a — calculator business rules) | `lib/earning-calculator.ts` | ✅ Local fix |
| `hs/vouchers.php` (logic) | `lib/vouchers.ts` — voucher campaigns + customer voucher logic | ✅ Done |
| (no PHP equivalent) | `lib/site.ts` — validated, build-scoped origin/mode authority; fail-closed Staging default | ✅ local; release gate applies |
| `api/config.php` `logAdminAction()` | `lib/audit.ts` — admin action audit trail (shared `admin_audit_log` table) | ✅ Done |
| (no PHP equivalent) | `lib/payment-status.ts` — race-safe order paid transitions (pending→paid and failed→paid; no stock mutation in the current implementation); shared by callback / check-payment / return | ✅ Done |

---

## 6. Integrations

| Integration | PHP Files | Node.js Files | Status |
|---|---|---|---|
| **WhatsApp Cloud API** | `api/whatsapp.php`, `api/whatsapp-admin.php`, `api/lib/wa-client.php` | `lib/whatsapp/client.ts`, `lib/whatsapp/ai.ts`, `app/api/whatsapp/`, `app/api/admin/whatsapp/` | ✅ Done |
| **Telegram Bot** | `api/telegram.php`, `api/telegram-admin.php`, `api/lib/telegram-client.php` | `lib/telegram/client.ts`, `app/api/telegram/`, `app/api/admin/telegram/` | ✅ Done |
| **Gemini AI** | `api/lib/gemini-client.php` | `lib/ai/gemini.ts` | ✅ Done |
| **ToyyibPay** | `api/payment.php`, `api/payment_return.php` | `lib/toyyibpay.ts`, `app/api/orders/create/`, `app/api/payment/` | ✅ Done |
| **Cloudflare** | `api/cloudflare.php` | `lib/cloudflare.ts`, `app/api/admin/cloudflare/` | ✅ Done |
| **Google Analytics 4** | `api/ga4.php`, `hs/ga4-oauth-setup.php` | `lib/google/oauth2.ts`, `lib/google/ga4.ts`, `app/api/admin/ga4/` | ✅ Done |
| **Google Search Console** | `api/gsc.php`, `hs/gsc-oauth-setup.php` | `lib/google/gsc.ts`, `app/api/admin/gsc/` | ✅ Done |
| **Cloudflare Turnstile** | inline in `api/auth.php`, `api/payment.php` | `lib/turnstile.ts` | ✅ Done |
| **Email (SMTP)** | `api/email-helper.php` | `lib/email.ts` (nodemailer) | ✅ Done |

---

## 7. Database Tables (23+ tables)

All tables managed by `lib/migrate.ts` → `ensureAllTables()`.
Full schema reference: see PHP project's `DATABASE.md`.

**Core:** customers, orders, products, couriers, postcode_zones, reviews, review_photos, postcode_inquiries, marketing_templates, voucher_campaigns, customer_vouchers, shopee_orders
**Auth:** admin_users, login_attempts, turnstile_logs, settings, sessions, email_verifications
**WhatsApp (18):** whatsapp_config, whatsapp_processed, wa_conversations, wa_customers, wa_sessions, ai_daily_usage, wa_pending_queue, wa_reply_queue, wa_rate_limits, wa_admin_notices, wa_conversation_tags, wa_conversation_notes, wa_templates, wa_escalation_rules, wa_audit_log, wa_admin_prefs, wa_scheduled_messages, wa_test_logs, wa_message_reactions
**Telegram (3):** telegram_settings, telegram_conversations, telegram_messages

---

## 8. Dependencies

From `package.json`:

| Package | Purpose |
|---|---|
| `next@16.2.6` | React framework |
| `react@19.2.4` | UI library |
| `mysql2@^3.22.3` | MariaDB driver |
| `jose@^6.2.3` | JWT session tokens |
| `zod@^4.4.3` | Input validation schemas |
| `nodemailer@^8.0.7` | SMTP email sending |
| `tailwindcss@^4.2.4` | CSS framework |
| `typescript@^5` | Type checking |


## Configuration/release validation — 2026-10-07

lib/runtime-config.ts is the shared, value-redacted configuration validator used by
app/api/health/route.ts and scripts/check-runtime-config.mjs. scripts/check-release.mjs
checks login/authorization/readiness/exact SHA without credentials or business actions.
These additions do not change schemas or certify integrations; see DEPLOYMENT_SAFETY.md.

## Admin operation parity review — 2026-10-08

The scoped PHP self-service comparison and remaining limits are documented in [MIGRATION_STATUS.md](MIGRATION_STATUS.md). It records the new `/hs/zones.php` redirect, direct Reports menu route, selected-filter Orders summary difference from PHP's global cards, report definitions/date default, review attachment cleanup limits, and explicit Marketing Design/Shopee boundaries. This pass adds no database schema changes and does not claim deployment or live proof.


## Cobalt admin redesign — 2026-10-09

Local implementation after owner selection of A / Cobalt Grid covers every Next.js /hs route through the shared AdminShell and scoped responsive design system. Desktop rail, phone menu/bottom navigation, native forms, compact phone records, login and light/dark styling are implemented. Backend authorization and database schema are preserved; dashboard summary queries now expose all-time paid revenue and actionable queues. Public/PHP design is outside scope.

PASS: local TypeScript, webpack build, ESLint (0 errors/50 existing warnings), migration/core contract suites and fixture-based desktop/phone visual checks. All 26 desktop surfaces were refreshed at 1440×1000, with dashboard boundary checks at 1280×900 and 1600×1000 and a populated-settings overflow correction verified at desktop and phone. See MIGRATION_STATUS.md for evidence and limits. The owner submitted the actual component-plan approval receipt, closing plates. Hero pixel comparison scored 74.2% with hard regional blockers and remains FAILED/open, not an automated fidelity PASS. On 2026-10-09 the owner explicitly chose actual-preview acceptance and the comp as visual reference only. The tool refused to recognize that statement in its force option; no phase state was manually changed. Independent final visual/structural review is recorded separately.

NOT RUN: real DB/authenticated business writes, third-party integration and export parity, physical phones, deployment and live verification. No commit, push or deployment is claimed.

Final independent actual-preview design review: **ship — local admin UI design delivery only**, material_fixes: []. The whole-design contrast finding was corrected through scoped semantic text pairs and independently rechecked in all 12 Customers/Shopee/Cloudflare desktop/phone/light/dark screenshots. Final webpack/TypeScript and diff checks pass. Automated build-phase ship was refused over its open gates and its tool finish remains fix; this is separate from the owner-authorized actual-preview acceptance.


Focused owner-reported scroll/sidebar follow-up: admin-only root overflow clipping keeps the blue rail sticky; desktop collapse to 76px retains 24 labeled routes and persists; dashboard work groups stay together. Local browser scrolling, keyboard/search/reload, short desktop and phone menu checks plus webpack/TypeScript and focused ESLint pass. Exact scroll-end DOM and the default raw capture are in .impeccable/review/sidebar-default-end.json and sidebar-default-end.jpg; overridden crops are composition evidence only. Independent focused review: ship, material_fixes empty, limited to these local user-feedback corrections; physical phones, real DB/services and deployment remain NOT RUN.

Brand/control polish requested by owner: compact Eastel/Admin typography, a 44px outlined directional collapse control, compact e tile and matching phone header/drawer close treatment. Runtime scope is shell.tsx and admin.css only, with handlers/routes/persistence preserved. PASS: local expanded/collapsed/light/dark/intermediate/short-phone browser checks, focused ESLint, TypeScript no emit and diff check; evidence .impeccable/review/brand-refinement-checks.json and brand-*.jpg. Full build was not repeated for this presentation refinement. Independent scoped review: ship, material_fixes empty; deployment and physical phones remain NOT RUN.


## SEO environment and AI search preparation — 2026-10-15

The merchant sells physical Eastel SIM cards; the official brand/operator is a separate entity. Public plan/roaming references are not blanket merchant offers. Preserve owner-confirmed optional plan purchasing assistance in checkout, with separate fees/manual fulfillment and no operator or automatic-renewal claim. No production deployment, domain switch, real payment or database schema change is part of this slice.

| Surface | Responsibility | Boundary |
|---|---|---|
| `lib/site.ts`, Next build config and proxy | Validated frozen Staging/Production origin and hostname rejection; noindex, cache and GA4 gating | Independent builds/processes for the two environments; never construct canonical from arbitrary Host |
| `components/seo-head.tsx`, root/locale layouts | Existing Metadata API authority, languages, canonical, hreflang and social metadata | Preserve static rendering where appropriate; no parallel ad-hoc SEO head system |
| `app/robots.ts`, `app/sitemap.ts` | Environment-scoped crawler policy and true public-route inventory | Static robots shadow removed; no private URLs or fictional modification dates |
| `lib/structured-data.ts`, `components/json-ld.tsx` | Content-only WebSite/page/breadcrumb/FAQ graph and safe JSON-LD serialization; no business-identity node | Owner removed Organization/LocalBusiness/seller entities; no invented ratings or unconfirmed policy facts |
| `lib/public-product.ts` and existing order entry | Reuse existing getStorefrontCheckout for SSR base-SIM price/availability; retain optional-plan checkout | Database unavailable means unknown, not an invented RM10 offer; no schema change |
| `lib/legacy-redirects.ts` | Explicit locale-preserving public PHP URL mapping | Payment internal rewrites stay separate; private token compatibility remains a release gate |
| `scripts/verify-legacy-redirects.mjs`, `scripts/fixtures/legacy-public-urls.json` | Deterministic mapping/loop/language regression evidence | Fixture is public URL data, not production customer/payment data |
| `docs/SEO_URL_MIGRATION.md` | PHP source revision, old sitemap inventory and URL table | Real search/log inventory and old token/bill behavior require target evidence |
| `docs/SEO_OPERATIONS.md`, `CUTOVER.md` | GSC/Bing/GA4, AI visibility, IndexNow, merchant feeds and future rollback | Account approvals, production response verification and commercial facts are pending |

SEO/content regression commands and built-response test outcomes are recorded in the task's final verification evidence. Read-only public fetches, local mocks and a successful build do not prove Cloudflare policy, real MariaDB grants/concurrency, external providers or actual search/AI visibility. No shopping feed, IndexNow submission, new paid SEO service or new chatbot is introduced.

SEO verification/source files added: `lib/seo-policy.ts`, `scripts/check-seo-config.mjs`, `scripts/verify-seo.mjs`, `scripts/verify-search-content.mjs`, `scripts/verify-seo-html.mjs`, `scripts/verify-seo-build.mjs`, `scripts/verify-nginx-seo.mjs`, `infra/nginx/production.conf.example`, and `infra/cloudflare/staging-cache-rule.review.json`. Actual read-only Cloudflare findings are in `MIGRATION_STATUS.md`; final outcomes and remaining gates are in `MIGRATION_STATUS.md`.

Public content follow-up (2026-10-15): owner removed business-identity copy from all three languages and external Eastel website referrals. No new route/API/table. Ten SSR FAQs remain; EASTELpreneurs buttons use an in-page anchor and localized order/contact. Regression checks cover dictionaries, schema and actual HTML/hydration output; preserve paid-plan fulfillment and payment behavior. Source/verification links in internal project documents do not render as public website links.

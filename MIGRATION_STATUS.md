# Security changes and verification limits

The Next.js application serves https://eastel.site. The earlier implementation is
retained only through source-level compatibility fixtures and required behavior.
Internal release identifiers and deployment inventories are not part of this document.

## Production security repair — 2026-10-22

- Guest checkout locks, rechecks and consumes its mailbox proof in the account/
  order transaction. An unverified pre-registration gets new credentials, cleared
  reset proofs and revoked customer sessions. Verified accounts keep credentials.
  Unverified sessions cannot create or read orders. Existing password-bound
  session creation serializes against the same customer lock.
- All three payment failure writers retain voucher reservations while their
  discounted bill remains payable. Failed-to-paid retries and once-only payment
  notifications remain supported. Legacy Telegram return output escapes fields.
- PR review follow-up: failed orders expose the original guarded Pay Now action
  in all locales, so retaining a voucher does not strand its owner. Guest proof
  locking/consumption and account validation now precede external bill creation;
  the transaction spans a bounded10s gateway request and rolls back on failure.
  Expired/replayed proof rejection creates no bill; gateway errors preserve the
  proof for retry. Distributed gateway/DB commit failures remain an operational
  reconciliation concern, as with existing bill creation; no false atomicity claim.
- Guest OTP requires a configured-host/order-action CAPTCHA, bounded inputs and
  concurrency, and durable global/caller/recipient mail admission in existing
  login_attempts. Recipient rotation cannot fill the shared auth limiter. Failed
  mail consumes admission too. The form refreshes single-use CAPTCHA tokens and
  uses verify-email to verify a logged-in account's authoritative server state.
- Local PASS: core/security/AI/migration, PHP/Node password/email compatibility,
  production build, typecheck, lint (0 errors,50 existing warnings), built SEO47/47
  and legacy GET/HEAD46/46. A baseline run accepts an unverified session in the
  same regression harness; patched checkout rejects before bill creation. Fresh
  independent post-patch source review found no concrete bypass/regression.
- Production npm audit:0 advisories. Full audit:5 high issues in development
  ESLint->fast-glob->micromatch->braces; registry braces latest3.0.3 has no fix.
  Do not force the suggested unrelated Next ESLint downgrade. Next16.4.2 is above
  the official October14 patched16.4.1 baseline.
- This repair's publication/deployment is pending at this entry. No real payment,
  mail/bot delivery, customer mutation or MariaDB race test was performed. Review
  was partial source coverage, not exhaustive assurance. Historical preclaimed
  accounts/voucher conflicts need separate read-only reconciliation; no bulk
  customer changes are included. Private-media retention still targets a legacy
  directory and needs a reference-aware policy. Cron remains deferred until last.


## Subsequent review record — 2026-10-22

The subsequent security review recorded deployment, release and SEO checks and
isolated MariaDB concurrency/rollback/admission tests with synthetic data. These are
historical review records. This public cleanup did not repeat them or verify the
website's current deployment. Earlier deployment-pending statements describe the
earlier point in time and are superseded by that later record.

Real payments, mail/provider delivery, historical data reconciliation, detached-bill
reconciliation and Cron acceptance remain operational work unless separately verified.
Do not mark them complete based on source publication or passing local fixtures.

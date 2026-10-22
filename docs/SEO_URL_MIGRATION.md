# Legacy public URLs

The application at https://eastel.site preserves earlier public paths where required.
Current rules are in `lib/legacy-redirects.ts` and `next.config.ts`; route fixtures
live in `scripts/fixtures/`.

Keep method/query semantics, locale paths and callback behavior. Do not redirect
private account/payment state through an untrusted origin or infer that a redirect
proves payment, provider callback or data migration success.

Validate relevant fixtures offline. Live migration/provider acceptance remains a
separate operation. No private source location or deployment inventory belongs here.

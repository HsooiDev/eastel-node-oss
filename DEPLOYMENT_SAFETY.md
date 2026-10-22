# Configuration and release safety

Production uses `https://eastel.site`. Set `SITE_ENV=production` and both
`NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_BASE_URL` to that origin for an approved
production build. Origin and indexing mode are frozen at build time; changing
environment values after compilation requires a rebuild.

Local development uses `SITE_ENV=development` with a loopback origin. The default
non-production origin in this public source is a reserved test domain, not an Eastel
hostname. Non-production remains noindex and cannot serve production as an alias.
Preserve strict hostname checks and production/private-page cache controls.

Use `.env.example` as a variable reference. Configure your own database, authentication,
payment, CAPTCHA, email and messaging credentials securely outside Git. Secret fields
in the template remain empty. Never copy masked settings back to a live environment.

Use an isolated database for development. Startup/session code can invoke the schema
migrator; an unreviewed local process must not point to production. Persistent uploads,
review images, marketing media and messaging attachments belong outside app releases
and public web roots, with approved permissions and backups.

Before an authorized hosted release, check configuration, exact source identity,
build result and public-origin behavior. The public source contains no live environment
inventory. Do not replace a newer deployed revision with an older snapshot.

Deployment, DNS/configuration changes, provider credential changes, real payments,
messages, data writes and scheduled jobs require their own explicit authorization.
This document does not grant it.

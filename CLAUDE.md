# Contributor rules

This repository contains the Next.js source snapshot for https://eastel.site.
Read `PROJECT_STATUS.md`, `MEMORY.md`, `PROJECT_AUDIT.md`, `MIGRATION_STATUS.md`,
`PRODUCT.md` and `DESIGN.md` before changing related code.

- Record current branch, HEAD, refs and dirty state. Fetch current refs and work
  on an isolated task branch; preserve existing work. Do not commit directly to main.
- Preserve customer/admin authorization, mailbox proof ownership and consumption,
  OTP quotas, payment idempotency and original-bill voucher reservations.
- Keep the existing MariaDB schema and parameterized query patterns. Schema changes
  need explicit approval. Do not add an ORM or redesign business logic.
- Keep EN/MS/ZH routing, response contracts, SEO controls and mobile accessibility.
- Use `lib/db.ts` and existing shared helpers. Keep production/indexing decisions
  tied to explicit trusted build configuration, never request headers.
- Never commit credentials, private identities, customer data, local tool settings,
  hosting account details, logs, backups or runtime uploads. Leave sensitive example
  variables empty; use reserved domains and synthetic identities in fixtures.
- Keep documentation focused on eastel.site and the source in this repository.
  Internal environment inventories and private operational reports belong outside Git.
- Run only focused, offline validation needed for the change. Do not test old
  credentials or contact payment, email, messaging or production database services.
- Report checks and limits honestly. Historical verification is not fresh deployment
  evidence. Publishing code does not authorize deploying it.
- Main merges, deployment, credential changes and remote history rewrites require
  the owner's explicit authorization for the concrete operation.

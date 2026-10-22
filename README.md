# Eastel

Next.js application for the SIM sales website at [eastel.site](https://eastel.site).
It provides English, Malay and Chinese pages, SIM ordering, customer accounts,
order tracking, administration, and payment and messaging integrations.

This repository contains an audited source snapshot. It is not a live deployment
and should not be assumed to match every later change on the website.

## Local development

Use Node.js 24 and an isolated local database. Copy `.env.example` to `.env.local`
and supply your own configuration locally. The template contains no service credentials.
Do not use a production database or live payment/messaging configuration for development.

```bash
npm ci --include=dev
```

For local development, set `SITE_ENV=development`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
and `NEXT_PUBLIC_BASE_URL=http://localhost:3000` in `.env.local`, then run:

```bash
npm run dev
```

See [configuration and release safety](DEPLOYMENT_SAFETY.md) before building or
running a hosted release. Non-production examples use a reserved test domain;
they do not describe an Eastel environment.

## Project documentation

- [Project status](PROJECT_STATUS.md)
- [Source and feature map](PROJECT_GUIDE.md)
- [Security and maintenance notes](MEMORY.md)
- [Security changes and verification limits](MIGRATION_STATUS.md)
- [AI commerce interfaces](docs/AI_COMMERCE.md)
- [Contributor rules](CLAUDE.md)

Validation commands are defined in `package.json`. Run only checks relevant to a
change; production requests, payments, messages and database writes require separate
authorization. A local test result does not establish live integration acceptance.

## Licence

Original code and documentation use **AGPL-3.0-only**. Commercial use is permitted
under its terms. See [LICENSE](LICENSE), [NOTICE](NOTICE) and
[third-party notices](THIRD_PARTY_NOTICES.md) for the complete terms and asset scope.
The licence does not grant trademark rights or imply official operator endorsement.

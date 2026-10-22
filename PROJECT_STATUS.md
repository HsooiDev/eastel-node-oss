# Project status

The Next.js application serves [eastel.site](https://eastel.site). The source supports
English, Malay and Chinese pages, SIM sales, customer accounts and order tracking,
staff administration, payments, messaging and AI-assisted checkout preparation.

This public repository contains an audited source snapshot. It is not an exact
statement of the website's current deployed revision. Internal deployment records,
environment inventories, private source locations and operational audit reports are
kept outside this repository.

The previous PHP implementation is retired from the main site. Compatibility
fixtures and legacy URL handling remain where the current application requires them.

Authentication, mailbox proof/OTP admission, payment reservations and protected
original-bill retry behavior are described in [security notes](MIGRATION_STATUS.md).
Real payment/provider delivery acceptance, historical reconciliation and scheduled
job acceptance are separate operational checks. This public documentation update
does not mark them complete or claim a new deployment.

See [README](README.md), [source map](PROJECT_GUIDE.md),
[release safety](DEPLOYMENT_SAFETY.md), and [licence scope](THIRD_PARTY_NOTICES.md).

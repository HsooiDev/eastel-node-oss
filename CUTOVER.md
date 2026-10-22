# Compatibility and release boundaries

The Next.js application serves https://eastel.site. This is not a pending instruction
to repeat the earlier platform migration. Operational cutover and rollback records
are maintained outside the public repository.

Preserve customer password compatibility, provider callbacks and bill URLs, order/
payment reconciliation, database contracts and persistent media references. Source
fixtures do not prove live data consistency or provider acceptance.

See [configuration and release safety](DEPLOYMENT_SAFETY.md),
[security and verification limits](MIGRATION_STATUS.md), and [scheduled jobs](CRONJOBS.md).
Do not enable jobs, change a database, deploy or roll back from this document without
a separately reviewed operation and explicit authorization.

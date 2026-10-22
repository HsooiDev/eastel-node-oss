# Publication hygiene

Keep the public source focused on https://eastel.site and this application. Exclude
internal environment inventories, unrelated hostnames, private source locations,
customer records, local settings, logs, backups and runtime media.

Review intended public refs and reachable history, commit identities, PR text,
Actions output/artifacts, releases, LFS and binary metadata. Use trusted static
scanners with complete redaction and no online credential validation. Record finding
types, paths and status without values or secret fingerprints. A clean scan is not
proof that every private fact has been identified.

Keep sensitive configuration examples empty; use synthetic data and reserved domains
in fixtures. Public CAPTCHA sitekeys and analytics identifiers are different from
server secrets; forks should configure their own services.

Preserve [LICENSE](../LICENSE), [NOTICE](../NOTICE) and
[third-party notices](../THIRD_PARTY_NOTICES.md). Identity changes, public-history
rewrites, visibility changes, credential operations and deployment need the owner's
explicit authorization for the concrete action.

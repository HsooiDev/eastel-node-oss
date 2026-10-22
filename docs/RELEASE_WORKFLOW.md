# Source review and release workflow

Use isolated task branches from current refs and preserve existing work. Keep changes
reviewable and run only relevant validation. Record the tested revision; distinguish
offline checks from live acceptance.

The workflow under `.github/workflows/` validates source and does not authorize
deployment. Before an approved release, inspect the actual hosting integration,
watched source, triggers, runtime configuration and exact build identity. Do not infer
current hosting behavior from this source snapshot.

Main merges, history updates, deployment and provider/production changes require
explicit authorization. Do not run real payments, messages or data writes for an
ordinary source review. See [release safety](../DEPLOYMENT_SAFETY.md).

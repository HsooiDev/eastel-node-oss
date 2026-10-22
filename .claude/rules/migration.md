# Migration Rules

## Before Any Migration Work

1. **Read the original PHP file(s) first** — never assume functionality.
2. Check `MIGRATION_STATUS.md` for current state.
3. Check `PROJECT_AUDIT.md` for related dependencies.
4. State the migration plan with success criteria before writing code.

## During Migration

- Preserve exact business logic — no "improvements" unless explicitly requested.
- Match API response shape: `{ status: "success|error", message: "...", ...data }`.
- Same database — never alter table schemas without approval.
- Use existing lib modules (check `PROJECT_AUDIT.md` §5) before creating new ones.
- No speculative rewrites or unnecessary abstractions.

## After Migration

- Verify build passes: `npm run build`.
- Update `MIGRATION_STATUS.md` with new status.
- Update `PROJECT_AUDIT.md` if new routes/files created.
- Update `MEMORY.md` if new gotcha discovered.

## Forbidden

- Skipping directly to implementation without discovery.
- Assuming PHP behavior from function names alone.
- Changing DB schema without coordination (existing database consumers rely on the current contracts).
- Adding features that don't exist in the PHP version (unless requested).

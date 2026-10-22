# Database Rules

## Legacy-compatible Database

The Node.js project is now the production application and preserves the migrated
MariaDB schema and business contracts. PHP is a retired reference implementation;
any residual legacy database writers must be checked separately. See `PROJECT_STATUS.md`.

**Never alter table schemas without explicit approval.**

## Connection

- Use the shared pool from `lib/db.ts` — never create new connections directly.
- Pool is configured via `.env.local`: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- Use separate staging and production databases; resolve their names from private environment configuration.

## Schema Migrations

- All table creation/updates go through `lib/migrate.ts` → `ensureAllTables()`.
- Migrations must be idempotent — safe to re-run at any time.
- Use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` with existence checks.

## mysql2 Gotchas

### LIMIT/OFFSET — Never bind as parameters

```ts
// WRONG — MariaDB rejects quoted integers
await pool.execute('SELECT * FROM t LIMIT ?', [100]);

// CORRECT — cast and interpolate
const limit = Number(n);
await pool.execute(`SELECT * FROM t LIMIT ${limit}`);
```

### JSON Columns

Use `longtext` with `CHECK (json_valid(...))` instead of native `json` type — older MariaDB doesn't support it.

### Phone Numbers

WhatsApp phone numbers stored without `+` prefix: `60123456789` not `+60123456789`.

## Query Patterns

- Always use parameterized queries for user input (SQL injection prevention).
- Only interpolate LIMIT/OFFSET (cast to Number first).
- Use `pool.execute()` for parameterized queries, `pool.query()` for non-parameterized.
- Return `{ status, message, ...data }` shape from all API routes.

## Key Tables Reference

See `MEMORY.md` for the full table list. The most commonly used:
- `customers`, `orders`, `products`, `couriers`, `postcode_zones`
- `reviews`, `review_photos`
- `admin_users`, `login_attempts`, `settings`
- `wa_conversations`, `whatsapp_config`, `wa_pending_queue`

// One-time seed: creates test admin user.
// Supply an isolated test environment explicitly; never implicitly load .env.
// Run with: npx tsx --env-file=/private/local-test.env scripts/seed-test-admin.ts

import db from "../lib/db";
import { hashPassword, validatePassword } from "../lib/auth";

const EMAIL = process.env.SEED_TEST_ADMIN_EMAIL ?? "";
const PASSWORD = process.env.SEED_TEST_ADMIN_PASSWORD ?? "";
const NAME = "Test Admin";

async function main() {
  if (process.env.NODE_ENV !== "development" ||
      !["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST ?? "") ||
      !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME ?? "") ||
      process.env.SEED_TEST_ADMIN_CONFIRM !== "isolated-local-test") {
    throw new Error("Test admin seeding requires an explicitly confirmed isolated loopback development database ending in _test.");
  }
  if (!EMAIL || !validatePassword(PASSWORD).valid) {
    throw new Error("Supply SEED_TEST_ADMIN_EMAIL and a unique strong SEED_TEST_ADMIN_PASSWORD.");
  }
  const [rows] = await db.query(
    "SELECT id FROM admin_users WHERE email = ? LIMIT 1",
    [EMAIL]
  ) as unknown as [{ id: number }[], unknown];

  if (rows.length > 0) {
    console.log(`Admin user "${EMAIL}" already exists (id=${rows[0].id}). Skipping.`);
    process.exit(0);
  }

  const hash = await hashPassword(PASSWORD);
  await db.execute(
    "INSERT INTO admin_users (name, email, password_hash, created_at) VALUES (?, ?, ?, NOW())",
    [NAME, EMAIL, hash]
  );
  console.log(`Test admin "${EMAIL}" created successfully.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});

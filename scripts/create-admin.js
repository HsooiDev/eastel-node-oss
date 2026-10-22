#!/usr/bin/env node
/**
 * ONE-TIME ADMIN ACCOUNT CREATOR
 * ================================
 * Creates or updates an admin account in the admin_users table.
 *
 * Usage:
 *   node --env-file=.env.local scripts/create-admin.js <name> <email> <password>
 *
 * Example:
 *   node --env-file=.env.local scripts/create-admin.js "Example Admin" "admin@example.com" "<strong-unique-password>"
 *
 * ⚠️  Run this once on the server then keep credentials safe.
 * ================================
 */

'use strict'

const { hashPassword } = require('../lib/auth.ts')
const mysql = require('mysql2/promise')

async function main() {
  const [, , name, email, password] = process.argv

  if (!name || !email || !password) {
    console.error('Usage: node --env-file=.env.local scripts/create-admin.js <name> <email> <password>')
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters.')
    process.exit(1)
  }

  const { DB_HOST, DB_USER, DB_PASS, DB_PASSWORD, DB_NAME } = process.env
  if (!DB_HOST || !DB_NAME) {
    console.error('Error: DB_HOST and DB_NAME env vars required. Pass --env-file=.env.local')
    process.exit(1)
  }

  // Finish hashing before opening the database or running the existing DDL.
  const hash = await hashPassword(password)
  const pool = await mysql.createPool({
    host:     DB_HOST,
    user:     DB_USER,
    password: DB_PASS || DB_PASSWORD || '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 2,
  })

  try {
    // ── Ensure admin_users table exists (safe on existing DB) ──
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS \`admin_users\` (
        \`id\`            INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`name\`          VARCHAR(100) NOT NULL,
        \`email\`         VARCHAR(255) NOT NULL,
        \`password_hash\` VARCHAR(255) NOT NULL,
        \`is_active\`     TINYINT(1) DEFAULT 1,
        \`last_login\`    TIMESTAMP NULL DEFAULT NULL,
        \`created_at\`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Table admin_users ready.')

    const [result] = await pool.execute(
      `INSERT INTO \`admin_users\` (\`name\`, \`email\`, \`password_hash\`, \`is_active\`, \`created_at\`)
       VALUES (?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE
         \`name\`          = VALUES(\`name\`),
         \`password_hash\` = VALUES(\`password_hash\`),
         \`is_active\`     = 1`,
      [name.trim(), email.toLowerCase().trim(), hash]
    )

    const action = result.insertId > 0 ? 'CREATED' : 'UPDATED'
    console.log(`✅ [${action}] Admin account: ${email.toLowerCase().trim()}`)

    // Show all existing admins
    const [admins] = await pool.query(
      'SELECT id, name, email, is_active, last_login, created_at FROM admin_users ORDER BY id'
    )
    console.log('\nExisting admin accounts:')
    console.table(admins)

  } finally {
    await pool.end()
  }
}

main().catch(e => {
  console.error('Failed:', e.message)
  process.exit(1)
})

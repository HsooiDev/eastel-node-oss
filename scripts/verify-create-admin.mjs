// Execute the real administrative CLI with an offline database boundary.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { hashPassword, verifyPassword } from '../lib/auth.ts'

const source = fs.readFileSync(new URL('./create-admin.js', import.meta.url), 'utf8')
const password = `${'a'.repeat(72)}管理员9!`
const php = process.env.EASTEL_PHP_BIN || 'php'

async function run({ existing = false, failHash = false } = {}) {
  const writes = [], events = []
  let exitCode = null
  const pool = {
    execute: async (sql, values) => {
      events.push('write')
      writes.push({ sql, values })
      return [{ insertId: existing ? 0 : 7 }]
    },
    query: async () => [[]],
    end: async () => { events.push('closed') },
  }
  await vm.runInNewContext(source, {
    require: name => {
      if (name === '../lib/auth.ts') return { hashPassword: async value => {
        events.push('hash')
        if (failHash) throw new Error('Synthetic hash failure')
        return hashPassword(value)
      } }
      assert.equal(name, 'mysql2/promise')
      return { createPool: async () => { events.push('pool'); return pool } }
    },
    process: {
      argv: ['node', 'create-admin.js', 'Synthetic Admin', 'ADMIN@example.invalid', password],
      env: { DB_HOST: 'offline.invalid', DB_NAME: 'synthetic' },
      exit: code => { exitCode = code },
    },
    console: { log() {}, error() {}, table() {} },
  })
  return { writes, events, exitCode }
}

for (const existing of [false, true]) {
  const result = await run({ existing })
  assert.equal(result.exitCode, null)
  assert.deepEqual(result.events, ['hash', 'pool', 'write', 'write', 'closed'])
  const upsert = result.writes[1]
  assert.match(upsert.sql, /ON DUPLICATE KEY UPDATE/)
  const [name, email, hash] = upsert.values
  assert.equal(name, 'Synthetic Admin')
  assert.equal(email, 'admin@example.invalid')
  assert.match(hash, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/)
  assert.equal(await verifyPassword(password, hash), true)
  assert.equal(await verifyPassword(`${'a'.repeat(72)}different`, hash), false)
  const verified = spawnSync(php, ['-n', 'scripts/fixtures/password-interop.php'], {
    input: JSON.stringify({ operation: 'verify', password, hash }), encoding: 'utf8', timeout: 15000,
  })
  assert.equal(verified.status, 0, 'PHP CLI required; set EASTEL_PHP_BIN')
  assert.equal(JSON.parse(verified.stdout).valid, true)
}
const failure = await run({ failHash: true })
assert.equal(failure.exitCode, 1)
assert.equal(failure.writes.length, 0)
assert.deepEqual(failure.events, ['hash'])
console.log('PASS: admin CLI creates/updates PHP-readable Argon2id, preserves long UTF-8 passwords and never opens DB on hash failure; synthetic only')

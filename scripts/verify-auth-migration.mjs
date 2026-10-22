import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { DatabaseSync } from 'node:sqlite'

const require = createRequire(import.meta.url)
const tables = new Set(process.argv.includes('--empty') ? [] : ['admin_users', 'customers', 'orders', 'couriers', 'products', 'wa_customers', 'wa_sessions', 'telegram_settings', 'telegram_conversations', 'telegram_messages'])
const existingWhatsApp = process.argv.includes('--existing-wa')
const schemaDb = new DatabaseSync(':memory:')
const schemaStatements = []
if (existingWhatsApp) {
  tables.add('whatsapp_logs')
  schemaDb.exec("CREATE TABLE whatsapp_logs (id INTEGER PRIMARY KEY, phone TEXT); INSERT INTO whatsapp_logs VALUES (7, 'synthetic')")
}
const writes = []
let failQueries = false
let legacyMetadataReads = 0
const legacyPriceMetadataSql = "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'unit_price' AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL"
const db = {
  async execute(sql, params) {
    schemaStatements.push(sql)
    const create = sql.match(/CREATE TABLE IF NOT EXISTS `([^`]+)`/)
    if (create) {
      if (create[1] === 'whatsapp_logs' && !tables.has(create[1])) {
        // Real columns from the runtime CREATE; SQLite supplies offline relational execution.
        assert.match(sql, /`media_path` VARCHAR\(500\) DEFAULT NULL/)
        const columns = [...sql.matchAll(/^\s*`([^`]+)`\s+(\w+)/gm)].map(([, name]) =>
          name === 'id' ? 'id INTEGER PRIMARY KEY' : `\`${name}\` TEXT`)
        schemaDb.exec(`CREATE TABLE whatsapp_logs (${columns.join(', ')})`)
      }
      tables.add(create[1])
    }
    const alter = sql.match(/ALTER TABLE `([^`]+)`/)
    if (alter && !tables.has(alter[1])) throw Object.assign(new Error(`Table ${alter[1]} does not exist`), { code: 'ER_NO_SUCH_TABLE', errno: 1146 })
    const insert = sql.match(/INSERT INTO `([^`]+)`/)
    if (insert) {
      assert.ok(tables.has(insert[1]))
      writes.push({ sql, params })
    }
    return [{ affectedRows: 1 }, []]
  },
  async query(sql) {
    if (failQueries) throw new Error('database unavailable')
    if (sql.trim().replace(/\s+/g, ' ') === legacyPriceMetadataSql) {
      legacyMetadataReads++
      // Captured PHP-shaped orders have no Node-only unit_price column.
      return [[], []]
    }
    assert.match(sql, /s\.`role` = '(customer|admin)'/)
    return [[], []]
  },
}
function load(relative, deps) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, require: (id) => deps[id] ?? require(id), Date, Buffer }, { filename: relative })
  return module.exports
}
const migrate = load('../lib/migrate.ts', { '@/lib/db': db })
const sessions = load('../lib/session.ts', {
  '@/lib/db': db,
  '@/lib/migrate': migrate,
  '@/lib/db-helpers': { formatDate: (date) => date.toISOString().slice(0, 19).replace('T', ' ') },
})
const customer = await sessions.createSession(7, '', '', 'customer')
const admin = await sessions.createSession(7, '', '', 'admin')
assert.match(customer, /^[a-f0-9]{64}$/)
assert.notEqual(customer, admin)
assert.equal(writes[0].params[2], 'customer')
assert.equal(writes[1].params[2], 'admin')
assert.equal(await sessions.validateSession(customer), null)
assert.equal(await sessions.validateAdminSession(admin), null)
failQueries = true
await assert.rejects(sessions.validateAdminSession(admin), /database unavailable/)
await migrate.ensureAllTables()
assert.equal(legacyMetadataReads, 1, 'legacy unit_price metadata is read only during the first initialization')
assert.ok(!schemaStatements.some(sql => /ALTER TABLE\s+`whatsapp_logs`[\s\S]*`media_path`/i.test(sql)), 'existing WhatsApp tables must not be automatically altered')
if (existingWhatsApp) {
  assert.equal(schemaDb.prepare('SELECT phone FROM whatsapp_logs WHERE id = 7').get().phone, 'synthetic')
  assert.ok(!schemaDb.prepare('PRAGMA table_info(whatsapp_logs)').all().some(column => column.name === 'media_path'))
  console.log('PASS: an existing legacy WhatsApp table and its data are preserved; missing media_path still requires a separately approved alignment.')
} else {
  const mediaPath = 'media/wa/2026-10/60000000000/synthetic.jpg'
  schemaDb.prepare('INSERT INTO whatsapp_logs (phone, direction, media_id, media_path, local_date) VALUES (?, ?, ?, ?, ?)')
    .run('60000000000', 'in', '12345', mediaPath, '2026-10-16')
  assert.equal(schemaDb.prepare('SELECT media_path FROM whatsapp_logs').get().media_path, mediaPath)
  console.log('PASS: fresh WhatsApp CREATE includes PHP VARCHAR(500) media_path and accepts an attachment log in offline SQL.')
}
schemaDb.close()
console.log('PASS: PHP-import migration creates missing messaging/session tables before ALTER; customer/admin sessions retain role separation and reject missing sessions/database failures.')

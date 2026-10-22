// Offline actual callback + actual admin chat reader against SQLite.
// All provider calls, authentication and payment transitions are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
function load(file, deps, Clock, errors) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require: id => {
      assert.ok(Object.hasOwn(deps, id), 'Unexpected dependency: ' + id); return deps[id];
    },
    Request, Response, URL, Date: Clock, Intl,
    console: { error: (...args) => errors.push(args), log() {} },
  }, { filename: file });
  return module.exports;
}
async function runScenario(name, { duplicate = false, sendFailure = false, failTables = [], at = '2026-10-18T16:00:00.000Z', sentAt, expectedDate = '2026-10-19', source = 'whatsapp' } = {}) {
  const state = { sends: [], attempts: [], errors: [], transitions: 0 };
  let clockTime = at;
  class Clock extends Date {
    constructor(value) { super(value === undefined ? clockTime : value); }
    static now() { return new Date(clockTime).getTime(); }
  }
  const sqlDb = new DatabaseSync(':memory:');
  sqlDb.exec(`
    CREATE TABLE whatsapp_logs (id INTEGER PRIMARY KEY,phone TEXT NOT NULL,contact_name TEXT,direction TEXT NOT NULL,message TEXT NOT NULL,msg_type TEXT,is_ai INTEGER,msg_id TEXT,local_date TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE wa_conversations (id INTEGER PRIMARY KEY,phone TEXT NOT NULL,contact_name TEXT,direction TEXT NOT NULL,message TEXT NOT NULL,msg_id TEXT,local_date TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE wa_conversation_tags (id INTEGER PRIMARY KEY,phone TEXT,tag_name TEXT,tag_color TEXT);
    CREATE TABLE wa_conversation_notes (id INTEGER PRIMARY KEY,phone TEXT,created_at TEXT);
  `);
  const db = {
    query: async (sql, params = []) => {
      if (/FROM orders\b/.test(sql)) return [[{ id: 7, order_ref: 'WA-SYNTHETIC', payment_status: 'pending', order_status: 'processing', source, phone: '60000000000', lang: 'en', full_name: 'Synthetic Customer' }], []];
      assert.match(sql, /FROM wa_conversation(?:s|_tags|_notes)\b/, 'Unexpected consumer query');
      return [sqlDb.prepare(sql).all(...params), []];
    },
    execute: async (sql, params) => {
      const table = sql.match(/INSERT\s+INTO\s+(whatsapp_logs|wa_conversations)\b/i)?.[1];
      assert.ok(table, 'Unexpected database write');
      state.attempts.push(table);
      if (failTables.includes(table)) throw new Error('synthetic ' + table + ' failure');
      const result = sqlDb.prepare(sql).run(...params);
      return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []];
    },
  };
  const helpers = load('lib/db-helpers.ts', {}, Clock, state.errors);
  const rejectExternal = () => { throw new Error('Unexpected external provider operation'); };
  const client = { sendText: async (...args) => {
    state.sends.push(args);
    if (sendFailure) throw new Error('synthetic send failure');
    if (sentAt) clockTime = sentAt;
    return 'synthetic-message-id';
  }, editMessage: rejectExternal, deleteMessage: rejectExternal, sendReaction: rejectExternal };
  const route = load('app/api/payment/callback/route.ts', {
    '@/lib/db': { __esModule: true, default: db },
    '@/lib/db-helpers': helpers,
    '@/lib/toyyibpay': { getBillTransactions: async () => [{ billpaymentStatus: 1, billpaymentInvoiceNo: 'synthetic-transaction' }] },
    '@/lib/payment-status': { transitionOrderToPaid: async () => { state.transitions++; return duplicate ? 'none' : 'pending'; } },
    '@/lib/email': { sendOrderConfirmedOnce: async () => true },
    '@/lib/telegram/notifications': { notifyTelegramOrderPaid: async () => {}, notifyTelegramOrderFailed: async () => {} },
    '@/lib/whatsapp/client': client,
  }, Clock, state.errors);
  try {
    const response = await route.POST(new Request('http://localhost/api/whatsapp-payment-callback.php', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'billcode=fixtureA1&status_id=1',
    }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(response.status, 200, name + ': callback ACK');
    assert.equal(await response.text(), duplicate ? 'OK - Already processed' : 'OK');
    assert.equal(state.transitions, 1);
    const delivered = !duplicate && !sendFailure && source === 'whatsapp';
    assert.equal(state.sends.length, duplicate || source !== 'whatsapp' ? 0 : 1, name + ': no duplicate send');
    assert.equal(state.attempts.length, delivered ? 2 : 0, name + ': each independent log attempted once');
    for (const table of ['whatsapp_logs', 'wa_conversations']) {
      const rows = sqlDb.prepare('SELECT * FROM ' + table).all();
      assert.equal(rows.length, delivered && !failTables.includes(table) ? 1 : 0, name + ': persisted ' + table);
      if (rows.length) {
        assert.equal(rows[0].phone, '60000000000');
        assert.equal(rows[0].contact_name, 'Synthetic Customer');
        assert.equal(rows[0].msg_id, 'synthetic-message-id');
        assert.equal(rows[0].message, state.sends[0][1]);
        assert.equal(rows[0].direction, 'out');
        assert.equal(rows[0].local_date, expectedDate, 'Explicit MYT date after send');
      }
    }
    // The real admin GET must read the saved confirmation, not a mocked log array.
    const admin = load('app/api/admin/whatsapp/route.ts', {
      '@/lib/db': { __esModule: true, default: db },
      '@/lib/db-helpers': helpers,
      '../_helpers': { requireAdmin: async () => ({ id: 1 }), success: data => Response.json({ status: 'success', ...data }), error: (message, status = 400) => Response.json({ status: 'error', message }, { status }) },
      '@/lib/csv': { csvText: rejectExternal },
      '@/lib/ai/gemini': { generateReply: rejectExternal, generate: rejectExternal },
      '@/lib/whatsapp/client': client,
      '@/lib/whatsapp/ai': { learnFromResponse: rejectExternal },
    }, Clock, state.errors);
    for (const suffix of ['', '&since=0']) {
      const result = await admin.GET(new Request('http://localhost/api/admin/whatsapp?action=chat&phone=60000000000' + suffix));
      const body = await result.json();
      assert.equal(result.status, 200);
      assert.equal(body.status, 'success');
      const visible = delivered && !failTables.includes('wa_conversations');
      assert.equal(body.messages.length, visible ? 1 : 0, 'Actual admin chat can read confirmation');
      if (visible) assert.equal(body.messages[0].message, state.sends[0][1]);
    }
    if (sendFailure || failTables.length) assert.ok(state.errors.length > 0, name + ': failure observable');
    console.log('PASS:', name, '(host TZ=' + process.env.TZ + ')');
  } finally { sqlDb.close(); }
}
const previousTZ = process.env.TZ;
try {
  process.env.TZ = 'UTC';
  await runScenario('successful confirmation is readable by actual admin chat');
  await runScenario('send failure never logs or retries', { sendFailure: true });
  await runScenario('duplicate payment transition sends and logs nothing', { duplicate: true });
  await runScenario('legacy log failure still saves Node conversation', { failTables: ['whatsapp_logs'] });
  await runScenario('Node log failure retains legacy log and callback ACK', { failTables: ['wa_conversations'] });
  await runScenario('both log failures never resend or fail callback ACK', { failTables: ['whatsapp_logs', 'wa_conversations'] });
  await runScenario('website order sends no WhatsApp confirmation', { source: 'website' });
  await runScenario('one millisecond before MYT midnight', { at: '2026-10-18T15:59:59.999Z', expectedDate: '2026-10-18' });
  await runScenario('MYT year boundary', { at: '2026-12-31T16:00:00.000Z', expectedDate: '2027-01-01' });
  await runScenario('send crossing midnight logs completion date', { at: '2026-10-18T15:59:59.999Z', sentAt: '2026-10-18T16:00:00.000Z' });
  process.env.TZ = 'America/Los_Angeles';
  await runScenario('non-MYT host cannot alter local date');
} finally {
  if (previousTZ === undefined) delete process.env.TZ;
  else process.env.TZ = previousTZ;
}
console.log('PASS: 11 offline actual-handler/consumer cases; SQLite, no network or real database/provider');

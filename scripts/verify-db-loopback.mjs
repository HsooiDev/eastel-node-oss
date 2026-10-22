import assert from 'node:assert/strict'
import test from 'node:test'
import mysql from 'mysql2/promise'
import { closePool, query } from '../lib/db.ts'

test('database pool uses IPv4 for localhost and preserves explicit hosts', async () => {
  const originalCreatePool = mysql.createPool
  const envKeys = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME']
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
  const capturedHosts = []
  mysql.createPool = (config) => {
    capturedHosts.push(config.host)
    return {
      execute: async () => [[{ ready: 1 }], []],
      end: async () => {},
    }
  }
  try {
    process.env.DB_USER = 'fixture-user'
    process.env.DB_PASS = 'fixture-password'
    process.env.DB_NAME = 'fixture-database'
    for (const host of ['localhost', '127.0.0.1', 'db.example.test']) {
      process.env.DB_HOST = host
      const [rows] = await query('SELECT 1 AS ready')
      assert.equal(rows[0].ready, 1)
      await closePool()
    }
    assert.deepEqual(capturedHosts, ['127.0.0.1', '127.0.0.1', 'db.example.test'])
  } finally {
    await closePool()
    mysql.createPool = originalCreatePool
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

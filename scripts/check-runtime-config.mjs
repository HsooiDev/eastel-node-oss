import { createRequire } from 'node:module'
import { validateRuntimeConfig } from '../lib/runtime-config.ts'
import { getMarketingShareDirectory, getMarketingPosterDirectory, getReviewUploadDirectory, getWhatsAppMediaDirectory } from '../lib/marketing-share-path.ts'

const require = createRequire(import.meta.url)
const { loadEnvConfig } = require('@next/env')
const originArg = process.argv.find(arg => arg.startsWith('--expected-origin='))
const expectedOrigin = originArg?.slice('--expected-origin='.length)
try {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
  const result = validateRuntimeConfig(process.env, 'release', expectedOrigin)
  for (const [key, resolve] of [['MARKETING_SHARE_DIR', getMarketingShareDirectory], ['MARKETING_POSTER_DIR', getMarketingPosterDirectory], ['REVIEW_UPLOAD_DIR', getReviewUploadDirectory], ['WHATSAPP_MEDIA_DIR', getWhatsAppMediaDirectory]]) {
    try { resolve({ ...process.env, NODE_ENV: 'production' }) }
    catch { if (!result.missing.includes(key)) result.invalid.push(key) }
  }
  if (result.missing.length || result.invalid.length) {
    console.error('FAIL: runtime configuration; field names only', JSON.stringify(result))
    process.exitCode = 1
  } else {
    console.log('PASS: release configuration; external services and account login still require verification')
  }
} catch {
  console.error('FAIL: unable to load runtime configuration')
  process.exitCode = 1
}

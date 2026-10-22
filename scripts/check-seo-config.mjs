// Validate the deployment contract without contacting a service or printing secrets.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolveSiteConfig } from '../lib/site.ts';
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
try {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const config = resolveSiteConfig(process.env);
  if (process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '') !== config.origin) {
    throw new Error('NEXT_PUBLIC_BASE_URL must match NEXT_PUBLIC_SITE_URL');
  }
  if (process.argv.includes('--built')) {
    const built = JSON.parse(readFileSync('.next/required-server-files.json', 'utf8')).config.env;
    if (built.SITE_ENV !== config.environment || built.NEXT_PUBLIC_SITE_URL !== config.origin) {
      throw new Error('Built SEO configuration differs from the launch environment; rebuild before starting');
    }
  }
  console.log(`PASS SEO configuration: ${config.environment}, ${config.origin}, indexable=${config.indexable}`);
} catch (error) {
  // Our validator only includes field names and fixed accepted origins.
  console.error(`FAIL SEO configuration: ${error.message}`);
  process.exitCode = 1;
}

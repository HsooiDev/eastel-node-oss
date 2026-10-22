// Hostinger invokes a package script after its own dependency installation.
// Reinstall from the lockfile before validating and producing the release.
import { spawnSync } from 'node:child_process';

const origin = 'https://staging.example.test';
if (process.env.SITE_ENV !== 'staging' ||
    process.env.NEXT_PUBLIC_SITE_URL !== origin ||
    process.env.NEXT_PUBLIC_BASE_URL !== origin) {
  console.error('FAIL: Hostinger staging requires explicit staging mode and matching staging.example.test origins');
  process.exit(1);
}
if (!/^[a-f0-9]{40}$/i.test(process.env.BUILD_SHA || '')) {
  console.error('FAIL: set BUILD_SHA to the exact 40-character release commit before deploying');
  process.exit(1);
}
if (!process.env.npm_execpath) {
  console.error('FAIL: invoke this release script through npm run build:hostinger:staging');
  process.exit(1);
}

for (const args of [
  ['ci'],
  ['run', 'check:runtime-config', '--', `--expected-origin=${origin}`],
  ['run', 'build'],
  ['run', 'check:seo-config', '--', '--built'],
]) {
  console.log(`Release step: npm ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('FAIL: Hostinger staging release step did not complete');
    process.exit(result.status || 1);
  }
}

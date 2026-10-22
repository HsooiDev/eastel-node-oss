// Dedicated apex release: validate before building, then check the built artifact.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function runProductionRelease({ env = process.env, run = spawnSync, execPath = process.execPath, log = console } = {}) {
  const origin = 'https://eastel.site';
  if (env.SITE_ENV !== 'production' || env.APP_ENV !== 'production' ||
      env.NEXT_PUBLIC_SITE_URL !== origin || env.NEXT_PUBLIC_BASE_URL !== origin) {
    log.error('FAIL: Hostinger production requires explicit production mode and matching eastel.site origins');
    return 1;
  }
  if (!/^[a-f0-9]{40}$/i.test(env.BUILD_SHA || '')) {
    log.error('FAIL: set BUILD_SHA to the exact 40-character release commit before deploying');
    return 1;
  }
  if (!env.npm_execpath) {
    log.error('FAIL: invoke this release script through npm run build:hostinger:production');
    return 1;
  }
  for (const args of [
    ['ci', '--include=dev'],
    ['run', 'check:runtime-config', '--', '--expected-origin=' + origin],
    ['run', 'build'],
    ['run', 'check:seo-config', '--', '--built'],
  ]) {
    log.log('Release step: npm ' + args.join(' '));
    try {
      const result = run(execPath, [env.npm_execpath, ...args], { stdio: 'inherit', env });
      if (result.error || result.status !== 0) {
        log.error('FAIL: Hostinger production release step did not complete');
        return Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
      }
    } catch {
      log.error('FAIL: Hostinger production release step could not start');
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runProductionRelease();
}

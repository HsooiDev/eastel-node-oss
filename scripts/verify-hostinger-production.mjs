import assert from 'node:assert/strict';
import { runProductionRelease } from './build-hostinger-production.mjs';
const good = { SITE_ENV: 'production', APP_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://eastel.site', NEXT_PUBLIC_BASE_URL: 'https://eastel.site', BUILD_SHA: 'a'.repeat(40), npm_execpath: '/trusted/npm-cli.js' };
let passed = 0;
function check(name, fn) { fn(); passed++; }
function execute(overrides = {}, failAt = -1, failure = { status: 7 }) {
  const calls = [], logs = [];
  const env = { ...good, ...overrides };
  const status = runProductionRelease({ env, execPath: '/trusted/node', log: { log: text => logs.push(text), error: text => logs.push(text) }, run: (command, args, options) => {
    calls.push({ command, args, options });
    if (calls.length - 1 === failAt) {
      if (failure instanceof Error) throw failure;
      return failure;
    }
    return { status: 0 };
  } });
  return { status, calls, logs, env };
}
check('production executes locked install, preflight, build and built check in order', () => {
  const result = execute();
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls.map(call => call.args.slice(1)), [ ['ci', '--include=dev'], ['run', 'check:runtime-config', '--', '--expected-origin=https://eastel.site'], ['run', 'build'], ['run', 'check:seo-config', '--', '--built'] ]);
  for (const call of result.calls) {
    assert.equal(call.command, '/trusted/node');
    assert.equal(call.args[0], good.npm_execpath);
    assert.equal(call.options.env, result.env);
    assert.equal(call.options.stdio, 'inherit');
  }
});
for (const invalid of [
  { SITE_ENV: 'staging' }, { SITE_ENV: undefined }, { APP_ENV: 'development' }, { APP_ENV: undefined },
  { NEXT_PUBLIC_SITE_URL: 'https://staging.example.test' }, { NEXT_PUBLIC_BASE_URL: 'https://staging.example.test' },
  { NEXT_PUBLIC_SITE_URL: 'https://eastel.site/' }, { NEXT_PUBLIC_BASE_URL: undefined },
  { BUILD_SHA: undefined }, { BUILD_SHA: 'unknown' }, { BUILD_SHA: 'a'.repeat(39) }, { BUILD_SHA: 'g'.repeat(40) },
  { npm_execpath: undefined },
]) check('bad production inputs spawn no release step: ' + Object.keys(invalid)[0], () => {
  const result = execute(invalid);
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 0);
});
for (let step = 0; step < 4; step++) {
  for (const failure of [{ status: 7 }, { status: null, signal: 'SIGTERM' }, { status: 0, error: new Error('private detail') }, new Error('private detail')]) {
    check('failed step stops later commands without leaking exception details: ' + step, () => {
      const result = execute({}, step, failure);
      assert.notEqual(result.status, 0);
      assert.equal(result.calls.length, step + 1);
      assert.ok(!result.logs.join(' ').includes('private detail'));
    });
  }
}
for (const settings of [{ NODE_ENV: 'production' }, { npm_config_omit: 'dev' }, { NODE_ENV: 'production', npm_config_omit: 'dev' }]) {
  check('production install explicitly includes build tooling despite omission settings', () => {
    const result = execute(settings);
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls[0].args.slice(1), ['ci', '--include=dev']);
    for (const [key, value] of Object.entries(settings)) assert.equal(result.calls[0].options.env[key], value);
  });
}
check('no Cron secret is required or synthesized', () => {
  const result = execute();
  assert.equal(result.status, 0);
  assert.ok(result.calls.every(call => !('CRON_SECRET' in call.options.env)));
});
console.log('PASS: ' + passed + ' Hostinger production release scenarios');

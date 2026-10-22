// Behavioral SEO tests against the actual TypeScript modules, offline only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
let checks = 0;
function test(name, action) { action(); checks++; console.log(`PASS ${name}`); }
function context(environment, origin) {
  const cache = new Map();
  const env = { SITE_ENV: environment, NEXT_PUBLIC_SITE_URL: origin };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = specifier => {
      if (specifier.startsWith('@/')) {
        const base = specifier.slice(2);
        const target = [base + '.ts', base + '.tsx'].find(file => fs.existsSync(path.join(root, file)));
        return load(target);
      }
      return require(specifier);
    };
    new Function('require', 'module', 'exports', 'process', js)(localRequire, module, module.exports, { env });
    return module.exports;
  }
  return { load };
}
const staging = context('staging', 'https://staging.example.test');
const prod = context('production', 'https://eastel.site');
const site = staging.load('lib/site.ts');
test('fail-closed default staging', () => assert.deepEqual(site.resolveSiteConfig({}), { environment: 'staging', origin: 'https://staging.example.test', indexable: false }));
for (const env of [
  { SITE_ENV: 'production' },
  { SITE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://staging.example.test' },
  { SITE_ENV: 'staging', NEXT_PUBLIC_SITE_URL: 'https://eastel.site' },
  { SITE_ENV: 'preview' },
  ...['https://eastel.site.evil.test', 'https://user@staging.example.test', 'https://staging.example.test/path', 'https://staging.example.test?x=1', 'https://staging.example.test/#x', 'http://staging.example.test', 'javascript:alert(1)'].map(NEXT_PUBLIC_SITE_URL => ({ SITE_ENV: 'staging', NEXT_PUBLIC_SITE_URL })),
]) test('reject invalid environment/origin ' + JSON.stringify(env), () => assert.throws(() => site.resolveSiteConfig(env)));
const productionConfig = prod.load('lib/site.ts').SITE_CONFIG;
for (const host of ['evil.test', 'eastel.site.evil.test', 'eastel.site:443', 'staging.example.test', 'eastel.site@evil.test', 'eastel.site,evil.test', 'eastel.site/path', null]) {
  test('reject production host ' + host, () => assert.equal(site.classifySiteHost(host, productionConfig), 'reject'));
}
test('trusted production host', () => assert.equal(site.classifySiteHost('eastel.site', productionConfig), 'site'));
test('www is a fixed canonical redirect', () => assert.equal(site.classifySiteHost('www.eastel.site', productionConfig), 'www'));
test('production never accepted by staging', () => assert.equal(site.classifySiteHost('eastel.site'), 'reject'));
test('local inspection is distinct', () => assert.equal(site.classifySiteHost('127.0.0.1:3456'), 'local'));
const policy = staging.load('lib/seo-policy.ts');
for (const [mode, ctx, origin] of [['staging', staging, 'https://staging.example.test'], ['production', prod, 'https://eastel.site']]) {
  const metadata = ctx.load('components/seo-head.tsx').buildMetadata;
  const robots = ctx.load('app/robots.ts').default();
  const sitemap = ctx.load('app/sitemap.ts').default();
  test(mode + ' sitemap contents', () => {
    assert.equal(sitemap.length, mode === 'production' ? 33 : 0);
    for (const entry of sitemap) {
      assert.ok(policy.publicPage(new URL(entry.url).pathname));
      assert.equal(new URL(entry.url).origin, origin);
      assert.equal(entry.lastModified, undefined);
      assert.equal(entry.alternates.languages['x-default'], entry.url.replace(/\/(en|zh)($|\/)/, '/ms$2'));
    }
  });
  test(mode + ' stable sitemap', () => assert.deepEqual(ctx.load('app/sitemap.ts').default(), sitemap));
  test(mode + ' robots crawler separation', () => {
    const ruleFor = bot => robots.rules.find(rule => [rule.userAgent].flat().includes(bot));
    for (const bot of policy.SEARCH_CRAWLERS) {
      assert.equal(ruleFor(bot).allow, '/');
      assert.deepEqual(ruleFor(bot).disallow, policy.ROBOTS_PRIVATE_PATHS);
    }
    for (const bot of policy.TRAINING_CRAWLERS) assert.equal(ruleFor(bot).disallow, '/');
    assert.equal(robots.sitemap, mode === 'production' ? origin + '/sitemap.xml' : undefined);
  });
  for (const locale of policy.SEO_LOCALES) for (const suffix of policy.PUBLIC_PAGE_PATHS) {
    test(`${mode} metadata ${locale}${suffix}`, () => {
      assert.ok(fs.existsSync(path.join(root, 'app/[locale]', suffix, 'page.tsx')));
      const result = metadata({ canonical: `${origin}/${locale}${suffix}?utm_source=example`, locale });
      assert.equal(result.robots.index, mode === 'production');
      assert.equal(result.alternates.canonical, `${origin}/${locale}${suffix}`);
      assert.equal(result.openGraph.url, result.alternates.canonical);
      assert.deepEqual(result.alternates.languages, policy.languageAlternates(origin, suffix));
      assert.equal(result.twitter.card, 'summary_large_image');
    });
  }
  for (const suffix of ['/account/login', '/thankyou', '/unknown']) test(mode + ' private/unknown metadata ' + suffix, () => {
    const result = metadata({ canonical: `${origin}/en${suffix}`, locale: 'en', noIndex: true });
    assert.equal(result.robots.index, false);
    assert.equal(result.alternates, undefined);
  });
  test(mode + ' foreign canonical rejected', () => assert.throws(() => metadata({ canonical: 'https://evil.test/en' })));
}
test('only one robots route', () => assert.ok(!fs.existsSync(path.join(root, 'public/robots.txt'))));
console.log(`SEO behavioral checks passed: ${checks}`);

#!/usr/bin/env node
/**
 * Read-only public HTTP regression checks. No accounts, API calls, cookies,
 * search submissions, order references or payment requests are used.
 *
 * node scripts/verify-seo-html.mjs --base-url=http://127.0.0.1:3000 --mode=staging --host=staging.example.test
 * node scripts/verify-seo-html.mjs --base-url=http://127.0.0.1:3000 --mode=production --host=eastel.site
 * node scripts/verify-seo-html.mjs --base-url=https://staging.example.test --mode=staging
 *
 * Host overrides and cross-host probes are confined to loopback connections.
 * Run against an isolated local build first. A live PHP origin is not expected
 * to satisfy these Next.js checks until the separately authorized cutover.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  assert.match(argument, /^--[a-z-]+=/, 'Use --name=value arguments');
  const separator = argument.indexOf('=');
  return [argument.slice(2, separator), argument.slice(separator + 1)];
}));
for (const key of Object.keys(options)) {
  assert.ok(['base-url', 'mode', 'host'].includes(key), `Unknown option: ${key}`);
}
assert.ok(['staging', 'production'].includes(options.mode), 'Specify --mode=staging or --mode=production');
const base = new URL(options['base-url'] || 'http://127.0.0.1:3000');
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password && base.pathname === '/' && !base.search && !base.hash, 'Use a plain HTTP(S) origin');
assert.ok(loopback || ['staging.example.test', 'eastel.site'].includes(base.hostname), 'Only loopback and the two authorized Eastel origins are supported');
assert.ok(loopback || base.protocol === 'https:', 'Remote checks require HTTPS');
assert.ok(!options.host || loopback, 'Host overrides are only allowed on loopback');
const production = options.mode === 'production';
const canonicalOrigin = production ? 'https://eastel.site' : 'https://staging.example.test';
const expectedHost = production ? 'eastel.site' : 'staging.example.test';
assert.ok(!options.host || options.host === expectedHost, `This mode requires --host=${expectedHost}`);
assert.ok(!production || !loopback || options.host === expectedHost, 'Production checks on loopback require --host=eastel.site');
const locales = ['en', 'ms', 'zh'];
const publicPages = ['', '/plans', '/roaming', '/faq', '/contact', '/eastelpreneurs', '/order', '/track', '/delivery', '/privacy', '/terms'];
let passed = 0;
const failures = [];

async function check(name, action) {
  try {
    await action();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function request(pathname, host = options.host) {
  assert.ok(pathname.startsWith('/') && !pathname.startsWith('//'), 'Requests must remain on the configured origin');
  // Node's fetch can silently discard a Host override. Use the HTTP transport
  // so cross-host tests exercise the actual wire authority, not loopback again.
  const url = new URL(pathname, base);
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'user-agent': 'Googlebot', ...(host ? { host } : {}) },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(key, part);
        }
        resolve({ response: new Response(html, { status: res.statusCode, headers }), html });
      });
    });
    req.on('error', reject);
  });
}

function decode(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    return String.fromCodePoint(entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
  });
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}
function tags(html, name) { return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => attributes(match[0])); }
function meta(html, key, attribute = 'name') { return tags(html, 'meta').filter(tag => tag[attribute] === key).map(tag => tag.content); }
function visibleText(html) { return decode(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function compact(html) { return visibleText(html).replace(/\s+/g, ''); }
function nodes(value) {
  if (!value || typeof value !== 'object') return [];
  return [...(value['@type'] ? [value] : []), ...Object.values(value).flatMap(child => Array.isArray(child) ? child.flatMap(nodes) : nodes(child))];
}
function structuredData(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => attributes(match[1]).type === 'application/ld+json')
    .flatMap(match => nodes(JSON.parse(match[2])));
}
function noindex(response, html) {
  return /\bnoindex\b/i.test([response.headers.get('x-robots-tag'), ...meta(html, 'robots'), ...meta(html, 'googlebot')].join(','));
}

const titlesByPage = new Map();
for (const page of publicPages) {
  for (const locale of locales) {
    const path = `/${locale}${page}`;
    await check(`${path} SSR metadata, language, schema and index policy`, async () => {
      const { response, html } = await request(path);
      assert.equal(response.status, 200, 'Expected a real 200 page');
      assert.match(response.headers.get('content-type') || '', /text\/html/, 'Expected HTML');
      assert.equal(tags(html, 'html')[0]?.lang, locale === 'zh' ? 'zh-Hans' : locale, 'Wrong document language');
      const title = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)];
      assert.equal(title.length, 1, 'Expected exactly one title');
      assert.ok(visibleText(title[0][1]).length > 4, 'Empty title');
      const pageTitles = titlesByPage.get(page) || [];
      pageTitles.push(visibleText(title[0][1]));
      titlesByPage.set(page, pageTitles);
      assert.equal(meta(html, 'description').length, 1, 'Expected one description');
      assert.ok(meta(html, 'description')[0]?.length > 20, 'Description is missing or unhelpful');
      const links = tags(html, 'link');
      const canonical = links.filter(link => link.rel === 'canonical');
      assert.deepEqual(canonical.map(link => link.href), [`${canonicalOrigin}${path}`], 'Canonical must reference this page on the configured origin');
      const alternates = links.filter(link => link.rel === 'alternate' && link.hreflang);
      for (const language of [...locales, 'x-default']) {
        assert.deepEqual(alternates.filter(link => link.hreflang === language).map(link => link.href), [`${canonicalOrigin}/${language === 'x-default' ? 'ms' : language}${page}`], `Wrong ${language} alternate`);
      }
      for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) assert.ok(meta(html, key, 'property')[0], `${key} missing`);
      assert.equal(meta(html, 'og:url', 'property')[0], `${canonicalOrigin}${path}`, 'Open Graph URL disagrees with canonical');
      assert.equal(meta(html, 'twitter:card')[0], 'summary_large_image', 'Twitter card missing');
      assert.equal((html.match(/<h1\b/gi) || []).length, 1, 'Expected one meaningful H1');
      assert.ok(visibleText(html).length > 150, 'Main content must exist without JavaScript');
      assert.doesNotMatch(html, /eastel\.com\.my/i, 'Public HTML or hydration data must not retain the external Eastel website');
      assert.doesNotMatch(visibleText(html), /商家身份|身份不同|运营商|pengendali|\boperator\b|authori[sz]ed partner|销售商|\bseller\b|\bpenjual\b/i, 'Removed business identity copy must not return');
      if (page === '/eastelpreneurs') {
        const hrefs = tags(html, 'a').map(link => link.href);
        assert.ok(hrefs.includes(`/${locale}/order`) && hrefs.includes(`/${locale}/contact`), 'Programme purchase and support actions must stay on the localized website');
        assert.ok(hrefs.includes('#how-it-works') && /id="how-it-works"/.test(html), 'In-page programme navigation must have a real target');
      }
      assert.equal(noindex(response, html), !production, 'Index policy does not match deployment mode');
      assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /\bnoai\b|\bnoimageai\b/i, 'Nonstandard AI exclusion header remains');
      if (!production) {
        assert.match(response.headers.get('x-robots-tag') || '', /noindex/i, 'Staging needs HTTP noindex');
        assert.ok(meta(html, 'robots').some(value => /noindex/i.test(value)), 'Staging needs HTML noindex');
        assert.match(response.headers.get('cache-control') || '', /no-store/i, 'Staging must not share cached HTML');
        assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js/, 'Staging must not emit the production GA4 tag');
      }
      const schema = structuredData(html);
      assert.ok(schema.length > 0, 'Expected server-rendered JSON-LD');
      for (const node of schema) {
        assert.ok(!['Organization', 'LocalBusiness'].includes(node['@type']), 'Do not reintroduce a business-identity entity');
        assert.equal(node.seller, undefined, 'Do not retain a business-identity reference');
        assert.notEqual(node['@type'], 'AggregateRating', 'No unverified aggregate ratings');
        if (node['@id']?.startsWith('http')) assert.equal(new URL(node['@id']).origin, canonicalOrigin, 'Entity ID uses another deployment origin');
        if (['/plans', '/roaming'].includes(page)) assert.ok(!['Product', 'Offer'].includes(node['@type']), 'Reference-only mobile plans must not become merchant products');
        if (node['@type'] === 'Question') {
          assert.ok(compact(html).includes(compact(node.name)), 'FAQ question exists only in JSON-LD');
          assert.ok(compact(html).includes(compact(node.acceptedAnswer?.text || '')), 'FAQ answer exists only in JSON-LD');
        }
      }
    });
  }
}

await check('Independent titles in all three languages', async () => {
  for (const [page, titles] of titlesByPage) assert.equal(new Set(titles).size, 3, `Repeated titles for ${page || 'home'}`);
});

await check('Robots search access, training restrictions and private paths', async () => {
  const { response, html: text } = await request('/robots.txt');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/plain/);
  const groups = [];
  let group;
  for (const line of text.split(/\r?\n/)) {
    const match = line.replace(/#.*/, '').trim().match(/^([\w-]+):\s*(.*)$/);
    if (!match) continue;
    const [, rawKey, value] = match;
    const key = rawKey.toLowerCase();
    if (key === 'user-agent') {
      if (!group || group.rules.length) groups.push(group = { agents: [], rules: [] });
      group.agents.push(value.toLowerCase());
    } else if (['allow', 'disallow'].includes(key) && group) group.rules.push({ key, value });
  }
  const rulesFor = agent => groups.filter(group => group.agents.includes(agent.toLowerCase())).flatMap(group => group.rules);
  const wildcard = rulesFor('*');
  for (const agent of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User']) {
    const rules = rulesFor(agent).length ? rulesFor(agent) : wildcard;
    assert.ok(rules.some(rule => rule.key === 'allow' && rule.value === '/'), `${agent} cannot read public noindex/content`);
    assert.ok(!rules.some(rule => rule.key === 'disallow' && rule.value === '/'), `${agent} is blocked`);
  }
  for (const agent of ['GPTBot', 'ClaudeBot', 'Google-Extended']) assert.ok(rulesFor(agent).some(rule => rule.key === 'disallow' && rule.value === '/'), `${agent} training policy changed`);
  for (const path of ['/api/', '/hs/', '/uploads/', '/en/account/', '/ms/account/', '/zh/account/']) {
    assert.ok(wildcard.some(rule => rule.key === 'disallow' && [path, path.replace(/\/$/, '')].includes(rule.value)), `Private crawler exclusion missing: ${path}`);
  }
  const sitemaps = [...text.matchAll(/^sitemap:\s*(\S+)/gim)].map(match => match[1]);
  assert.deepEqual(sitemaps, production ? [`${canonicalOrigin}/sitemap.xml`] : [], 'Wrong sitemap advertisement');
});

await check('Sitemap origins, public inventory, hreflang and stable timestamps', async () => {
  const first = await request('/sitemap.xml');
  const second = await request('/sitemap.xml');
  assert.equal(first.response.status, 200);
  assert.match(first.response.headers.get('content-type') || '', /xml/);
  assert.equal(first.html, second.html, 'Sitemap changes without a content/configuration change');
  const entries = [...first.html.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => match[1]);
  if (!production) assert.equal(entries.length, 0, 'Staging must not publish indexable inventory');
  else {
    const locations = entries.map(entry => decode(entry.match(/<loc>(.*?)<\/loc>/)?.[1] || ''));
    assert.equal(new Set(locations).size, locations.length, 'Duplicate sitemap URLs');
    assert.deepEqual(locations.sort(), publicPages.flatMap(page => locales.map(locale => `${canonicalOrigin}/${locale}${page}`)).sort(), 'Sitemap does not match real public inventory');
    for (const entry of entries) {
      const url = new URL(decode(entry.match(/<loc>(.*?)<\/loc>/)[1]));
      const page = url.pathname.replace(/^\/(en|ms|zh)/, '');
      const alternates = [...entry.matchAll(/<xhtml:link\b[^>]*>/g)].map(match => attributes(match[0]));
      for (const language of [...locales, 'x-default']) assert.ok(alternates.some(link => link.hreflang === language && link.href === `${canonicalOrigin}/${language === 'x-default' ? 'ms' : language}${page}`), `Missing ${language} sitemap alternate`);
      const modified = entry.match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
      if (modified) assert.ok(Number.isFinite(Date.parse(modified)), 'Invalid content modification timestamp');
    }
  }
});

for (const [from, to] of [['/', '/ms'], ['/en/', '/en'], ['/en/plans.php', '/en/plans'], ['/ms/faq.html', '/ms/faq'], ['/zh/contact.html', '/zh/contact'], ['/order.html', '/en/order'], ['/terms.html', '/en/terms'], ['/privacy-policy.html', '/en/privacy']]) {
  await check(`Permanent legacy/default redirect ${from}`, async () => {
    const { response } = await request(from);
    assert.ok([301, 308].includes(response.status), `Expected permanent redirect, got ${response.status}`);
    const destination = new URL(response.headers.get('location'), canonicalOrigin);
    assert.equal(destination.pathname.replace(/\/$/, ''), to);
    assert.ok([canonicalOrigin, base.origin].includes(destination.origin), 'Redirect escapes the deployment origin');
  });
}

await check('Unknown localized page is a genuine 404 with noindex', async () => {
  const { response, html } = await request('/en/seo-regression-page-that-does-not-exist');
  assert.equal(response.status, 404, 'Avoid soft 404s and homepage redirects');
  assert.ok(noindex(response, html), '404 must not be indexable');
});
await check('Customer and administrator login remain private', async () => {
  for (const path of ['/en/account/login', '/hs/login']) {
    const { response, html } = await request(path);
    assert.equal(response.status, 200, 'Login route should remain reachable');
    assert.ok(noindex(response, html), 'Login must not be indexable');
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js/, 'Private login must not emit the public GA4 tag');
    assert.match(response.headers.get('cache-control') || '', /no-store/i, 'Login must not be shared cached');
  }
});
if (loopback) {
  await check('Cross-deployment and untrusted Host cannot escape isolation', async () => {
    for (const host of [production ? 'staging.example.test' : 'eastel.site', 'untrusted.example']) {
      const { response } = await request('/en', host);
      assert.equal(response.status, 421, `Wrong deployment Host ${host} must be rejected`);
      assert.match(response.headers.get('x-robots-tag') || '', /noindex/i);
      assert.match(response.headers.get('cache-control') || '', /no-store/i);
      assert.equal(response.headers.get('location'), null, 'Untrusted Host must not be reflected into redirects');
    }
  });
}

console.log(`SEO HTTP checks: ${passed} passed; ${failures.length} failed. Public GETs only; external platform acceptance and field Core Web Vitals are not measured.`);
if (failures.length) process.exitCode = 1;

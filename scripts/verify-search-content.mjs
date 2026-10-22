// Real JSON-LD builders, catalogue reader and translated FAQ contracts; no services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
function load(relative, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected external dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const { buildPageSchema, buildSimProduct, serializeJsonLd } = load('lib/structured-data.ts');
const { FAQ_CATEGORIES } = load('lib/plans-data.ts');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const payload = { name: '</script><img src=x onerror=alert(1)>' };
test('JSON-LD safely preserves text without script breakout', () => {
  const serialized = serializeJsonLd(payload);
  assert.ok(!serialized.includes('<'));
  assert.deepEqual(JSON.parse(serialized), payload);
});
for (const locale of ['en', 'ms', 'zh']) {
  const tr = JSON.parse(fs.readFileSync(path.join(root, 'locales', locale + '.json'), 'utf8'));
  const questions = FAQ_CATEGORIES.flatMap(category => category.items.map(item => ({ question: tr[item.questionKey], answer: tr[item.answerKey] })));
  test(locale + ' FAQ coverage and translations', () => {
    assert.equal(questions.length, 10);
    assert.equal(new Set(questions.map(item => item.question)).size, questions.length);
    for (const item of questions) {
      assert.ok(item.question?.length > 8);
      assert.ok(item.answer?.length > 30);
      assert.ok(!/<(?:script|iframe)\b|onerror\s*=/i.test(item.answer));
    }
    for (const policy of ['delivery','privacy','terms']) for (let section = 1; section <= 4; section++) {
      assert.ok(tr[`${policy}.section${section}.heading`]);
      assert.ok(tr[`${policy}.section${section}.body`]?.length > 20);
    }
  });
  test(locale + ' content-only schema, FAQ and breadcrumbs', () => {
    const schema = buildPageSchema({ origin: 'https://eastel.site', locale, path: 'faq', title: tr['faq.title'], description: tr['faq.desc'], homeLabel: tr['seo.home'], type: 'FAQPage', questions });
    const graph = JSON.parse(serializeJsonLd(schema))['@graph'];
    assert.ok(!graph.some(node => ['Organization', 'LocalBusiness'].includes(node['@type'])));
    assert.ok(!JSON.stringify(graph).includes('/#seller'));
    const site = graph.find(node => node['@type'] === 'WebSite');
    assert.equal(site['@id'], 'https://eastel.site/#website');
    const page = graph.find(node => node['@type'] === 'FAQPage');
    assert.equal(page.mainEntity.length, questions.length);
    assert.equal(page.publisher, undefined);
    assert.equal(page.isPartOf['@id'], site['@id']);
    for (let i = 0; i < questions.length; i++) {
      assert.equal(page.mainEntity[i].name, questions[i].question);
      assert.equal(page.mainEntity[i].acceptedAnswer.text, questions[i].answer);
    }
    const breadcrumb = graph.find(node => node['@type'] === 'BreadcrumbList');
    assert.equal(breadcrumb.itemListElement[1].item, `https://eastel.site/${locale}/faq`);
  });
  test(locale + ' no retained business identity or offsite purchase/support directions', () => {
    const text = JSON.stringify(tr);
    assert.doesNotMatch(text, /eastel\.com\.my|official channels|saluran rasmi|官方渠道|运营商|pengendali|\boperator\b|business identity|商家身份|身份不同|authori[sz]ed partner|销售商|\bseller\b|\bpenjual\b/i);
    assert.equal(tr['seo.sellerScope'], undefined);
    assert.equal(tr['faq.general.q1'], undefined);
  });
}
for (const price of [undefined, NaN, -1, 0]) test('unknown price never creates an Offer: ' + price, () => {
  assert.equal(buildSimProduct({ origin: 'https://eastel.site', locale: 'en', name: 'Physical SIM', description: 'SIM only', price }).offers, undefined);
});
test('real SIM price without a business identity or invented shipping, availability or ratings', () => {
  const product = buildSimProduct({ origin: 'https://eastel.site', locale: 'en', name: 'Physical SIM', description: 'SIM only', price: 12.50 });
  assert.equal(product.offers.price, '12.50');
  assert.equal(product.offers.priceCurrency, 'MYR');
  assert.equal(product.offers.seller, undefined);
  for (const key of ['availability','shippingDetails','hasMerchantReturnPolicy','aggregateRating']) assert.equal(product.offers[key], undefined);
  assert.equal(product.aggregateRating, undefined);
  assert.ok(fs.existsSync(path.join(root, 'public', new URL(product.image).pathname)));
});
for (const [product, expected] of [
  [null, null], [{ price: NaN, available: true }, null], [{ price: -1, available: true }, null],
  [{ price: 12.5, available: true }, { price: 12.5, canOrder: true }],
  [{ price: 12.5, available: false }, { price: 12.5, canOrder: false }],
  [{ price: Infinity, available: true }, null],
]) {
  const reader = load('lib/public-product.ts', { '@/lib/storefront': { getStorefrontCheckout: async () => ({ product }) } });
  assert.deepEqual(await reader.readPublicSim(), expected); checks++;
}
const unavailable = load('lib/public-product.ts', { '@/lib/storefront': { getStorefrontCheckout: async () => { throw new Error('offline'); } } });
assert.equal(await unavailable.readPublicSim(), null); checks++;
test('no synthetic testimonials fallback', () => assert.deepEqual(load('lib/reviews-data.ts').PUBLIC_REVIEWS, []));
console.log(`Search content/structured data checks passed: ${checks}`);

/**
 * Runs the checked-in vhosts against local fake upstreams, never real services.
 * Requires nginx (http_ssl, http_v2, realip) and openssl on PATH, or NGINX_BIN.
 * Usage: NGINX_BIN=/path/to/nginx node scripts/verify-nginx-seo.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nginx = process.env.NGINX_BIN || 'nginx';
const scratch = await mkdtemp(path.join(tmpdir(), 'eastel-nginx-seo-'));
const children = [];
const servers = [];
let assertions = 0;

async function unusedPort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function upstream(name) {
  const server = http.createServer((req, res) => {
    const privatePage = /\/(?:account|thankyou|hs|api|payment)(?:\/|\?|$)/.test(req.url);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    res.setHeader('Vary', 'RSC, Next-Router-State-Tree, Accept-Encoding');
    if (privatePage) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.end(JSON.stringify({ name, url: req.url, headers: req.headers }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return server.address().port;
}

function request(port, host, pathname = '/en', secure = true, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = secure ? https : http;
    const req = client.get({
      host: '127.0.0.1', port, path: pathname,
      headers: { Host: host, ...headers },
      // Only this local fixture uses a disposable self-signed certificate.
      ...(secure ? { rejectUnauthorized: false, servername: host } : {}),
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('Local nginx response timeout')));
    req.on('error', reject);
  });
}

function check(condition, message) {
  assert.ok(condition, message);
  assertions++;
}

try {
  const stageUpstream = await upstream('staging');
  const prodUpstream = await upstream('production');
  const [stageHttp, stageHttps, prodHttp, prodHttps] = await Promise.all(
    Array.from({ length: 4 }, unusedPort),
  );
  await mkdir(path.join(scratch, 'public', 'images'), { recursive: true });
  await writeFile(path.join(scratch, 'public', 'images', 'fixture.svg'), '<svg/>');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', path.join(scratch, 'key.pem'), '-out', path.join(scratch, 'cert.pem'),
    '-days', '1', '-subj', '/CN=local-eastel-seo-test'], { stdio: 'ignore' });

  let stage = await readFile(path.join(root, 'nginx.conf'), 'utf8');
  let prod = await readFile(path.join(root, 'infra/nginx/production.conf.example'), 'utf8');
  check(!/server_name[^;]*\s(?:eastel\.site|www\.eastel\.site)[;\s]/.test(stage),
    'Default staging template must not bind the live PHP hostnames');
  const adapt = (source, port80, port443) => source
    .replaceAll('listen 80;', `listen 127.0.0.1:${port80};`)
    .replaceAll('listen 443 ssl;', `listen 127.0.0.1:${port443} ssl;`)
    .replaceAll('/etc/ssl/certs/eastel.site.pem', path.join(scratch, 'cert.pem'))
    .replaceAll('/etc/ssl/private/eastel.site.key', path.join(scratch, 'key.pem'))
    .replaceAll('/home/deploy/eastel-website_nodejs/public', path.join(scratch, 'public'))
    .replaceAll('127.0.0.1:3000', `127.0.0.1:${stageUpstream}`)
    .replaceAll('127.0.0.1:3001', `127.0.0.1:${prodUpstream}`);
  stage = adapt(stage, stageHttp, stageHttps);
  prod = adapt(prod, prodHttp, prodHttps);
  const config = path.join(scratch, 'nginx.conf');
  await writeFile(config, `pid ${scratch}/nginx.pid;\nerror_log ${scratch}/error.log;\n`
    + `events {}\nhttp { access_log off; client_body_temp_path ${scratch}/body; `
    + `proxy_temp_path ${scratch}/proxy; ${stage}\n${prod}\n}\n`);
  execFileSync(nginx, ['-p', scratch, '-t', '-c', config], { stdio: 'pipe' });
  const child = spawn(nginx, ['-p', scratch, '-c', config, '-g', 'daemon off;'],
    { stdio: 'pipe' });
  children.push(child);
  for (let n = 0; n < 60; n++) {
    try { await request(stageHttp, 'staging.example.test', '/', false); break; }
    catch (error) {
      if (n === 59) throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  for (const route of ['/en', '/ms', '/zh', '/api/health/live', '/robots.txt',
    '/sitemap.xml', '/images/fixture.svg', '/images/missing.svg', '/en/thankyou?token=fixture']) {
    const res = await request(stageHttps, 'staging.example.test', route);
    check(/noindex/.test(res.headers['x-robots-tag']), `${route}: staging noindex`);
    check(/no-store/.test(res.headers['cache-control']), `${route}: staging no-store`);
    check(/no-store/.test(res.headers['cdn-cache-control']), `${route}: CDN no-store`);
    check(res.headers['x-content-type-options'] === 'nosniff', `${route}: inherited security`);
  }
  const stageRedirect = await request(stageHttp, 'staging.example.test', '/en?fixture=1', false);
  check(stageRedirect.status === 308 && stageRedirect.headers.location
    === 'https://staging.example.test/en?fixture=1', 'Fixed staging HTTPS redirect');
  check(/noindex/.test(stageRedirect.headers['x-robots-tag']), 'HTTP redirect retains noindex');
  for (const [port, secure] of [[stageHttp, false], [stageHttps, true], [prodHttp, false], [prodHttps, true]]) {
    const bad = await request(port, 'attacker.invalid', '/en', secure);
    check(bad.status === 421 && !bad.headers.location, 'Unknown Host rejected without redirect');
  }
  const spoofed = await request(stageHttps, 'staging.example.test', '/en', true, {
    'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-For': '203.0.113.99',
    'CF-Connecting-IP': '203.0.113.98',
  });
  const reflected = JSON.parse(spoofed.body);
  check(reflected.name === 'staging', 'Staging uses isolated upstream');
  check(reflected.headers.host === 'staging.example.test', 'Fixed upstream Host');
  check(!reflected.headers['x-forwarded-host'], 'Untrusted forwarded host removed');
  check(reflected.headers['x-forwarded-for'] === '127.0.0.1', 'Forged visitor IP ignored');
  for (const route of ['/images/ASP-Licence.jpg', '/images/asp-licence.jpg',
    '/images/Eastel-logo-white-100x100.png', '/images/eastel-logo-dark1.svg']) {
    const res = await request(stageHttps, 'staging.example.test', `${route}?legacy=1`);
    check(res.status === 200, `${route}: legacy image reaches Next`);
    const upstream = JSON.parse(res.body);
    check(upstream.name === 'staging' && upstream.url === `${route}?legacy=1`, `${route}: URI/query retained`);
    check(upstream.headers.host === 'staging.example.test', `${route}: trusted upstream Host retained`);
    check(/noindex/.test(res.headers['x-robots-tag']) && /no-store/.test(res.headers['cache-control']), `${route}: staging policy retained`);
  }
  const publicProd = await request(prodHttps, 'eastel.site');
  check(publicProd.status === 200 && JSON.parse(publicProd.body).name === 'production',
    'Production uses independent upstream');
  check(!publicProd.headers['x-robots-tag'], 'Production public response has no global noindex');
  check(/public, max-age=300/.test(publicProd.headers['cache-control']), 'Public cache headers retained');
  check(/RSC/.test(publicProd.headers.vary), 'Next.js RSC Vary retained');
  for (const route of ['/api/orders/track', '/hs/login', '/en/account/login',
    '/ms/account/orders', '/zh/thankyou?token=fixture', '/payment/success']) {
    const res = await request(prodHttps, 'eastel.site', route);
    check(/no-store/.test(res.headers['cache-control']), `${route}: production private no-store`);
    check(/noindex/.test(res.headers['x-robots-tag']), `${route}: app private noindex retained`);
  }
  const www = await request(prodHttps, 'www.eastel.site', '/zh/plans?q=1');
  check(www.status === 308 && www.headers.location === 'https://eastel.site/zh/plans?q=1',
    'www redirects to fixed production apex with path/query');
  console.log(`PASS: Nginx syntax and ${assertions} isolation/cache/Host/header checks (local fixtures only).`);
} finally {
  for (const child of children) {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
  }
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await rm(scratch, { recursive: true, force: true });
}

// The browser preview (dist/) in headless Chrome with a fake client site.
// Everything is answered inside Chrome (DevTools Fetch interception) at
// https://preview.test/ — the app at /, the "client site" at /site/.
// Nothing leaves the machine. No packages: DevTools protocol over Node's WebSocket.
//
//   npm run build:web && node --test tests/page.test.mjs
//   SHOTS=1 node --test tests/page.test.mjs     (also writes shots/)

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, TYPES, useChrome } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');
const ORIGIN = 'https://preview.test';
const PARAMS = new URLSearchParams({
  site: ORIGIN + '/site/',
  name: "Joe's Pizza",
  tabs: 'Home:home:/site/,Menu:grid:/site/menu/,Call:phone:call,Share:share:share',
  phone: '+12125550123',
  email: 'hello@joes-pizza.test',
  hide: '.site-header,#cookie-bar',
});
const APP = `${ORIGIN}/?${PARAMS}`;

// ---------- the fake client site ----------
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;margin:0;color:#222;background:#fff}
.site-header{background:#b91c1c;color:#fff;padding:18px}main{padding:20px}#cookie-bar{position:fixed;bottom:0;left:0;right:0;background:#333;color:#fff;padding:12px}
a{color:#b91c1c;display:block;padding:8px 0}</style></head><body>
<header class="site-header">JOE'S PIZZA — full site menu</header>
<main><h1 id="h">${title}</h1>${body}</main><div id="cookie-bar">We use cookies</div></body></html>`;
const SITE = {
  '/site/': page('Fresh pizza in Brooklyn', `<p>Wood-fired since 1998.</p>
    <a id="menu" href="/site/menu/">See the menu</a>
    <a id="insta" href="https://instagram.com/joespizza">Instagram</a>
    <a id="call" href="tel:+12125550123">Call us</a>
    <a id="pdf" href="/site/menu.pdf">Menu PDF</a>
    <a id="evil" href="weird-app://steal">Weird link</a>
    <a id="blank" target="_blank" href="https://yelp.com/biz/joes">Yelp</a>`),
  '/site/menu/': page('Menu', '<p>Margherita $14 · Pepperoni $16</p><a id="home" href="/site/">Home</a>'),
};

let offline = false;

const h = useChrome((url, reply, fail) => {
  if (url.origin !== ORIGIN) return fail('BlockedByClient');
  if (url.pathname.startsWith('/site/')) {
    if (offline) return fail('InternetDisconnected');
    const html = SITE[url.pathname];
    return html ? reply(html, 'text/html; charset=utf-8') : reply('<h1 id="h">Not found</h1>', 'text/html', 404);
  }
  const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = normalize(join(DIST, path));
  if (!file.startsWith(DIST) || !existsSync(file)) return reply('not found', 'text/plain', 404);
  return reply(readFileSync(file), TYPES[extname(file)] || 'application/octet-stream');
});
const { js, waitFor, q, FRAME, inFrame, tapAt, tap, shot } = h;
const frameReady = (path) => waitFor(`${FRAME}?.contentDocument?.readyState === 'complete' && ${FRAME}.contentWindow.location.pathname === ${JSON.stringify(path)} && ${FRAME}.contentDocument.getElementById('h')`);
const open = ({ url = APP, ...opts } = {}) => h.open(url, opts);

test.before(() => assert.ok(existsSync(join(DIST, 'index.html')), 'run npm run build:web first'));
test.beforeEach(() => { offline = false; });

test('site loads in the frame, own header and cookie bar hidden, Home tab selected', async () => {
  await open();
  await frameReady('/site/');
  assert.equal(await inFrame(`d.documentElement.classList.contains('in-app')`), true);
  assert.equal(await inFrame(`getComputedStyle(d.querySelector('.site-header')).display`), 'none');
  assert.equal(await inFrame(`getComputedStyle(d.getElementById('cookie-bar')).display`), 'none');
  assert.equal(await js(`${q('tab-0')}.getAttribute('aria-selected')`), 'true');
  assert.equal(await js(`${q('tab-1')}.getAttribute('aria-selected')`), 'false');
  assert.equal(await js(`document.querySelector('[role="tablist"]') !== null`), true);
  await waitFor(`!${q('progress')}`);
  assert.equal(await js(`!!${q('offline')}`), false);
  await shot('01-home-light.png');
  assert.deepEqual(h.problems, []);
});

test('tabs navigate inside the app and follow in-page links', async () => {
  await open();
  await frameReady('/site/');
  await tap('tab-1');
  await frameReady('/site/menu/');
  await waitFor(`${q('tab-1')}.getAttribute('aria-selected') === 'true'`);
  // a link inside the page back home: stays inside, Home tab lights up
  await inFrame(`d.getElementById('home').click()`);
  await frameReady('/site/');
  await waitFor(`${q('tab-0')}.getAttribute('aria-selected') === 'true'`);
  // a link inside the page to the menu
  await inFrame(`d.getElementById('menu').click()`);
  await frameReady('/site/menu/');
  await waitFor(`${q('tab-1')}.getAttribute('aria-selected') === 'true'`);
  assert.deepEqual(h.problems, []);
});

test('other sites, phone links and files leave the app; weird schemes are dropped', async () => {
  await open();
  await frameReady('/site/');
  for (const idn of ['insta', 'call', 'pdf', 'evil', 'blank']) await inFrame(`d.getElementById('${idn}').click()`);
  await sleep(200);
  assert.equal(await inFrame('d.location.pathname'), '/site/', 'the frame did not navigate');
  const opened = await js('window.__opened');
  assert.ok(opened.some((u) => u.startsWith('https://instagram.com/joespizza')), JSON.stringify(opened));
  assert.ok(opened.some((u) => u.startsWith('tel:+12125550123')), JSON.stringify(opened));
  assert.ok(opened.some((u) => u.endsWith('/site/menu.pdf')), JSON.stringify(opened));
  assert.ok(opened.some((u) => u.startsWith('https://yelp.com/')), JSON.stringify(opened));
  assert.ok(!opened.some((u) => u.startsWith('weird-app:')), JSON.stringify(opened));
});

test('call tab dials, share tab does not crash', async () => {
  await open();
  await frameReady('/site/');
  await tap('tab-2');
  assert.ok((await js('window.__opened')).includes('tel:+12125550123'));
  await tap('tab-3');
  await sleep(200);
  assert.deepEqual(h.problems.filter((x) => !/share/i.test(x)), []);
});

test('offline: contacts screen, retry brings the site back', async () => {
  offline = true;
  await open();
  await waitFor(q('offline'));
  const t = await js(`${q('offline')}.innerText`);
  assert.match(t, /No connection/);
  assert.match(t, /\+12125550123/);
  assert.match(t, /hello@joes-pizza\.test/);
  await shot('03-offline-light.png');
  // the phone number works without internet
  await tapAt(`[...document.querySelectorAll('[role="link"]')].find((e) => e.innerText.includes('+1212'))`, 'call');
  assert.ok((await js('window.__opened')).includes('tel:+12125550123'));
  offline = false;
  await tap('retry');
  await waitFor(`!${q('offline')}`);
  await frameReady('/site/');
});

test('offline tab press: reloads that page once back online', async () => {
  offline = true;
  await open();
  await waitFor(q('offline'));
  offline = false;
  await tap('tab-1');
  await waitFor(`!${q('offline')}`);
  await frameReady('/site/menu/');
});

test('dark theme and a wide screen render without errors', async () => {
  await open({ dark: true });
  await frameReady('/site/');
  const bar = await js(`getComputedStyle(document.querySelector('[role="tablist"]')).backgroundColor`);
  assert.equal(bar, 'rgb(23, 32, 31)');
  await shot('02-home-dark.png');
  offline = true;
  await open({ dark: true });
  await waitFor(q('offline'));
  await shot('04-offline-dark.png');
  offline = false;
  await open({ width: 1024, height: 768 });
  await frameReady('/site/');
  assert.deepEqual(h.problems, []);
});

test('touch targets: tabs and buttons are at least 44 px', async () => {
  offline = true;
  await open();
  await waitFor(q('offline'));
  const small = await js(`[...document.querySelectorAll('[role="tab"],[role="button"],[role="link"]')]
    .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && (b.height < 44 || b.width < 44)).length`);
  assert.equal(small, 0);
});

test('preview accepts https sites only (no data:/http pages under our address)', async () => {
  for (const bad of ['data:text/html,<h1>fake bank</h1>', 'http://preview.test/site/', 'javascript:alert(1)']) {
    await open({ url: `${ORIGIN}/?site=${encodeURIComponent(bad)}&name=Bank&tabs=Home:home:/,Pay:cart:/pay` });
    const labels = await js(`[...document.querySelector('[role="tablist"]').children].map((e) => e.getAttribute('aria-label')).join(',')`);
    assert.equal(labels, 'Home,Work,Audit,Share', bad); // the kit's own config, not the link's
  }
});

test('top strip takes the site header colour', async () => {
  await open({ url: APP + '&top=%23B91C1C' });
  await frameReady('/site/');
  const bg = await js(`getComputedStyle(${q('tab-0')}.closest('[role="tablist"]').parentElement).backgroundColor`);
  assert.equal(bg, 'rgb(185, 28, 28)');
});

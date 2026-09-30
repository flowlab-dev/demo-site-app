// The PUBLIC demo build (dist-demo/) as it will live at
// https://flowlab-dev.github.io/demo/site-app/ — served here from disk, nothing leaves the machine.
//   npm run build:demo && node --test tests/demo.test.mjs      (SHOTS=1 — screenshots for the portfolio)

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, TYPES, useChrome } from './harness.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-demo');
const ORIGIN = 'https://flowlab-dev.github.io';
const BASE = '/demo/site-app/';
const APP = ORIGIN + BASE;
let offline = false;

const h = useChrome((url, reply, fail) => {
  if (url.origin !== ORIGIN || !url.pathname.startsWith(BASE)) return fail('BlockedByClient');
  if (offline && url.pathname.startsWith(BASE + 'site/')) return fail('InternetDisconnected');
  let path = url.pathname.slice(BASE.length) || 'index.html';
  let file = normalize(join(DIST, path));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(DIST) || !existsSync(file)) return reply('not found', 'text/plain', 404);
  return reply(readFileSync(file), TYPES[extname(file)] || 'application/octet-stream');
});
const { js, waitFor, q, FRAME, inFrame, tap, shot } = h;
const frameAt = (path) => waitFor(`${FRAME}?.contentDocument?.readyState === 'complete' && ${FRAME}.contentWindow.location.pathname === ${JSON.stringify(BASE + path)} && ${FRAME}.contentDocument.querySelector('h1')`);
const tabs = () => js(`[...document.querySelector('[role="tablist"]').children].map((e) => e.getAttribute('aria-label')).join(',')`);

test.before(() => assert.ok(existsSync(join(DIST, 'index.html')), 'run npm run build:demo first'));
test.beforeEach(() => { offline = false; });

test('built for the sub-folder: title, noindex, assets under /demo/site-app/, bakery + PDF inside', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  assert.match(html, /<title>Your website as a real app - demo by Flow Lab<\/title>/);
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /src="\/demo\/site-app\/expo\//);
  assert.ok(!existsSync(join(DIST, '_expo')) && !html.includes('_expo'), 'GitHub Pages does not serve _folders');
  for (const f of ['site/index.html', 'site/menu/index.html', 'site/visit/index.html', 'site/style.css', 'site/menu.pdf']) assert.ok(existsSync(join(DIST, f)), f);
  assert.match(readFileSync(join(DIST, 'site/menu.pdf'), 'latin1'), /^%PDF-1\.4[\s\S]*%%EOF\n$/);
  for (const f of ['site/index.html', 'site/menu/index.html', 'site/visit/index.html']) assert.match(readFileSync(join(DIST, f), 'utf8'), /fictional bakery/);
});

test('phone: the bakery in the app, own header/footer hidden, tabs switch pages', async () => {
  await h.open(APP);
  await frameAt('site/');
  assert.equal(await tabs(), 'Home,Menu,Visit,Call');
  assert.equal(await inFrame(`getComputedStyle(d.querySelector('body > header')).display`), 'none');
  assert.equal(await inFrame(`getComputedStyle(d.querySelector('body > footer')).display`), 'none');
  assert.equal(await js(`!!${q('demo-phone')}`), false, 'no desktop frame on a phone');
  await shot('demo-01-phone-home.png');
  await tap('tab-1');
  await frameAt('site/menu/');
  await waitFor(`${q('tab-1')}.getAttribute('aria-selected') === 'true'`);
  await shot('demo-02-phone-menu.png');
  await inFrame(`[...d.querySelectorAll('a')].find((a) => a.textContent === 'PDF').click()`);
  await tap('tab-2');
  await frameAt('site/visit/');
  await inFrame(`[...d.querySelectorAll('a')].find((a) => a.textContent === 'Open in Maps').click()`);
  await tap('tab-3');
  await sleep(150);
  const opened = await js('window.__opened');
  assert.ok(opened.some((u) => u.endsWith('/demo/site-app/site/menu.pdf')), JSON.stringify(opened));
  assert.ok(opened.some((u) => u.startsWith('https://maps.apple.com/')), JSON.stringify(opened));
  assert.ok(opened.includes('tel:+12075550188'), JSON.stringify(opened));
  assert.equal(await inFrame('d.location.pathname'), BASE + 'site/visit/');
  assert.deepEqual(h.problems, []);
});

test('the address bar cannot put another site into the public demo', async () => {
  await h.open(APP + '?site=' + encodeURIComponent('https://evil.example/') + '&name=Bank&tabs=Pay:cart:/pay');
  await frameAt('site/');
  assert.equal(await tabs(), 'Home,Menu,Visit,Call');
  assert.equal(await js(`${FRAME}.contentWindow.location.origin`), ORIGIN);
});

test('computer: phone frame, explanation, and the button that shows the offline screen', async () => {
  await h.open(APP, { width: 1440, height: 900 });
  await frameAt('site/');
  assert.equal(await js(`!!${q('demo-phone')}`), true);
  assert.match(await js('document.body.innerText'), /Your website, as a real app/);
  assert.match(await js('document.body.innerText'), /fictional/);
  await shot('demo-03-desktop.png');
  await tap('demo-offline');
  await waitFor(q('offline'));
  const t = await js(`${q('offline')}.innerText`);
  assert.match(t, /No connection/);
  assert.match(t, /\+12075550188/);
  await shot('demo-04-desktop-offline.png');
  await tap('retry');
  await waitFor(`!${q('offline')}`);
  await frameAt('site/');
  await h.open(APP, { width: 1440, height: 900, dark: true });
  await frameAt('site/');
  await shot('demo-05-desktop-dark.png');
  assert.deepEqual(h.problems, []);
});

test('real offline on a phone: contacts screen, then back', async () => {
  offline = true;
  await h.open(APP);
  await waitFor(q('offline'));
  await shot('demo-06-phone-offline.png');
  offline = false;
  await tap('retry');
  await waitFor(`!${q('offline')}`);
  await frameAt('site/');
});

test('sample first-stage report: EN and RU pages with the app screenshots, facts from the real check', async () => {
  for (const [path, words] of [['report/', ['ready to become an app', 'Privacy Policy page', 'Home · Menu · Visit · Call', '12 testers', 'fictional']], ['report/ru/', ['готов стать приложением', 'политика конфиденциальности', 'Главная', '12 тестировщиков', 'вымышленная']]]) {
    await h.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    h.problems = [];
    await h.send('Page.navigate', { url: APP + path });
    await waitFor(`document.readyState === 'complete' && document.querySelectorAll('figure img').length === 3 && [...document.images].every((i) => i.complete && i.naturalWidth > 0)`);
    const text = await js('document.body.innerText');
    for (const w of words) assert.ok(text.toLowerCase().includes(w.toLowerCase()), `${path}: "${w}"`);
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'no sideways scroll on a phone');
    await shot(`demo-07-report-${path.includes('ru') ? 'ru' : 'en'}.png`);
    assert.deepEqual(h.problems, []);
  }
});

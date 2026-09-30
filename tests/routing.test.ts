//   node --test tests/routing.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTab, deepLinkTarget, hostAllowed, httpsTwin, intentFallback, routeFor, tabUrl } from '../src/logic/routing.ts';
import { injectedScript, retryDelayMs } from '../src/logic/inject.ts';
import type { SiteConfig } from '../src/site.config.ts';

const cfg = {
  startUrl: 'https://joes-pizza.test/',
  allowedHosts: ['joes-pizza.test', 'order.joes-pizza.test'],
  flowHosts: ['www.paypal.com', '*.stripe.com', 'shop.app'],
  externalExtensions: ['pdf', 'zip'],
  tabs: [
    { title: 'Home', icon: 'home', kind: 'page', path: '/' },
    { title: 'Menu', icon: 'grid', kind: 'page', path: '/menu' },
    { title: 'Specials', icon: 'tag', kind: 'page', path: '/menu/specials/' },
    { title: 'Call', icon: 'phone', kind: 'call' },
  ],
} satisfies Pick<SiteConfig, 'startUrl' | 'allowedHosts' | 'flowHosts' | 'externalExtensions' | 'tabs'>;

test('own pages stay inside', () => {
  for (const u of ['https://joes-pizza.test/', 'https://www.joes-pizza.test/menu?x=1#top', 'https://order.joes-pizza.test/cart', 'https://JOES-PIZZA.TEST./about'])
    assert.equal(routeFor(u, cfg), 'inside', u);
});

test('other sites open in the browser', () => {
  for (const u of ['https://instagram.com/joes', 'https://evil-joes-pizza.test/', 'https://joes-pizza.test.evil.io/', 'https://sub.order.joes-pizza.test/'])
    assert.equal(routeFor(u, cfg), 'browser', u);
});

test('payment and booking steps of the site stay inside', () => {
  for (const u of ['https://www.paypal.com/checkoutnow?token=1', 'https://checkout.stripe.com/c/pay/cs_1', 'https://hooks.stripe.com/3d_secure', 'https://shop.app/pay'])
    assert.equal(routeFor(u, cfg), 'inside', u);
  for (const u of ['https://stripe.com/', 'https://evilstripe.com/', 'https://paypal.com.evil.io/', 'http://www.paypal.com/'])
    assert.equal(routeFor(u, cfg), 'browser', u);
  assert.ok(hostAllowed('a.b.stripe.com', ['*.stripe.com']));
  assert.ok(!hostAllowed('stripe.com', ['*.stripe.com']));
});

test('old http links of the site go to their https page; files go to the browser', () => {
  assert.equal(routeFor('http://joes-pizza.test/menu', cfg), 'upgrade');
  assert.equal(routeFor('http://www.joes-pizza.test/menu', cfg), 'upgrade');
  assert.equal(httpsTwin('HTTP://joes-pizza.test/a?b=1'), 'https://joes-pizza.test/a?b=1');
  assert.equal(routeFor('https://joes-pizza.test/menu.PDF', cfg), 'browser');
  assert.equal(routeFor('https://joes-pizza.test/files/menu.zip?v=2', cfg), 'browser');
  assert.equal(routeFor('https://joes-pizza.test/menu.pdf.html', cfg), 'inside');
  assert.equal(routeFor('https://joes-pizza.test/.pdf', cfg), 'inside'); // dot-file, not an extension
});

test('phone actions go to the system', () => {
  for (const u of ['tel:+12125550123', 'mailto:joe@joes-pizza.test', 'sms:+12125550123', 'https://maps.apple.com/?q=Joes', 'https://www.google.com/maps/place/Joes', 'https://maps.app.goo.gl/abc', 'https://wa.me/12125550123', 'https://t.me/joes', 'https://apps.apple.com/app/id1', 'market://details?id=com.joes', 'itms-apps://apps.apple.com/app/id1', 'comgooglemaps://?q=Joes'])
    assert.equal(routeFor(u, cfg), 'system', u);
  assert.equal(routeFor('https://www.google.com/search?q=maps', cfg), 'browser');
  assert.equal(routeFor('https://www.google.com/mapsfake', cfg), 'browser');
});

test('dangerous or unknown schemes are blocked', () => {
  for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'intent://scan/#Intent;scheme=zxing;end', 'weird-app://open', 'not a url', 'blob:https://joes-pizza.test/1', 'about:blank'])
    assert.equal(routeFor(u, cfg), 'block', u);
});

test('intent links: only their https fallback is used', () => {
  assert.equal(intentFallback('intent://open#Intent;scheme=joes;package=com.joes;S.browser_fallback_url=https%3A%2F%2Fjoes-pizza.test%2Fapp;end'), 'https://joes-pizza.test/app');
  assert.equal(intentFallback('intent://open#Intent;S.browser_fallback_url=javascript%3Aalert(1);end'), null);
  assert.equal(intentFallback('intent://open#Intent;scheme=x;end'), null);
  assert.equal(intentFallback('https://x.com/;S.browser_fallback_url=https%3A%2F%2Fa.com'), null);
});

test('hostAllowed: exact host, www twin, nothing else', () => {
  assert.ok(hostAllowed('www.joes-pizza.test', ['joes-pizza.test']));
  assert.ok(hostAllowed('joes-pizza.test', ['www.joes-pizza.test']));
  assert.ok(!hostAllowed('shop.joes-pizza.test', ['joes-pizza.test']));
  assert.ok(!hostAllowed('xjoes-pizza.test', ['joes-pizza.test']));
});

test('tab urls', () => {
  assert.equal(tabUrl(cfg, cfg.tabs[1]), 'https://joes-pizza.test/menu');
  assert.equal(tabUrl({ startUrl: 'https://a.com/app/' }, { title: 'x', icon: 'home', kind: 'page', path: '/deals' }), 'https://a.com/deals');
});

test('active tab: longest matching path, home only as fallback', () => {
  assert.equal(activeTab(cfg, 'https://joes-pizza.test/'), 0);
  assert.equal(activeTab(cfg, 'https://joes-pizza.test/about'), 0);
  assert.equal(activeTab(cfg, 'https://joes-pizza.test/menu'), 1);
  assert.equal(activeTab(cfg, 'https://joes-pizza.test/menu/pizza/margherita'), 1);
  assert.equal(activeTab(cfg, 'https://joes-pizza.test/menu/specials'), 2);
  assert.equal(activeTab(cfg, 'https://joes-pizza.test/menus'), 0); // /menus is not /menu
  assert.equal(activeTab(cfg, 'https://other.com/menu'), -1);
  assert.equal(activeTab(cfg, 'garbage'), -1);
});

test('deep links', () => {
  assert.equal(deepLinkTarget(cfg, 'joespizza://menu/specials?ref=push'), 'https://joes-pizza.test/menu/specials?ref=push');
  assert.equal(deepLinkTarget(cfg, 'joespizza://'), 'https://joes-pizza.test/');
  assert.equal(deepLinkTarget(cfg, 'joespizza:///menu'), 'https://joes-pizza.test/menu');
  assert.equal(deepLinkTarget(cfg, 'https://www.joes-pizza.test/menu#x'), 'https://www.joes-pizza.test/menu#x');
  assert.equal(deepLinkTarget(cfg, 'https://evil.com/menu'), null);
  assert.equal(deepLinkTarget(cfg, 'http://joes-pizza.test/menu'), null);
  // never another host, whatever the link looks like
  for (const l of ['joespizza:/\\evil.com/x', 'joespizza://evil.com@x/..//y', 'joespizza:////evil.com/steal', 'joespizza:\\\\evil.com', 'joespizza://%2F%2Fevil.com/'])
    { const t = deepLinkTarget(cfg, l); assert.ok(t === null || new URL(t).hostname === 'joes-pizza.test', l + ' → ' + t); }
  const odd = deepLinkTarget(cfg, 'joespizza:////evil.com/steal');
  assert.ok(odd === null || new URL(odd).hostname === 'joes-pizza.test', String(odd));
});

test('injected script: selectors are data, not code', () => {
  const js = injectedScript({ hideSelectors: ['header.site', '.cookie-bar', `a[title="x\\"); alert(1); //"]`] });
  assert.ok(js.includes('in-app'));
  assert.ok(js.trim().endsWith('true;'));
  // runs in a fake page without throwing and without executing the payload
  const added: string[] = [];
  let alerted = false;
  const doc = {
    documentElement: { classList: { add: (c: string) => added.push(c) }, appendChild: () => {} },
    head: { appendChild: (el: { textContent: string }) => added.push(el.textContent) },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '' }),
    addEventListener: () => {},
  };
  new Function('document', 'alert', js)(doc, () => { alerted = true; });
  assert.equal(alerted, false);
  assert.equal(added[0], 'in-app');
  assert.match(added[1], /\.cookie-bar/);
  assert.equal(injectedScript({ hideSelectors: [] }).includes('display: none'), false);
});

test('retry delays grow and cap at 30 s', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(retryDelayMs), [2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

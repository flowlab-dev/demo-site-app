// tools/check-site.mjs on fixed pages — no network.
//   node --test tests/check-site.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import * as tool from '../tools/check-site.mjs';
import * as snap from '../tools/snapshot.mjs';
import { checkConfig } from '../src/logic/config-check.ts';
import { site } from '../src/site.config.ts';

// the tool is plain JS; its report is loosely typed on purpose
const analyse = tool.analyse as (html: string, url: string, headers: Record<string, string>) => any;
const previewLink = tool.previewLink as (r: unknown, base?: string) => string;

const PIZZA = `<!doctype html><html><head><title>Joe's Pizza | Brooklyn</title><script>fbq('init','1')</script>
<meta name="viewport" content="width=device-width"><meta name="theme-color" content="#b91c1c">
<link rel="apple-touch-icon" href="/icon-180.png"><script src="https://cdn.shopify.com/s/x.js"></script></head>
<body>
<header><nav><a href="/">Home</a><a href="/menu">Our Menu</a><a href="/locations">Find us</a><a href="/catering">Catering</a>
<a href="https://instagram.com/joes">IG</a><a href="#top">Top</a><a href="/account/login">Sign in</a></nav></header>
<main><a href="tel:+1 (212) 555-0123">Call</a><a href="mailto:hi@joes-pizza.test?subject=x">Mail</a><button>Add to cart</button></main>
<div class="cookie-banner">cookies</div><footer>©</footer>
<script src="https://www.paypal.com/sdk/js?client-id=x"></script><form><input type="file"></form></body></html>`;

test('pizza shop: tabs from the menu, call tab, contacts, colours, hide list', () => {
  const r = analyse(PIZZA, 'https://www.joes-pizza.test/', {});
  assert.equal(r.platform, 'Shopify');
  assert.equal(r.phone, '+12125550123');
  assert.equal(r.email, 'hi@joes-pizza.test');
  assert.equal(r.icon, 'https://www.joes-pizza.test/icon-180.png');
  assert.deepEqual(r.tabs.map((t: { title: string; icon: string }) => `${t.title}:${t.icon}`), ['Home:home', 'Our Menu:grid', 'Find us:pin', 'Call:phone']);
  assert.deepEqual(r.hide, ['body > header', 'header[role="banner"]', '.site-header', 'body > footer', 'footer[role="contentinfo"]', '.site-footer']);
  assert.ok(r.notes.some((n: string) => /cookie-consent banner: NOT hidden/.test(n)));
  assert.deepEqual(r.config.flowHosts, ['www.paypal.com', 'shop.app', 'pay.shopify.com', 'checkout.shopify.com']);
  assert.ok(r.notes.some((n: string) => /NSCameraUsageDescription/.test(n)));
  assert.ok(r.notes.some((n: string) => /Meta Pixel/.test(n)));
  assert.equal(r.config.topBar, '#B91C1C');
  assert.equal(r.config.geolocation, false);
  assert.equal(r.config.accent, '#B91C1C');
  assert.equal(r.config.appName, "Joe's Pizza");
  assert.ok(r.notes.some((n: string) => /menu has 5 items/.test(n)), r.notes.join('\n'));
  assert.ok(r.notes.some((n: string) => /5\.1\.1/.test(n)), 'login → account deletion note');
  assert.ok(r.notes.some((n: string) => /physical goods/.test(n)));
  assert.ok(!r.risks.some((x: string) => /3\.1\.1/.test(x)));
  // the draft becomes a valid config after merging
  assert.deepEqual(checkConfig({ ...site, ...r.config }), []);
});

test('desktop-only http site with digital memberships: red flags', () => {
  const html = `<html><head><title>Yoga Online</title></head><body><nav><a href="/classes">Classes</a></nav>
    <p>Join our membership to unlock premium content</p><input type="password"></body></html>`;
  const r = analyse(html, 'http://yoga.example/', { 'x-frame-options': 'SAMEORIGIN' });
  assert.ok(r.risks.some((x: string) => /no https/.test(x)));
  assert.ok(r.risks.some((x: string) => /no mobile viewport/.test(x)));
  assert.ok(r.risks.some((x: string) => /3\.1\.1/.test(x)));
  assert.equal(r.flowHosts.length, 0);
  assert.equal(r.framable, false);
  assert.ok(r.notes.some((n: string) => /no phone\/email/.test(n)));
  assert.deepEqual(r.tabs.map((t: { path?: string }) => t.path), ['/', '/classes']);
});

test('one-page site that only mentions WooCommerce: anchors flagged, not a shop', () => {
  const html = `<html><head><meta name="viewport" content="width=device-width"><title>Studio</title></head><body>
    <header><a href="/">Studio</a><a href="/#services">Services</a><a href="#work">Work</a><a href="/#contact">Contact</a></header>
    <p>We build WooCommerce and Shopify stores. Find the nearest studio.</p><a href="mailto:hi@studio.test">Mail</a>
    <div id="g_id_onload" data-client_id="x"></div></body></html>`;
  const r = analyse(html, 'https://studio.test/', {});
  assert.ok(r.risks.some((x: string) => /one-page site \(menu = 3/.test(x)), r.risks.join('\n'));
  assert.ok(!r.notes.some((n: string) => /physical goods/.test(n)));
  assert.ok(r.risks.some((x: string) => /Sign in with Google/.test(x)));
  assert.equal(r.config.geolocation, true);
  assert.deepEqual(r.tabs.map((t: { kind: string }) => t.kind), ['page', 'share']);
  assert.deepEqual(checkConfig({ ...site, ...r.config }), []);
});

test('preview link round-trips the draft', () => {
  const r = analyse(PIZZA, 'https://www.joes-pizza.test/', {});
  const u = new URL(previewLink(r, 'https://preview.test/'));
  assert.equal(u.searchParams.get('site'), 'https://www.joes-pizza.test/');
  assert.equal(u.searchParams.get('tabs'), 'Home:home:/,Our Menu:grid:/menu,Find us:pin:/locations,Call:phone:call');
  assert.equal(u.searchParams.get('phone'), '+12125550123');
});

test('snapshot: frame bans removed only from the headers it must, CSP otherwise kept', () => {
  const unframe = snap.unframe as (h: { name: string; value: string }[]) => { name: string; value: string }[];
  const out = unframe([
    { name: 'X-Frame-Options', value: 'DENY' },
    { name: 'Content-Security-Policy', value: "default-src 'self'; frame-ancestors 'none'; img-src *" },
    { name: 'Content-Type', value: 'text/html' },
  ]);
  assert.deepEqual(out.map((h) => h.name), ['Content-Security-Policy', 'Content-Type']);
  assert.equal(out[0].value, "default-src 'self'; img-src *");
});

test('site in a sub-folder: home is the checked page\'s folder, logo link becomes Home, outside pages ignored', () => {
  const html = `<html><head><meta name="viewport" content="width=device-width"><title>Crumb</title></head><body>
    <header><a class="brand" href="./">Crumb &amp; Co</a><nav><a href="./">Home</a><a href="menu/">Menu</a><a href="visit/index.html">Visit</a><a href="/">Our agency</a></nav></header>
    <a href="tel:+12075550188">Call</a></body></html>`;
  const r = analyse(html, 'https://x.github.io/demo/app/site/', {});
  assert.equal(r.config.startUrl, 'https://x.github.io/demo/app/site/');
  assert.deepEqual(r.tabs.map((t: { title: string; path?: string }) => `${t.title}:${t.path ?? t.title}`), ['Home:/demo/app/site/', 'Menu:/demo/app/site/menu/', 'Visit:/demo/app/site/visit/', 'Call:Call']);
});

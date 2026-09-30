#!/usr/bin/env node
// 15-minute check of a client's site before we quote "turn my site into an app".
// Reads ONE public page (no login, no scripts run, no files saved) and prints:
//   · review risks (Apple 4.2 "repackaged website", 3.1.1 digital goods, Google Play webview rule)
//   · what the site gives us (menu → tabs, phone, email, icon, colours, platform)
//   · a draft `site` object for src/site.config.ts and a preview link.
//
//   node tools/check-site.mjs https://example.com
//   node tools/check-site.mjs https://example.com --json     (machine-readable)
//
// It never decides for us: the verdict lines are hints for the estimate form
// Read the page yourself too.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ICON_BY_WORD = [
  [/^(home|главная|start)$/i, 'home'],
  [/menu|меню|food|dishes|catalog|каталог|shop|store|products|товары|collection/i, 'grid'],
  [/cart|basket|корзин|order|заказ/i, 'cart'],
  [/book|reserv|appointment|schedule|calendar|запис|брон|events?|classes/i, 'calendar'],
  [/account|profile|login|sign in|кабинет|профиль|войти/i, 'user'],
  [/contact|контакт|call|звон/i, 'phone'],
  [/about|о нас|story|team|инфо/i, 'info'],
  [/chat|message|support|help|поддерж/i, 'chat'],
  [/deal|offer|special|sale|promo|акци|скидк|price|pricing|цены/i, 'tag'],
  [/location|find us|map|address|адрес|карта|stores/i, 'pin'],
  [/search|поиск/i, 'search'],
];

const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')) || []).slice(2).find((x) => x !== undefined);

export function analyse(html, pageUrl, headers = {}) {
  const base = new URL(pageUrl);
  const host = base.hostname.replace(/^www\./, '');
  const lower = html.toLowerCase();
  const out = { url: pageUrl, host, risks: [], notes: [], tabs: [], hide: [] };

  // --- platform
  const platforms = [
    ['Shopify', /cdn\.shopify\.com|shopify\.theme/], ['Wix', /static\.wixstatic\.com|wix-bolt|_wixcss/], ['Squarespace', /static1\.squarespace\.com|squarespace-cdn/],
    ['WordPress', /wp-content\/|wp-includes\//], ['Webflow', /webflow\.(js|css)|data-wf-page/], ['Tilda', /tildacdn|tilda-blocks/], ['GoDaddy', /img1\.wsimg\.com/],
  ];
  out.platform = (platforms.find(([, re]) => re.test(lower)) || ['unknown'])[0];

  // --- basics
  out.https = base.protocol === 'https:';
  if (!out.https) out.risks.push('🔴 no https — the app cannot load it (iOS App Transport Security); the site must get a certificate first');
  out.viewport = /<meta[^>]+name=["']?viewport/i.test(html);
  if (!out.viewport) out.risks.push('🔴 no mobile viewport — the site is desktop-only; inside the app it will look tiny. Mobile layout work first (+hours)');
  const xfo = String(headers['x-frame-options'] || '');
  const csp = String(headers['content-security-policy'] || '');
  out.framable = !/deny|sameorigin/i.test(xfo) && !/frame-ancestors\s+('none'|'self')/i.test(csp);
  if (!out.framable) out.notes.push('browser preview link will not show this site (it forbids framing) — the phone app is not affected; show screenshots instead');

  // --- contacts
  const tel = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1]).replace(/[^\d+]/g, ''));
  const mail = [...html.matchAll(/href=["']mailto:([^"'?]+)/gi)].map((m) => decodeURIComponent(m[1]));
  out.phone = tel.find((t) => t.startsWith('+')) || tel[0] || null;
  out.email = mail[0] || null;
  if (out.phone && !out.phone.startsWith('+')) out.notes.push(`phone ${out.phone} has no country code — ask the client for the international format`);
  if (!out.phone && !out.email) out.notes.push('no phone/email link on the page — ask the client which contact the offline screen should show');

  // --- look
  out.themeColor = attr((html.match(/<meta[^>]+name=["']?theme-color[^>]*>/i) || [''])[0], 'content') || null;
  const icon = (html.match(/<link[^>]+rel=["']?apple-touch-icon[^>]*>/i) || html.match(/<link[^>]+rel=["']?(shortcut )?icon[^>]*>/i) || [''])[0];
  out.icon = icon ? new URL(attr(icon, 'href') || '/', base).toString() : null;
  out.manifest = /<link[^>]+rel=["']?manifest/i.test(html);
  if (!out.icon || !/apple-touch-icon/i.test(icon)) out.notes.push('no 180px+ touch icon — ask for the logo as a square PNG/SVG (App Store icon is 1024×1024, no transparency)');

  // --- menu → tabs (links in <nav> or <header>, same host, short labels)
  const navHtml = [...html.matchAll(/<(nav|header)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]).join(' ') || html;
  // the site's home = the folder of the checked page (a site may live in a sub-folder)
  const home = base.pathname.replace(/[^/]*$/, '') || '/';
  out.home = home;
  const seen = new Set();
  for (const m of navHtml.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const href = attr(m[0], 'href');
    const label = strip(m[0]).slice(0, 40);
    if (!href || !label || label.length > 20 || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    let u; try { u = new URL(href, base); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== host) continue;
    const path = (u.pathname || '/').replace(/index\.html?$/i, '');
    if (!path.startsWith(home) || seen.has(path)) continue;   // pages outside the site's folder are not its tabs
    seen.add(path);
    if (path === home) { out.tabs.push({ title: 'Home', icon: 'home', kind: 'page', path }); continue; }   // logo link or "Home"
    const icon = (ICON_BY_WORD.find(([re]) => re.test(label)) || [null, 'info'])[1];
    out.tabs.push({ title: label.length > 12 ? label.split(' ')[0].slice(0, 12) : label, icon, kind: 'page', path });
  }
  const anchors = [...navHtml.matchAll(/<a\b[^>]*href=["']\/?#[^"']+["']/gi)].length;
  if (out.tabs.length < 2 && anchors >= 2) out.risks.push(`🟡 one-page site (menu = ${anchors} jumps inside one page): tabs have little to switch — 4.2 risk is higher; offer push/offline/booking as the native part or a couple of real pages`);
  out.tabs = [...out.tabs.filter((t) => t.path === home), ...out.tabs.filter((t) => t.path !== home)];   // Home first
  if (!out.tabs.some((t) => t.path === home)) out.tabs.unshift({ title: 'Home', icon: 'home', kind: 'page', path: home });
  out.menuSize = out.tabs.length;
  out.tabs = out.tabs.slice(0, out.phone ? 3 : 4);
  if (out.phone) out.tabs.push({ title: 'Call', icon: 'phone', kind: 'call' });
  if (out.tabs.length < 2) out.tabs.push({ title: 'Share', icon: 'share', kind: 'share' });
  if (out.menuSize > 4) out.notes.push(`the site menu has ${out.menuSize} items — tabs take the first ${out.tabs.filter((t) => t.kind === 'page').length}; choose with the client (the rest stay reachable in the pages)`);

  // --- what to hide inside the app: only the page-level header/footer (not <header> inside articles or cards)
  if (/<body\b[^>]*>\s*(<[^>]+>\s*)?<header\b/i.test(html) || /<header\b[^>]*(site-header|masthead|role=["']banner)/i.test(html)) out.hide.push('body > header', 'header[role="banner"]', '.site-header');
  if (/<footer\b/i.test(html)) out.hide.push('body > footer', 'footer[role="contentinfo"]', '.site-footer');
  if (out.hide.length) out.notes.push('hiding the site header/footer: check the Privacy Policy link, search and cart are still reachable in the app (a tab or a page)');
  if (/onetrust|cookiebot|cookie[-_]?(banner|notice|consent)|cmplz-cookiebanner|cookieyes/i.test(html)) out.notes.push('cookie-consent banner: NOT hidden (the client may need it by law, e.g. EU) — style it with html.in-app instead if it looks bad');

  // --- a public Privacy Policy page (both stores require its link)
  const priv = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((m) => m[0]).find((t) => /privacy|конфиденциальн/i.test(t));
  out.privacyUrl = priv ? new URL(attr(priv, 'href') || '/', base).toString() : null;
  if (!out.privacyUrl) out.notes.push('no Privacy Policy link found — both stores require a public Privacy Policy URL');

  // --- review risks by content
  const login = /type=["']?password/i.test(html) || /\b(log ?in|sign ?in|my account|войти|личный кабинет)\b/i.test(strip(navHtml));
  const shop = out.platform === 'Shopify' || /add[- ]to[- ]cart|plugins\/woocommerce|class=["'][^"']*woocommerce|href=["'][^"']*\/(cart|checkout)\b|в корзину/i.test(lower);
  const digital = /\b(membership|subscribe now|subscription plan|online course|premium content|unlock|e-?book|digital download|онлайн[- ]курс|подписк)/i.test(strip(html));
  if (digital) out.risks.push('🟡 sells digital content/subscriptions? Apple 3.1.1: unlocking content in the app needs In-App Purchase — hide those buttons in the app (or add IAP as a separate stage). Physical goods and services are fine');
  if (shop) out.notes.push('shop/checkout: physical goods — Apple allows the site checkout (Apple Pay not required); cart and login must survive app restarts (cookies are kept, checked on the device)');
  if (login) out.notes.push('login on the site: Apple 5.1.1(v) — if users can create an account in the app, the app must let them delete it; check the site has "delete account"');
  // payment / sign-in flows that leave the site's host
  const flows = [];
  if (/paypal\.com|paypalobjects/i.test(lower)) flows.push('www.paypal.com');
  if (/js\.stripe\.com|checkout\.stripe\.com|buy\.stripe\.com/i.test(lower)) flows.push('*.stripe.com');
  if (out.platform === 'Shopify') flows.push('shop.app', 'pay.shopify.com', 'checkout.shopify.com');
  if (/calendly\.com/i.test(lower)) flows.push('*.calendly.com');
  if (/squareup\.com|square\.site/i.test(lower)) flows.push('*.squareup.com');
  out.flowHosts = [...new Set(flows)];
  if (out.flowHosts.length) out.notes.push(`payment/booking on other hosts (${out.flowHosts.join(', ')}) — kept inside the app via flowHosts; test a real checkout on the device (3-D Secure bank pages arrive as form posts)`);
  if (/accounts\.google\.com|gsi\/client|g_id_onload|sign in with google/i.test(lower)) out.risks.push('🟡 "Sign in with Google": Google blocks it inside app web views (disallowed_useragent) and Apple 4.8 then asks for Sign in with Apple too — hide it in the app or plan native sign-in');
  if (/connect\.facebook\.net[^"']*sdk|fb:login-button|continue with facebook/i.test(lower)) out.risks.push('🟡 Facebook login on the site: Apple 4.8 — offer Sign in with Apple as well, or hide it in the app');
  Object.assign(out, { login, shop, digital, upload: /type=["']?file/i.test(html), googleSignIn: /accounts\.google\.com|gsi\/client|g_id_onload|sign in with google/i.test(lower) });
  if (/type=["']?file/i.test(html)) out.notes.push('file/photo upload form: camera/photos texts are in app.json (NSCameraUsageDescription…) — put the client\'s app name in them');
  out.geolocation = /navigator\.geolocation|near me|find (the )?nearest|use my location/i.test(html);
  if (out.geolocation) out.notes.push('the site asks for location: set geolocation: true and add NSLocationWhenInUseUsageDescription to app.json');
  const trackers = [['Meta Pixel', /connect\.facebook\.net\/[^"']*fbevents|fbq\(/i], ['Google Ads', /googleadservices|gtag\([^)]*['"]AW-/i], ['Google Analytics', /googletagmanager\.com|google-analytics\.com/i], ['TikTok Pixel', /analytics\.tiktok\.com/i]]
    .filter(([, re]) => re.test(html)).map(([n]) => n);
  out.trackers = trackers;
  if (trackers.length) out.notes.push(`trackers on the site: ${trackers.join(', ')} — fill App Privacy (Apple) and Data safety (Google) honestly; ad pixels that track across apps/sites need the ATT prompt or must be off in the app (html.in-app / user agent tag)`);
  out.risks.push('🟡 Apple 4.2 "repackaged website": we ship native tabs, offline screen with contacts, push (if the client sends news/offers), share, deep links — say in App Review notes what is native');
  out.notes.push('Google Play spam policy: webview of a site only with the owner\'s permission — the client must be the site owner (or have written permission)');

  out.config = {
    appName: strip((html.match(/<title>([\s\S]*?)<\/title>/i) || ['', host])[1]).split(/[|–—-]/)[0].trim().slice(0, 30) || host,
    startUrl: base.origin + home,
    allowedHosts: [base.hostname],
    tabs: out.tabs,
    flowHosts: out.flowHosts,
    accent: /^#[0-9a-f]{6}$/i.test(out.themeColor || '') ? out.themeColor.toUpperCase() : '#0F766E',
    topBar: /^#[0-9a-f]{6}$/i.test(out.themeColor || '') ? out.themeColor.toUpperCase() : '#FFFFFF',
    // most sites have no dark theme — then the strip stays the same in dark mode
    topBarDark: /^#[0-9a-f]{6}$/i.test(out.themeColor || '') ? out.themeColor.toUpperCase() : '#FFFFFF',
    geolocation: out.geolocation,
    hideSelectors: out.hide,
    contact: { ...(out.phone?.startsWith('+') ? { phone: out.phone } : {}), ...(out.email ? { email: out.email } : {}) },
  };
  return out;
}

export function previewLink(r, previewBase = 'https://flowlab-dev.github.io/demo/site-app/') {
  const q = new URLSearchParams({
    site: r.config.startUrl,
    name: r.config.appName,
    tabs: r.config.tabs.map((t) => `${t.title.replace(/[,:]/g, ' ')}:${t.icon}:${t.kind === 'page' ? t.path : t.kind}`).join(','),
    ...(r.config.contact.phone ? { phone: r.config.contact.phone } : {}),
    ...(r.config.contact.email ? { email: r.config.contact.email } : {}),
    ...(r.hide.length ? { hide: r.hide.join(',') } : {}),
    top: r.config.topBar,
  });
  return previewBase + '?' + q;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.log('usage: node tools/check-site.mjs https://site.com [--json]'); process.exit(2); }
  const url = /^https?:\/\//.test(arg) ? arg : 'https://' + arg;
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  } catch (e) {
    console.log(`❌ cannot open ${url}: ${e.cause?.code || e.message}. Some US sites block foreign visitors — check from the US (check-host.net) before telling the client the site is down.`);
    process.exit(1);
  }
  const html = await res.text();
  const ms = Date.now() - t0;
  const r = analyse(html, res.url, Object.fromEntries(res.headers));
  r.status = res.status; r.ms = ms; r.kb = Math.round(Buffer.byteLength(html) / 1024);
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ ...r, preview: previewLink(r) }, null, 2)); return; }
  console.log(`\n${r.url} · HTTP ${r.status} · HTML ${r.kb} KB in ${ms} ms · platform: ${r.platform}`);
  console.log('\nRisks:'); for (const x of r.risks) console.log('  ' + x);
  console.log('\nNotes:'); for (const x of r.notes) console.log('  · ' + x);
  const iconText = r.icon?.startsWith('data:') ? `inline image (${Math.round(r.icon.length / 1024)} KB, too small for the store — ask for the logo)` : r.icon;
  console.log(`\nIcon: ${iconText ?? '—'} · theme colour: ${r.themeColor ?? '—'} · manifest: ${r.manifest ? 'yes' : 'no'} · phone: ${r.phone ?? '—'} · email: ${r.email ?? '—'}`);
  console.log('\nDraft for src/site.config.ts (merge into `site`, then npm test):');
  console.log(JSON.stringify(r.config, null, 2));
  console.log(`\nPreview${r.framable ? '' : ' (will NOT show — site forbids framing)'}: ${previewLink(r)}\n`);
}

// run as a script (the path has spaces and Cyrillic — compare decoded paths)
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

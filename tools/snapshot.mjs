#!/usr/bin/env node
// "Your site as an app" in one minute: a phone screenshot of the client's real site
// inside our app shell (their menu → native tabs, their header/footer hidden,
// their colour), plus a framed version to attach to a proposal.
// FOR THE CLIENT PERSONALLY (in the chat or by email) — never published.
//
//   npm run build:web                        (once: the test build in dist/)
//   node tools/snapshot.mjs https://example.com [--tabs "Home:home:/,Menu:grid:/menu,Call:phone:call"] [--out ./snapshots]
//   → <out>-phone.png (390×844 @2x) and <out>-framed.png (phone frame + caption)
//
// A private headless Chrome (separate profile, no window). The app shell is served
// from dist/ inside Chrome; the client's site loads from the internet. Only in this
// browser, their "do not show me in a frame" headers are removed and cross-origin
// access is allowed, so the shell can hide their header exactly as the phone app does.
// Nothing is logged in, clicked or submitted on their site.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse } from './check-site.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');
const SHELL = 'https://preview.test';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the site's colour is used for the tabs only if it reads on white (WCAG AA, ≥ 4.5:1)
const luminance = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; }

function chromeBin() {
  const root = join(HERE, '..', '..', 'chrome-headless-shell', 'chrome-headless-shell');
  try {
    for (const v of readdirSync(root)) {
      const bin = join(root, v, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
      if (existsSync(bin)) return bin;
    }
  } catch { /* none */ }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

export function shellLink(r, tabsOverride) {
  const c = r.config;
  const q = new URLSearchParams({
    site: c.startUrl,
    name: c.appName,
    tabs: tabsOverride || c.tabs.map((t) => `${t.title.replace(/[,:]/g, ' ')}:${t.icon}:${t.kind === 'page' ? t.path : t.kind}`).join(','),
    top: c.topBar,
    ...(r.themeColor && c.accent !== '#0F766E' && /^#[0-9a-f]{6}$/i.test(c.accent) && luminance(c.accent) < 0.18 ? { accent: c.accent } : {}),
    ...(c.contact.phone ? { phone: c.contact.phone } : {}),
    ...(c.contact.email ? { email: c.contact.email } : {}),
    ...(r.hide.length ? { hide: r.hide.join(',') } : {}),
  });
  return `${SHELL}/?${q}`;
}

// Response headers without the frame bans (only in this private browser).
export function unframe(headers) {
  return headers
    .filter((h) => h.name.toLowerCase() !== 'x-frame-options')
    .map((h) => h.name.toLowerCase() === 'content-security-policy'
      ? { name: h.name, value: h.value.split(';').filter((d) => !/^\s*frame-ancestors\b/i.test(d)).join(';') }
      : h);
}

async function main() {
  const raw = process.argv[2];
  if (!raw || raw.startsWith('--')) { console.log('usage: node tools/snapshot.mjs https://site.com [--tabs "…"] [--out path]'); process.exit(2); }
  if (!existsSync(join(DIST, 'index.html'))) { console.log('No dist/ — run npm run build:web first'); process.exit(1); }
  const url = /^https?:\/\//.test(raw) ? raw : 'https://' + raw;

  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  const r = analyse(await res.text(), res.url, Object.fromEntries(res.headers));
  r.config.startUrl = res.url;                           // exactly the page we were given (after redirects)
  if (!r.https) { console.log('❌ site is not https — the app cannot show it (see check-site)'); process.exit(1); }
  const out = resolve(arg('--out') || join(homedir(), 'Desktop', r.host.replace(/[^a-z0-9.-]/gi, '_')));
  mkdirSync(dirname(out), { recursive: true });

  const profile = mkdtempSync(join(tmpdir(), 'snapshot-'));
  const chrome = spawn(chromeBin(), ['--headless', '--no-sandbox', '--hide-scrollbars', '--disable-web-security', '--disable-site-isolation-trials',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws; let id = 0; const waiting = new Map();
  const send = (method, params = {}) => new Promise((ok) => { id += 1; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const done = async (code) => {
    try { ws?.close(); } catch { /* closed */ }
    if (chrome.exitCode === null) { chrome.kill('SIGKILL'); await sleep(200); }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    process.exit(code);
  };
  try {
    const port = await new Promise((ok, bad) => {
      let buf = '';
      chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)/); if (m) ok(m[1]); });
      setTimeout(() => bad(new Error('Chrome did not start')), 15000);
    });
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not yet */ }
      if (!target) await sleep(100);
    }
    ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.addEventListener('message', async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); return; }
      if (msg.method !== 'Fetch.requestPaused') return;
      const { requestId, request, responseHeaders, responseStatusCode } = msg.params;
      const u = new URL(request.url);
      if (u.origin === SHELL) {                          // the app shell, from disk
        const path = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
        const file = normalize(join(DIST, path));
        const ok = file.startsWith(DIST) && existsSync(file);
        return send('Fetch.fulfillRequest', {
          requestId, responseCode: ok ? 200 : 404,
          responseHeaders: [{ name: 'Content-Type', value: ok ? TYPES[extname(file)] || 'application/octet-stream' : 'text/plain' }],
          body: (ok ? readFileSync(file) : Buffer.from('not found')).toString('base64'),
        });
      }
      if (responseHeaders) return send('Fetch.continueResponse', { requestId, responseCode: responseStatusCode, responseHeaders: unframe(responseHeaders) });
      return send('Fetch.continueRequest', { requestId });
    });
    await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
    await send('Page.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: SHELL + '/*', requestStage: 'Request' }, { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' }] });
    await send('Emulation.setUserAgentOverride', { userAgent: UA });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: shellLink(r, arg('--tabs')) });

    const until = Date.now() + 30000;
    let state = '';
    while (Date.now() < until) {
      state = await js(`(() => {
        if (document.querySelector('[data-testid="offline"]')) return 'offline';
        const f = document.querySelector('[data-testid="site-frame"]');
        try { return f && f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentWindow.location.href !== 'about:blank' ? 'ready' : 'wait'; } catch { return 'wait'; }
      })()`);
      if (state !== 'wait') break;
      await sleep(250);
    }
    if (state !== 'ready') { console.log(`❌ the site did not load in the shell (${state || 'timeout'})`); return done(1); }
    await sleep(2500);                                   // images, fonts, cookie banners settle
    const phone = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
    writeFileSync(out + '-phone.png', phone);

    // framed version: the screenshot in a phone outline with a one-line caption
    const page = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#F4F1EC;font:15px/1.4 -apple-system,system-ui,sans-serif;color:#4B5563;display:grid;place-items:center;height:100vh}
      .p{width:390px;height:844px;border:12px solid #111;border-radius:56px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.18)}
      .p img{width:390px;height:844px;display:block}p{margin:22px 0 0;text-align:center}</style>
      <div><div class="p"><img src="data:image/png;base64,${phone.toString('base64')}"></div>
      <p>${r.host} as an app — concept preview</p></div>`;
    await send('Emulation.setDeviceMetricsOverride', { width: 560, height: 1000, deviceScaleFactor: 2, mobile: false });
    await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(page).toString('base64') });
    await sleep(700);
    writeFileSync(out + '-framed.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
    console.log(`✅ ${out}-phone.png\n✅ ${out}-framed.png\nTabs: ${r.config.tabs.map((t) => t.title).join(' · ')} — change with --tabs if the menu guess is off. For the client only, not for publishing.`);
    return done(0);
  } catch (e) {
    console.log('❌ ' + (e.message || e));
    return done(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

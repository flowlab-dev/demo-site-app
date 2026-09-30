// Headless Chrome for the page tests: DevTools protocol over Node's own WebSocket,
// no packages. Every request is answered by `serve` (DevTools Fetch interception):
// nothing leaves the machine. window.open on the top page is recorded in window.__opened.
import test from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', 'shots');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' };

// A separate test browser: CHROME_PATH, or chrome-headless-shell in the repo, or the installed Chrome.
function testBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const dir = join(HERE, '..', 'chrome-headless-shell'); // optional: npx @puppeteer/browsers install chrome-headless-shell@stable
  try {
    for (const v of readdirSync(dir)) {
      const bin = join(dir, v, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
      if (existsSync(bin)) return bin;
    }
  } catch { /* not installed */ }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

// serve(url: URL, reply(body, type, status?), fail(reason)) — must answer every request.
export function useChrome(serve) {
  let chrome; let ws; let id = 0; let profile;
  const waiting = new Map();
  const h = { problems: [] };

  h.send = (method, params = {}) => {
    id += 1;
    const mine = id;
    return new Promise((resolve) => { waiting.set(mine, resolve); ws.send(JSON.stringify({ id: mine, method, params })); });
  };
  h.js = async (expression) => {
    const r = await h.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  h.waitFor = async (expr, ms = 8000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      try { if (await h.js(`!!(${expr})`)) return true; } catch { /* loading */ }
      await sleep(50);
    }
    throw new Error('timed out waiting for ' + expr);
  };
  h.q = (tid) => `document.querySelector('[data-testid="${tid}"]')`;
  h.FRAME = h.q('site-frame');
  h.inFrame = (expr) => h.js(`(() => { const d = ${h.FRAME}?.contentDocument; return d ? (${expr}) : null; })()`);
  h.tapAt = async (expr, what) => {
    const r = await h.js(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    if (!r) throw new Error('nothing to tap: ' + what);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await h.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    }
    await sleep(150);
  };
  h.tap = (tid) => h.tapAt(h.q(tid), tid);
  h.shot = async (name) => {
    if (!process.env.SHOTS) return;
    await sleep(300);
    const r = await h.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(join(SHOTS, name), Buffer.from(r.result.data, 'base64'));
  };
  h.open = async (url, { width = 390, height = 844, dark = false } = {}) => {
    await h.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await h.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
    await h.send('Page.navigate', { url: 'about:blank' });
    await sleep(50);
    h.problems = [];
    await h.send('Page.navigate', { url });
    await h.waitFor(`document.readyState === 'complete' && ${h.q('tab-0')}`);
  };

  const onRequest = ({ requestId, request }) => {
    const reply = (body, type, status = 200) => h.send('Fetch.fulfillRequest', {
      requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: type }],
      body: Buffer.from(body).toString('base64'),
    });
    const fail = (errorReason) => h.send('Fetch.failRequest', { requestId, errorReason });
    return serve(new URL(request.url), reply, fail);
  };

  test.before(async () => {
    profile = mkdtempSync(join(tmpdir(), 'siteapp-test-'));
    chrome = spawn(process.env.CHROME || testBrowser(), ['--headless', '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    const port = await new Promise((resolve, reject) => {
      let buf = '';
      chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)/); if (m) resolve(m[1]); });
      setTimeout(() => reject(new Error('Chrome did not start')), 15000);
    });
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not yet */ }
      if (!target) await sleep(100);
    }
    ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.addEventListener('message', async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); return; }
      if (msg.method === 'Fetch.requestPaused') return onRequest(msg.params);
      if (msg.method === 'Runtime.exceptionThrown') h.problems.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) h.problems.push('console: ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    });
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    await h.send('Runtime.enable'); await h.send('Page.enable');
    await h.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await h.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (window === window.top) { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; }` });
  });

  test.after(async () => {
    try { ws.close(); } catch { /* closed */ }
    if (chrome && chrome.exitCode === null) await new Promise((r) => { chrome.once('exit', r); chrome.kill('SIGKILL'); });
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  return h;
}

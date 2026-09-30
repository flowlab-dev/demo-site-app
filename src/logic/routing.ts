// Where a link goes: stays in the app, opens in the system browser, is handed
// to the phone (call, mail, maps…), goes to the https twin of the page, or is
// blocked. Pure functions — tested in Node.

import type { SiteConfig, Tab } from '../site.config.ts';

export type Route = 'inside' | 'upgrade' | 'browser' | 'system' | 'block';

// Schemes the phone handles itself. Anything else unknown is blocked:
// a page must not be able to launch arbitrary apps (or javascript:/file:/data:).
const SYSTEM_SCHEMES = new Set([
  'tel:', 'mailto:', 'sms:', 'facetime:', 'facetime-audio:', 'maps:', 'geo:', 'comgooglemaps:',
  'whatsapp:', 'tg:', 'viber:', 'market:', 'itms-apps:', 'itms-appss:',
]);
// https links that belong to phone apps (Maps, WhatsApp, Telegram, the stores): [host, path prefix].
const SYSTEM_LINKS: [string, string][] = [
  ['maps.apple.com', ''], ['maps.google.com', ''], ['www.google.com', '/maps'], ['google.com', '/maps'],
  ['goo.gl', '/maps'], ['maps.app.goo.gl', ''], ['wa.me', ''], ['api.whatsapp.com', ''], ['t.me', ''],
  ['apps.apple.com', ''], ['play.google.com', ''],
];

const hostOf = (u: URL) => u.hostname.toLowerCase().replace(/\.$/, '');

// 'shop.com' also matches 'www.shop.com' (and back); '*.stripe.com' matches any
// sub-domain of stripe.com, not stripe.com itself.
export function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return allowed.some((a) => {
    const x = a.toLowerCase();
    if (x.startsWith('*.')) return h.endsWith(x.slice(1)) && h.length > x.length - 1;
    return h === x || h === 'www.' + x || (x.startsWith('www.') && h === x.slice(4));
  });
}

function extensionOf(pathname: string): string {
  const last = pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : '';
}

type RouteCfg = Pick<SiteConfig, 'allowedHosts' | 'flowHosts' | 'externalExtensions'>;

export function routeFor(raw: string, cfg: RouteCfg): Route {
  let u: URL;
  try { u = new URL(raw); } catch { return 'block'; }
  if (SYSTEM_SCHEMES.has(u.protocol)) return 'system';
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'block';   // intent:, about:, data:, javascript:, file:, blob:…
  const host = hostOf(u);
  if (SYSTEM_LINKS.some(([h, p]) => host === h && (p === '' || u.pathname === p || u.pathname.startsWith(p + '/')))) return 'system';
  const own = hostAllowed(host, cfg.allowedHosts);
  // payment / booking / sign-in steps of the client's own flow stay inside (cookies of the cart survive)
  const flow = !own && hostAllowed(host, cfg.flowHosts);
  if (!own && !flow) return 'browser';
  if (u.protocol === 'http:') return own ? 'upgrade' : 'browser';           // old http links of the site → its https page
  if (cfg.externalExtensions.includes(extensionOf(u.pathname))) return 'browser';
  return 'inside';
}

// http://own-site/page → https://own-site/page
export const httpsTwin = (url: string) => url.replace(/^http:/i, 'https:');

// Android "intent:" links (e.g. "open in app, else this page") — their https fallback, if any.
export function intentFallback(raw: string): string | null {
  const m = /;S\.browser_fallback_url=([^;]+)/.exec(raw);
  if (!raw.startsWith('intent:') || !m) return null;
  try {
    const u = new URL(decodeURIComponent(m[1]));
    return u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

// Full URL of a tab's page on the start host.
export function tabUrl(cfg: Pick<SiteConfig, 'startUrl'>, tab: Tab): string {
  return new URL(tab.path ?? '/', cfg.startUrl).toString();
}

const norm = (p: string) => (p.endsWith('/') ? p : p + '/');

// The tab that should look active for the page being shown: longest path prefix
// wins ('/' matches everything only when nothing else does). -1: none.
export function activeTab(cfg: Pick<SiteConfig, 'startUrl' | 'allowedHosts' | 'tabs'>, current: string): number {
  let u: URL;
  try { u = new URL(current); } catch { return -1; }
  if (!hostAllowed(hostOf(u), cfg.allowedHosts)) return -1;
  const path = norm(u.pathname);
  let best = -1, bestLen = -1;
  cfg.tabs.forEach((t, i) => {
    if (t.kind !== 'page') return;
    const p = norm(new URL(t.path ?? '/', cfg.startUrl).pathname);
    if (path.startsWith(p) && p.length > bestLen) { best = i; bestLen = p.length; }
  });
  return best;
}

// Deep link (clientapp://menu/today, or an https link to the site) → page inside the app.
// Never returns another host.
export function deepLinkTarget(cfg: Pick<SiteConfig, 'startUrl' | 'allowedHosts'>, link: string): string | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  let target: URL;
  if (u.protocol === 'https:') target = u;
  else if (u.protocol === 'http:') return null;
  else {
    // custom scheme: host + path is the path on the site
    const rest = ((u.host ? '/' + u.host : '') + (u.pathname || '')).replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    try { target = new URL(rest || '/', cfg.startUrl); } catch { return null; }
    target.search = u.search;
    target.hash = u.hash;
  }
  return target.protocol === 'https:' && hostAllowed(hostOf(target), cfg.allowedHosts) ? target.toString() : null;
}

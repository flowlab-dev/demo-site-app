// Browser builds of the kit. Which config they show is fixed at build time
// (EXPO_PUBLIC_KIT_MODE, inlined by Expo):
//   test  — any https site from the address bar, for page tests and private screenshots:
//           …/?site=https://joes-pizza.com/&tabs=Home:home:/,Menu:grid:/menu,Call:phone:call&phone=+12125550123&hide=body%20>%20header
//   demo  — the PUBLIC demo (flowlab-dev.github.io/demo/site-app/): only our fictional bakery in ./site/,
//           the address bar changes nothing (a client's site is shown to them privately, never published).
//   (none) — src/site.config.ts as written.
import { checkConfig } from './logic/config-check.ts';
import type { IconName, SiteConfig, Tab } from './site.config.ts';

const MODE = process.env.EXPO_PUBLIC_KIT_MODE;
const ICONS: IconName[] = ['home', 'grid', 'cart', 'user', 'phone', 'calendar', 'info', 'chat', 'search', 'share', 'tag', 'pin'];

export const isDemo = MODE === 'demo';

function bakery(base: SiteConfig): SiteConfig {
  const start = new URL('site/', globalThis.location?.href ?? 'https://flowlab-dev.github.io/demo/site-app/');
  const path = (p: string) => start.pathname + p;
  return {
    ...base,
    appName: 'Crumb & Co',
    startUrl: start.toString(),
    allowedHosts: [start.hostname],
    flowHosts: [],
    tabs: [
      { title: 'Home', icon: 'home', kind: 'page', path: path('') },
      { title: 'Menu', icon: 'grid', kind: 'page', path: path('menu/') },
      { title: 'Visit', icon: 'pin', kind: 'page', path: path('visit/') },
      { title: 'Call', icon: 'phone', kind: 'call' },
    ],
    accent: '#9A3412',
    accentDark: '#F59E6B',
    topBar: '#FFFFFF',
    topBarDark: '#231B17',
    hideSelectors: ['body > header', 'body > footer'],
    contact: { phone: '+12075550188', email: 'hello@crumb-and-co.example', address: '12 Harbor St (fictional)', hours: 'Mon–Fri 7–17' },
    push: { enabled: false },
  };
}

function fromAddressBar(base: SiteConfig): SiteConfig {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const start = q.get('site');
  if (!start) return base;
  let host: string;
  // https pages only (no data:/javascript:/http), name within the store limit
  try { const u = new URL(start); if (u.protocol !== 'https:') return base; host = u.hostname; } catch { return base; }
  const tabs: Tab[] = (q.get('tabs') ?? 'Home:home:/').split(',').map((t) => {
    const [title = 'Page', icon = 'home', what = '/'] = t.split(':');
    const i = (ICONS.includes(icon as IconName) ? icon : 'home') as IconName;
    if (what === 'call') return { title, icon: i, kind: 'call' };
    if (what === 'share') return { title, icon: i, kind: 'share' };
    return { title, icon: i, kind: 'page', path: what };
  });
  return {
    ...base,
    appName: (q.get('name') ?? host).slice(0, 30),
    startUrl: start,
    allowedHosts: [host, ...(q.get('hosts')?.split(',') ?? [])],
    flowHosts: [],
    topBar: /^#[0-9a-f]{6}$/i.test(q.get('top') ?? '') ? q.get('top')! : base.topBar,
    topBarDark: /^#[0-9a-f]{6}$/i.test(q.get('top') ?? '') ? q.get('top')! : base.topBarDark,
    accent: /^#[0-9a-f]{6}$/i.test(q.get('accent') ?? '') ? q.get('accent')! : base.accent,
    tabs,
    hideSelectors: q.get('hide')?.split(',') ?? [],
    contact: { phone: q.get('phone') ?? undefined, email: q.get('email') ?? base.contact.email },
    push: { enabled: false },
  };
}

export function withPreview(base: SiteConfig): SiteConfig {
  const cfg = MODE === 'demo' ? bakery(base) : MODE === 'test' ? fromAddressBar(base) : base;
  const errs = checkConfig(cfg);
  if (errs.length && cfg !== base) console.warn('preview config: ' + errs.join('; '));
  return cfg;
}

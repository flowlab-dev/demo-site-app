// Rules a client config must pass before a build. Returns human-readable
// problems (empty = OK). Tests run it on src/site.config.ts.

import type { SiteConfig } from '../site.config.ts';
import { hostAllowed } from './routing.ts';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const E164 = /^\+[1-9]\d{6,14}$/;

export function checkConfig(c: SiteConfig): string[] {
  const out: string[] = [];
  let start: URL | null = null;
  try { start = new URL(c.startUrl); } catch { out.push('startUrl is not a URL'); }
  if (start && start.protocol !== 'https:') out.push('startUrl must be https');
  if (start && !hostAllowed(start.hostname, c.allowedHosts)) out.push('startUrl host is not in allowedHosts');
  if (!c.appName.trim() || c.appName.length > 30) out.push('appName: 1–30 characters (App Store name limit)');
  if (c.allowedHosts.length === 0) out.push('allowedHosts is empty');
  for (const h of [...c.allowedHosts, ...c.flowHosts]) if (h.includes('/') || h.includes(':') || h !== h.toLowerCase() || h.replace(/^\*\./, '').includes('*')) out.push(`hosts: "${h}" — host only, lower case, optional leading *.`);
  for (const h of c.allowedHosts) if (h.startsWith('*.')) out.push(`allowedHosts: "${h}" — list the site's hosts exactly (wildcards only in flowHosts)`);
  for (const h of c.flowHosts) if (/^\*\.[^.]+$/.test(h)) out.push(`flowHosts: "${h}" — too wide`);

  if (c.tabs.length < 2 || c.tabs.length > 5) out.push('tabs: 2–5 (Apple and Google tab bar guidance)');
  if (!c.tabs.some((t) => t.kind === 'page')) out.push('tabs: at least one page tab');
  const paths = new Set<string>();
  c.tabs.forEach((t, i) => {
    const n = `tab ${i + 1} "${t.title}"`;
    if (!t.title.trim() || t.title.length > 12) out.push(`${n}: title 1–12 characters`);
    if (t.kind === 'page') {
      if (!t.path || !t.path.startsWith('/')) out.push(`${n}: path must start with /`);
      else if (paths.has(t.path)) out.push(`${n}: duplicate path ${t.path}`);
      else paths.add(t.path);
    } else if (t.path) out.push(`${n}: path is only for page tabs`);
    if (t.kind === 'call' && !c.contact.phone) out.push(`${n}: call tab needs contact.phone`);
  });

  if (!HEX.test(c.accent) || !HEX.test(c.accentDark) || !HEX.test(c.topBar) || !HEX.test(c.topBarDark)) out.push('accent/accentDark/topBar/topBarDark: #RRGGBB');
  if (c.contact.phone && !E164.test(c.contact.phone)) out.push('contact.phone: international format, e.g. +12125550123');
  if (c.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact.email)) out.push('contact.email is not an email');
  if (!c.contact.phone && !c.contact.email) out.push('contact: phone or email — the offline screen must offer a way to reach the business');
  if (c.push.enabled) {
    let r: URL | null = null;
    try { r = new URL(c.push.registerUrl ?? ''); } catch { /* reported below */ }
    if (!r || r.protocol !== 'https:') out.push('push.registerUrl: https endpoint required when push is enabled');
  }
  if (!/^[A-Za-z0-9._\/-]{1,40}$/.test(c.userAgentTag)) out.push('userAgentTag: letters, digits, . _ / - only');
  for (const s of c.hideSelectors) if (/[{}<]/.test(s)) out.push(`hideSelectors: "${s}" — a CSS selector, no braces or tags`);
  for (const [k, v] of Object.entries(c.texts)) if (!v.trim()) out.push(`texts.${k} is empty`);
  return out;
}

// The shipped config passes every rule; each rule catches its mistake.
//   node --test tests/config.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkConfig } from '../src/logic/config-check.ts';
import { site, type SiteConfig } from '../src/site.config.ts';

test('site.config.ts passes all rules', () => {
  assert.deepEqual(checkConfig(site), []);
});

test('app.json matches the config and is not left with the demo identity', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
  const plist = app.ios.infoPlist ?? {};
  assert.equal(app.name, site.appName);
  assert.ok(app.scheme && /^[a-z][a-z0-9+.-]*$/.test(app.scheme), 'expo.scheme: lower-case deep-link scheme');
  assert.equal(plist.NSAppTransportSecurity, undefined, 'do not weaken App Transport Security');
  for (const id of [app.ios.bundleIdentifier, app.android.package]) {
    assert.ok(!/^com\.example\./.test(id), `${id}: Google Play rejects com.example.*`);
    assert.match(id, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, `${id}: reverse domain, lower case`);
  }
  if (site.appName !== 'Flow Lab') {
    // a client build must not keep our demo's identity (links would open the wrong app on test phones)
    assert.notEqual(app.scheme, 'flowlab'); assert.notEqual(app.slug, 'flowlab-site-app');
    assert.ok(!app.ios.bundleIdentifier.startsWith('dev.flowlab.'), 'bundleIdentifier: the client\'s reverse domain');
  }
  // photo/video upload from a site form: without these iOS closes the app when the camera is chosen
  for (const k of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSMicrophoneUsageDescription'])
    assert.ok(String(plist[k] ?? '').includes(site.appName), `${k}: explain the use, with the app name`);
  if (site.geolocation) assert.ok(plist.NSLocationWhenInUseUsageDescription, 'geolocation: add NSLocationWhenInUseUsageDescription');
  if (site.push.enabled) assert.ok(app.android.googleServicesFile, 'push on Android needs android.googleServicesFile (Firebase) — README, push');
});

const bad = (patch: Partial<SiteConfig>, expect: RegExp) => {
  const errs = checkConfig({ ...site, ...patch });
  assert.ok(errs.some((e) => expect.test(e)), `${expect} not in ${JSON.stringify(errs)}`);
};

test('each rule catches its mistake', () => {
  bad({ startUrl: 'http://flowlab-dev.github.io/' }, /https/);
  bad({ startUrl: 'https://other.com/' }, /allowedHosts/);
  bad({ startUrl: 'nope' }, /not a URL/);
  bad({ appName: 'A very long application name here!' }, /appName/);
  bad({ allowedHosts: ['https://flowlab-dev.github.io'] }, /host only/);
  bad({ tabs: [site.tabs[0]] }, /2–5/);
  bad({ tabs: [...site.tabs, ...site.tabs] }, /2–5/);
  bad({ tabs: [{ title: 'Share', icon: 'share', kind: 'share' }, { title: 'Call', icon: 'phone', kind: 'call' }] }, /at least one page/);
  bad({ tabs: [site.tabs[0], { ...site.tabs[0], title: 'Again' }] }, /duplicate path/);
  bad({ tabs: [site.tabs[0], { title: 'Menu', icon: 'grid', kind: 'page', path: 'menu' }] }, /start with \//);
  bad({ tabs: [site.tabs[0], { title: 'Call', icon: 'phone', kind: 'call' }], contact: { email: 'a@b.co' } }, /contact.phone/);
  bad({ tabs: [site.tabs[0], { title: 'Extraordinary', icon: 'grid', kind: 'page', path: '/x' }] }, /title 1–12/);
  bad({ accent: 'teal' }, /#RRGGBB/);
  bad({ topBar: 'white' }, /#RRGGBB/);
  bad({ topBarDark: '#000' }, /#RRGGBB/);
  bad({ allowedHosts: ['*.flowlab-dev.github.io'] }, /wildcards only/);
  bad({ flowHosts: ['*.com'] }, /too wide/);
  bad({ flowHosts: ['pay*.stripe.com'] }, /host only/);
  bad({ contact: { phone: '212-555-0123' } }, /international/);
  bad({ contact: {} }, /offline screen/);
  bad({ push: { enabled: true } }, /registerUrl/);
  bad({ push: { enabled: true, registerUrl: 'http://api.x.com/push' } }, /registerUrl/);
  bad({ userAgentTag: 'App <script>' }, /userAgentTag/);
  bad({ hideSelectors: ['header { color: red }'] }, /hideSelectors/);
  bad({ texts: { ...site.texts, retry: ' ' } }, /texts.retry/);
});

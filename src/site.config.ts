// The ONLY file to edit for a new client (plus icons in assets/ and names in app.json).
// `node tools/check-site.mjs https://client.site` prints a draft of this object
// from the client's own menu. `npm test` fails if the config breaks a rule
// (https only, 2–5 tabs, tabs on allowed hosts, readable colours).

export type TabKind = 'page' | 'call' | 'share';

export type Tab = {
  title: string;          // 1–2 short words, shown under the icon
  icon: IconName;
  kind: TabKind;          // page: open `path` in the app · call: dial `phone` · share: share the current page
  path?: string;          // for kind 'page': path on startUrl's host, e.g. '/menu'
};

export type IconName = 'home' | 'grid' | 'cart' | 'user' | 'phone' | 'calendar' | 'info' | 'chat' | 'search' | 'share' | 'tag' | 'pin';

export type SiteConfig = {
  appName: string;
  startUrl: string;                 // https only
  allowedHosts: string[];           // the client's site: opened inside the app; everything else — system browser
  flowHosts: string[];              // steps of the site's own flows that must stay inside (payment, booking widget):
                                    // e.g. 'www.paypal.com', '*.stripe.com', 'shop.app', 'pay.shopify.com', '*.calendly.com'
  tabs: Tab[];                      // 2–5, the native bottom bar (Apple 4.2: "app-like" navigation)
  accent: string;                   // brand colour on light background (#RRGGBB)
  accentDark: string;               // its twin for dark mode
  topBar: string;                   // colour behind the status bar = the site's header colour (#RRGGBB)
  topBarDark: string;               // the same in dark mode — equal to topBar if the site has no dark theme
  hideSelectors: string[];          // site header/footer/cookie bar hidden inside the app (tab bar replaces them)
  userAgentTag: string;             // appended to the browser's user agent — the site can tell it runs in the app
  externalExtensions: string[];     // files opened outside (downloads do not work inside a web view on iOS)
  geolocation: boolean;             // the site asks for location ("find nearest") — also add NSLocationWhenInUseUsageDescription in app.json
  contact: {                        // shown on the offline screen — works without internet
    phone?: string;                 // E.164, e.g. +12125550123
    email?: string;
    address?: string;
    hours?: string;
  };
  push: {
    enabled: boolean;
    registerUrl?: string;           // client's endpoint: POST {token, platform, app} — https only
  };
  texts: {
    offlineTitle: string;
    offlineBody: string;
    serverTitle: string;            // the site answered with an error (5xx) — not the user's internet
    serverBody: string;
    retry: string;
    call: string;
    email: string;
    loading: string;
    noCalls: string;                // iPad / no SIM: the number is shown instead of dialling
  };
};

// Demo: our own site (we own it, so Google Play's "webview of a site you don't own" rule is met).
export const site: SiteConfig = {
  appName: 'Flow Lab',
  startUrl: 'https://flowlab-dev.github.io/',
  allowedHosts: ['flowlab-dev.github.io'],
  flowHosts: [],
  tabs: [
    { title: 'Home', icon: 'home', kind: 'page', path: '/' },
    { title: 'Work', icon: 'grid', kind: 'page', path: '/demo/' },
    { title: 'Audit', icon: 'search', kind: 'page', path: '/demo/app-audit/' },
    { title: 'Share', icon: 'share', kind: 'share' },
  ],
  accent: '#0F766E',
  accentDark: '#5EEAD4',
  topBar: '#F7F8F8',
  topBarDark: '#F7F8F8',
  hideSelectors: [],
  userAgentTag: 'FlowLabApp/1.0',
  externalExtensions: ['pdf', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ics'],
  geolocation: false,
  contact: {
    email: 'hello@crumb-and-co.example',
  },
  push: { enabled: false },
  texts: {
    offlineTitle: 'No connection',
    offlineBody: 'Check your internet and try again. You can still reach us:',
    serverTitle: 'Something went wrong',
    serverBody: 'Our site is not responding right now. Please try again in a minute, or reach us directly:',
    retry: 'Try again',
    call: 'Call',
    email: 'Email',
    loading: 'Loading',
    noCalls: 'Calls are not available on this device. Our number:',
  },
};

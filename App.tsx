// Site-to-app shell: the client's site in a native frame with a native tab bar,
// offline / server-error screen with their contacts, Android back button, deep
// links and optional push. Everything client-specific is in src/site.config.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, Platform, Share, StyleSheet, useColorScheme, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { site as written } from './src/site.config.ts';
import { isDemo, withPreview } from './src/preview';
import { DEMO_OFFLINE, DemoFrame } from './src/ui/DemoFrame';
import { openOutside } from './src/outside';
import { activeTab, deepLinkTarget, httpsTwin, intentFallback, routeFor, tabUrl } from './src/logic/routing.ts';
import { injectedScript, retryDelayMs } from './src/logic/inject.ts';
import { listenForTaps, registerPush } from './src/push';
import { OfflineScreen } from './src/ui/OfflineScreen.tsx';
import { TabBar } from './src/ui/TabBar.tsx';
import { luminance, palettes } from './src/ui/theme.ts';
import { WebFrame } from './src/web/WebFrame';
import type { Failure, NavState, WebFrameHandle } from './src/web/types.ts';

SplashScreen.preventAutoHideAsync().catch(() => {});
const site = withPreview(written);
const INJECTED = injectedScript(site);
// Colours of the site actually shown (the web demo shows another site than site.config.ts).
const PAL = palettes(site.accent, site.accentDark);
const inside = (url: string) => routeFor(url, site) === 'inside';
// An iPad (or anything without a phone app) cannot dial: no Call tab there.
const canDial = !(Platform.OS === 'ios' && Platform.isPad);
const TABS = site.tabs.filter((t) => t.kind !== 'call' || canDial);

export default function App() {
  return (
    <SafeAreaProvider>
      <DemoFrame>
        <Shell />
      </DemoFrame>
    </SafeAreaProvider>
  );
}

// Dial, or show the number where calls are impossible (iPad without iPhone, no SIM).
export function call(phone: string) {
  openOutside('tel:' + phone).catch(() => Alert.alert(site.texts.noCalls, phone));
}

function Shell() {
  const scheme = useColorScheme();
  const p = scheme === 'dark' ? PAL.dark : PAL.light;
  const topBar = scheme === 'dark' ? site.topBarDark : site.topBar;
  const frame = useRef<WebFrameHandle>(null);
  const [nav, setNav] = useState<NavState>({ url: site.startUrl, canGoBack: false, loading: true });
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<Failure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const attempt = useRef(0);
  const firstLoad = useRef(true);
  const cfgTabs = useMemo(() => ({ ...site, tabs: TABS }), []);

  // Leaving the app's pages: the phone or the system browser takes over; old http links of
  // the site go to their https page; unknown schemes are dropped (an intent's https fallback is used).
  const leave = useCallback((url: string) => {
    const r = routeFor(url, site);
    if (r === 'upgrade') frame.current?.go(httpsTwin(url));
    else if (r === 'browser' || r === 'system') openOutside(url).catch(() => {});
    else if (r === 'block') {
      const fb = intentFallback(url);
      if (fb) openOutside(fb).catch(() => {});
    }
  }, []);

  // Open a page of the site from a tab, a deep link or a notification.
  const open = useCallback((url: string) => {
    if (!inside(url)) return leave(url);
    // Before the first page (cold start from a link) or after a failure: a fresh load, not in-page navigation.
    if (failed || firstLoad.current) { setRetrying(!!failed); frame.current?.reload(url); } else frame.current?.go(url);
  }, [failed, leave]);

  const retry = useCallback(() => { setRetrying(true); frame.current?.reload(); }, []);

  // Splash stays until the first page is on screen (or 8 s) — no white flash.
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 8000);
    return () => clearTimeout(t);
  }, []);

  // Failed: retry by itself with growing pauses, and whenever the app comes back to the front.
  useEffect(() => {
    if (!failed || retrying) return;
    const t = setTimeout(retry, retryDelayMs(attempt.current++));
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') retry(); });
    return () => { clearTimeout(t); sub.remove(); };
  }, [failed, retry, retrying]);

  // Android back button: back in the site's history (also from the error screen), then leave the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!nav.canGoBack) return false;
      if (failed) { setFailed(null); setRetrying(false); }
      frame.current?.back();
      return true;
    });
    return () => sub.remove();
  }, [nav.canGoBack, failed]);

  // Links into the app (scheme://path; https links to the site only if the client adds
  // associated domains — see README) and notification taps. Subscribed once; `openRef`
  // always calls the current `open`. Not in the browser preview: there the "initial URL"
  // is the preview page itself.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const go = (link: string | null) => {
      const target = link ? deepLinkTarget(site, link) : null;
      if (target && inside(target)) openRef.current(target);
    };
    Linking.getInitialURL().then(go).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => go(e.url));
    const stop = listenForTaps(go);
    return () => { sub.remove(); stop(); };
  }, []);

  const onLoaded = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
    setFailed(null);
    setRetrying(false);
    attempt.current = 0;
    if (firstLoad.current) {
      firstLoad.current = false;
      registerPush(site).catch((e) => { if (__DEV__) console.warn('push registration failed', e); });
    }
  }, []);

  const onFailed = useCallback((why: Failure) => {
    SplashScreen.hideAsync().catch(() => {});
    setFailed(why);
    setRetrying(false);
  }, []);

  // Public web demo: the side button shows the offline screen (a browser cannot easily go offline).
  useEffect(() => {
    if (Platform.OS !== 'web' || !isDemo) return;
    const show = () => onFailed('offline');
    window.addEventListener(DEMO_OFFLINE, show);
    return () => window.removeEventListener(DEMO_OFFLINE, show);
  }, [onFailed]);

  const onTab = (i: number) => {
    const t = TABS[i];
    if (t.kind === 'page') open(tabUrl(site, t));
    else if (t.kind === 'call' && site.contact.phone) call(site.contact.phone);
    else if (t.kind === 'share') {
      const url = inside(nav.url) ? nav.url : site.startUrl;
      Share.share(Platform.OS === 'ios' ? { url } : { message: url }).catch(() => Alert.alert(url));
    }
  };

  const loadingBar = nav.loading && !failed && progress < 1;
  const topIsDark = luminance(topBar) < 0.4;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.root, { backgroundColor: topBar }]}>
      <StatusBar style={topIsDark ? 'light' : 'dark'} />
      <View style={[s.body, { backgroundColor: p.bg }]}>
        <WebFrame
          ref={frame}
          startUrl={site.startUrl}
          userAgentTag={site.userAgentTag}
          injected={INJECTED}
          geolocation={site.geolocation}
          shouldLoadInside={inside}
          onLeave={leave}
          onState={setNav}
          onProgress={setProgress}
          onLoaded={onLoaded}
          onFailed={onFailed}
        />
        {loadingBar ? (
          <View
            testID="progress"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={[s.progress, { backgroundColor: p.accent, width: `${Math.max(8, progress * 100)}%` }]}
          />
        ) : null}
        {failed ? (
          // Modal for screen readers: VoiceOver must not read the web page underneath.
          <View style={StyleSheet.absoluteFill} accessibilityViewIsModal importantForAccessibility="yes">
            <OfflineScreen cfg={site} p={p} why={failed} onRetry={retry} retrying={retrying} onCall={call} canDial={canDial} />
          </View>
        ) : null}
      </View>
      <TabBar tabs={TABS} active={activeTab(cfgTabs, nav.url)} onPress={onTab} p={p} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  progress: { position: 'absolute', top: 0, left: 0, height: 3, borderRadius: 2 },
});

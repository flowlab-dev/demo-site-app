// The phone version: react-native-webview 13.16 (WKWebView on iOS, Android System WebView).
//
// Load outcome: the library calls onLoadEnd after an error too, and on Android even
// sends "finished" BEFORE the error. So a load counts as good only if no error
// arrived for it within SETTLE_MS after onLoadEnd; an error always wins.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebFrameHandle, WebFrameProps } from './types.ts';

const SETTLE_MS = 300;
const isAbout = (url: string) => !url || url.startsWith('about:');

export const WebFrame = forwardRef<WebFrameHandle, WebFrameProps>(function WebFrame(props, ref) {
  const view = useRef<WebView>(null);
  // Changing the key remounts the view: the only reliable way back from an error page.
  const [mount, setMount] = useState(0);
  const [source, setSource] = useState({ uri: props.startUrl });
  const last = useRef(props.startUrl);   // last real page — where a reload returns
  const errored = useRef(false);         // an error arrived for the current load
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const navigate = (url: string) => view.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)}); true;`);
  const fresh = (url: string) => { last.current = url; setSource({ uri: url }); setMount((m) => m + 1); };
  const fail = (why: 'offline' | 'server') => {
    errored.current = true;
    if (settle.current) clearTimeout(settle.current);
    latest.current.onFailed(why);
  };

  useImperativeHandle(ref, () => ({
    go: (url) => { last.current = url; navigate(url); },
    back: () => view.current?.goBack(),
    reload: (url) => fresh(url ?? last.current),
  }), []);

  return (
    <WebView
      key={mount}
      ref={view}
      source={source}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      // Our own offline/server screen covers failures; the library's grey error text must never show.
      renderError={() => <View style={{ flex: 1 }} />}
      // Every navigation goes through onShouldStartLoadWithRequest — including odd schemes,
      // which the default list would hand straight to the OS.
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={(r) => {
        if (isAbout(r.url)) return true;              // blank frames the page creates for itself
        if (r.isTopFrame === false) return true;      // iOS: embedded maps, video, payment frames
        if (props.shouldLoadInside(r.url)) return true;
        props.onLeave(r.url);
        return false;
      }}
      // window.open / target=_blank: pop-ups are not supported, so the target opens in place (or outside).
      onOpenWindow={(e) => {
        const url = e.nativeEvent.targetUrl;
        if (isAbout(url)) return;                     // window.open('') would blank the page
        if (props.shouldLoadInside(url)) navigate(url);
        else props.onLeave(url);
      }}
      // iOS cancels downloads silently, Android would download inside the app: hand files to the browser.
      onFileDownload={(e) => props.onLeave(e.nativeEvent.downloadUrl)}
      onLoadStart={() => {
        errored.current = false;
        if (settle.current) clearTimeout(settle.current);
      }}
      onNavigationStateChange={(n) => {
        if (/^https?:/.test(n.url)) last.current = n.url;
        props.onState({ url: n.url, canGoBack: n.canGoBack, loading: n.loading });
      }}
      onLoadProgress={(e) => props.onProgress(e.nativeEvent.progress)}
      onLoadEnd={() => {
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => { if (!errored.current) latest.current.onLoaded(); }, SETTLE_MS);
      }}
      onError={(e) => {
        // -999 (iOS) = a load cancelled by a newer one (fast tab taps) — not a failure
        if (e.nativeEvent.code === -999) return;
        fail('offline');
      }}
      onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) fail('server'); }}
      // A killed web process leaves a blank white screen — a common review rejection. Reload instead.
      onContentProcessDidTerminate={() => view.current?.reload()}
      onRenderProcessGone={() => fresh(last.current)}
      // Before the page renders (iOS reliably; Android may run it on the previous document)…
      injectedJavaScriptBeforeContentLoaded={props.injected}
      // …and again when it has loaded (Android). The script is safe to run twice.
      injectedJavaScript={props.injected}
      applicationNameForUserAgent={props.userAgentTag}
      geolocationEnabled={props.geolocation}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      allowsBackForwardNavigationGestures
      pullToRefreshEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction
      setSupportMultipleWindows
      javaScriptCanOpenWindowsAutomatically={false}
      decelerationRate="normal"
      webviewDebuggingEnabled={__DEV__}
    />
  );
});

// Browser preview only (screenshots, page tests, showing a client the idea):
// an iframe. Link routing and the injected script work only for same-origin
// pages (the test site); a real cross-origin site just shows in the frame.
// The phone build never uses this file.
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { WebFrameHandle, WebFrameProps } from './types.ts';

export const WebFrame = forwardRef<WebFrameHandle, WebFrameProps>(function WebFrame(props, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [src, setSrc] = useState(props.startUrl);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(props);
  latest.current = props;

  // Probe first: an iframe gives no error event when the site is unreachable.
  useEffect(() => {
    let live = true;
    latest.current.onState({ url: src, canGoBack: false, loading: true });
    latest.current.onProgress(0.1);
    fetch(src, { mode: 'no-cors', cache: 'no-store' })
      .then(() => { if (live && frame.current) frame.current.src = src; })
      .catch(() => { if (live) latest.current.onFailed('offline'); });
    return () => { live = false; };
  }, [src, attempt]);

  useImperativeHandle(ref, () => ({
    go: (url) => { setSrc(url); setAttempt((a) => a + 1); },   // same src after in-page navigation still reloads
    back: () => { try { frame.current?.contentWindow?.history.back(); } catch { /* cross-origin */ } },
    reload: (url) => { if (url) setSrc(url); setAttempt((a) => a + 1); },
  }), []);

  const onLoad = () => {
    const p = latest.current;
    let url = src;
    try {
      const w = frame.current!.contentWindow!;
      url = w.location.href;
      const s = w.document.createElement('script');
      s.textContent = p.injected;
      w.document.head.appendChild(s);
      // same-origin preview: route clicks like the phone does
      w.document.addEventListener('click', (e) => {
        const a = (e.target as HTMLElement).closest?.('a');
        if (!a || !a.href) return;
        if (!p.shouldLoadInside(a.href)) { e.preventDefault(); latest.current.onLeave(a.href); }
      }, true);
    } catch { /* cross-origin page: shown as is */ }
    p.onProgress(1);
    p.onState({ url, canGoBack: false, loading: false });
    p.onLoaded();
  };

  return createElement('iframe', {
    ref: frame,
    title: 'site',
    'data-testid': 'site-frame',
    onLoad,
    style: { border: 0, width: '100%', height: '100%', flex: 1, background: 'transparent' },
  });
});

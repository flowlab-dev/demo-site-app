// One interface for the phone web view (WebFrame.tsx) and the browser preview
// (WebFrame.web.tsx, used only for our screenshots and page tests).

export type NavState = { url: string; canGoBack: boolean; loading: boolean };
export type Failure = 'offline' | 'server';

export type WebFrameProps = {
  startUrl: string;
  userAgentTag: string;
  injected: string;
  geolocation: boolean;
  // A link the page wants to open that must not load inside (browser/system/upgrade/block) — the frame
  // has already refused it; the app decides what to do.
  shouldLoadInside: (url: string) => boolean;
  onLeave: (url: string) => void;
  onState: (s: NavState) => void;
  onProgress: (p: number) => void;   // 0..1
  onLoaded: () => void;              // a page finished loading WITHOUT an error
  onFailed: (why: Failure) => void;  // the main page could not load: no internet / DNS (offline) or HTTP 5xx (server)
};

export type WebFrameHandle = {
  go: (url: string) => void;         // navigate, keeping history
  back: () => void;
  reload: (url?: string) => void;    // fresh load (of url, or the last page) — recovers after a failure
};

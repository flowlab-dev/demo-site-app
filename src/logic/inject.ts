// Script run in every page before it renders: hides the site's own header,
// footer and cookie bar (the native tab bar replaces them) and marks the page
// so the client's CSS can adapt (html.in-app). Selectors are embedded as JSON —
// no string concatenation into code.

import type { SiteConfig } from '../site.config.ts';

export function injectedScript(cfg: Pick<SiteConfig, 'hideSelectors'>): string {
  const css = cfg.hideSelectors.length
    ? cfg.hideSelectors.join(',\n') + ' { display: none !important; }'
    : '';
  return `(function () {
  try {
    document.documentElement.classList.add('in-app');
    var css = ${JSON.stringify(css)};
    if (css) {
      var add = function () {
        if (document.getElementById('in-app-style')) return;
        var s = document.createElement('style');
        s.id = 'in-app-style';
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
      };
      add();
      document.addEventListener('DOMContentLoaded', add);
    }
  } catch (e) {}
})();
true;`;
}

// Delay before the next automatic retry when offline: 2, 4, 8, 16, 30, 30… seconds.
export function retryDelayMs(attempt: number): number {
  return Math.min(30000, 2000 * 2 ** Math.max(0, attempt));
}

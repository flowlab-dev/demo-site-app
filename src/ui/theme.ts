// Design tokens. Neutral greys + the client's brand colour from site.config.ts.
// Every text pair meets WCAG AA (≥ 4.5:1) in both themes — tests/theme.test.ts
// fails if a client's colour breaks that (PRINT=1 shows the numbers); then pick
// a darker `accent` / lighter `accentDark`.

import { site } from '../site.config.ts';

export type Palette = {
  bg: string; surface: string; ink: string; muted: string; line: string;
  accent: string; onAccent: string; accentSoft: string; danger: string;
};

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
// a over b at share t (0..1)
export const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b);
  return hex(x.map((v, i) => v * t + y[i] * (1 - t)));
};
export const luminance = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Text on the brand colour: white or near-black, whichever reads better.
const onColour = (h: string) => (luminance(h) > 0.179 ? '#0B0F0E' : '#FFFFFF');

export function palettes(accent: string, accentDark: string): { light: Palette; dark: Palette } {
  return {
    light: {
      bg: '#F7F8F8', surface: '#FFFFFF', ink: '#111827', muted: '#4B5563', line: '#D9DEE0',
      accent, onAccent: onColour(accent), accentSoft: mix(accent, '#FFFFFF', 0.1), danger: '#B42318',
    },
    dark: {
      bg: '#0E1413', surface: '#17201F', ink: '#ECF1F0', muted: '#A7B4B2', line: '#2A3634',
      accent: accentDark, onAccent: onColour(accentDark), accentSoft: mix(accentDark, '#17201F', 0.14), danger: '#FF8A7A',
    },
  };
}

export const { light, dark } = palettes(site.accent, site.accentDark);

// Type scale: three sizes plus a caption, one family.
export const type = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };
export const radius = { sm: 10, md: 14, lg: 20 };
export const TAP = 48; // min touch target (iOS 44pt, Android 48dp)

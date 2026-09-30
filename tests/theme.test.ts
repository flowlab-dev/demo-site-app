// Every text/background pair used on screen meets WCAG AA (4.5:1 for text,
// 3:1 for lines that carry meaning), in both themes — with the client's colours
// from site.config.ts. Fails → darker `accent` / lighter `accentDark`.
//   node --test tests/theme.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { dark, light, palettes, type Palette } from '../src/ui/theme.ts';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const TEXT: [keyof Palette, keyof Palette][] = [
  ['ink', 'bg'], ['ink', 'surface'], ['muted', 'bg'], ['muted', 'surface'],
  ['onAccent', 'accent'], ['accent', 'bg'], ['accent', 'surface'], ['accent', 'accentSoft'], ['ink', 'accentSoft'],
  ['danger', 'bg'], ['danger', 'surface'],
];
// accentSoft is the active tab background: the icon/label on it must read.

// + the public web demo's bakery colours (src/preview.web.ts)
const bakery = palettes('#9A3412', '#F59E6B');
for (const [name, p] of [['light', light], ['dark', dark], ['demo light', bakery.light], ['demo dark', bakery.dark]] as const) {
  test(`${name}: text contrast ≥ 4.5`, () => {
    for (const [fg, bg] of TEXT) {
      const c = contrast(p[fg], p[bg]);
      assert.ok(c >= 4.5, `${fg} on ${bg}: ${c.toFixed(2)}`);
    }
  });
  test(`${name}: accent outline on surface ≥ 3`, () => {
    assert.ok(contrast(p.accent, p.surface) >= 3);
  });
}

if (process.env.PRINT) {
  for (const [name, p] of [['light', light], ['dark', dark]] as const) {
    console.log(name, TEXT.map(([f, b]) => `${f}/${b} ${contrast(p[f], p[b]).toFixed(1)}`).join(' · '));
  }
}

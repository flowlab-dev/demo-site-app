// The sample first-stage report shown to clients: our demo bakery (Crumb & Co is
// fictional), checked by tools/check-site.mjs exactly like a real site — offline,
// from demo-site/index.html at the address where the demo lives.
//   node sample/make.mjs   → sample/sample-report-{en,ru}.{md,html}
// Images: sample/img/ (phone screenshots of the demo, from SHOTS=1 npm run test:demo).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse } from '../tools/check-site.mjs';
import { reportHtml, reportMd, T } from '../tools/report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = 'https://flowlab-dev.github.io/demo/site-app/site/';
const r = analyse(readFileSync(join(HERE, '..', 'demo-site', 'index.html'), 'utf8'), URL_, {});
r.config.startUrl = URL_;
const date = '2026-09-28';
const caps = { en: ['Home', 'Menu', 'No internet'], ru: ['Главная', 'Меню', 'Нет интернета'] };
for (const lang of ['en', 'ru']) {
  const prefix = lang === 'ru' ? '../img/' : 'img/';   // published: report/ and report/ru/
  const images = ['home.png', 'menu.png', 'offline.png'].map((f, i) => [caps[lang][i], prefix + f]);
  writeFileSync(join(HERE, `sample-report-${lang}.md`), `> ${T[lang].sample}\n\n` + reportMd(r, lang, { date, images }));
  writeFileSync(join(HERE, `sample-report-${lang}.html`), reportHtml(r, lang, { date, images, note: T[lang].sample }));
}
console.log('sample: sample-report-{en,ru}.{md,html}');

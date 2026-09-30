// After `expo export` of the public demo: the fictional bakery site goes to
// dist-demo/site/ (same origin as the app shell, so links are routed and the
// site's header/footer hidden like on a phone), plus a one-page PDF menu
// (to show that files open outside the app), a real title and noindex.
// GitHub Pages (Jekyll, no .nojekyll on our site) does not serve folders starting
// with "_": _expo/ becomes expo/ (the bundle has no other "_expo/" paths — checked).
import { cpSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist-demo');
cpSync(join(root, 'demo-site'), join(out, 'site'), { recursive: true });

// Minimal PDF 1.4, Helvetica, no libraries.
function pdf(lines) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => '\\' + c);
  const text = lines.map(([size, y, t]) => `BT /F1 ${size} Tf 56 ${y} Td (${esc(t)}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}
writeFileSync(join(out, 'site', 'menu.pdf'), pdf([
  [22, 770, 'Crumb & Co - menu (fictional bakery, demo)'],
  [13, 730, 'Country sourdough 900 g ........ $9'],
  [13, 710, 'Seeded rye ..................... $8'],
  [13, 690, 'Butter croissant ............... $4'],
  [13, 670, 'Cardamom bun ................... $5'],
  [13, 650, 'Flat white ..................... $4.50'],
  [11, 610, 'Allergens: wheat, milk, butter, eggs, sesame, nuts may be present.'],
  [10, 80, 'Demo made by Flow Lab - flowlab-dev.github.io'],
]));

renameSync(join(out, '_expo'), join(out, 'expo'));
// the sample first-stage report (sample/make.mjs): report/ (EN) and report/ru/ (RU)
mkdirSync(join(out, 'report', 'ru'), { recursive: true });
cpSync(join(root, 'sample', 'img'), join(out, 'report', 'img'), { recursive: true });
cpSync(join(root, 'sample', 'sample-report-en.html'), join(out, 'report', 'index.html'));
cpSync(join(root, 'sample', 'sample-report-ru.html'), join(out, 'report', 'ru', 'index.html'));

const index = join(out, 'index.html');
let html = readFileSync(index, 'utf8');
if (!html.includes('/_expo/')) throw new Error('index.html: no /_expo/ path to rewrite — check the Expo export');
html = html.replaceAll('/_expo/', '/expo/');
html = html.replace(/<title>[^<]*<\/title>/, '<title>Your website as a real app - demo by Flow Lab</title>');
html = html.replace('</head>', '<meta name="robots" content="noindex"><meta name="description" content="A bakery website inside a native iOS/Android app shell: tab bar, offline screen, one-tap call. Demo by Flow Lab."></head>');
writeFileSync(index, html);
console.log('demo: expo/ (was _expo/), site/, site/menu.pdf, report/ (+ru/), title + noindex');

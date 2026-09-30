#!/usr/bin/env node
// First-stage report for the client ("your website as an app"): what we checked on
// their site, what it means for the App Store / Google Play, what the app adds beyond
// the website, how it will look, what we need from them, and the plan. EN and RU.
// Built from tools/check-site.mjs results — every line comes from a real check.
//
//   node tools/report.mjs https://client-site.com [--lang ru] [--out report.html]   (HTML; --md for Markdown)
//   Images: pass --img "Home:path.png,Offline:path.png" (e.g. from tools/snapshot.mjs) — copied next to the HTML.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse } from './check-site.mjs';

const T = {
  en: {
    title: (n) => `Your website as an app — first-stage report: ${n}`,
    head: (u, d) => `Site: ${u} · checked ${d}`,
    ready: '**Verdict: ready to become an app.**',
    notReady: '**Verdict: the website needs work before it can become an app** (see 🔴 below).',
    counts: (a, b) => ` ${a} to prepare · ${b} ${b === 1 ? 'note' : 'notes'}.`,
    checked: 'What we checked', cols: ['', 'Check', 'Result', 'What it means'],
    https: ['Secure connection (https)', 'yes', 'The app can open your pages.', 'no', 'Apps cannot open plain http pages: the site needs a certificate first.'],
    mobile: ['Phone layout', 'yes', 'Your pages already fit a phone screen.', 'no', 'The site is desktop-only: pages would look tiny in the app. Phone layout comes first.'],
    tabs: ['Your menu → app tabs', (t) => t, 'The native bar at the bottom of the app; your own header and footer are hidden inside the app.'],
    phone: ['Phone for one-tap call', (p) => p, 'A Call tab, and a call button on the "no internet" screen that works offline.', 'not found', 'Tell us the number for the Call tab and the offline screen.'],
    icon: ['App icon', 'found', 'We will prepare the store icons from it (1024×1024, no transparency).', 'not found', 'Send your logo as a square image — the App Store icon is 1024×1024 without transparency.'],
    privacy: ['Privacy Policy page', (u) => u, 'Both stores need its link.', 'not found', 'Both stores require a public Privacy Policy page. Please add one to the site (we can place the text you approve).'],
    pay: ['Payments', (h) => `on ${h}`, 'These checkout steps stay inside the app, so the cart is not lost.', 'on your site', 'Physical goods and services can use your own checkout.'],
    digital: ['Digital content for sale', 'found', 'Apple and Google require their in-app purchase to unlock digital content in an app: these buttons are hidden in the app, or in-app purchase is a separate stage.'],
    login: ['Sign-in', 'found', 'If people can create an account in the app, Apple requires a way to delete it in the app too — we check your site has it.'],
    google: ['Sign in with Google', 'found', 'Google blocks it inside apps, and Apple then asks for Sign in with Apple as well: we hide it in the app or plan native sign-in.'],
    upload: ['Photo / file upload', 'found', 'We add the camera and photo permission texts the stores require.'],
    trackers: ['Tracking pixels', (t) => t, 'Declared honestly in the store privacy forms; ad tracking needs Apple\'s permission prompt or is switched off in the app.'],
    owner: ['Ownership', 'your site', 'Google Play accepts an app of a website only from its owner (or with written permission).'],
    adds: 'What the app adds beyond your website',
    addsText: 'Apple rejects apps that are "a repackaged website" (App Review Guideline 4.2). Your app gets native parts:',
    addsList: [
      'a bottom tab bar made from your menu, with your own header and footer hidden',
      'a "no internet" screen with your phone and email — it works offline',
      'other websites, maps, phone and email open in the phone\'s own apps; the app stays where it was',
      'back gesture (iPhone) and back button (Android) through your pages, and a Share tab if you want one',
      'optional: push notifications for news and offers that open the right page (a separate stage)',
    ],
    look: 'How your app will look',
    need: 'What we need from you',
    needList: [
      'Store accounts in your name: Apple Developer ($99 a year) and Google Play Console ($25 once). We publish from your accounts; you own the app.',
      'Your logo as a square image, and the app name (up to 30 characters).',
      'A public Privacy Policy page on your site.',
      'Someone to try the test build on their phone (iPhone: TestFlight; Android: a link).',
      'Google Play, personal developer account created after 13 Nov 2023: before the app goes live, 12 testers must stay in a closed test for 14 days in a row (Google\'s rule). A company account does not have this step.',
    ],
    plan: 'Plan, step by step',
    planList: [
      'Test build of your app on your phone — 1–2 working days after we start.',
      'Your feedback and one round of changes.',
      'Store pages: name, description, screenshots, privacy answers.',
      'Submission from your accounts and answers to the reviewers. Review time is set by Apple and Google.',
      'After launch: updates when your site changes are not needed — the app shows your live pages.',
    ],
    sample: 'Sample report on our demo bakery (Crumb & Co is fictional) — this is what you get for your own website at the first stage.',
  },
  ru: {
    title: (n) => `Ваш сайт — приложение: отчёт первого этапа — ${n}`,
    head: (u, d) => `Сайт: ${u} · проверен ${d}`,
    ready: '**Итог: сайт готов стать приложением.**',
    notReady: '**Итог: прежде чем делать приложение, сайт нужно доработать** (см. 🔴 ниже).',
    counts: (a, b) => ` Подготовить: ${a} · заметок: ${b}.`,
    checked: 'Что мы проверили', cols: ['', 'Проверка', 'Результат', 'Что это значит'],
    https: ['Защищённое соединение (https)', 'да', 'Приложение сможет открыть ваши страницы.', 'нет', 'Приложения не открывают страницы без https: сначала нужен сертификат.'],
    mobile: ['Вёрстка под телефон', 'да', 'Страницы уже подходят под экран телефона.', 'нет', 'Сайт сделан только под компьютер: в приложении страницы будут мелкими. Сначала — версия для телефона.'],
    tabs: ['Ваше меню → вкладки приложения', (t) => t, 'Родная панель внизу приложения; ваши шапка и подвал внутри приложения скрыты.'],
    phone: ['Телефон для звонка в одно касание', (p) => p, 'Вкладка «Позвонить» и кнопка звонка на экране «нет интернета» — работает без сети.', 'не найден', 'Сообщите номер для вкладки «Позвонить» и экрана без интернета.'],
    icon: ['Значок приложения', 'найден', 'Подготовим из него значки для магазинов (1024×1024, без прозрачности).', 'не найден', 'Пришлите логотип квадратом — значок App Store 1024×1024 без прозрачности.'],
    privacy: ['Политика конфиденциальности', (u) => u, 'Её ссылка нужна обоим магазинам.', 'не найдена', 'Оба магазина требуют открытую страницу политики конфиденциальности. Добавьте её на сайт (можем разместить согласованный вами текст).'],
    pay: ['Оплата', (h) => `через ${h}`, 'Шаги оплаты остаются внутри приложения — корзина не теряется.', 'на вашем сайте', 'Для товаров и услуг можно оставить вашу оплату.'],
    digital: ['Продажа цифрового', 'найдено', 'Apple и Google требуют свою встроенную покупку, чтобы открывать цифровое в приложении: такие кнопки в приложении скрываем или делаем встроенную покупку отдельным этапом.'],
    login: ['Вход в аккаунт', 'найден', 'Если в приложении можно создать аккаунт, Apple требует и удаление аккаунта в приложении — проверим, есть ли оно на сайте.'],
    google: ['Вход через Google', 'найден', 'Google блокирует его внутри приложений, а Apple тогда просит ещё и вход через Apple: в приложении скрываем или делаем родной вход.'],
    upload: ['Загрузка фото / файлов', 'найдена', 'Добавим тексты разрешений камеры и фото, которые требуют магазины.'],
    trackers: ['Счётчики и пиксели', (t) => t, 'Честно указываем в анкетах приватности магазинов; рекламное отслеживание — с запросом разрешения Apple или выключено в приложении.'],
    owner: ['Владелец', 'ваш сайт', 'Google Play принимает приложение сайта только от его владельца (или с письменным разрешением).'],
    adds: 'Что приложение добавит к сайту',
    addsText: 'Apple отклоняет приложения, которые — «просто сайт в обёртке» (правило App Review 4.2). В вашем приложении будут родные части:',
    addsList: [
      'нижняя панель вкладок из вашего меню; ваши шапка и подвал скрыты',
      'экран «нет интернета» с вашим телефоном и почтой — работает без сети',
      'чужие сайты, карты, телефон и почта открываются в приложениях телефона; приложение остаётся на месте',
      'жест «назад» (iPhone) и кнопка «назад» (Android) по вашим страницам, по желанию — вкладка «Поделиться»',
      'по желанию: push-уведомления о новостях и акциях, открывающие нужную страницу (отдельный этап)',
    ],
    look: 'Как будет выглядеть приложение',
    need: 'Что нужно от вас',
    needList: [
      'Аккаунты магазинов на ваше имя: Apple Developer (99 $ в год) и Google Play Console (25 $ один раз). Публикуем с ваших аккаунтов — приложение ваше.',
      'Логотип квадратом и название приложения (до 30 знаков).',
      'Открытая страница политики конфиденциальности на сайте.',
      'Кто попробует тестовую сборку на своём телефоне (iPhone — TestFlight, Android — ссылка).',
      'Google Play, личный аккаунт разработчика, созданный после 13.11.2023: до выпуска 12 тестировщиков должны пробыть в закрытом тесте 14 дней подряд (правило Google). У аккаунта компании этого шага нет.',
    ],
    plan: 'План по шагам',
    planList: [
      'Тестовая сборка приложения на вашем телефоне — через 1–2 рабочих дня после старта.',
      'Ваши замечания и один круг правок.',
      'Страницы в магазинах: название, описание, скриншоты, ответы о приватности.',
      'Отправка с ваших аккаунтов и ответы проверяющим. Сроки проверки задают Apple и Google.',
      'После запуска: обновлять приложение при изменениях сайта не нужно — оно показывает ваши живые страницы.',
    ],
    sample: 'Пример отчёта на нашей демо-пекарне (Crumb & Co — вымышленная) — такой отчёт вы получите по своему сайту на первом этапе.',
  },
};

const fmtPhone = (p) => (/^\+1\d{10}$/.test(p) ? `+1 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

// rows: [level, check, result, meaning]
export function rows(r, lang = 'en') {
  const t = T[lang];
  const out = [];
  const two = (key, ok, fill) => {
    const k = t[key];
    if (ok) out.push(['✅', k[0], typeof k[1] === 'function' ? k[1](fill) : k[1], k[2]]);
    else out.push([key === 'https' || key === 'mobile' ? '🔴' : '🟡', k[0], k[3], k[4]]);
  };
  two('https', r.https);
  two('mobile', r.viewport);
  out.push(['✅', t.tabs[0], t.tabs[1](r.config.tabs.map((x) => x.title).join(' · ')), t.tabs[2]]);
  two('phone', !!r.phone, r.phone && fmtPhone(r.phone));
  two('icon', !!(r.icon && !r.icon.startsWith('data:') && /apple-touch-icon|\.png|\.svg/i.test(r.icon)));
  two('privacy', !!r.privacyUrl, r.privacyUrl);
  if (r.flowHosts?.length) out.push(['✅', t.pay[0], t.pay[1](r.flowHosts.join(', ')), t.pay[2]]);
  else if (r.shop) out.push(['✅', t.pay[0], t.pay[3], t.pay[4]]);
  if (r.digital) out.push(['🟡', ...t.digital]);
  if (r.login) out.push(['🟡', ...t.login]);
  if (r.googleSignIn) out.push(['🟡', ...t.google]);
  if (r.upload) out.push(['⚪', ...t.upload]);
  if (r.trackers?.length) out.push(['⚪', t.trackers[0], t.trackers[1](r.trackers.join(', ')), t.trackers[2]]);
  out.push(['⚪', ...t.owner]);
  return out;
}

export function reportMd(r, lang = 'en', { date = new Date().toISOString().slice(0, 10), images = [] } = {}) {
  const t = T[lang];
  const rs = rows(r, lang);
  const red = rs.filter((x) => x[0] === '🔴').length;
  const lines = [
    `# ${t.title(r.config.appName)}`,
    '',
    t.head(r.url, date),
    '',
    (red ? t.notReady : t.ready) + t.counts(rs.filter((x) => x[0] === '🟡' || x[0] === '🔴').length, rs.filter((x) => x[0] === '⚪').length),
    '',
    `## ${t.checked}`,
    '',
    `| ${t.cols.join(' | ')} |`,
    '|---|---|---|---|',
    ...rs.map((x) => `| ${x.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`),
    '',
    `## ${t.adds}`,
    '',
    t.addsText,
    ...t.addsList.map((x) => `- ${x}`),
    '',
  ];
  if (images.length) lines.push(`## ${t.look}`, '', ...images.map(([cap, file]) => `![${cap}](${file})`), '');
  lines.push(`## ${t.need}`, '', ...t.needList.map((x, i) => `${i + 1}. ${x}`), '', `## ${t.plan}`, '', ...t.planList.map((x, i) => `${i + 1}. ${x}`), '');
  return lines.join('\n');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function reportHtml(r, lang = 'en', { note = '', ...opts } = {}) {
  const md = reportMd(r, lang, opts).split('\n');
  const out = [];
  let mode = '';
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\\\|/g, '|').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const close = () => { if (mode) out.push({ table: '</tbody></table>', ul: '</ul>', ol: '</ol>', fig: '</div>' }[mode]); mode = ''; };
  for (const line of md) {
    if (line.startsWith('|---')) continue;
    if (line.startsWith('| ')) {
      const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => inline(c.trim()));
      if (mode !== 'table') { close(); out.push(`<table><thead><tr>${cells.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`); mode = 'table'; continue; }
      out.push(`<tr>${cells.map((c, i) => `<td${i === 0 ? ' class=lvl' : ''}>${c}</td>`).join('')}</tr>`);
      continue;
    }
    const img = /^!\[(.*)\]\((.*)\)$/.exec(line);
    if (img) { if (mode !== 'fig') { close(); out.push('<div class=shots>'); mode = 'fig'; } out.push(`<figure><img src="${esc(img[2])}" alt="${esc(img[1])}" width="390" height="844" loading="lazy"><figcaption>${esc(img[1])}</figcaption></figure>`); continue; }
    if (line.startsWith('- ')) { if (mode !== 'ul') { close(); out.push('<ul>'); mode = 'ul'; } out.push(`<li>${inline(line.slice(2))}</li>`); continue; }
    if (/^\d+\. /.test(line)) { if (mode !== 'ol') { close(); out.push('<ol>'); mode = 'ol'; } out.push(`<li>${inline(line.replace(/^\d+\. /, ''))}</li>`); continue; }
    if (!line.trim()) continue;
    close();
    if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(md[0].replace(/^# /, ''))}</title><style>
:root{--bg:#f7f8f8;--card:#fff;--ink:#111827;--muted:#4b5563;--line:#d9dee0;--accent:#0f766e}
@media (prefers-color-scheme:dark){:root{--bg:#0e1413;--card:#17201f;--ink:#ecf1f0;--muted:#a7b4b2;--line:#2a3634;--accent:#5eead4}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 16px 48px}h1{font-size:28px;line-height:1.2;margin:0 0 12px}h2{font-size:20px;margin:30px 0 10px}
p{margin:6px 0;color:var(--muted)}p b{color:var(--ink)}a{color:var(--accent);word-break:break-all}.note{border:1.5px solid var(--accent);border-radius:12px;padding:10px 14px;color:var(--ink);margin-bottom:18px}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:14px;overflow:hidden;margin:14px 0;font-size:15px}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}th{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
td.lvl{width:1.5em}ul,ol{background:var(--card);border-radius:14px;padding:14px 14px 14px 34px;margin:10px 0}li{margin:4px 0}
.shots{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}figure{margin:0;flex:1 1 200px;max-width:260px}figure img{width:100%;height:auto;border-radius:22px;border:1px solid var(--line);display:block}
figcaption{font-size:14px;color:var(--muted);text-align:center;margin-top:6px}
@media (max-width:640px){table,thead,tbody,tr,td,th{display:block}thead{display:none}tr{border-bottom:1px solid var(--line);padding:8px 4px}td{border:0;padding:2px 8px}td.lvl,td:nth-child(2){display:inline-block;width:auto;padding-right:0}td:nth-child(2){font-weight:600;color:var(--ink)}}
</style></head><body><main>${note ? `<p class=note>${esc(note)}</p>` : ''}${out.join('\n')}</main></body></html>\n`;
}

export { T };

async function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const raw = process.argv[2];
  if (!raw || raw.startsWith('--')) { console.log('usage: node tools/report.mjs https://site.com [--lang ru] [--md] [--img "Home:a.png,Offline:b.png"] [--out report.html]'); process.exit(2); }
  const url = /^https?:\/\//.test(raw) ? raw : 'https://' + raw;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  const r = analyse(await res.text(), res.url, Object.fromEntries(res.headers));
  r.config.startUrl = res.url;
  const lang = arg('--lang') === 'ru' ? 'ru' : 'en';
  const outFile = arg('--out');
  const images = (arg('--img') || '').split(',').filter(Boolean).map((x) => { const [cap, file] = x.split(':'); return [cap, file]; });
  let shown = images;
  if (outFile && images.length) {
    const dir = join(dirname(resolve(outFile)), 'img');
    mkdirSync(dir, { recursive: true });
    shown = images.map(([cap, file]) => { copyFileSync(file, join(dir, basename(file))); return [cap, 'img/' + basename(file)]; });
  }
  const text = process.argv.includes('--md') ? reportMd(r, lang, { images: shown }) : reportHtml(r, lang, { images: shown });
  if (outFile) { writeFileSync(outFile, text); console.log('✅ ' + outFile); } else process.stdout.write(text);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

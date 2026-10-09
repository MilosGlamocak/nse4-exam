import { chromium } from 'playwright-core';
// Optional browser tests (need: npm i && npx playwright-core install chromium).
// Run after 'npm run build'. Opens the built nse4-exam.html via file://.
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const S = mkdtempSync(join(tmpdir(), 'nse4-e2e-'));
mkdirSync(S + '/shots');
const APP_URL = `file://${P}/nse4-exam.html`;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message));
await page.goto(APP_URL);
await page.waitForSelector('h1');

// ---- bundled packs (samples/pack-*.json baked into the HTML) ----
await page.waitForSelector('.banner.good');
ok(/Ugrađeni paketi učitani/.test(await page.textContent('.banner.good')), 'bundled packs auto-import on first run');
await page.click('nav >> text=Biblioteka');
ok((await page.textContent('h2 >> nth=-1')).includes('Pitanja (147)'), 'bundled: 147 questions (95+9+43)');
ok((await page.locator('.badge:text-is("ugrađen")').count()) === 3, 'bundled packs are badged');
await page.waitForTimeout(500);
await page.reload(); await page.waitForSelector('h1');
await page.click('nav >> text=Biblioteka');
ok((await page.textContent('h2 >> nth=-1')).includes('Pitanja (147)'), 'bundled: no duplicates after reload');
await page.click('tr:has-text("knowledge-checks") >> button:has-text("Obriši")');
await page.click('.modal button.danger');
await page.waitForTimeout(500);
await page.reload(); await page.waitForSelector('h1');
await page.click('nav >> text=Biblioteka');
ok((await page.textContent('h2 >> nth=-1')).includes('Pitanja (104)'), 'bundled: deleted pack stays deleted after reload');
await page.click('button:has-text("Vrati ugrađene pakete")');
ok((await page.textContent('h2 >> nth=-1')).includes('Pitanja (147)'), 'bundled: restore button brings it back');
// start the rest of the scenarios from an empty library
await page.click('nav >> text=Podešavanja');
await page.click('button:has-text("Obriši sve")'); await page.click('.modal button.danger');
await page.click('nav >> text=Biblioteka');

// ---- import via file chooser ----
await page.click('nav >> text=Biblioteka');
const upload = async (f) => { await page.setInputFiles('input[type=file][multiple]', f); await page.waitForTimeout(150); };
await upload(`${P}/sample-pack.json`);
let rep = await page.textContent('.report');
ok(/Dodato pitanja: 6/.test(rep) && /Ispiti – dodato: 1/.test(rep), 'JSON import adds 6 questions + 1 exam');
await upload(`${P}/sample-pack.json`);
rep = await page.textContent('.report');
ok(/preskočeno \(postoje\): 6/.test(rep), 're-import skips existing');
await page.check('text=Prepiši pitanja');
await upload(`${P}/sample-pack.json`);
rep = await page.textContent('.report');
ok(/prepisano: 6/.test(rep), 'overwrite replaces');
await page.uncheck('text=Prepiši pitanja');
await upload(`${P}/sample-pack.csv`);
ok(/Dodato pitanja: 2/.test(await page.textContent('.report')), 'CSV (with BOM) import adds 2');

const bad = `${S}/bad.json`;
writeFileSync(bad, JSON.stringify({ pack: 'bad', questions: [
  { id: 'ok1', source: 'dump', lesson: 2, topic: 'T', type: 'single', question: 'Q', options: [{id:'A',text:'a'},{id:'B',text:'b'}], correct: ['A'] },
  { id: 'bad1', source: 'dump', lesson: 2, topic: 'T', type: 'single', question: 'Q', options: [{id:'A',text:'a'},{id:'A',text:'b'}], correct: ['Z'] },
  { id: 'bad2', source: 'x', lesson: 99, topic: '', type: 'multi', question: '', options: [], correct: [] },
]}));
await upload(bad);
rep = await page.textContent('.report');
ok(/Dodato pitanja: 1/.test(rep) && /Nevažeći zapisi: 2/.test(rep), 'invalid questions rejected individually, valid kept');
const badCsv = `${S}/bad.csv`;
writeFileSync(badCsv, 'id;source;lesson;topic;question;A;B;C;D;E;F;correct;explanation\nc1;dump;1;T;Q;a;b;;;;;A;\nc2;dump;1;T;too;few\n');
await upload(badCsv);
rep = await page.textContent('.report');
ok(/Dodato pitanja: 1/.test(rep) && /Nevažeći zapisi: 1/.test(rep), 'CSV wrong field count reported');
const notPack = `${S}/nope.json`; writeFileSync(notPack, '{broken');
await upload(notPack);
ok(/JSON nije ispravan/.test(await page.textContent('.banner.bad')), 'broken JSON reports fatal error');
ok((await page.textContent('h2 >> nth=-1')).includes('Pitanja (10)'), 'library has 10 questions (6+2+1+1)');

// delete single + search
await page.fill('input[type=search]', 'ok1');
ok((await page.locator('.qrow').count()) === 1, 'search narrows list');
await page.click('.qrow button[aria-label^="Obriši"]');
await page.click('.modal button.danger');
await page.fill('input[type=search]', '');
ok((await page.textContent('h2 >> nth=-1')).includes('Pitanja (9)'), 'delete single question');
// delete pack
await page.click('tr:has-text("bad") >> button:has-text("Obriši")');
await page.click('.modal button.danger');
await page.waitForTimeout(100);
ok(!(await page.textContent('main')).includes('bad.csv'), 'pack deleted');

// ---- exam mode: all correct ----
await page.click('nav >> text=Početna');
await page.click('.exam-card button.primary');
await page.waitForSelector('.run-head');
const n = await page.locator('.navcell').count();
const pickText = async (...subs) => { for (const s of subs) await page.locator('.opt', { has: page.locator('.txt', { hasText: new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click(); };
for (let i = 0; i < n; i++) {
  const q = await page.textContent('.qtext');
  if (q.includes('marked as the correct')) await pickText('Option text: this is the correct choice');
  else if (q.includes('SIX options')) {
    ok((await page.locator('.opt').count()) === 6, 'six-option question shows 6 options');
    await page.keyboard.press('f'); // should select option F (6th), not flag
    ok((await page.locator('.opt').nth(5).getAttribute('aria-checked')) === 'true', 'F key selects option F on 6-option question');
    ok(!(await page.textContent('.run-head')).includes('1 označeno'), 'F did not flag');
    await page.keyboard.press('Shift+F');
    ok((await page.textContent('.run-head')).includes('1 označeno'), 'Shift+F flags');
    await page.keyboard.press('Shift+F');
    await page.locator('.opt', { has: page.locator('.txt', { hasText: /^sixth/ }) }).click();
  }
  else if (q.includes('contain the word')) await pickText('yes - select me', 'yes - select me too');
  else if (q.includes('even numbers')) { await page.click('.opt >> text=/^2$/'); await page.click('.opt >> text=/^10$/'); await page.click('.opt >> text=/^4$/'); }
  else if (q.includes('colour is the link')) await pickText('blue');
  else if (q.includes('statements that are true')) await pickText('The exhibit shows two boxes', 'The boxes are connected by a line');
  else console.log('UNKNOWN Q', q);
  if (i < n - 1) await page.keyboard.press('n');
}
ok((await page.textContent('.run-head')).includes('6/6 odgovoreno'), 'all answered');
await page.keyboard.press('p'); await page.keyboard.press('p');
ok((await page.textContent('.qhead')).includes(`${n - 2} / ${n}`), 'P goes back');
await page.click('.run-head >> text=Predaj');
await page.click('.modal button.primary');
await page.waitForSelector('.score-big');
const hero = await page.textContent('.score-hero');
ok(hero.includes('100%') && hero.includes('PROLAZ'), 'shuffled answers all correct => 100% PROLAZ: ' + hero.replace(/\s+/g,' '));

// ---- practice mode ----
await page.click('button:has-text("Početna")');
await page.click('.exam-card button:has-text("Vežba")');
await page.waitForSelector('.run-head');
ok((await page.textContent('.qhead')).includes('Lekcija'), 'practice shows lesson/topic');
await page.keyboard.press('a');
await page.keyboard.press('Enter');
await page.waitForSelector('.feedback');
ok(/Tačno|Netačno/.test(await page.textContent('.feedback')), 'practice gives immediate feedback');
ok((await page.locator('.opt:disabled').count()) > 0, 'answer locked after check');
await page.click('.run-head >> text=Predaj');
await page.click('.modal button.primary');
await page.waitForSelector('.score-big');
// retry wrong
const wrongBtn = page.locator('button:has-text("Ponovi pogrešne (vežba)")');
if (await wrongBtn.isEnabled()) { await wrongBtn.click(); await page.waitForSelector('.run-head'); ok(true, 'retry wrong starts a session'); await page.click('.run-head >> text=Prekini'); await page.click('.modal button.danger'); }

// ---- partial credit ----
await page.click('nav >> text=Podešavanja');
await page.check('text=Delimični bodovi');
await page.click('nav >> text=Početna');
await page.click('.exam-card button.primary');
await page.waitForSelector('.run-head');
for (let i = 0; i < n; i++) {
  const q = await page.textContent('.qtext');
  if (q.includes('contain the word')) await pickText('yes - select me too'); // 1 of 2 right
  if (i < n - 1) await page.keyboard.press('n');
}
await page.click('.run-head >> text=Predaj'); await page.click('.modal button.primary');
await page.waitForSelector('.score-big');
ok((await page.textContent('.score-hero')).includes('0,5 / 6') || (await page.textContent('.score-hero')).includes('0.5 / 6'), 'partial credit gives 0.5 for 1/2 multi: ' + (await page.textContent('.score-hero')).replace(/\s+/g,' '));
await page.click('nav >> text=Podešavanja'); await page.uncheck('text=Delimični bodovi');

// ---- custom exam ----
await page.click('nav >> text=Početna');
await page.click('text=Podesi ispit');
await page.click('.chip:has-text("11")');
ok((await page.textContent('.card >> nth=1')).includes('2 pitanja odgovara'), 'custom lesson filter counts 2');
await page.selectOption('select', 'practice');
await page.click('button:has-text("Započni")');
await page.waitForSelector('.run-head');
ok((await page.locator('.navcell').count()) === 2, 'custom exam has 2 questions');
await page.click('.run-head >> text=Prekini'); await page.click('.modal button.danger');

// ---- backup export / restore ----
await page.click('nav >> text=Podešavanja');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Preuzmi backup")')]);
const bk = `${S}/backup.json`; await dl.saveAs(bk);
const bj = JSON.parse(readFileSync(bk, 'utf8'));
ok(bj.app === 'nse4-exam-backup' && bj.questions.length === 8 && bj.history.length >= 3, `backup contains data (q=${bj.questions.length}, h=${bj.history.length})`);
await page.click('button:has-text("Obriši sve")'); await page.click('.modal button.danger');
await page.click('nav >> text=Biblioteka');
ok(!(await page.textContent('main')).includes('Pitanja ('), 'wipe empties library');
await page.click('nav >> text=Podešavanja');
await page.setInputFiles('input[type=file]:not([multiple])', bk);
await page.click('.modal button.danger');
await page.waitForTimeout(200);
await page.click('nav >> text=Istorija');
ok((await page.locator('tbody tr').count()) >= 3, 'restore brings history back');

// ---- persistence across reload ----
await page.waitForTimeout(500);
await page.reload(); await page.waitForSelector('h1');
await page.click('nav >> text=Biblioteka');
ok((await page.textContent('h2 >> nth=-1')).includes('Pitanja (8)'), 'data persists after reload');

// ---- themes + mobile screenshots ----
await page.click('nav >> text=Podešavanja');
await page.selectOption('select >> nth=0', 'dark');
await page.click('nav >> text=Početna');
await page.click('.exam-card button.primary'); await page.waitForSelector('.run-head');
await page.click('.opt >> nth=0');
await page.screenshot({ path: S + '/shots/dark-run.png' });
await page.setViewportSize({ width: 390, height: 800 });
await page.screenshot({ path: S + '/shots/mobile-run.png', fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!overflow, 'no horizontal overflow at 390px');
await page.click('.run-head >> text=Prekini'); await page.click('.modal button.danger');
await page.click('nav >> text=Istorija'); await page.click('text=Slaba područja');
await page.screenshot({ path: S + '/shots/mobile-weak.png', fullPage: true });
ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
console.log(fails ? `${fails} FAILURES` : 'ALL OK');
await browser.close();

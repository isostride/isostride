import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { TEST_DATA, addFromPicker, chooseFolder, clearAnalysis, fakeFolderPicker, nav, showList } from '../e2e/support';

/**
 * The site's screenshots (apps/site/public/shots): the whole window of the app on the demo data of a
 * made-up runner, never on anybody's own runs. Not part of the test suite:
 *   node scripts/make-demo.mjs /tmp/demo && DEMO=/tmp/demo npx playwright test -c playwright.shots.config.ts
 * then, in apps/site/public/shots: for f in *.png; do cwebp -q 82 -m 6 $f -o ${f%.png}.webp; done; rm *.png
 * With SHOTS_LANG=pl the same screens in Polish, into apps/site/public/shots/pl ("pamietaj o screensjota
 * polskich w wersji polskiej strony"): the app is driven in English and put in Polish for each shot.
 */
const DEMO = process.env.DEMO!;
const LANG = process.env.SHOTS_LANG === 'pl' ? 'pl' : 'en';
const OUT = path.resolve(TEST_DATA, '../../../site/public/shots', LANG === 'en' ? '' : LANG);
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'en-GB' });

async function put(page: Page, dir: string[], files: { name: string; b64: string }[]) {
  await page.evaluate(async ({ dir, files }) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('data', { create: true });
    for (const part of dir) d = await d.getDirectoryHandle(part, { create: true });
    for (const { name, b64 } of files) {
      const w = await (await d.getFileHandle(name, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
    }
  }, { dir, files });
}
const read = async (dir: string, names: string[]) => Promise.all(names.map(async (name) => ({ name, b64: (await fs.readFile(path.join(dir, name))).toString('base64') })));

/** Puts the app in a language (as Settings › Display does) and reloads the screen shown. */
async function language(page: Page, lang: string) {
  await page.evaluate((l) => localStorage.setItem('isostride.language', l), lang);
  await page.reload();
  await page.locator('html:not([data-lang-pending])').waitFor();
  await page.waitForTimeout(5000);
}

/** The whole window, as the runner sees it; in Polish, the screen put in Polish for it, then back. */
async function shot(page: Page, name: string) {
  if (LANG !== 'en') await language(page, LANG);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(700, 895);
  await page.waitForTimeout(1500);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', name, (await page.locator('h1').first().textContent().catch(() => '')) ?? '');
  if (LANG !== 'en') await language(page, 'en');
}

test('site shots', async ({ page }) => {
  test.setTimeout(900_000);
  const fit = (await fs.readdir(path.join(DEMO, 'fit'))).sort();
  // The app's today: the evening of the demo's last day (a Sunday), so the week and the form are full.
  await page.clock.setFixedTime(new Date(`${fit[fit.length - 1].slice(0, 10)}T17:30:00Z`));
  await fakeFolderPicker(page);
  await page.goto('/');
  for (let i = 0; i < fit.length; i += 12) await put(page, ['fit'], await read(path.join(DEMO, 'fit'), fit.slice(i, i + 12)));
  await put(page, ['.isostride', 'user'], await read(path.join(DEMO, '.isostride/user'), ['gear.json', 'run-tags.json', 'settings.json', 'block-definitions.json', 'dashboard.json']));
  await chooseFolder(page);
  await page.getByRole('heading', { name: 'Runs' }).waitFor();
  await page.locator('.sidebar .brand').click();
  await page.getByRole('button', { name: 'Import folder' }).click();
  await page.getByText(/^Imported \d+ runs?/).waitFor({ timeout: 600_000 });
  await page.waitForTimeout(4000);

  await page.goto('/dashboard');
  await page.locator('.perf-widget, .tile, [class*="tile"]').first().waitFor({ timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(6000);
  await shot(page, 'dashboard');

  await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
  await page.getByRole('heading', { name: 'Runs' }).waitFor();
  await showList(page);
  await page.locator('tr.row', { hasText: '6 × 1 km' }).first().click();
  await page.getByRole('img', { name: /^Run metrics · / }).waitFor();
  await page.waitForTimeout(2500);
  await shot(page, 'run');

  await nav(page, 'Compare');
  await clearAnalysis(page);
  await addFromPicker(page, /^1 km reps/);
  await page.locator('.item-chip').first().waitFor({ timeout: 60_000 });
  const metrics = page.getByRole('group', { name: 'Metrics' });
  for (const m of ['Pace', 'Ground contact']) {
    const b = metrics.getByRole('button', { name: m, exact: true });
    if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
  }
  for (const b of await metrics.getByRole('button', { pressed: true }).all()) {
    const t = (await b.textContent()) ?? '';
    if (!['Pace', 'Ground contact'].includes(t.trim())) await b.click();
  }
  await page.getByRole('table', { name: 'Changes' }).waitFor({ timeout: 120_000 });
  console.log('changes:', ((await page.getByRole('table', { name: 'Changes' }).innerText()) ?? '').replace(/\s+/g, ' ').slice(0, 400));
  await shot(page, 'trend');

  await page.getByRole('tab', { name: 'A/B' }).click();
  await page.getByRole('img', { name: 'Difference and interval' }).waitFor({ timeout: 60_000 }).catch(() => console.log('ab: no difference chart'));
  console.log('ab:', ((await page.locator('.analysis-panel').innerText()) ?? '').replace(/\s+/g, ' ').slice(0, 500));
  await shot(page, 'ab');

  for (const [tab, view] of [['load', 'form'], ['capacity', 'critical']]) {
    await page.goto(tab === 'overview' ? '/performance' : `/performance?tab=${tab}&view=${view}`);
    await page.getByRole('heading', { name: 'Performance' }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(5000);
    if (view === 'critical') console.log(view + ':', ((await page.locator('.perf-widget').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 300));
    await shot(page, view || 'performance');
  }
});

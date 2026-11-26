import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEST_DATA, addFromPicker, clearAnalysis, nav, showList } from '../e2e/support';

/**
 * The site's screenshots (apps/site/public/shots): the whole window of the app on its demo (lib/demo, the
 * sample runner the app makes when it is opened with ?demo), never on anybody's own runs. Not part of the
 * test suite:
 *   npx playwright test -c playwright.shots.config.ts
 * then, in apps/site/public/shots: for f in *.png; do cwebp -q 82 -m 6 $f -o ${f%.png}.webp; done; rm *.png
 * With SHOTS_LANG=pl the same screens in Polish, into apps/site/public/shots/pl ("pamietaj o screensjota
 * polskich w wersji polskiej strony"): the demo is made in Polish (its titles and tags), the app is driven
 * in English and put in Polish for each shot.
 */
const LANG = process.env.SHOTS_LANG === 'pl' ? 'pl' : 'en';
const OUT = path.resolve(TEST_DATA, '../../../site/public/shots', LANG === 'en' ? '' : LANG);
/** The demo's segment of 1 km repetitions, as the demo names it in its language (lib/demo/words.ts). */
const KM_REPS = LANG === 'pl' ? /^Powtórzenia 1 km/ : /^1 km reps/;
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'en-GB' });

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
  // The demo made in the language of the shots, then the app driven in English.
  await page.goto('/');
  await page.evaluate((l) => localStorage.setItem('isostride.language', l), LANG);
  await page.goto('/dashboard?demo');
  const bar = page.locator('.demo-bar');
  await bar.waitFor({ timeout: 180_000 });
  // Until the earlier history is in too: the two years whole.
  await expect(bar.getByRole('status')).toHaveCount(0, { timeout: 600_000 });
  if (LANG !== 'en') await language(page, 'en');
  await page.waitForTimeout(4000);

  await page.goto('/dashboard');
  await page.locator('.perf-widget, .tile, [class*="tile"]').first().waitFor({ timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(6000);
  await shot(page, 'dashboard');

  await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
  await page.getByRole('heading', { name: 'Runs' }).waitFor();
  await showList(page);
  // A session of 1 km repetitions (not the short one of a race week).
  await page.locator('tr.row', { hasText: /[4-9] × 1 km/ }).first().click();
  await page.getByRole('img', { name: /^Run metrics · / }).waitFor();
  await page.waitForTimeout(2500);
  await shot(page, 'run');

  await nav(page, 'Compare');
  await clearAnalysis(page);
  await addFromPicker(page, KM_REPS);
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
  await page.getByRole('img', { name: /^Over time · Ground contact/ }).waitFor({ timeout: 120_000 });
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

  // The curve of the 90 days, by the model in use, with the bests on it.
  await page.goto('/performance?tab=capacity&view=efforts');
  await page.getByRole('heading', { name: 'Performance' }).waitFor({ timeout: 60_000 });
  await page.locator('.chart-note[data-model]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await shot(page, 'curve');

  // What if: 20 minutes 10 s/km faster than the best of that length.
  await page.goto('/performance?tab=whatif&view=curve');
  const pace = page.getByRole('textbox', { name: 'Effort 1: pace' });
  await pace.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const [m, sec] = (await pace.inputValue()).split(':').map(Number);
  const faster = m * 60 + sec - 10;
  await pace.fill(`${Math.floor(faster / 60)}:${String(faster % 60).padStart(2, '0')}`);
  await pace.blur();
  await page.getByRole('img', { name: 'Pace curve now and with the effort' }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await shot(page, 'whatif');
});

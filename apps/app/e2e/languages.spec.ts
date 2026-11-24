import { expect, test, type Page } from '@playwright/test';
import { PL } from '../lib/i18n/pl';
import { fakeFolderPicker, fitFiles, putFitFiles } from './support';

// A browser set to Polish (requirements "App in English and Polish", "Language chosen", "Numbers and dates in the language").
test.use({ locale: 'pl-PL' });

/** The site, served as the static host serves it (playwright.config.ts). */
const SITE = 'http://localhost:4174/';
/** The English texts on the screen the Polish dictionary translates: a text that went round t(). */
async function english(page: Page): Promise<string[]> {
  const shown = await page.evaluate(() => {
    const out: string[] = [];
    const seen = (e: Element) => e.checkVisibility() && !e.closest('nextjs-portal, .sr-only');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim();
      if (text && n.parentElement && seen(n.parentElement)) out.push(text);
    }
    for (const e of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
      if (!seen(e)) continue;
      for (const a of ['aria-label', 'title', 'placeholder']) { const v = e.getAttribute(a)?.trim(); if (v) out.push(v); }
    }
    return out;
  });
  return [...new Set(shown.filter((s) => { const pl = PL[s]; return pl !== undefined && (typeof pl === 'string' ? pl : pl.other) !== s; }))];
}

test.describe('App in English and Polish', () => {
  test('App in Polish from the browser', async ({ page }) => {
    // The site first (requirement "Site in English and Polish"): a Polish browser lands on /pl; EN and PL
    // in the header switch the language, the choice kept in this browser.
    await page.goto(SITE);
    await expect(page).toHaveURL(`${SITE}pl`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('IsoStride: otwarta platforma do analizy biegów.');
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', 'https://isostride.com');
    await page.getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(SITE);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('IsoStride is an open platform for analysing your runs.');
    await page.reload();
    await expect(page).toHaveURL(SITE);
    await page.getByRole('link', { name: 'Polski' }).click();
    await expect(page).toHaveURL(`${SITE}pl`);
    await page.goto(SITE);
    await expect(page).toHaveURL(`${SITE}pl`);

    await fakeFolderPicker(page, { wizard: true });
    await page.goto('/');
    await putFitFiles(page, await fitFiles(5, '2026-10-01'));
    const left: string[] = [];
    const check = async (screen: string) => {
      await page.waitForTimeout(300);
      left.push(...(await english(page)).map((s) => `${screen}: ${s}`));
    };
    const html = page.locator('html');

    // In Polish from the start: the page is in its language, the Welcome screen too.
    await expect(html).toHaveAttribute('lang', 'pl');
    await expect(html).not.toHaveAttribute('data-lang-pending');
    await check('Welcome');
    await page.locator('.welcome-step .btn').first().click();
    await page.waitForURL(/\/setup$/);

    // The wizard: the runs imported by themselves, then each step in Polish.
    const card = page.locator('section.setup-card');
    const next = page.locator('.setup-nav .btn.primary');
    await expect(card.locator('.setup-facts dd').nth(1)).toHaveText('5', { timeout: 60_000 });
    await check('Setup · runs');
    for (const step of ['You', 'Zones', 'Gear', 'Load model', 'Look & feel']) {
      await next.click();
      await page.waitForTimeout(200);
      await check(`Setup · ${step}`);
    }
    // The language switched in the wizard's Display step: the wizard and the menu at once, the step kept.
    const nav = page.getByRole('navigation').first();
    await expect(nav).toContainText('Biegi');
    await page.getByRole('radio', { name: 'English' }).click();
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(nav).toContainText('Runs');
    await expect(card.locator('.setup-device')).toBeVisible();
    await expect(card).toContainText('Language');
    await page.getByRole('radio', { name: 'Polski' }).click();
    await expect(nav).toContainText('Biegi');
    await expect(card).toContainText('Język');
    await next.click();
    await check('Setup · Done');
    await next.click();
    await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
    await check('Dashboard');

    // Settings › Language & region: English chosen, kept after a reload; then Polish again.
    await page.locator('.sidebar a[href="/settings"]').click();
    await page.goto('/settings?tab=language');
    await page.getByRole('radio', { name: 'English' }).click();
    await page.reload();
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(page.locator('.sidebar .nav a[href="/"]')).toContainText('Runs');
    await page.getByRole('radio', { name: 'Polski' }).click();
    await expect(page.locator('.sidebar .nav a[href="/"]')).toContainText('Biegi');
    for (const tab of ['data', 'models', 'metrics', 'gears', 'tags', 'display', 'language', 'about']) {
      await page.goto(`/settings?tab=${tab}`);
      await check(`Settings · ${tab}`);
    }

    // The screens: no English the dictionary translates; distances with a decimal comma, dates in Polish.
    await page.locator('.sidebar .nav a[href="/"]').click();
    await page.locator('.cal-week').first().waitFor();
    await check('Runs');
    await expect(page.locator('.calendar')).toContainText(/(listopad|październik) 2026/i);
    await page.locator('.run-tile:not(.dim)').first().click();
    await page.locator('.run-figures').waitFor();
    await expect(page.locator('.run-figures dd').first()).toHaveText(/^\d+,\d{2} km$/);
    await check('Run');
    for (const [href, screen] of [['/segments', 'Segments'], ['/compare', 'Compare'], ['/performance', 'Performance'], ['/settings', 'Data']] as const) {
      await page.goto(href);
      await page.waitForTimeout(1500);
      await check(screen);
    }
    expect(left).toEqual([]);
  });
});

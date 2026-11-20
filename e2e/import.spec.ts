import { expect, test } from '@playwright/test';
import { fakeFolderPicker, fitFiles, importAll, openWithFolder, putFitFiles, recordMeasure } from './support';

test.describe('Pick data folder', () => {
  test('First launch picks folder', async ({ page }) => {
    await fakeFolderPicker(page);
    await page.goto('/');
    await putFitFiles(page, await fitFiles(1));
    await expect(page.getByRole('button', { name: 'Choose data folder' })).toBeVisible();
    await page.getByRole('button', { name: 'Choose data folder' }).click();
    await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible();
    // The handle is remembered in IndexedDB.
    const kept = await page.evaluate(() => new Promise<boolean>((resolve) => {
      const req = indexedDB.open('strideprism');
      req.onsuccess = () => {
        const get = req.result.transaction('kv').objectStore('kv').get('folderHandle');
        get.onsuccess = () => resolve(!!get.result && get.result.name === 'data');
      };
    }));
    expect(kept).toBe(true);
  });
});

test.describe('Reopen same folder', () => {
  test('Later launch reopens folder', async ({ page }) => {
    await openWithFolder(page, await fitFiles(1));
    // A later launch: the remembered folder opens once access is confirmed (here, at once).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose data folder' })).toHaveCount(0);
    await expect(page.locator('.crumbs')).toContainText('data');
  });
});

test.describe('Unsupported browser message', () => {
  test('Edge starts normally', async ({ page }) => {
    // Chromium stands for Chrome, Edge and Opera.
    await page.goto('/');
    await expect(page.getByText('Browser not supported')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Choose data folder' })).toBeVisible();
    await recordMeasure('supportedStartedChromium', 1);
  });
});

test.describe('Import FIT files', () => {
  test('Import new FIT files', async ({ page }) => {
    await openWithFolder(page, await fitFiles(3));
    await importAll(page);
    // The Runs screen opens on the calendar (scenario "Calendar shown and switched to a list"): a row
    // per week of 7 days with its totals, each run a tile; the weeks at a glance with up to 12 bars.
    const calendar = page.getByRole('region', { name: 'Calendar of runs' });
    await expect(calendar.locator('.run-tile')).toHaveCount(3);
    await expect(calendar.locator('.cal-week').first().locator('.cal-day')).toHaveCount(7);
    await expect(calendar.locator('.cal-week:has(.run-tile) .cal-total b').first()).toHaveText(/^\d+(\.\d)? km$/);
    // Grouped by month: a band with the month's name and totals, the weeks named by their ISO number.
    await expect(calendar.locator('.cal-month-band h3').first()).toHaveText(/^[A-Z][a-z]+ \d{4}$/);
    await expect(calendar.locator('.cal-month-band').filter({ hasText: / km · / }).first()).toContainText(/\d+ runs?$/);
    await expect(calendar.locator('.cal-week-name b').first()).toHaveText(/^W\d{1,2}$/);
    const glance = page.getByRole('region', { name: 'Weeks at a glance' });
    await expect(glance.getByRole('img')).toHaveAttribute('aria-label', /^Distance of the last \d+ weeks: /);
    const weeks = await calendar.locator('.cal-week').count();
    await expect(glance.locator('.glance-bar')).toHaveCount(Math.min(12, weeks));
    // A tile opens its run; back, the list shows the table, remembered after a reload.
    await calendar.locator('.run-tile').first().click();
    await expect(page).toHaveURL(/\/run\?id=/);
    await page.goBack();
    await page.getByRole('radio', { name: 'List' }).click();
    await expect(page.locator('table.data tbody tr.row')).toHaveCount(3);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('table.data tbody tr.row')).toHaveCount(3);
  });
});

test.describe('Non-blocking processing', () => {
  test('UI responsive during import', async ({ page }) => {
    await openWithFolder(page, await fitFiles(40));
    await page.getByRole('button', { name: 'Import folder' }).click();
    await expect(page.getByText(/Working in the background/)).toBeVisible();
    // While the worker imports, another screen opens at once.
    const t0 = Date.now();
    await page.locator('.sidebar').getByRole('link', { name: /Gear and tags$/ }).click();
    await expect(page.getByRole('heading', { name: 'Gear and tags' })).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(2000);
    // The import finished in the background.
    await expect(async () => {
      await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
      await expect(page.locator('.run-tile')).toHaveCount(40, { timeout: 2000 });
    }).toPass({ timeout: 60_000 });
  });
});

import { expect, test } from '@playwright/test';
import { addFromPicker, fitFiles, importAll, nav, openWithFolder, recordMeasure, clearAnalysis } from './support';


const bg = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('Light and dark theme', () => {
  test('Theme follows the system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openWithFolder(page, await fitFiles(1));
    expect(await bg(page)).toBe('rgb(29, 31, 35)');
    await page.getByRole('radio', { name: 'Light' }).click();
    expect(await bg(page)).toBe('rgb(244, 245, 247)');
    await page.reload();
    await page.getByRole('heading', { name: 'Runs' }).waitFor();
    expect(await bg(page)).toBe('rgb(244, 245, 247)');
    await page.getByRole('radio', { name: 'System' }).click();
    expect(await bg(page)).toBe('rgb(29, 31, 35)');
  });
});

test.describe('Journeys', () => {
  test('Import, recompute, block definition, trend, export and A/B without the network', async ({ page }) => {
    const origins = new Set<string>();
    page.on('request', (r) => origins.add(new URL(r.url()).origin));
    // Runs on both watches, so the A/B screen can split by watch.
    await openWithFolder(page, await fitFiles(30, '2026-05-01'));
    await importAll(page);

    // Recompute everything from the FIT files.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Recompute everything' }).click();
    await expect(page.getByText(/^Recomputed \d+ runs/)).toBeVisible({ timeout: 60_000 });

    // Block definition: on the Analysis screen, take a suggested route segment (about 4.5 min, so pace, not HR).
    await nav(page, 'Analysis');
    // Analysis opens with all runs; the block is taken in their place.
    await expect(page.locator('.item-chip')).toHaveText([/^All runs/]);
    await clearAnalysis(page);
    await addFromPicker(page, /^1\.6 km/);
    await expect(page.locator('.item-chip')).toHaveCount(1, { timeout: 30_000 });

    // Analysis: the block over time, its verdict in words.
    await page.getByRole('button', { name: 'Pace', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Over time' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Changes' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/-instances\.csv$/);

    // A/B, a tab of Analysis: split by watch, a difference with its interval.
    await page.getByRole('tab', { name: 'A/B' }).click();
    await expect(page.getByRole('img', { name: 'Difference and interval' })).toBeVisible();
    await expect(page.getByText(/95% interval/).first()).toBeVisible();

    const external = [...origins].filter((o) => o !== 'http://localhost:4173');
    await recordMeasure('externalRequests', external.length);
    expect(external).toEqual([]);
  });
});

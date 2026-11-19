import { expect, test } from '@playwright/test';
import { fitFiles, importAll, openWithFolder, recordMeasure } from './support';

const nav = (page: import('@playwright/test').Page, name: string) => page.locator('.sidebar').getByRole('link', { name: new RegExp(`${name.replace('/', '\\/')}$`) }).click();
const bg = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('Light and dark theme', () => {
  test('Theme follows the system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openWithFolder(page, await fitFiles(1));
    expect(await bg(page)).toBe('rgb(14, 16, 21)');
    await page.getByRole('radio', { name: 'Light' }).click();
    expect(await bg(page)).toBe('rgb(247, 247, 249)');
    await page.reload();
    await page.getByRole('heading', { name: 'Runs' }).waitFor();
    expect(await bg(page)).toBe('rgb(247, 247, 249)');
    await page.getByRole('radio', { name: 'System' }).click();
    expect(await bg(page)).toBe('rgb(14, 16, 21)');
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

    // Block definition: accept a suggested route segment (about 4.5 min, so pace, not HR).
    await nav(page, 'Blocks');
    await page.locator('.block-card.suggested', { hasText: /^1\.6 km/ }).getByRole('button', { name: 'Accept' }).click();
    await expect(page.locator('.block-card:not(.suggested)')).toHaveCount(1, { timeout: 30_000 });

    // Trend: the chart and a series card.
    await nav(page, 'Trend');
    await page.getByRole('button', { name: 'Pace', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Trend' })).toBeVisible();
    await expect(page.getByText(/instances$/).first()).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/-instances\.csv$/);

    // A/B: split by watch, a difference with its interval.
    await nav(page, 'A/B comparison');
    await expect(page.getByRole('img', { name: 'Difference and interval' })).toBeVisible();
    await expect(page.getByText(/95% interval/)).toBeVisible();

    const external = [...origins].filter((o) => o !== 'http://localhost:4173');
    await recordMeasure('externalRequests', external.length);
    expect(external).toEqual([]);
  });
});

import { expect, test } from '@playwright/test';
import { fitFiles, importAll, openRun, openWithFolder, recordMeasure } from './support';

/** A 1×1 transparent PNG: the tile server is stood in for, nothing leaves the test machine. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test.describe('Map background', () => {
  test('Map tiles only when switched on', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) external.push(r.url()); });
    await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
    await openWithFolder(page, await fitFiles(1, '2026-11-09'));
    await importAll(page);
    await openRun(page);
    const map = page.getByRole('img', { name: 'Route' });
    await map.waitFor();

    // Off by default: nothing requested from outside, no tiles drawn.
    await page.waitForTimeout(500);
    expect(external).toEqual([]);
    await expect(map.locator('.map-tiles')).toHaveCount(0);

    // Switched on: tiles from tile.openstreetmap.org only, under the route, with the attribution.
    await page.getByRole('checkbox', { name: /Map background/ }).check();
    await expect(map.locator('.map-tiles image').first()).toBeAttached();
    await expect(page.getByRole('link', { name: '© OpenStreetMap contributors' })).toBeVisible();
    await expect.poll(() => external.length).toBeGreaterThan(0);
    const other = external.filter((u) => !/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u));
    await recordMeasure('mapOnOtherRequests', other.length);
    expect(other).toEqual([]);

    // The setting is remembered on the next visit.
    await page.reload();
    await page.getByRole('img', { name: 'Route' }).waitFor();
    await expect(page.getByRole('checkbox', { name: /Map background/ })).toBeChecked();
    await expect(page.getByRole('img', { name: 'Route' }).locator('.map-tiles image').first()).toBeAttached();
  });
});

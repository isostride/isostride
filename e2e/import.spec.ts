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
      await expect(page.locator('table.data tbody tr.row')).toHaveCount(40, { timeout: 2000 });
    }).toPass({ timeout: 60_000 });
  });
});

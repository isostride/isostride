import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { addFromPicker, clearAnalysis, fitFiles, importAll, nav, openWithFolder, showList } from './support';

/**
 * Requirement "Every metric offered everywhere" (ADR "Metrics from the file"): the runner's COROS files
 * hold Form Power, a developer field the app has no entry for, and no respiration rate.
 */
test.describe('Every metric offered everywhere', () => {
  test('New metric on every screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWithFolder(page, await fitFiles(3, '2026-11-09'));
    await importAll(page);

    // The run chart: Form Power among the metrics it can show, respiration rate nowhere.
    await showList(page);
    await page.locator('tr.row').first().click();
    await page.getByRole('img', { name: /^Run metrics · / }).waitFor();
    await expect(page.getByRole('button', { name: /^Form Power$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Respiration/ })).toHaveCount(0);

    // Compare: all runs, Form Power among its metrics, a column of the CSV export.
    await nav(page, 'Compare');
    await clearAnalysis(page);
    await addFromPicker(page, /^All runs/);
    await expect(page.locator('.item-chip')).toHaveCount(1, { timeout: 30_000 });
    const metrics = page.getByRole('group', { name: 'Metrics' });
    await expect(metrics.getByRole('button', { name: 'Form Power' })).toBeVisible();
    await expect(metrics.getByRole('button', { name: /Respiration/ })).toHaveCount(0);
    // The segments of the rule computed: the export holds them.
    await expect(page.locator('.chart-loading')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole('table', { name: 'Changes' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const csv = await fs.readFile(await (await download).path(), 'utf8');
    expect(csv.split('\n')[0].split(',')).toContain('dev.formPower');

    // Settings: a zone of Form Power, and which way is better, not set (up or down).
    await nav(page, 'Settings');
    await expect(page.locator('.zone-row', { hasText: 'Form Power' })).toBeVisible();
    await expect(page.locator('.zone-row', { hasText: /Respiration/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Metrics' }).click();
    const direction = page.getByRole('combobox', { name: 'Which way is better for Form Power' });
    await expect(direction).toHaveValue('app');
    await expect(direction.locator('option:checked')).toHaveText('Not set: up or down');
  });
});

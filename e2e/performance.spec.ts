import { expect, test } from '@playwright/test';
import { fitFiles, importAll, nav, openRun, openWithFolder, readText, showList } from './support';

test.describe('Performance model', () => {
  test('Load model set and form drawn', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWithFolder(page, await fitFiles(30, '2026-08-20'));
    await importAll(page);

    // Settings: Banister TRIMP until chosen otherwise; Power TSS against the critical power of the curve, saved, the loads recomputed.
    await nav(page, 'Settings');
    const card = page.getByRole('region', { name: 'Performance model' });
    const models = card.getByRole('radiogroup', { name: 'Load model' });
    await expect(models.getByRole('radio', { name: /Banister TRIMP/ })).toHaveAttribute('aria-checked', 'true');
    await expect(card.getByLabel('Maximum heart rate')).toHaveAttribute('placeholder', /^auto: \d{3}$/);
    await models.getByRole('radio', { name: /Power TSS/ }).click();
    await expect(card.getByLabel('Critical power')).toHaveAttribute('placeholder', /^auto: \d+$/);
    await card.getByRole('button', { name: 'Save and recompute' }).click();
    await expect(card.getByRole('status')).toHaveText('Saved · loads recomputed', { timeout: 60_000 });
    expect(JSON.parse(await readText(page, 'strideprism/user/settings.json')).performance.load).toBe('powerTss');

    // Runs: each run's load in TSS in the list, each week's in the calendar.
    await nav(page, 'Runs');
    await page.getByRole('radio', { name: 'Calendar' }).click();
    await expect(page.locator('.cal-load').first()).toHaveText(/^\d+ TSS$/);
    await showList(page);
    await expect(page.getByRole('columnheader', { name: 'Load TSS' })).toBeVisible();
    await expect(page.locator('tr.row').first().locator('td').nth(10)).toHaveText(/^\d+\*?$/);

    // A run: its load and the form that morning.
    await openRun(page);
    await expect(page.locator('.run-load dd')).toHaveText(/^\d+\*? TSS$/);
    await expect(page.locator('.run-figures')).toContainText(/form that morning[+−-]?\d+/);

    // Analysis, the Form tab, with no item chosen: fitness, fatigue, form and the ratio, over the period chosen, kept in the link.
    await nav(page, 'Analysis');
    await page.getByRole('tab', { name: 'Form' }).click();
    await expect(page).toHaveURL(/tab=form/);
    const chart = page.getByRole('img', { name: 'Form over time' });
    await expect(chart.locator('.form-fitness')).toBeAttached();
    await expect(chart.locator('.form-fatigue')).toBeAttached();
    await expect(chart.locator('.form-form')).toBeAttached();
    expect(await chart.locator('.form-load').count()).toBeGreaterThan(5);
    const today = page.getByLabel('Form today');
    await expect(today).toContainText(/Fitness \(CTL\)\d+/);
    await expect(today).toContainText(/Form \(TSB\)[+-]?\d+/);
    await expect(page.getByText('Load by Power TSS (TSS)')).toBeVisible();
    await page.getByRole('radio', { name: 'All' }).click();
    await expect(page).toHaveURL(/period=all/);
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.7, box.y + 100);
    await expect(page.locator('.tooltip')).toContainText(/fitness \d+ · fatigue \d+/);
  });
});

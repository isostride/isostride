import { expect, test, type Locator, type Page } from '@playwright/test';
import { fitFiles, importAll, openWithFolder } from './support';

/**
 * Every chart on the whole screen (the runner's "podoba mi sie opcja wykresu full screen i obracania go na telefonie ..
 * che aby kazdy mial taka opcje"): Expand on the card of each chart, the card made the screen, its charts as wide and
 * as tall as the screen leaves them; Close or Escape, and the focus back on Expand.
 */
async function expandAndBack(page: Page, card: Locator, name: string) {
  const chart = card.getByRole('img').first();
  const before = (await chart.boundingBox())!;
  await card.getByRole('button', { name: 'Expand chart' }).click();
  const dialog = page.getByRole('dialog', { name: `${name}, expanded` });
  await expect(dialog).toBeVisible();
  // Wider and taller than on its screen, and the screen's size.
  const viewport = page.viewportSize()!;
  await expect.poll(async () => (await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect((await dialog.boundingBox())!.height).toBeGreaterThanOrEqual(viewport.height - 1);
  await expect.poll(async () => (await dialog.getByRole('img').first().boundingBox())!.width).toBeGreaterThan(before.width);
  await expect.poll(async () => (await dialog.getByRole('img').first().boundingBox())!.height).toBeGreaterThan(before.height);
  // Escape closes it; the focus is back on Expand.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Expand chart' })).toBeFocused();
}

test.describe('Charts on the whole screen', () => {
  test('Every chart expanded to the whole screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await openWithFolder(page, await fitFiles(12, '2026-09-01'));
    await importAll(page);
    // The Runs screen's weeks.
    await expandAndBack(page, page.locator('section.glance'), 'Weeks at a glance');
    // A view of Performance: Form.
    await page.goto('/performance?tab=load&view=form');
    const view = page.locator('.perf-widget');
    await expect(view.getByRole('img', { name: 'Form over time' })).toBeVisible({ timeout: 30_000 });
    await expandAndBack(page, view, 'Load · Form');
    // A tile of the Dashboard: Expand in its head; a tile with no chart has none.
    await page.goto('/dashboard');
    const weekly = page.getByRole('region', { name: 'Weekly distance' });
    await expect(weekly.getByRole('img')).toBeVisible({ timeout: 30_000 });
    await expandAndBack(page, weekly, 'Weekly distance');
    await expect(page.getByRole('region', { name: 'Recent runs' }).getByRole('button', { name: 'Expand chart' })).toHaveCount(0);
  });

  test('Chart expanded on a phone on its side', async ({ page }) => {
    // A phone turned on its side: 844 × 390. The card made to fit: no scrolling to see its chart whole.
    await page.setViewportSize({ width: 844, height: 390 });
    await openWithFolder(page, await fitFiles(12, '2026-09-01'));
    await importAll(page);
    await page.goto('/performance?tab=load&view=form');
    const view = page.locator('.perf-widget');
    await expect(view.getByRole('img', { name: 'Form over time' })).toBeVisible({ timeout: 30_000 });
    await view.getByRole('button', { name: 'Expand chart' }).click();
    const dialog = page.getByRole('dialog', { name: 'Load · Form, expanded' });
    await expect(dialog).toBeVisible();
    const chart = dialog.getByRole('img', { name: 'Form over time' });
    await expect.poll(async () => { const b = (await chart.boundingBox())!; return b.y + b.height; }).toBeLessThanOrEqual(390 + 1);
    expect((await chart.boundingBox())!.width).toBeGreaterThan(844 * 0.88);
    await dialog.getByRole('button', { name: 'Exit full screen' }).click();
    await expect(dialog).toHaveCount(0);
  });
});

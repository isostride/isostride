import { expect, test } from '@playwright/test';
import { fitFiles, importAll, nav, openWithFolder } from './support';

test.describe('Accept or reject recommendation', () => {
  test('Accept recommendation', async ({ page }) => {
    await openWithFolder(page, await fitFiles(30, '2026-05-01'));
    await importAll(page);
    await nav(page, 'Blocks');
    const card = page.locator('.block-card.suggested').first();
    const name = (await card.locator('.title').textContent())!;
    await card.getByRole('button', { name: 'Accept' }).click();
    // Moves to My blocks, with its instances detected in the history.
    const mine = page.locator('.block-card:not(.suggested)', { hasText: name });
    await expect(mine).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('.block-card.suggested', { hasText: name })).toHaveCount(0);
  });
});

test.describe('Definition from selection', () => {
  test('Definition from chart selection', async ({ page }) => {
    await openWithFolder(page, await fitFiles(5, '2026-11-09'));
    await importAll(page);
    await page.locator('tr.row').first().click();
    // Drag across the pace chart, a third of the run.
    const chart = page.getByRole('img', { name: 'Pace /km', exact: true });
    await chart.waitFor();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByText(/^Selected min /)).toBeVisible();
    await page.getByRole('button', { name: 'Steady fragment' }).click();
    // The new definition is the runner's own, on the Blocks screen.
    await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible();
    await expect(page.locator('.block-card:not(.suggested)')).toHaveCount(1, { timeout: 30_000 });
  });
});

test.describe('Block attributes', () => {
  test('Effort block shows its attributes', async ({ page }) => {
    await openWithFolder(page, await fitFiles(200, '2026-08-03'));
    await importAll(page);
    await nav(page, 'Blocks');
    await page.locator('.block-card.suggested').first().waitFor();
    const all = page.getByRole('button', { name: /^Show all \d+$/ });
    if (await all.isVisible()) await all.click();
    const effort = page.locator('.block-card.suggested', { has: page.locator('.title', { hasText: /effort$/ }) }).first();
    const name = (await effort.locator('.title').textContent())!;
    await effort.getByRole('button', { name: 'Accept' }).click();
    const card = page.locator('.block-card:not(.suggested)', { hasText: name });
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    // Heart rate from minute 5 of every instance, by default for an effort.
    await expect(card.getByText('heart rate from minute 5')).toBeVisible();
    // A standing start, set in the block's sheet, shows on the card.
    await card.click();
    await page.getByRole('combobox', { name: 'Start of every instance' }).selectOption('standing');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('.block-card:not(.suggested)', { hasText: name }).getByText('standing start')).toBeVisible({ timeout: 30_000 });
  });
});

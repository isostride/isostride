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
    // Deleted from its sheet: gone from My blocks, suggested again.
    page.once('dialog', (d) => d.accept());
    await mine.click();
    await page.getByRole('button', { name: 'Delete block' }).click();
    await expect(mine).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.block-card.suggested', { hasText: name })).toHaveCount(1, { timeout: 30_000 });
  });
});

test.describe('Definition from selection', () => {
  test('Definition from chart selection', async ({ page }) => {
    await openWithFolder(page, await fitFiles(5, '2026-11-09'));
    await importAll(page);
    await page.locator('tr.row').first().click();
    // Drag across the pace chart, a third of the run.
    const chart = page.getByRole('img', { name: 'Pace · min/km', exact: true });
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

test.describe('Blocks from criteria', () => {
  test('Block from criteria with a live count', async ({ page }) => {
    await openWithFolder(page, await fitFiles(12, '2026-05-01'));
    await importAll(page);
    // The runner titles the newest run, so a block can find it by its title.
    const first = page.locator('tr.row').first();
    await first.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill('COROS test');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(first.getByText('COROS test')).toBeVisible();

    await nav(page, 'Blocks');
    await page.getByRole('button', { name: '+ New block from criteria' }).click();
    const sheet = page.getByRole('dialog', { name: 'New block from criteria' });
    const count = sheet.locator('.preview-count');
    await expect(count).toContainText('12 runs meet the criteria');
    // Narrowed as the runner types: a distance range, then the title.
    await sheet.getByLabel('Distance from').fill('0.5');
    await sheet.getByLabel('Distance to').fill('100');
    await expect(count).toContainText(/^\d+ runs? meets? the criteria$/);
    await sheet.getByLabel('Title contains').fill('coros');
    await expect(count).toContainText('1 run meets the criteria');
    await expect(sheet.getByLabel('Name')).toHaveValue('“coros” · 0.5–100 km');
    await sheet.getByRole('button', { name: 'Create block' }).click();
    // The block is the runner's own, with the titled run as its instance.
    const card = page.locator('.block-card:not(.suggested)', { hasText: '“coros” · 0.5–100 km' });
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card.getByText('1 accepted')).toBeVisible({ timeout: 30_000 });
  });
});

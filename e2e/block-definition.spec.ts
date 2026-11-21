import { expect, test } from '@playwright/test';
import { addFromPicker, fitFiles, importAll, nav, openPicker, openRun, openWithFolder, showList, clearAnalysis, setChart } from './support';

test.describe('Accept or reject recommendation', () => {
  test('Accept recommendation', async ({ page }) => {
    await openWithFolder(page, await fitFiles(30, '2026-05-01'));
    await importAll(page);
    await nav(page, 'Analysis');
    await clearAnalysis(page);
    // The blocks found in the runs are offered in the picker; taking one keeps it and shows it.
    let dialog = await openPicker(page);
    const row = dialog.locator('.palette-row', { has: page.getByRole('button', { name: /^Dismiss / }) }).first();
    const name = (await row.locator('.palette-item span').first().textContent())!;
    await row.locator('.palette-item').click();
    const chip = page.locator('.item-chip', { hasText: name });
    await expect(chip).toHaveCount(1, { timeout: 30_000 });
    // On one of its runs (scenario "Blocks shown on demand"): the chart draws no block until asked;
    // pointing at the block in the list draws it alone, the Blocks toggle draws them all.
    const point = page.getByRole('img', { name: /^Over time · / }).first().locator('circle[r="4.5"]').last();
    await point.waitFor({ timeout: 30_000 });
    await point.scrollIntoViewIfNeeded();
    const p = (await point.boundingBox())!;
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
    await expect(page.locator('.tooltip')).toContainText('Click to open the run');
    await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2);
    const chart = page.getByRole('img', { name: /^Run metrics · / });
    await chart.waitFor();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    const listed = page.locator('.run-block');
    await expect(listed.first()).toBeVisible({ timeout: 30_000 });
    await page.mouse.move(0, 0);
    await expect(chart.locator('.block-band')).toHaveCount(0);
    await listed.first().hover();
    await expect(chart.locator('.block-band')).toHaveCount(1);
    await chart.hover();
    await expect(chart.locator('.block-band')).toHaveCount(0);
    // Settings, Charts draws every kept block on the chart.
    await setChart(page, 'blocks on');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(chart.locator('.block-band')).toHaveCount(await listed.count());
    await page.goBack();
    await expect(chip).toHaveCount(1, { timeout: 30_000 });
    // It is the runner's own now: no longer suggested.
    dialog = await openPicker(page);
    await expect(dialog.getByRole('button', { name: `Dismiss ${name}` })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Deleted from its sheet: gone from the screen, suggested again.
    page.once('dialog', (d) => d.accept());
    await chip.getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('button', { name: 'Delete block' }).click();
    await expect(chip).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/^⟳ /)).toHaveCount(0, { timeout: 30_000 });
    dialog = await openPicker(page);
    await expect(dialog.getByRole('button', { name: `Dismiss ${name}` })).toHaveCount(1);
    // Dismissed: not proposed again.
    await dialog.getByRole('button', { name: `Dismiss ${name}` }).click();
    await expect(dialog.getByRole('button', { name: `Dismiss ${name}` })).toHaveCount(0, { timeout: 30_000 });
  });
});

test.describe('Definition from selection', () => {
  test('Definition from chart selection', async ({ page }) => {
    await openWithFolder(page, await fitFiles(5, '2026-11-09'));
    await importAll(page);
    await openRun(page);
    // Drag across the pace chart, a third of the run.
    const chart = page.getByRole('img', { name: /^Run metrics · / });
    await chart.waitFor();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    // Made a block of in the chart menu.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await page.getByRole('dialog', { name: 'Chart menu' }).getByRole('button', { name: 'Steady fragment' }).click();
    // The new block is the runner's own, and opens where blocks are used: on the Analysis screen.
    await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.item-chip', { hasText: /^Steady / })).toHaveCount(1, { timeout: 30_000 });

  });
});

test.describe('Block attributes', () => {
  test('Effort block shows its attributes', async ({ page }) => {
    await openWithFolder(page, await fitFiles(200, '2026-08-03'));
    await importAll(page);
    await nav(page, 'Analysis');
    await clearAnalysis(page);
    await addFromPicker(page, /effort/);
    const chip = page.locator('.item-chip', { hasText: /effort/ });
    await expect(chip).toHaveCount(1, { timeout: 30_000 });
    // Heart rate from minute 5 of every instance, by default for an effort: shown with the block.
    const row = page.getByRole('table', { name: 'Changes' }).getByRole('row').nth(1);
    await expect(row.getByText('heart rate from minute 5')).toBeVisible();
    // A standing start, set in the block's sheet, shows with the block.
    await chip.getByRole('button', { name: /^Edit / }).click();
    await page.getByRole('combobox', { name: 'Start of every instance' }).selectOption('standing');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(row.getByText('standing start')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Blocks defined in Analysis', () => {
  test('Block built from a rule with a live count', async ({ page }) => {
    await openWithFolder(page, await fitFiles(12, '2026-05-01'));
    await importAll(page);
    // The runner titles the newest run, so a block can find it by its title.
    await showList(page);
    const first = page.locator('tr.row').first();
    await first.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill('COROS test');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(first.getByText('COROS test')).toBeVisible();

    await nav(page, 'Analysis');
    await clearAnalysis(page);
    await page.getByRole('button', { name: '+ Add block or run' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add block or run' });
    await dialog.getByRole('tab', { name: 'New block' }).click();
    const count = dialog.locator('.preview-count');
    // Whole runs: every run is a segment; narrowed as the runner types, a distance range, then the title.
    await dialog.getByRole('radio', { name: 'Whole runs' }).click();
    await expect(count).toContainText('12 segments in 12 runs', { timeout: 30_000 });
    await dialog.getByLabel('Distance from').fill('0.5');
    await dialog.getByLabel('Distance to').fill('100');
    await dialog.getByLabel('Title contains').fill('coros');
    await expect(count).toContainText('1 segment in 1 run', { timeout: 30_000 });
    await expect(dialog.getByLabel('Name')).toHaveValue('Runs · 0.5–100 km · “coros”');
    await dialog.getByRole('button', { name: 'Save and use' }).click();
    // Kept: the block is the runner's own, with the titled run as its segment.
    const kept = page.locator('.item-chip', { hasText: 'Runs · 0.5–100 km · “coros”' });
    await expect(kept).toHaveCount(1, { timeout: 30_000 });
    await expect(kept.getByRole('button', { name: 'Save' })).toHaveCount(0);
    // The sections are tabs: Segments lists the block's segments.
    const tabs = page.getByRole('tablist', { name: 'Analysis sections' });
    await tabs.getByRole('tab', { name: 'Segments' }).click();
    const segments = page.getByRole('table', { name: 'Segments' });
    await expect(segments.getByRole('row')).toHaveCount(2);
    await expect(segments.getByRole('row').nth(1)).toContainText('COROS test');

    // The fastest 5 minutes with the heart rate never below 100, used without keeping it: computed now, carried by the link.
    await page.getByRole('button', { name: '+ Add block or run' }).click();
    await dialog.getByRole('tab', { name: 'New block' }).click();
    await dialog.getByLabel('Heart rate never below').fill('100');
    await expect(count).toContainText(/^\d+ segments in \d+ runs/, { timeout: 30_000 });
    await expect(dialog.getByLabel('Name')).toHaveValue('Fastest 5 min · HR never below 100');
    await dialog.getByRole('button', { name: 'Use in analysis' }).click();
    const adhoc = page.locator('.item-chip', { hasText: 'Fastest 5 min · HR never below 100' });
    await expect(adhoc).toHaveCount(1);
    await expect(page).toHaveURL(/(?:items=|%2C)q%3A/);
    await tabs.getByRole('tab', { name: 'Trends' }).click();
    const changes = page.getByRole('table', { name: 'Changes' });
    await expect(changes.getByRole('row').nth(2)).toContainText(/\d+ segments/, { timeout: 30_000 });
    // Its segments, each a stretch of a run; the first opens the run with the stretch selected.
    await tabs.getByRole('tab', { name: 'Segments' }).click();
    await page.getByLabel('Block', { exact: true }).selectOption({ label: 'Fastest 5 min · HR never below 100' });
    await expect(segments.getByRole('row').nth(1)).toContainText(/\d+:\d\d–\d+:\d\d · \d\.\d\d km/);
    // Kept from its chip: it becomes the runner's own.
    await adhoc.getByRole('button', { name: 'Save' }).click();
    await expect(adhoc.getByRole('button', { name: 'Save' })).toHaveCount(0, { timeout: 30_000 });
    // No item of the link is a rule any more (an item "q:…"; a block id may itself end in "q").
    await expect(page).not.toHaveURL(/(?:items=|%2C)q%3A/, { timeout: 30_000 });
  });
});

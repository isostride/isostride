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
    await chip.getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('button', { name: 'Delete block' }).click();
    await page.getByRole('alertdialog', { name: 'Delete this block?' }).getByRole('button', { name: 'Delete' }).click();
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
    // Eight runs of late October: some over the same route, others elsewhere.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openWithFolder(page, await fitFiles(8, '2026-10-17'));
    await importAll(page);
    await openRun(page);
    // Drag across the chart, a fifth of the run.
    const chart = page.getByRole('img', { name: /^Run metrics · / });
    await chart.waitFor();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');

    // Similar stretches (scenario "Similar stretches found and overlaid"): the same route first, each
    // pass with its date and its time against the selection; the newest two drawn with the selection.
    await page.getByRole('button', { name: 'Find similar' }).click();
    const panel = page.getByRole('region', { name: 'Similar stretches' });
    const tabs = panel.getByRole('tablist', { name: 'Similar by' });
    await expect(tabs.getByRole('tab', { selected: true })).toHaveText(/^Same route · [2-9]/, { timeout: 60_000 });
    const route = panel.getByRole('region', { name: 'Stretches of the same route' }).locator('tbody tr');
    expect(await route.count()).toBeGreaterThanOrEqual(2);
    await expect(route.first().locator('td').nth(3)).toHaveText(/^[+−±]\d+:\d\d$/);
    await expect(route.first().locator('td').nth(4)).toHaveText(/^\d:\d\d \/km$/);
    const overlay = panel.getByRole('img', { name: /^Pace of the selection and 2 like it, by distance$/ });
    await expect(overlay).toBeVisible();
    await expect(panel.getByRole('list', { name: 'Stretches drawn' }).getByRole('listitem')).toHaveCount(3);
    // Another one chosen joins the chart; the heart rate compared instead of the pace.
    await route.nth(1).getByRole('checkbox').uncheck();
    await expect(panel.getByRole('img', { name: /and 1 like it/ })).toBeVisible();
    await panel.getByRole('radio', { name: 'Heart rate' }).click();
    await expect(panel.getByRole('img', { name: /^Heart rate of the selection and 1 like it/ })).toBeVisible();
    // The same profile on other routes: each stretch with how alike it is, and in what.
    await tabs.getByRole('tab', { name: /^Same profile/ }).click();
    const profile = panel.getByRole('region', { name: 'Stretches of the same profile' }).locator('tbody tr');
    await expect(profile.first()).toContainText(/\d+ %terrain \d+ % · shape \d+ % · level \d+ %/);
    await expect(panel.getByRole('img', { name: /like it, by distance$/ })).toBeVisible();
    // The same route kept as a block, in the one editor (requirement "One way to make a block"): the
    // stretch is the route taken from this run, its segments counted; saved, it opens in Analysis.
    await tabs.getByRole('tab', { name: /^Same route/ }).click();
    await panel.getByRole('button', { name: 'Keep the same route as a block' }).click();
    const editor = page.getByRole('dialog', { name: 'New block' });
    await expect(editor.getByRole('radio', { name: /^Same route: \d\.\d km \w+-bound$/ })).toHaveAttribute('aria-checked', 'true');
    await expect(editor.locator('.preview-count')).toContainText(/^[3-9] segments? in [3-9] runs?/, { timeout: 60_000 });
    await editor.getByRole('button', { name: 'Save block' }).click();
    await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.item-chip', { hasText: /any pace/ })).toHaveCount(1, { timeout: 30_000 });
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
    // Edited in the one editor: the effort is a stretch like any other block's.
    await chip.getByRole('button', { name: /^Edit / }).click();
    const sheet = page.getByRole('dialog', { name: 'Block' });
    await expect(sheet.getByRole('radio', { name: 'Fastest stretch' })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByRole('checkbox', { name: /^Only when run as an effort/ })).toBeChecked();
    await sheet.getByText('More: start, how many per run, statistic').click();
    await sheet.getByRole('combobox', { name: 'Start of the segment' }).selectOption('standing');
    await sheet.getByRole('button', { name: /Save/ }).click();
    await expect(row.getByText('standing start')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Every block on one screen', () => {
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

    // Blocks, after Runs in the menu: the runner's blocks, and the one editor of a new one.
    const items = page.locator('.sidebar nav a');
    await expect(items.nth(0)).toContainText('Runs');
    await expect(items.nth(1)).toContainText('Blocks');
    await nav(page, 'Blocks');
    await expect(page.getByRole('heading', { name: 'Blocks', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'New block' }).click();
    const dialog = page.getByRole('dialog', { name: 'New block' });
    const count = dialog.locator('.preview-count');
    // Whole runs: every run is a segment; narrowed as the runner types, a distance range, then the title.
    await dialog.getByRole('radio', { name: 'Whole runs' }).click();
    await expect(count).toContainText('12 segments in 12 runs', { timeout: 30_000 });
    await dialog.getByLabel('Distance from').fill('0.5');
    await dialog.getByLabel('Distance to').fill('100');
    await dialog.getByLabel('Title contains').fill('coros');
    await expect(count).toContainText('1 segment in 1 run', { timeout: 30_000 });
    await expect(dialog.getByLabel('Name')).toHaveValue('Runs · 0.5–100 km · “coros”');
    await dialog.getByRole('button', { name: 'Save block' }).click();
    // On the screen: the block, the stretch it takes, its segments, their runs and the latest.
    const table = page.getByRole('region', { name: 'Blocks', exact: true });
    const row = table.getByRole('row', { name: /^Runs · 0\.5–100 km · “coros”/ });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.getByRole('cell')).toHaveText([/^Runs · 0\.5–100 km · “coros”/, 'Runs', '1', '1', /\w{3} \d+, 2026/, /Edit/]);
    // Opened in Analysis: Segments lists the block's segment, the titled run.
    await row.getByRole('link', { name: /in Analysis$/ }).click();
    const kept = page.locator('.item-chip', { hasText: 'Runs · 0.5–100 km · “coros”' });
    await expect(kept).toHaveCount(1, { timeout: 30_000 });
    const tabs = page.getByRole('tablist', { name: 'Analysis sections' });
    await tabs.getByRole('tab', { name: 'Segments' }).click();
    const segments = page.getByRole('table', { name: 'Segments' });
    await expect(segments.getByRole('row')).toHaveCount(2);
    await expect(segments.getByRole('row').nth(1)).toContainText('COROS test');
    // Changed in the same editor from the Blocks screen: the fastest 5 minutes with the heart rate never below 100.
    await nav(page, 'Blocks');
    await row.getByRole('button', { name: /^Edit / }).click();
    const sheet = page.getByRole('dialog', { name: 'Block' });
    await sheet.getByRole('radio', { name: 'Fastest stretch' }).click();
    await sheet.getByLabel('Title contains').fill('');
    await sheet.getByLabel('Heart rate never below').fill('100');
    await expect(sheet.locator('.preview-count')).toContainText(/^\d+ segments in \d+ runs/, { timeout: 30_000 });
    await sheet.getByRole('button', { name: 'Save & re-detect' }).click();
    await expect(table.getByRole('row').nth(1).getByRole('cell').nth(1)).toHaveText('Fastest 5 min', { timeout: 30_000 });
    // Esc closes the editor; Delete in its row, once confirmed, removes the block from the screen.
    await table.getByRole('row').nth(1).getByRole('button', { name: /^Edit / }).click();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    // Asked in the app, not by the browser (requirement "Confirmations in the app"): Cancel (or Esc) keeps it, Delete removes it.
    const del = table.getByRole('row').nth(1).getByRole('button', { name: /^Delete / });
    const confirm = page.getByRole('alertdialog', { name: 'Delete this block?' });
    await del.click();
    await expect(confirm).toContainText('Fastest 5 min');
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(table.getByRole('row')).toHaveCount(2);
    await del.click();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/^No block yet/)).toBeVisible({ timeout: 30_000 });
  });
});

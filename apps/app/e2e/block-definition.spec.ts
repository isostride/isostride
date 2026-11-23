import { expect, test } from '@playwright/test';
import { addFromPicker, fitFiles, importAll, nav, openPicker, openRun, openWithFolder, showList, clearAnalysis, setChart } from './support';

test.describe('Accept or reject recommendation', () => {
  test('Accept recommendation', async ({ page }) => {
    await openWithFolder(page, await fitFiles(30, '2026-05-01'));
    await importAll(page);
    await nav(page, 'Compare');
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
    // The efforts of the segments in this run, as chips under the chart.
    const listed = page.getByRole('group', { name: 'Efforts of your segments in this run' }).locator('.run-block');
    await expect(listed.first()).toBeVisible({ timeout: 30_000 });
    await page.mouse.move(0, 0);
    await expect(chart.locator('.block-band')).toHaveCount(0);
    await listed.first().hover();
    await expect(chart.locator('.block-band')).toHaveCount(1);
    await chart.hover();
    await expect(chart.locator('.block-band')).toHaveCount(0);
    // Settings, Charts draws every kept block on the chart.
    await setChart(page, 'blocks on');
    await expect(chart.locator('.block-band')).toHaveCount(await listed.count());
    await page.goBack();
    await expect(chip).toHaveCount(1, { timeout: 30_000 });
    // It is the runner's own now: no longer suggested.
    dialog = await openPicker(page);
    await expect(dialog.getByRole('button', { name: `Dismiss ${name}` })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Deleted from its sheet: gone from the screen, suggested again.
    await chip.getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('button', { name: 'Delete segment' }).click();
    await page.getByRole('alertdialog', { name: 'Delete this segment?' }).getByRole('button', { name: 'Delete' }).click();
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

    // Similar efforts (scenario "Similar segments found and overlaid"), compared in Compare: Compare similar
    // on the run brings the same route and the same profile as unsaved segments, the Efforts tab open.
    await page.getByRole('link', { name: 'Compare similar' }).click();
    await expect(page.getByRole('heading', { name: 'Compare', level: 1 })).toBeVisible();
    const sections = page.getByRole('tablist', { name: 'Compare sections' });
    await expect(sections.getByRole('tab')).toHaveText(['Trends', 'Efforts', 'A/B', 'Pace / power curve']);
    const route = page.locator('.item-chip', { hasText: /^Same route as \w{3} \d+, 2026 · \d\.\d km/ });
    const profileChip = page.locator('.item-chip', { hasText: /^Same profile as / });
    await expect(route).toHaveCount(1, { timeout: 60_000 });
    await expect(profileChip).toHaveCount(1);
    await expect(route.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(sections.getByRole('tab', { selected: true })).toHaveText('Efforts');
    // Its efforts, the selection marked among them; it and the two newest others drawn over each other by distance.
    const efforts = page.getByRole('table', { name: 'Efforts' });
    // Read in the worker: the table fills once the efforts are found, each at a like pace (within 10 %).
    await expect.poll(() => efforts.getByRole('checkbox').count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    const n = await efforts.getByRole('checkbox').count();
    await expect(efforts.locator('tr.reference')).toHaveCount(1);
    await expect(efforts.locator('tr.reference')).toContainText('your selection');
    const paces = (await efforts.locator('tbody tr').allTextContents()).map((t) => t.match(/(\d+):(\d\d) \/km/)!).map((m) => Number(m[1]) * 60 + Number(m[2]));
    const own = paces[await efforts.locator('tbody tr').evaluateAll((rows) => rows.findIndex((r) => r.classList.contains('reference')))];
    expect(paces.every((p) => Math.abs(p / own - 1) <= 0.12)).toBe(true);
    const drawn = Math.min(3, n);
    // Drawn on a chart as rich as the run's: pace, heart rate and cadence in their bands, by distance.
    const effortChart = page.getByRole('img', { name: `Pace, Heart rate, Cadence of ${drawn} efforts, by distance` });
    await expect(effortChart).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('list', { name: 'Efforts drawn' }).getByRole('listitem').first()).toContainText(/^This selection · /);
    // Its figures under it, a row per effort drawn; the cursor gives every effort's values.
    await expect(page.getByRole('region', { name: 'Figures of the efforts drawn' }).locator('tbody tr')).toHaveCount(drawn);
    const cb = (await effortChart.boundingBox())!;
    await page.mouse.move(cb.x + cb.width * 0.5, cb.y + 40);
    await expect(page.locator('.effort-card')).toContainText(/Pace.*\d:\d\d \/km/);
    await page.mouse.move(0, 0);
    // One taken off; elevation added; along the time instead of the distance.
    await efforts.locator('tbody tr:not(.reference)').getByRole('checkbox', { checked: true }).first().uncheck();
    const left = drawn - 1;
    await page.getByRole('group', { name: 'Metrics drawn' }).getByRole('button', { name: 'Elevation' }).click();
    await page.getByRole('radiogroup', { name: 'Along' }).getByRole('radio', { name: 'Time' }).click();
    await expect(page.getByRole('img', { name: new RegExp(`^Pace, Heart rate, Cadence, Elevation of ${left} efforts?, by time$`) })).toBeVisible();
    // The same profile's efforts: the other segment of the list.
    const pick = page.getByLabel('Segment', { exact: true });
    await pick.selectOption({ label: (await pick.locator('option', { hasText: /^Same profile as / }).textContent())! });
    await expect.poll(() => efforts.getByRole('checkbox').count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    await expect(efforts.locator('tr.reference')).toHaveCount(1);
    // Its parameters in the editor ("jak klikne edit to wszystko jest puste"): the route taken from the run as
    // its part of each run, the pace band around the selection's pace as its condition.
    await route.getByRole('button', { name: /^Edit / }).click();
    const sheet = page.getByRole('dialog', { name: 'Segment' });
    await expect(sheet.getByRole('radio', { name: /^Same route: \d\.\d km \w+-bound$/ })).toHaveAttribute('aria-checked', 'true');
    const [lo, hi] = [await sheet.getByLabel('Pace from').inputValue(), await sheet.getByLabel('Pace to').inputValue()].map((v) => { const [m, x] = v.split(':').map(Number); return m * 60 + x; });
    expect(hi / lo).toBeGreaterThan(1.2);
    expect(hi / lo).toBeLessThan(1.25);
    await page.keyboard.press('Escape');
    // On Trends, the same route's trend; kept from its chip, it is the runner's own.
    await sections.getByRole('tab', { name: 'Trends' }).click();
    await expect(page.getByRole('table', { name: 'Changes' }).getByRole('row').nth(1)).toContainText(/\d+ efforts?/, { timeout: 60_000 });
    await route.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.item-chip', { hasText: /^Same route as / }).getByRole('button', { name: 'Save' })).toHaveCount(0, { timeout: 30_000 });

    // Compare this run: Compare opens on the run.
    await page.goBack();
    await chart.waitFor();
    await page.getByRole('link', { name: 'Compare this run' }).click();
    await expect(page.locator('.item-chip')).toHaveCount(1);
    await expect(page).toHaveURL(/\/compare\?items=r%3A|\/compare\?items=r:/);
  });
});

test.describe('Block attributes', () => {
  test('Effort block shows its attributes', async ({ page }) => {
    await openWithFolder(page, await fitFiles(200, '2026-08-03'));
    await importAll(page);
    await nav(page, 'Compare');
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
    const sheet = page.getByRole('dialog', { name: 'Segment' });
    await expect(sheet.getByRole('radio', { name: 'Best effort' })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByRole('checkbox', { name: /^Only when run as an effort/ })).toBeChecked();
    await sheet.getByText('More: start, how many per run, statistic').click();
    await sheet.getByRole('combobox', { name: 'Start of the effort' }).selectOption('standing');
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
    await expect(items.nth(1)).toContainText('Runs');
    await expect(items.nth(2)).toContainText('Segments');
    await nav(page, 'Segments');
    await expect(page.getByRole('heading', { name: 'Segments', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'New segment' }).click();
    const dialog = page.getByRole('dialog', { name: 'New segment' });
    const count = dialog.locator('.preview-count');
    // Whole runs: every run is a segment; narrowed as the runner types, a distance range, then the title.
    await dialog.getByRole('radio', { name: 'Whole runs' }).click();
    await expect(count).toContainText('12 efforts in 12 runs', { timeout: 30_000 });
    await dialog.getByLabel('Distance from').fill('0.5');
    await dialog.getByLabel('Distance to').fill('100');
    await dialog.getByLabel('Title contains').fill('coros');
    await expect(count).toContainText('1 effort in 1 run', { timeout: 30_000 });
    await expect(dialog.getByLabel('Name')).toHaveValue('Runs · 0.5–100 km · “coros”');
    await dialog.getByRole('button', { name: 'Save segment' }).click();
    // On the screen: the block, the stretch it takes, its segments, their runs and the latest.
    const table = page.getByRole('region', { name: 'Segments', exact: true });
    const row = table.getByRole('row', { name: /^Runs · 0\.5–100 km · “coros”/ });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.getByRole('cell')).toHaveText([/^Runs · 0\.5–100 km · “coros”/, 'Runs', '1', '1', /\w{3} \d+, 2026/, /Edit/]);
    // Opened in Analysis: Segments lists the block's segment, the titled run.
    await row.getByRole('link', { name: /in Compare$/ }).click();
    const kept = page.locator('.item-chip', { hasText: 'Runs · 0.5–100 km · “coros”' });
    await expect(kept).toHaveCount(1, { timeout: 30_000 });
    const tabs = page.getByRole('tablist', { name: 'Compare sections' });
    await tabs.getByRole('tab', { name: 'Efforts' }).click();
    const segments = page.getByRole('table', { name: 'Efforts' });
    await expect(segments.getByRole('row')).toHaveCount(2);
    await expect(segments.getByRole('row').nth(1)).toContainText('COROS test');
    // Changed in the same editor from the Blocks screen: the fastest 5 minutes with the heart rate never below 100.
    await nav(page, 'Segments');
    await row.getByRole('button', { name: /^Edit / }).click();
    const sheet = page.getByRole('dialog', { name: 'Segment' });
    await sheet.getByRole('radio', { name: 'Best effort' }).click();
    await sheet.getByLabel('Title contains').fill('');
    await sheet.getByLabel('Heart rate never below').fill('100');
    await expect(sheet.locator('.preview-count')).toContainText(/^\d+ efforts in \d+ runs/, { timeout: 30_000 });
    await sheet.getByRole('button', { name: 'Save & find again' }).click();
    await expect(table.getByRole('row').nth(1).getByRole('cell').nth(1)).toHaveText('Fastest 5 min', { timeout: 30_000 });
    // Pinned to the Dashboard (scenario "Dashboard of the runner's tiles"): first in the menu, its tiles at first this week,
    // the form, the last run, the weekly distance and recent runs; the segment pinned joins them with its efforts' pace.
    const segName = (await table.getByRole('row').nth(1).getByRole('cell').first().evaluate((td) => td.firstChild?.textContent ?? '')).trim();
    await expect(page.locator('.sidebar nav').getByRole('link').first()).toHaveAccessibleName('Dashboard');
    // Any run pinned from the corner of its chart ("Pin na kazdej karcie-widgecie"), with the metrics it shows.
    await nav(page, 'Runs');
    await openRun(page, 0);
    const pinRun = page.locator('.run-board').getByRole('button', { name: 'Pin COROS test to the dashboard' });
    await pinRun.click();
    await expect(pinRun).toHaveAttribute('aria-pressed', 'true');
    await nav(page, 'Dashboard');
    const tiles = page.locator('.dash-tile');
    await expect(tiles.locator('h2')).toHaveText(['This week', 'Form today', 'Last run', 'Weekly distance', 'Recent runs', 'COROS test'], { timeout: 30_000 });
    // The run's chart there as on its screen: its bands, Pace first.
    await expect(page.getByRole('region', { name: 'COROS test' }).locator('.dash-run svg').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'COROS test' })).toContainText('Pace');
    await expect(page.getByRole('region', { name: 'Weekly distance' }).getByRole('img', { name: /^Kilometres a week, the last 12 weeks/ })).toBeVisible();
    // Customize: a tile added, one moved up, one removed; kept for the next visit.
    await page.getByRole('button', { name: 'Customize' }).click();
    await page.getByLabel('Tile', { exact: true }).selectOption({ label: 'A segment' });
    await page.getByLabel('Which').selectOption({ label: segName });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByLabel('Tile', { exact: true }).selectOption({ label: 'A model of Performance' });
    await page.getByLabel('Which').selectOption({ label: 'VO2max as VDOT' });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Move Last run up' }).click();
    await page.getByRole('button', { name: 'Remove Recent runs' }).click();
    // Widths in thirds of the row: the weekly distance from two thirds to the whole row.
    await page.getByRole('button', { name: 'Width of Weekly distance: two thirds' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    await expect(tiles.locator('h2')).toHaveText(['This week', 'Last run', 'Form today', 'Weekly distance', 'COROS test', segName, 'VO2max as VDOT'], { timeout: 30_000 });
    await expect(page.getByRole('region', { name: segName })).toContainText(/\d:\d\d \/km/);
    await expect(page.getByRole('region', { name: 'Weekly distance' })).toHaveClass(/size-3/);
    await nav(page, 'Segments');
    // Esc closes the editor; Delete in its row, once confirmed, removes the block from the screen.
    await table.getByRole('row').nth(1).getByRole('button', { name: /^Edit / }).click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    // Asked in the app, not by the browser (requirement "Confirmations in the app"): Cancel (or Esc) keeps it, Delete removes it.
    const del = table.getByRole('row').nth(1).getByRole('button', { name: /^Delete / });
    const confirm = page.getByRole('alertdialog', { name: 'Delete this segment?' });
    await del.click();
    await expect(confirm).toContainText('Fastest 5 min');
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(table.getByRole('row')).toHaveCount(2);
    await del.click();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/^No segment yet/)).toBeVisible({ timeout: 30_000 });
  });
});

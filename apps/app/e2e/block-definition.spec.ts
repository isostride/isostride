import { expect, test } from '@playwright/test';
import { addField, addFromPicker, goToStep, saveSegment, clearAnalysis, fitFiles, headGap, importAll, nav, openPicker, openRun, openWithFolder, setChart, showList } from './support';

test.describe('Accept or reject recommendation', () => {
  test('Accept recommendation', async ({ page }) => {
    await openWithFolder(page, await fitFiles(30, '2026-05-01'));
    await importAll(page);
    await nav(page, 'Compare');
    await clearAnalysis(page);
    // Add segment or run at the right of the head, as New segment on Segments ("daj po prawej tak samo jak w segments").
    const head = page.locator('.page-head');
    const add = head.getByRole('button', { name: '+ Add segment or run' });
    const [headBox, addBox] = [(await head.boundingBox())!, (await add.boundingBox())!];
    expect(headBox.x + headBox.width - (addBox.x + addBox.width)).toBeLessThanOrEqual(24);
    // The blocks found in the runs are offered in the picker; taking one keeps it and shows it.
    let dialog = await openPicker(page);
    // In the look of the command palette ("panel add compare .. wyglada biednie"): the groups with their counts,
    // each option with the glyph of its kind, the keys and New segment… at its foot.
    await expect(dialog.locator('.cmdk-group').first()).toHaveText(/^Every run\d+$/);
    await expect(dialog.locator('.palette-item').first().locator('.cmdk-icon svg')).toBeVisible();
    await expect(dialog.locator('.cmdk-foot')).toContainText('↵ add');
    await expect(dialog.getByRole('link', { name: 'New segment…' })).toBeVisible();
    const row = dialog.locator('.palette-row', { has: page.getByRole('button', { name: /^Dismiss / }) }).first();
    const name = (await row.locator('.palette-item .cmdk-label').textContent())!;
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
    await page.getByRole('dialog', { name: 'Segment' }).getByRole('button', { name: 'Delete', exact: true }).click();
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
    await expect(sections.getByRole('tab')).toHaveText(['Trends', 'Efforts', 'A/B']);
    const route = page.locator('.item-chip', { hasText: /^Same route as \w{3} \d+, 2026 · \d\.\d km/ });
    const profileChip = page.locator('.item-chip', { hasText: /^Same profile as / });
    await expect(route).toHaveCount(1, { timeout: 60_000 });
    await expect(profileChip).toHaveCount(1);
    await expect(route.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(sections.getByRole('tab', { selected: true })).toHaveText('Efforts');
    // Its efforts, the selection marked among them; it and the two newest others drawn over each other by distance.
    const efforts = page.getByRole('table', { name: 'Efforts by run' });
    // Read in the worker: the table fills once the efforts are found, the selection's run open, the selection marked; every run opened, each effort at a like pace (within 10 %).
    await expect.poll(() => efforts.locator('tbody tr.reps-run-row').count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    await expect(efforts.locator('tr.reference')).toHaveCount(1);
    await expect(efforts.locator('tr.reference')).toContainText('your selection');
    for (const toggle of await efforts.getByRole('button', { expanded: false }).all()) await toggle.click();
    const paceCells = await efforts.locator('tbody tr.reps-rep-row').evaluateAll((rows) => rows.map((r) => ({ ref: r.classList.contains('reference'), text: r.children[2]?.textContent ?? '' })));
    const paces = paceCells.map((c) => { const m = c.text.match(/(\d+):(\d\d)/)!; return { ref: c.ref, p: Number(m[1]) * 60 + Number(m[2]) }; });
    const own = paces.find((x) => x.ref)!.p;
    expect(paces.every((x) => Math.abs(x.p / own - 1) <= 0.12)).toBe(true);
    // Drawn on a chart as rich as the run's, by the toggle (the chart alone): its runs chosen above it, at first the
    // selection's and the two newest others, each the mean of its efforts; pace, heart rate and cadence in their bands, by distance.
    const viewToggle = page.getByRole('radiogroup', { name: 'View' });
    // Its lines the metrics chosen above the tabs.
    const chosenMetrics = page.getByRole('group', { name: 'Metrics', exact: true });
    for (const m of ['Pace', 'Heart rate', 'Cadence']) {
      const b = chosenMetrics.getByRole('button', { name: m, exact: true });
      if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    }
    await viewToggle.getByRole('radio', { name: 'Chart' }).click();
    await expect(efforts).toHaveCount(0);
    const runsDrawn = page.getByRole('group', { name: 'Runs drawn' });
    const drawn = await runsDrawn.getByRole('button', { pressed: true }).count();
    expect(drawn).toBeGreaterThanOrEqual(2);
    expect(drawn).toBeLessThanOrEqual(3);
    const effortChart = page.getByRole('img', { name: `Pace, Heart rate, Cadence of ${drawn} efforts, by distance` });
    await expect(effortChart).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('list', { name: 'Efforts drawn' }).getByRole('listitem').first()).toContainText(/^This selection · /);
    // Its figures under it, a row per effort drawn; the cursor gives every effort's values.
    await expect(page.getByRole('region', { name: 'Figures of the efforts drawn' }).locator('tbody tr')).toHaveCount(drawn);
    const cb = (await effortChart.boundingBox())!;
    await page.mouse.move(cb.x + cb.width * 0.5, cb.y + 40);
    await expect(page.locator('.effort-card')).toContainText(/Pace.*\d:\d\d \/km/);
    await page.mouse.move(0, 0);
    // One run taken off; ground contact time added above the tabs; along the time instead of the distance.
    await runsDrawn.getByRole('button', { pressed: true }).last().click();
    const left = drawn - 1;
    await chosenMetrics.getByRole('button', { name: 'Ground contact', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Along' }).getByRole('radio', { name: 'Time' }).click();
    await expect(page.getByRole('img', { name: new RegExp(`^Pace, Heart rate, Cadence, Ground contact of ${left} efforts?, by time$`) })).toBeVisible();
    // The same profile's efforts: the other segment of the list.
    const pick = page.getByLabel('Segment', { exact: true });
    await pick.selectOption({ label: (await pick.locator('option', { hasText: /^Same profile as / }).textContent())! });
    await viewToggle.getByRole('radio', { name: 'Table' }).click();
    await expect.poll(() => efforts.locator('tbody tr').count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    await expect(efforts.locator('tr.reference')).toHaveCount(1);
    // Its parameters in the editor ("jak klikne edit to wszystko jest puste"): the route taken from the run as
    // its part of each run, the pace band around the selection's pace as its condition.
    await route.getByRole('button', { name: /^Edit / }).click();
    const sheet = page.getByRole('dialog', { name: 'Segment' });
    await goToStep(sheet, 'Segment');
    await expect(sheet.getByRole('radio', { name: /^Same route: \d\.\d km \w+-bound$/ })).toHaveAttribute('aria-checked', 'true');
    await goToStep(sheet, 'Further conditions');
    const [lo, hi] = [await sheet.getByLabel('Pace from').inputValue(), await sheet.getByLabel('Pace to').inputValue()].map((v) => { const [m, x] = v.split(':').map(Number); return m * 60 + x; });
    expect(hi / lo).toBeGreaterThan(1.2);
    expect(hi / lo).toBeLessThan(1.25);
    await page.keyboard.press('Escape');
    // On Trends, the same route's trend; kept from its chip, it is the runner's own.
    await sections.getByRole('tab', { name: 'Trends' }).click();
    await expect(page.getByRole('img', { name: /^Over time · / }).first().locator('.trend-line').first()).toBeVisible({ timeout: 60_000 });
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
    // Its attributes in its editor (no table of changes under the charts): heart rate from minute 5 of every instance, by default for an effort.
    // Edited in the one editor: the effort is a stretch like any other block's.
    await chip.getByRole('button', { name: /^Edit / }).click();
    const sheet = page.getByRole('dialog', { name: 'Segment' });
    await goToStep(sheet, 'Further conditions');
    await sheet.getByText('Matching checks').click();
    await expect(sheet.getByLabel(/^Heart rate from minute/)).toHaveValue('5');
    await goToStep(sheet, 'Segment');
    await expect(sheet.getByRole('radio', { name: 'Time' })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByRole('checkbox', { name: /^Only when run as an effort/ })).toBeChecked();
    await addField(sheet, 'condition', 'Start of the effort');
    await sheet.getByRole('combobox', { name: 'Start of the effort' }).selectOption('standing');
    await saveSegment(sheet);
    // A standing start, set in the editor, kept with the block.
    await chip.getByRole('button', { name: /^Edit / }).click();
    await goToStep(page.getByRole('dialog', { name: 'Segment' }), 'Further conditions');
    await expect(page.getByRole('dialog', { name: 'Segment' }).getByRole('combobox', { name: 'Start of the effort' })).toHaveValue('standing', { timeout: 30_000 });
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
    // The wizard ("1. Okres ... 2. Schemat biegu ... 3. Segment ... 4. dodaktowe warunki"), opened on the period.
    await expect(dialog.locator('.wizard-steps .wizard-title')).toHaveText(['Period', 'Run layout', 'Segment', 'Further conditions', 'Name and save']);
    await expect(dialog.locator('.wizard-steps button[aria-current="step"] .wizard-title')).toHaveText('Period');
    await goToStep(dialog, 'Segment');
    // The steps stay where they are while the count beside them changes ("gorne kafelki wizarda sie przesuwaja").
    const steps = dialog.locator('.wizard-steps');
    await expect(count).not.toContainText('Looking for efforts', { timeout: 30_000 });
    const before = await steps.boundingBox();
    await dialog.getByRole('radio', { name: 'Whole run' }).click();
    await expect(count).toContainText('Looking for efforts');
    expect(await steps.boundingBox()).toEqual(before);
    await expect(count).toContainText('12 efforts in 12 runs', { timeout: 30_000 });
    expect(await steps.boundingBox()).toEqual(before);
    // The editor in sections: a field shown once added ("+ Add a condition", "+ Add a filter of the runs"), the sections' heads saying what is set.
    await addField(dialog, 'condition', 'Distance');
    await dialog.getByLabel('Distance from').fill('0.5');
    await dialog.getByLabel('Distance to').fill('100');
    await addField(dialog, 'filter', 'Title contains');
    await dialog.getByLabel('Title contains', { exact: true }).fill('coros');
    // The steps name what each sets.
    await expect(dialog.locator('.step-summary')).toHaveText(['All runs', 'Any layout', 'Runs', 'Title contains · Distance', 'Runs · 0.5–100 km · “coros”']);
    await expect(count).toContainText('1 effort in 1 run', { timeout: 30_000 });
    // The matches: their count in the head, the runs listed only once it is opened.
    await expect(dialog.locator('.preview-list')).toBeHidden();
    await count.click();
    await expect(dialog.locator('.preview-list li')).toHaveCount(1);
    // Save on the last step only; Back and Next before it.
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await goToStep(dialog, 'Name and save');
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Runs · 0.5–100 km · “coros”');
    await expect(dialog.locator('.builder-actions button')).toHaveText(['Cancel', 'Back', 'Save']);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    // On the screen: the block, the stretch it takes, its segments, their runs and the latest.
    const table = page.getByRole('region', { name: 'Segments', exact: true });
    const row = table.getByRole('row', { name: /^Runs · 0\.5–100 km · “coros”/ });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.getByRole('cell')).toHaveText([/^Runs · 0\.5–100 km · “coros”/, 'Runs', '1', '1', /\w{3} \d+, 2026/, '']);
    await expect(row.getByRole('button', { name: /^Edit / })).toHaveAttribute('title', 'Edit');
    await row.hover();
    expect(await headGap(table.locator('table'))).toBeGreaterThanOrEqual(6);
    // Opened in Analysis by a click on its row (no Compare button: "poprostu klikam na wiersz"): Segments lists the block's segment, the titled run.
    await expect(row.getByRole('link', { name: 'Compare →' })).toHaveCount(0);
    await row.getByRole('cell').nth(2).click();
    const kept = page.locator('.item-chip', { hasText: 'Runs · 0.5–100 km · “coros”' });
    await expect(kept).toHaveCount(1, { timeout: 30_000 });
    const tabs = page.getByRole('tablist', { name: 'Compare sections' });
    await tabs.getByRole('tab', { name: 'Efforts' }).click();
    const segments = page.getByRole('table', { name: 'Efforts by run' });
    await expect(segments.locator('tbody tr.reps-run-row')).toHaveCount(1, { timeout: 30_000 });
    await expect(segments.locator('tbody tr.reps-run-row')).toContainText('COROS test');
    // Changed in the same editor from the Blocks screen: the fastest 5 minutes with the heart rate never below 100.
    await nav(page, 'Segments');
    await row.getByRole('button', { name: /^Edit / }).click();
    const sheet = page.getByRole('dialog', { name: 'Segment' });
    await goToStep(sheet, 'Segment');
    await sheet.getByRole('radio', { name: 'Time' }).click();
    await goToStep(sheet, 'Further conditions');
    await sheet.getByLabel('Title contains', { exact: true }).fill('');
    await addField(sheet, 'condition', 'Heart rate never below / above');
    await sheet.getByLabel('Heart rate never below', { exact: true }).fill('100');
    await expect(sheet.locator('.preview-count')).toContainText(/^\d+ efforts in \d+ runs/, { timeout: 30_000 });
    await saveSegment(sheet);
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
    // Each tile's way on, a pill at its foot ("linki na widgeta wygladaja kiepsko").
    const ways = tiles.locator('a.row-open');
    await expect(ways.first()).toBeVisible();
    for (const style of await ways.evaluateAll((as) => as.map((a) => { const c = getComputedStyle(a); return [c.borderTopLeftRadius, c.borderTopStyle, c.height]; })))
      expect(style).toEqual(['999px', 'solid', '30px']);
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
    // Its editor a dialog as every other: Cancel and ✕ close it too; Delete, Cancel and Save at its foot.
    await table.getByRole('row').nth(1).getByRole('button', { name: /^Edit / }).click();
    await expect(sheet.locator('.builder-actions button')).toHaveText(['Delete', 'Cancel', 'Next']);
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await table.getByRole('row').nth(1).getByRole('button', { name: /^Edit / }).click();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    // The list offers Edit and Compare only; a segment is deleted from its editor ("lista segmentow powinna miec
    // tylko edit i compare, w samym edit jest usuwanie"), asked in the app, not by the browser (requirement
    // "Confirmations in the app"): Cancel (or Esc) keeps it, Delete removes it.
    await expect(table.getByRole('row').nth(1).getByRole('button', { name: /^Delete / })).toHaveCount(0);
    const del = sheet.getByRole('button', { name: 'Delete', exact: true });
    const confirm = page.getByRole('alertdialog', { name: 'Delete this segment?' });
    await table.getByRole('row').nth(1).getByRole('button', { name: /^Edit / }).click();
    await del.click();
    await expect(confirm).toContainText('Fastest 5 min');
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(2);
    await del.click();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/^No segment yet/)).toBeVisible({ timeout: 30_000 });
  });

  test('Reps of a lap layout', async ({ page }) => {
    // The runs of 2 to 29 March: two of them 5 min + 25 min + 2 × 3 min.
    await openWithFolder(page, await fitFiles(16, '2026-03-02'));
    await importAll(page);
    await nav(page, 'Segments');
    await page.getByRole('button', { name: 'New segment' }).click();
    const dialog = page.getByRole('dialog', { name: 'New segment' });
    const count = dialog.locator('.preview-count');
    // The run's layout: the layouts found in the runs, with their runs; its reps the segments, identical, then the same reps in any layout.
    await goToStep(dialog, 'Run layout');
    const layout = dialog.getByLabel('Layout of laps', { exact: true });
    await expect(layout.locator('option', { hasText: '5 min + 25 min + 2 × 3 min (2 runs)' })).toHaveCount(1);
    await layout.selectOption({ label: '5 min + 25 min + 2 × 3 min (2 runs)' });
    await dialog.getByRole('radio', { name: 'The reps' }).click();
    await expect(dialog.getByRole('radio', { name: /^Identical layout/ })).toHaveAttribute('aria-checked', 'true');
    await expect(count).toContainText('6 efforts in 2 runs', { timeout: 30_000 });
    await expect(dialog.locator('.step-summary').nth(4)).toHaveText('Reps of 5 min + 25 min + 2 × 3 min');
    await dialog.getByRole('radio', { name: /^The same reps: 25 min \+ 2 × 3 min/ }).click();
    await expect(count).toContainText('6 efforts in 2 runs', { timeout: 30_000 });
    await expect(dialog.locator('.step-summary').nth(4)).toHaveText('Reps of 25 min + 2 × 3 min, any layout');
    // Not split: the layout chooses the runs, the segment the whole run (step 3).
    await dialog.getByRole('radio', { name: /^No: whole run/ }).click();
    await goToStep(dialog, 'Segment');
    await dialog.getByRole('radio', { name: 'Whole run' }).click();
    await expect(count).toContainText('2 efforts in 2 runs', { timeout: 30_000 });
    await expect(dialog.locator('.step-summary').nth(4)).toHaveText('Runs · runs with 25 min + 2 × 3 min');
    // The number of laps is no longer offered.
    await goToStep(dialog, 'Further conditions');
    const offered = dialog.getByLabel('+ Add a condition', { exact: true }).locator('option');
    await expect(offered.filter({ hasText: /^Title contains$/ })).toHaveCount(1);
    await expect(offered.filter({ hasText: /^Laps in the run$/ })).toHaveCount(0);
  });
});

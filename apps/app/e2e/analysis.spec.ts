import { expect, test } from '@playwright/test';
import { addFromPicker, fitFiles, importAll, nav, openWithFolder } from './support';

test.describe('Analysis workspace', () => {
  test('Rule blocks compared, ranked and curved', async ({ page }) => {
    await openWithFolder(page, await fitFiles(12, '2026-05-01'));
    await importAll(page);
    // A link of the former Ask screen opens as a block here: the fastest 10 minutes since 1 March, carried by the link.
    await page.goto('/ask?kind=best&window=600s&from=2026-03-01');
    const fastest = page.locator('.item-chip', { hasText: 'Fastest 10 min · since 2026-03-01' });
    await expect(fastest).toHaveCount(1, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/compare\?items=q/);
    // A second block, made in the one editor (New block… in the picker opens it on the Blocks screen):
    // whole runs since 1 March, each read by its maximum; then added here from the picker.
    await page.getByRole('button', { name: '+ Add segment or run' }).click();
    await page.getByRole('dialog', { name: 'Add segment or run' }).getByRole('link', { name: 'New segment…' }).click();
    const dialog = page.getByRole('dialog', { name: 'New segment' });
    await dialog.getByRole('radio', { name: 'Whole runs' }).click();
    await dialog.getByLabel('From', { exact: true }).fill('2026-03-01');
    await dialog.getByText('More: start, how many per run, statistic').click();
    await dialog.getByRole('radio', { name: 'maximum' }).click();
    await expect(dialog.locator('.preview-count')).toContainText('12 efforts in 12 runs', { timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Segments', exact: true }).getByRole('row', { name: /^Runs · since 2026-03-01 · maximum/ })).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await addFromPicker(page, 'Runs · since 2026-03-01 · maximum');
    const whole = page.locator('.item-chip', { hasText: 'Runs · since 2026-03-01 · maximum' });
    await expect(whole).toHaveCount(1, { timeout: 30_000 });

    // Pace and heart rate: one chart each, both blocks on them, the table of changes with a row per block.
    const metrics = page.getByRole('group', { name: 'Metrics' });
    for (const m of ['Pace', 'Heart rate']) {
      const b = metrics.getByRole('button', { name: m, exact: true });
      if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    }
    const changes = page.getByRole('table', { name: 'Changes' });
    await expect(changes.getByRole('columnheader')).toHaveText(['Segment', 'Pace', 'Heart rate']);
    await expect(changes.getByRole('row').nth(2)).toContainText(/12 efforts/, { timeout: 30_000 });
    const hr = page.getByRole('img', { name: 'Over time · Heart rate (bpm)' });
    await expect(hr.locator('.trend-line')).toHaveCount(2);

    // A click on a point opens its run, the segment selected.
    const clickPoint = async (chart: typeof hr) => {
      await chart.scrollIntoViewIfNeeded();
      const dot = (await chart.locator('circle[r="4.5"]').last().boundingBox())!;
      await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
      await expect(page.locator('.tooltip')).toContainText('Click to open the run');
      await page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2);
      await expect(page).toHaveURL(/\/run\?id=\d{8}-\d{6}&from=\d+&to=\d+/);
      await expect(page.locator('.range-stats h3')).toHaveText('Selection');
      await page.goBack();
      await expect(page.locator('.item-chip')).toHaveCount(2);
    };
    await clickPoint(hr);

    // The Over time chart is a widget: Pin in its corner puts it on the Dashboard, the same charts there ("Pin na kazdej karcie-widgecie").
    await page.getByRole('button', { name: /^Pin Over time · .+ to the dashboard$/ }).click();
    await expect(page.getByRole('button', { name: /^Pin Over time · / })).toHaveAttribute('aria-pressed', 'true');
    await nav(page, 'Dashboard');
    const widget = page.getByRole('region', { name: /^Over time · / });
    await expect(widget.getByRole('img', { name: 'Over time · Heart rate (bpm)' }).locator('.trend-line')).toHaveCount(2, { timeout: 30_000 });
    await page.goBack();
    await expect(page.locator('.item-chip')).toHaveCount(2);

    // The sections are tabs, kept in the link: Trends first, then Segments, A/B, the curve and Rep by rep; one at a time.
    const tabs = page.getByRole('tablist', { name: 'Compare sections' });
    await expect(tabs.getByRole('tab')).toHaveText(['Trends', 'Efforts', 'A/B', 'Pace / power curve', 'Rep by rep']);
    await expect(tabs.getByRole('tab', { name: 'Trends' })).toHaveAttribute('aria-selected', 'true');
    await tabs.getByRole('tab', { name: 'Efforts' }).click();
    await expect(page).toHaveURL(/tab=segments/);
    await expect(changes).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Metrics' })).toHaveCount(0);
    // The segments of the fastest-10-minutes block, ranked; the first opens the run with the stretch selected.
    const segments = page.getByRole('table', { name: 'Efforts' });
    await page.getByLabel('Segment', { exact: true }).selectOption({ label: 'Fastest 10 min · since 2026-03-01' });
    await page.getByRole('radio', { name: 'Best first' }).click();
    await page.getByLabel('Top').selectOption('5');
    await expect(segments.getByRole('row')).toHaveCount(6);
    // Each effort leads to the efforts like it: the link asks Compare for them.
    await expect(segments.getByRole('row').nth(1).getByRole('link', { name: 'Similar' })).toHaveAttribute('href', /similar=\d{8}-\d{6}%7E\d+%7E\d+$/);
    await expect(segments.getByRole('row').nth(1)).toContainText(/\d:\d\d \/km/);
    // Read at a glance: the rank a badge, the first three in the accent; beside each value a bar, the best the longest.
    await expect(segments.locator('.rank')).toHaveText(['1', '2', '3', '4', '5']);
    await expect(segments.locator('.rank.top')).toHaveCount(3);
    const barWidth = (n: number) => segments.locator('tbody tr').nth(n).locator('.cell-bar > i').evaluate((e) => e.getBoundingClientRect().width);
    expect(await barWidth(0)).toBeGreaterThan(await barWidth(4));
    // The row under the pointer is highlighted, its "Open run →" a pill.
    await segments.locator('tbody tr').nth(1).hover();
    const pill = segments.locator('tbody tr').nth(1).getByRole('link', { name: 'Open run →' });
    await expect.poll(() => pill.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe('none');
    expect(await segments.locator('tbody tr').nth(1).locator('td').first().evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(await segments.locator('tbody tr').nth(3).locator('td').first().evaluate((e) => getComputedStyle(e).backgroundColor));
    await segments.getByRole('row').nth(1).getByRole('link', { name: 'Open run →' }).click();
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    // The run's back link names the screen it was opened from and returns to it as it was left.
    await page.getByRole('link', { name: '← Compare' }).click();
    await expect(page).toHaveURL(/\/compare\?.*tab=segments/);
    await expect(page.locator('.item-chip')).toHaveCount(2);

    // Back on Segments after the run (the tab is in the link).
    await expect(tabs.getByRole('tab', { name: 'Efforts' })).toHaveAttribute('aria-selected', 'true');

    // Saved (scenario "Analysis saved and opened again"): named in the app, kept with its items and tab;
    // Analysis opened from the menu is empty, and the saved analysis opens as it was.
    await page.getByRole('button', { name: 'Save analysis' }).click();
    const save = page.getByRole('dialog', { name: 'Save analysis' });
    await expect(save.getByLabel('Name of the analysis')).toHaveValue(/^Fastest 10 min · since 2026-03-01 \+ Runs · since 2026-03-01…$/);
    await save.getByLabel('Name of the analysis').fill('Spring check');
    await save.getByRole('button', { name: 'Save analysis' }).click();
    await expect(page).toHaveURL(/[?&]a=an-/);
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
    await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
    await page.locator('.sidebar').getByRole('link', { name: /Compare$/ }).click();
    await expect(page.getByText(/^Choose the data to analyse/)).toBeVisible();
    await expect(page.locator('.item-chip')).toHaveCount(0);
    // Listed on the empty screen, each row opening its analysis, with Edit ("jak zapisze to chce open oraz edit");
    // no list of them in the head as well ("nie ma chyba sensu").
    await expect(page.getByRole('combobox', { name: 'Saved analyses' })).toHaveCount(0);
    const saved = page.getByRole('region', { name: 'Your saved analyses' });
    await expect(saved.getByRole('listitem')).toHaveText([/^Spring check2 items · saved \w{3} \d+, 2026$/]);
    await expect(saved.getByRole('button', { name: 'Delete Spring check' })).toHaveCount(0);
    // Edit renames it in place; Esc leaves it.
    await saved.getByRole('button', { name: 'Edit Spring check' }).click();
    await page.getByRole('dialog', { name: 'Edit Spring check' }).getByRole('textbox', { name: 'Name' }).fill('Spring check 2');
    await page.keyboard.press('Escape');
    await saved.getByRole('button', { name: 'Edit Spring check' }).click();
    await page.getByRole('dialog', { name: 'Edit Spring check' }).getByRole('textbox', { name: 'Name' }).fill('Spring review');
    await page.getByRole('dialog', { name: 'Edit Spring check' }).getByRole('button', { name: 'Save' }).click();
    await expect(saved.getByRole('listitem')).toHaveText([/^Spring review2 items/]);
    await saved.getByRole('button', { name: 'Edit Spring review' }).click();
    await page.getByRole('dialog', { name: 'Edit Spring review' }).getByRole('textbox', { name: 'Name' }).fill('Spring check');
    await page.keyboard.press('Enter');
    await expect(saved.getByRole('listitem')).toHaveText([/^Spring check2 items/]);
    // Opened by a click on its row.
    await saved.getByText('Spring check', { exact: true }).click();
    await expect(page.locator('.item-chip')).toHaveCount(2, { timeout: 30_000 });
    await expect(tabs.getByRole('tab', { name: 'Efforts' })).toHaveAttribute('aria-selected', 'true');
    // The curve tab, Speed first: one line per block, from its segments; time against pace, kept in the link.
    await tabs.getByRole('tab', { name: 'Pace / power curve' }).click(); // the state follows the link, a moment later
    await expect(page).toHaveURL(/tab=curve/);
    await expect(segments).toHaveCount(0);
    const curves = page.getByRole('group', { name: 'Curve' });
    await expect(curves.getByRole('button', { name: 'Speed' })).toHaveAttribute('aria-pressed', 'true');
    const curve = page.getByRole('img', { name: 'Pace curve' });
    await expect(curve.locator('.curve-line')).toHaveCount(2, { timeout: 60_000 });
    await expect(curve).toContainText('1 min');
    // The estimate: a dashed line per block, and its parameters from the research models (the exponent, critical speed and D′, the predicted times).
    await expect(curve.locator('.curve-estimate')).toHaveCount(2);
    const runsEstimate = page.getByRole('region', { name: 'Estimate · Runs · since 2026-03-01 · maximum' });
    await expect(runsEstimate).toContainText(/Exponent1\.\d{3}Riegel · \d+ bests ≥ 3 min/);
    await expect(runsEstimate).toContainText(/Critical speed\d:\d\d \/km/);
    await expect(runsEstimate).toContainText(/D′\d+ m/);
    await expect(runsEstimate).toContainText(/5 km(\d+:)?\d+:\d\dpredicted10 km(\d+:)?\d+:\d\dpredictedhalf(\d+:)?\d+:\d\dpredictedmarathon\d+:\d\d:\d\dpredicted/);
    // The fastest 10 minutes reach their 10-minute best (the segment's last sample counts), enough for an estimate.
    await expect(page.getByRole('region', { name: 'Estimate · Fastest 10 min · since 2026-03-01' })).toContainText(/Exponent1\.\d{3}/);
    expect(await curve.locator('.curve-gap').count()).toBeGreaterThan(0);
    await curve.scrollIntoViewIfNeeded();
    const box = (await curve.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
    await expect(page.locator('.tooltip')).toContainText(/estimate \d:\d\d \/km/);
    await page.mouse.move(box.x + box.width / 2, box.y - 40);
    // The bests: a row per block and length, with its estimate and gap; the pointer over a row rings its point; Open run shows the stretch in its run.
    const bests = page.getByRole('table', { name: 'Curve bests' });
    expect(await bests.locator('tbody tr').count()).toBeGreaterThan(5);
    const tenMin = bests.locator('tbody tr', { hasText: 'Fastest 10 min' }).filter({ has: page.locator('td.strong', { hasText: /^10 min$/ }) });
    await expect(tenMin).toHaveCount(1);
    await expect(tenMin).toContainText(/10 min\d:\d\d \/km\d:\d\d \/km(\d+ s\/km (slower|faster)|on the estimate)/);
    await tenMin.hover();
    await expect(curve.locator('.curve-highlight')).toHaveCount(1);
    await tenMin.getByRole('link', { name: 'Open run →' }).click();
    await expect(page).toHaveURL(/\/run\?id=\d{8}-\d{6}&from=\d+&to=\d+/);
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    await page.goBack();
    await expect(curve.locator('.curve-line')).toHaveCount(2, { timeout: 60_000 });

    // Power: the highest average power of each length, in watts, its estimate with critical power and W′, kept in the link.
    await curves.getByRole('button', { name: 'Power' }).click();
    await expect(page).toHaveURL(/curve=power/);
    const power = page.getByRole('img', { name: 'Power curve' });
    await expect(power.locator('.curve-line')).toHaveCount(2, { timeout: 60_000 });
    await expect(power).toContainText('1 min');
    await expect(page.getByRole('img', { name: 'Pace curve' })).toHaveCount(0);
    const powerEstimate = page.getByRole('region', { name: 'Estimate · Runs · since 2026-03-01 · maximum' });
    await expect(powerEstimate).toContainText(/Exponent1\.\d{3}power law/);
    await expect(powerEstimate).toContainText(/Critical power\d+ W/);
    await expect(powerEstimate).toContainText(/W′-?\d+\.\d kJ/);
    await expect(powerEstimate).toContainText(/20 min\d+ Westimated/);
    await expect(powerEstimate).not.toContainText('marathon');
    await expect(page.getByRole('table', { name: 'Curve bests' }).locator('tbody tr').first()).toContainText(/\d+ W/);
    await power.scrollIntoViewIfNeeded();
    const pbox = (await power.boundingBox())!;
    await page.mouse.move(pbox.x + pbox.width * 0.6, pbox.y + pbox.height / 2);
    await page.mouse.move(pbox.x + pbox.width * 0.62, pbox.y + pbox.height / 2);
    await expect(page.locator('.tooltip')).toContainText(/estimate \d+ W/);
    await page.mouse.move(pbox.x + pbox.width / 2, pbox.y - 40);
    // Back to Speed for the click through to a run.
    await curves.getByRole('button', { name: 'Speed' }).click();
    await expect(curve.locator('.curve-line')).toHaveCount(2, { timeout: 60_000 });
    // A best of the curve opens the run it comes from, the stretch selected.
    await clickPoint(curve);

    // A saved analysis deleted from its editor in the list of the empty screen, once confirmed in the app.
    await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
    await page.locator('.sidebar').getByRole('link', { name: /Compare$/ }).click();
    await saved.getByRole('button', { name: 'Edit Spring check' }).click();
    await page.getByRole('dialog', { name: 'Edit Spring check' }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog', { name: 'Delete this analysis?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(saved).toHaveCount(0);
  });
});

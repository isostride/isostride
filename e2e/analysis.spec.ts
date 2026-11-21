import { expect, test } from '@playwright/test';
import { fitFiles, importAll, openWithFolder } from './support';

test.describe('Analysis workspace', () => {
  test('Rule blocks compared, ranked and curved', async ({ page }) => {
    await openWithFolder(page, await fitFiles(12, '2026-05-01'));
    await importAll(page);
    // A link of the former Ask screen opens as a block here: the fastest 10 minutes since 1 March, carried by the link.
    await page.goto('/ask?kind=best&window=600s&from=2026-03-01');
    const fastest = page.locator('.item-chip', { hasText: 'Fastest 10 min · since 2026-03-01' });
    await expect(fastest).toHaveCount(1, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/analysis\?items=q/);
    // A second block built here: whole runs since 1 March, each read by its maximum.
    await page.getByRole('button', { name: '+ Add block or run' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add block or run' });
    await dialog.getByRole('tab', { name: 'New block' }).click();
    await dialog.getByRole('radio', { name: 'Whole runs' }).click();
    await dialog.getByLabel('From', { exact: true }).fill('2026-03-01');
    await dialog.getByText('More: start, how many per run, statistic').click();
    await dialog.getByRole('radio', { name: 'maximum' }).click();
    await expect(dialog.locator('.preview-count')).toContainText('12 segments in 12 runs', { timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Use in analysis' }).click();
    const whole = page.locator('.item-chip', { hasText: 'Runs · since 2026-03-01 · maximum' });
    await expect(whole).toHaveCount(1);

    // Pace and heart rate: one chart each, both blocks on them, the table of changes with a row per block.
    const metrics = page.getByRole('group', { name: 'Metrics' });
    for (const m of ['Pace', 'Heart rate']) {
      const b = metrics.getByRole('button', { name: m, exact: true });
      if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    }
    const changes = page.getByRole('table', { name: 'Changes' });
    await expect(changes.getByRole('columnheader')).toHaveText(['Block', 'Pace', 'Heart rate']);
    await expect(changes.getByRole('row').nth(2)).toContainText(/12 segments/, { timeout: 30_000 });
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

    // The sections are tabs, kept in the link: Trends first, then Segments, A/B and the curve; one at a time.
    const tabs = page.getByRole('tablist', { name: 'Analysis sections' });
    await expect(tabs.getByRole('tab')).toHaveText(['Trends', 'Segments', 'A/B', 'Pace / power curve']);
    await expect(tabs.getByRole('tab', { name: 'Trends' })).toHaveAttribute('aria-selected', 'true');
    await tabs.getByRole('tab', { name: 'Segments' }).click();
    await expect(page).toHaveURL(/tab=segments/);
    await expect(changes).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Metrics' })).toHaveCount(0);
    // The segments of the fastest-10-minutes block, ranked; the first opens the run with the stretch selected.
    const segments = page.getByRole('table', { name: 'Segments' });
    await page.getByLabel('Block', { exact: true }).selectOption({ label: 'Fastest 10 min · since 2026-03-01' });
    await page.getByRole('radio', { name: 'Best first' }).click();
    await page.getByLabel('Top').selectOption('5');
    await expect(segments.getByRole('row')).toHaveCount(6);
    await expect(segments.getByRole('row').nth(1)).toContainText(/\d:\d\d \/km/);
    await segments.getByRole('row').nth(1).getByRole('link', { name: 'Open run →' }).click();
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    // The run's back link names the screen it was opened from and returns to it as it was left.
    await page.getByRole('link', { name: '← Analysis' }).click();
    await expect(page).toHaveURL(/\/analysis\?.*tab=segments/);
    await expect(page.locator('.item-chip')).toHaveCount(2);

    // Back on Segments after the run (the tab is in the link).
    await expect(tabs.getByRole('tab', { name: 'Segments' })).toHaveAttribute('aria-selected', 'true');
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
  });
});

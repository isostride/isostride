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

    // The segments of the fastest-10-minutes block, ranked; the first opens the run with the stretch selected.
    const segments = page.getByRole('table', { name: 'Segments' });
    await page.getByLabel('Block', { exact: true }).selectOption({ label: 'Fastest 10 min · since 2026-03-01' });
    await page.getByRole('radio', { name: 'Best first' }).click();
    await page.getByLabel('Top').selectOption('5');
    await expect(segments.getByRole('row')).toHaveCount(6);
    await expect(segments.getByRole('row').nth(1)).toContainText(/\d:\d\d \/km/);
    await segments.getByRole('row').nth(1).getByRole('link', { name: 'Open run →' }).click();
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    await page.goBack();
    await expect(page.locator('.item-chip')).toHaveCount(2);

    // The pace curve: one line per block, from its segments; time against pace, kept in the link.
    await page.getByRole('checkbox', { name: 'Pace curve' }).click(); // the state follows the link, a moment later
    await expect(page).toHaveURL(/curve=1/);
    await expect(page.getByRole('checkbox', { name: 'Pace curve' })).toBeChecked();
    const curve = page.getByRole('img', { name: 'Pace curve' });
    await expect(curve.locator('.curve-line')).toHaveCount(2, { timeout: 60_000 });
    await expect(curve).toContainText('1 min');
    // The estimate: a dashed line and the predicted times, from the research models; each best's gap to it; read under the pointer.
    await expect(curve.locator('.curve-estimate').first()).toBeAttached();
    await expect(page.locator('.curve-note', { hasText: 'Runs · since 2026-03-01' })).toContainText(/Estimate \(Riegel power law through your strongest best, exponent 1\.\d\d from \d+ bests of 3 min and more\): 5 km (\d+:)?\d+:\d\d · 10 km (\d+:)?\d+:\d\d · half (\d+:)?\d+:\d\d · marathon \d+:\d\d:\d\d/);
    expect(await curve.locator('.curve-gap').count()).toBeGreaterThan(0);
    await curve.scrollIntoViewIfNeeded();
    const box = (await curve.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
    await expect(page.locator('.tooltip')).toContainText(/estimate \d:\d\d \/km/);
    // A best of the curve opens the run it comes from, the stretch selected.
    await clickPoint(curve);
  });
});

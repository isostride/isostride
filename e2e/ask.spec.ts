import { expect, test } from '@playwright/test';
import { fitFiles, importAll, nav, openWithFolder } from './support';

test.describe('Analysis workspace', () => {
  test('Runs matching a period compared and ranked', async ({ page }) => {
    await openWithFolder(page, await fitFiles(12, '2026-05-01'));
    await importAll(page);
    await nav(page, 'Analysis');
    // A run set from the picker's second tab: the runs since 1 March, by their maximum heart rate.
    await page.getByRole('button', { name: '+ Add block or run' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add block or run' });
    await dialog.getByRole('tab', { name: 'Runs matching…' }).click();
    await dialog.getByLabel('From').fill('2026-03-01');
    await dialog.getByRole('radio', { name: 'maximum' }).click();
    await expect(dialog.locator('.preview-count')).toContainText(/^12 runs · Runs since 2026-03-01 · maximum$/);
    await dialog.getByRole('button', { name: 'Add these runs' }).click();
    const chip = page.locator('.item-chip', { hasText: 'Runs since 2026-03-01 · maximum' });
    await expect(chip).toHaveCount(1);
    await expect(page).toHaveURL(/items=s%3A2026-03-01/);
    // Heart rate and the fastest 10 min: one chart each, the set's verdict per metric, the changes table.
    const metrics = page.getByRole('group', { name: 'Metrics' });
    for (const m of ['Pace', 'Heart rate']) {
      const b = metrics.getByRole('button', { name: m, exact: true });
      if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    }
    await page.getByRole('group', { name: 'Fastest stretch' }).getByRole('button', { name: '10 min', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Over time · Fastest 10 min (min/km)' })).toBeVisible({ timeout: 60_000 });
    const table = page.getByRole('table', { name: 'Changes' });
    await expect(table.getByRole('columnheader')).toHaveText(['Item', 'Pace', 'Heart rate', 'Fastest 10 min']);
    await expect(table.getByRole('row').nth(1)).toContainText(/12 runs/, { timeout: 60_000 });
    await page.locator('details.result', { hasText: 'Runs since 2026-03-01' }).locator('summary').click();
    await expect(page.getByText(/^Maximum heart rate since 2026-03-01: \d+ bpm → \d+ bpm over 12 runs/)).toBeVisible();
    // The pace curve: one line for the set, time against pace, kept in the link.
    await page.getByRole('checkbox', { name: 'Pace curve' }).click(); // the state follows the link, a moment later
    await expect(page).toHaveURL(/curve=1/);
    await expect(page.getByRole('checkbox', { name: 'Pace curve' })).toBeChecked();
    const curveChart = page.getByRole('img', { name: 'Pace curve' });
    await expect(curveChart.locator('.curve-line')).toHaveCount(1, { timeout: 60_000 });
    await expect(curveChart).toContainText('1 min');
    // The estimate: a dashed line and the predicted times, from the research models.
    await expect(curveChart.locator('.curve-estimate')).toHaveCount(1);
    // Each best's gap to the estimate, and the estimate read under the pointer.
    expect(await curveChart.locator('.curve-gap').count()).toBeGreaterThan(0);
    await curveChart.scrollIntoViewIfNeeded();
    const box = (await curveChart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
    await expect(page.locator('.tooltip')).toContainText(/estimate \d:\d\d \/km/);
    await expect(page.locator('.curve-note')).toContainText(/Estimate \(Riegel power law through your strongest best, exponent 1\.\d\d from \d+ bests of 3 min and more\): 5 km (\d+:)?\d+:\d\d · 10 km (\d+:)?\d+:\d\d · half (\d+:)?\d+:\d\d · marathon \d+:\d\d:\d\d/);
    // The runs behind the set, ranked by the fastest 10 min; the first opens with the stretch selected.
    const runsTable = page.getByRole('table', { name: 'Runs behind the answer' });
    await page.getByLabel('Table metric').selectOption('best:600s');
    await page.getByRole('radio', { name: 'Best first' }).click();
    await page.getByLabel('Top').selectOption('5');
    await expect(runsTable.getByRole('row')).toHaveCount(6);
    await expect(runsTable.getByRole('row').nth(1)).toContainText(/\d:\d\d \/km/);
    await runsTable.getByRole('row').nth(1).getByRole('link', { name: 'Open run →' }).click();
    await expect(page.getByText(/^Selected min /)).toBeVisible();
    await page.goBack();
    await expect(chip).toHaveCount(1);
    // An old Ask link opens as a run set here.
    await page.goto('/ask?kind=best&window=600s&from=2026-03-01&tag=easy');
    await expect(page).toHaveURL(/\/analysis\?items=s%3A2026-03-01/);
    await expect(page.locator('.item-chip', { hasText: 'tag easy' })).toHaveCount(1);
  });
});

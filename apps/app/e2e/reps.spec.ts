import { expect, test } from '@playwright/test';
import { addFromPicker, fitFiles, goToStep, importAll, nav, openPicker, openRun, openWithFolder, saveSegment } from './support';

test.describe('Efforts by run', () => {
  test('Previous workout compared rep by rep', async ({ page }) => {
    // The runs of 2 to 29 March: two of them 5 min + 25 min + 2 × 3 min, on 2 and 29 March.
    await openWithFolder(page, await fitFiles(16, '2026-03-02'));
    await importAll(page);
    // The newest run, later on 29 March, is no workout: no such link. The one before it, the workout of that day:
    // its link opens the Efforts tab on the reps of every run of its layout.
    await openRun(page, 0);
    await expect(page.getByRole('link', { name: 'Compare this run' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Compare with the previous/ })).toHaveCount(0);
    await page.goBack();
    await page.getByRole('heading', { name: 'Runs' }).waitFor();
    await openRun(page, 1);
    await page.getByRole('link', { name: 'Compare with the previous 5 min + 25 min + 2 × 3 min' }).click();
    await expect(page.getByRole('tab', { name: 'Efforts' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.item-chip')).toContainText('Reps of 5 min + 25 min + 2 × 3 min');

    // A row for each run, the newest first, a column for the time, the distance and each metric chosen above the tabs; on top the change from the previous run.
    const chosenMetrics = page.getByRole('group', { name: 'Metrics', exact: true });
    for (const m of ['Pace', 'Heart rate', 'Cadence']) {
      const b = chosenMetrics.getByRole('button', { name: m, exact: true });
      if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    }
    const table = page.getByRole('table', { name: 'Efforts by run' });
    await expect(table.getByRole('columnheader')).toHaveText([/^Run/, /^Efforts/, /^Pace \(min\/km\)/, /^Time/, /^Distance \(km\)/, /^Heart rate/, /^Cadence/], { timeout: 30_000 });
    const rows = table.locator('tbody tr');
    await expect(rows.nth(0).getByRole('cell').nth(0)).toHaveText('ChangeMar 2, 2026 → Mar 29, 2026');
    await expect(rows.nth(0).getByRole('cell').nth(2)).toHaveText(/^−\d+ s−\d+\.\d%$/);
    await expect(rows.nth(0).getByRole('cell').nth(2)).toHaveClass(/better/);
    // Of two runs, both open: each run's mean with its last effort against its first, then each effort.
    await expect(rows.nth(1).getByRole('cell').nth(0)).toHaveText('▾ Mar 29, 2026');
    await expect(rows.nth(1).getByRole('cell').nth(1)).toHaveText('3');
    await expect(rows.nth(1).getByRole('cell').nth(2)).toContainText('1→3');
    await expect(rows.nth(2).getByRole('cell').nth(2)).toHaveText('4:45');
    await expect(rows.nth(5).getByRole('cell').nth(0)).toHaveText('▾ Mar 2, 2026');
    await expect(rows.nth(6).getByRole('cell').nth(2)).toHaveText('5:07');
    // The chart alone, by the toggle: the two runs chosen above it, each the mean of its efforts, the figures chosen above, no choice of its own.
    await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Chart' }).click();
    await expect(table).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Runs drawn' }).getByRole('button', { pressed: true })).toHaveText(['Mar 29, 2026', 'Mar 2, 2026']);
    await expect(page.getByRole('img', { name: 'Pace, Heart rate, Cadence of 2 efforts, by distance' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('list', { name: 'Efforts drawn' }).getByRole('listitem').first()).toContainText('mean of 3 efforts');
    await expect(page.getByRole('group', { name: 'Metrics drawn' })).toHaveCount(0);
  });

  test('A segment’s efforts in every run, rep by rep', async ({ page }) => {
    // A segment of 10 minutes ("stworzylem segmenty 10 minutowe ... seria po serii porownanie nie dziala").
    await openWithFolder(page, await fitFiles(16, '2026-03-02'));
    await importAll(page);
    await nav(page, 'Segments');
    await page.getByRole('button', { name: 'New segment' }).click();
    const dialog = page.getByRole('dialog', { name: 'New segment' });
    await goToStep(dialog, 'Segment');
    await dialog.getByRole('radio', { name: 'Time' }).click();
    await dialog.getByRole('button', { name: '10 min', exact: true }).click();
    await expect(dialog.locator('.preview-count')).toContainText(/^\d+ efforts in \d+ runs/, { timeout: 30_000 });
    await saveSegment(dialog);
    // Straight to Compare, its efforts still being found: they show once they are, by run on the Efforts tab.
    await nav(page, 'Compare');
    await addFromPicker(page, 'Fastest 10 min');
    await page.getByRole('tab', { name: 'Efforts' }).click();
    const table = page.getByRole('table', { name: 'Efforts by run' });
    const rows = table.locator('tbody tr');
    // On top the change from the previous run, from the first and the trend per week; then a row for each run, closed.
    await expect(rows.nth(2).getByRole('cell').nth(0)).toHaveText('Trend per week', { timeout: 30_000 });
    const runs = (await rows.count()) - 3;
    expect(runs).toBeGreaterThan(2);
    const efforts = Number(await rows.nth(3).getByRole('cell').nth(1).textContent());
    await rows.nth(3).getByRole('button').click();
    await expect(rows).toHaveCount(runs + 3 + efforts);
  });

  test('Runs added whole, lap by lap', async ({ page }) => {
    // Two runs added whole, one with laps and one without ("wzialem 2 biegi ... w wysilkach jest pusto"; "1 ma lapy, 2-i nie ma").
    await openWithFolder(page, await fitFiles(16, '2026-03-02'));
    await importAll(page);
    await nav(page, 'Compare');
    for (let k = 0; k < 2; k++) {
      const picker = await openPicker(page);
      await picker.getByRole('textbox').fill('Mar 29');
      await picker.locator('.palette-item').first().click();
      await expect(page.locator('.item-chip')).toHaveCount(k + 1, { timeout: 30_000 });
    }
    await page.getByRole('tab', { name: 'Efforts' }).click();
    // A row for each run, its time and distance the whole run's; opened, its laps.
    const table = page.getByRole('table', { name: 'Efforts by run' });
    const runRows = table.locator('tbody tr.reps-run-row');
    await expect(runRows).toHaveCount(2, { timeout: 30_000 });
    await expect(runRows.nth(0).getByRole('cell').nth(4)).toHaveText(/^\d+\.\d\d$/);
    await expect(table.locator('tbody tr.reps-rep-row')).toHaveCount(8);
    await expect(table.locator('.reps-drift')).toHaveCount(0);
  });
});

import { expect, test } from '@playwright/test';
import { fitFiles, importAll, openRun, openWithFolder } from './support';

test.describe('Rep by rep', () => {
  test('Previous workout compared rep by rep', async ({ page }) => {
    // The runs of 2 to 29 March: two of them 5 min + 25 min + 2 × 3 min, on 2 and 29 March.
    await openWithFolder(page, await fitFiles(16, '2026-03-02'));
    await importAll(page);
    // The newest run, later on 29 March, is no workout: no such link. The one before it, the workout of that day:
    // its link opens Analysis on it alone, which finds its previous run of the layout.
    await openRun(page, 0);
    await expect(page.getByRole('link', { name: 'Compare this run' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Compare with the previous/ })).toHaveCount(0);
    await page.goBack();
    await page.getByRole('heading', { name: 'Runs' }).waitFor();
    await openRun(page, 1);
    await page.getByRole('link', { name: 'Compare with the previous 5 min + 25 min + 2 × 3 min' }).click();
    await expect(page).toHaveURL(/tab=reps/);
    await expect(page.getByRole('tab', { name: 'Rep by rep' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.item-chip')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.reps-lead')).toHaveText('Compared with the previous 5 min + 25 min + 2 × 3 min, of Mar 2, 2026, 4 weeks earlier. No other run of this layout between them.', { timeout: 30_000 });

    // The two side by side, the older first; a row for each rep's pace, the mean pace, the work and each metric.
    const table = page.getByRole('table', { name: 'Rep by rep' });
    await expect(table.getByRole('columnheader')).toHaveText(['Metric', 'Mar 2, 2026', 'Mar 29, 2026', 'Change']);
    const row = (name: string | RegExp) => table.getByRole('row').filter({ hasText: name });
    await expect(row('Pace, rep 1 / 2 / 3').getByRole('cell')).toHaveText(['Pace, rep 1 / 2 / 3 (min/km)', '5:07 / 4:30 / 4:20', '4:45 / 4:22 / 4:14', 'about −12 s/km']);
    await expect(row('Pace, rep 1 / 2 / 3').getByRole('cell').nth(3)).toHaveClass(/better/);
    await expect(row('Mean pace of the reps').getByRole('cell').nth(3)).toHaveText(/^−\d+\.\d%$/);
    await expect(row('Distance in 31 min of work').getByRole('cell')).toHaveText(['Distance in 31 min of work (km)', '6.25', '6.66', '+405 m']);
    await expect(row(/^Heart rate/)).toHaveCount(1);
    await expect(row(/^Cadence/).getByRole('cell').nth(1)).toHaveText(/^\d+ \/ \d+ \/ \d+$/);
  });
});

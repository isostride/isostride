import { expect, test } from '@playwright/test';
import { fitFiles, importAll, nav, openWithFolder } from './support';

test.describe('Questions about the data', () => {
  test('Question built from controls and answered with a sentence, a chart and a table', async ({ page }) => {
    await openWithFolder(page, await fitFiles(12, '2026-05-01'));
    await importAll(page);
    await nav(page, 'Ask');
    const answer = page.locator('[aria-label="Result"] .verdict');
    // The default question: the change of pace over all runs, with the trend's verdict in the sentence.
    await expect(answer).toContainText(/the noise between runs .*: (change|no detectable change)\.$/, { timeout: 60_000 });
    await expect(page.getByRole('img', { name: 'Over time · Pace (min/km)' }).locator('.trend-line')).toHaveCount(1);
    // The fastest 10 min since 1 March, from the controls; the link carries the question.
    await page.getByRole('radio', { name: 'Fastest stretch' }).click();
    await page.getByRole('group', { name: 'Stretch' }).getByRole('button', { name: '10 min', exact: true }).click();
    await page.getByLabel('From').fill('2026-03-01');
    await expect(page).toHaveURL(/kind=best&window=600s&from=2026-03-01/);
    await expect(answer).toContainText(/^Fastest 10 min since 2026-03-01: \d:\d\d \/km on \d+ \w+ \d{4}, minute \d+–\d+ of the run; \d+ runs ranked\./, { timeout: 60_000 });
    const table = page.getByRole('table', { name: 'Runs behind the answer' });
    await expect(table.getByRole('row').nth(1)).toContainText('1');
    // The first row opens the run with the stretch selected.
    await table.getByRole('row').nth(1).getByRole('link', { name: 'Open run →' }).click();
    await expect(page.getByText(/^Selected min /)).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('radio', { name: 'Fastest stretch' })).toHaveAttribute('aria-checked', 'true');
    // The lowest heart rate, two runs.
    await page.getByRole('radio', { name: 'Highest or lowest' }).click();
    await page.getByRole('group', { name: 'Metric' }).getByRole('button', { name: 'Heart rate', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Lowest', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Top').selectOption('5');
    await expect(answer).toContainText(/^Lowest heart rate since 2026-03-01: \d+ bpm on \d+ \w+ \d{4}; 5 runs ranked\.$/, { timeout: 60_000 });
    await expect(table.getByRole('row')).toHaveCount(6);
    // The statistic of each run: its maximum instead of its average.
    await page.getByRole('radio', { name: 'maximum' }).click();
    await expect(page).toHaveURL(/stat=max/);
    await expect(answer).toContainText(/^Lowest maximum heart rate since 2026-03-01: \d+ bpm/, { timeout: 60_000 });
  });
});

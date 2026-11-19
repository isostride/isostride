import { expect, test, type Page } from '@playwright/test';
import { GEAR_AUTUMN, fitFiles, nav, readText, setUpWithBlock } from './support';

const opened = (page: Page) => page.evaluate(() => (window as any).__opened as string[]);
const RUN_FILE = /^\d{8}-\d{6}\.json$/;

test.describe('Denormalized index files', () => {
  test('Analysis without run files', async ({ page }) => {
    await setUpWithBlock(page);
    // Every row of block-instances.json holds shoes, sensor, tags and day state.
    const { instances } = JSON.parse(await readText(page, 'strideprism/derived/block-instances.json'));
    expect(instances.length).toBeGreaterThan(0);
    for (const i of instances) {
      expect(Object.keys(i.context.run)).toEqual(expect.arrayContaining(['shoes', 'heartRateSource', 'workoutType', 'techniqueCue']));
      expect(Object.keys(i.context.day)).toEqual(expect.arrayContaining(['load3', 'load7']));
    }
    expect(new Set(instances.map((i: any) => i.context.run.shoes))).toEqual(new Set(['Shoes May', 'Shoes June']));

    // Trend and an A/B comparison split by shoes read the index files, no run file.
    await page.evaluate(() => { (window as any).__opened.length = 0; });
    await nav(page, 'Trend');
    await page.getByRole('button', { name: 'Pace', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Trend' })).toBeVisible();
    await nav(page, 'A/B comparison');
    await expect(page.getByRole('img', { name: 'Timeline of the two groups' })).toContainText('Shoes May');
    await expect(page.getByRole('img', { name: 'Difference and interval' })).toBeVisible();
    const names = await opened(page);
    expect(names).toContain('block-instances.json');
    expect(names.filter((n) => RUN_FILE.test(n))).toEqual([]);
  });
});
test.describe('Show trend', () => {
  test('Trend draws noise threshold and gear changes', async ({ page }) => {
    // The promenade northbound: five passes meet the conditions, from August to October, on one watch.
    await setUpWithBlock(page, { files: fitFiles(200, '2026-08-03'), gear: GEAR_AUTUMN, block: /^1\.0 km northeast/ });
    await nav(page, 'Trend');
    await page.getByRole('button', { name: 'Pace', exact: true }).click();
    const chart = page.getByRole('img', { name: 'Trend' });
    await expect(chart).toBeVisible();
    // The noise threshold as a band around each series' fitted line.
    await expect(chart.locator('.noise-band').first()).toBeAttached();
    // The change of shoes on 1 October as a vertical line with its name.
    const change = chart.locator('.gear-change', { hasText: 'Shoes Autumn' });
    await expect(change).toHaveCount(1);
    const line = change.locator('line');
    expect(await line.getAttribute('x1')).toBe(await line.getAttribute('x2'));
  });
});
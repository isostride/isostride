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

    // Analysis of a block and an A/B comparison split by shoes read the index files, no run file.
    await page.evaluate(() => { (window as any).__opened.length = 0; });
    await nav(page, 'Analysis');
    await page.getByRole('button', { name: 'Pace', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Over time' })).toBeVisible();
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
    await nav(page, 'Analysis');
    await page.getByRole('button', { name: 'Pace', exact: true }).click();
    const chart = page.getByRole('img', { name: 'Over time' });
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
test.describe('Analysis workspace', () => {
  test('Blocks and a run compared, several metrics', async ({ page }) => {
    await setUpWithBlock(page, { files: fitFiles(200, '2026-08-03'), gear: GEAR_AUTUMN, block: /^1\.0 km northeast/ });
    // A second block: the first suggestion left.
    const second = page.locator('.block-card.suggested').first();
    const secondName = (await second.locator('.title').textContent())!;
    await second.getByRole('button', { name: 'Accept' }).click();
    await expect(page.locator('.block-card:not(.suggested)')).toHaveCount(2, { timeout: 30_000 });
    await nav(page, 'Analysis');
    const chips = page.locator('.item-chip');
    await expect(chips).toHaveCount(1);

    // Several metrics: one Over time chart each, the table of changes, the line switches.
    const metrics = page.getByRole('group', { name: 'Metrics' });
    for (const m of ['Pace', 'Heart rate']) {
      const b = metrics.getByRole('button', { name: m, exact: true });
      if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    }
    // One Over time chart per metric, on the same dates, each with joined points and a trend line.
    const pace = page.getByRole('img', { name: 'Over time · Pace (min/km)' });
    const hr = page.getByRole('img', { name: 'Over time · Heart rate (bpm)' });
    for (const c of [pace, hr]) {
      await expect(c.locator('.join-line')).toHaveCount(1);
      await expect(c.locator('.trend-line')).toHaveCount(1);
    }
    const months = async (c: typeof pace) => (await c.locator('text').allTextContents()).filter((t) => /^[A-Z][a-z]{2}$/.test(t));
    expect(await months(pace)).toEqual(await months(hr));
    // The table of changes: one row per block, one column per metric, each with its verdict.
    const table = page.getByRole('table', { name: 'Changes' });
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByRole('columnheader')).toHaveText(['Block', 'Pace', 'Heart rate']);
    await expect(table.getByText(/no detectable change|^change ·/).first()).toBeVisible();
    // Switching off the joined points and the trend line hides them on every chart.
    await page.getByRole('checkbox', { name: 'Join points' }).uncheck();
    await page.getByRole('checkbox', { name: 'Trend line' }).uncheck();
    for (const c of [pace, hr]) {
      await expect(c.locator('.join-line')).toHaveCount(0);
      await expect(c.locator('.trend-line')).toHaveCount(0);
    }
    await page.getByRole('checkbox', { name: 'Join points' }).check();
    await page.getByRole('checkbox', { name: 'Trend line' }).check();

    // Add a run and a second block through the picker.
    const add = async (search: string) => {
      await page.getByRole('button', { name: '+ Add block or run' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add block or run' });
      await dialog.getByRole('textbox').fill(search);
      await dialog.getByRole('option').first().click();
    };
    await add('Nov 9');
    await add(secondName);
    await expect(chips).toHaveCount(3);
    const runChip = chips.filter({ hasText: /^Run / });
    const runColour = await runChip.locator('svg :is(circle, rect, polygon)').getAttribute('fill');

    // Over time: the block instances with their trend lines, the run's average as a point in its colour.
    await expect(pace).toBeVisible();
    await expect(pace.locator('.trend-line').first()).toBeAttached();
    await expect(pace.locator(`[fill="${runColour}"]`)).toHaveCount(1);
    // No Inside section any more.
    await expect(page.getByRole('img', { name: /^Inside/ })).toHaveCount(0);

    // Removing the first block keeps the colours of the others.
    await chips.first().getByRole('button', { name: /^Remove / }).click();
    await expect(chips).toHaveCount(2);
    expect(await chips.filter({ hasText: /^Run / }).locator('svg :is(circle, rect, polygon)').getAttribute('fill')).toBe(runColour);
  });

});

import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import { fitFiles, importAll, nav, openWithFolder, recordMeasure } from './support';

// A phone: its width, a touch screen (requirement "Layout that fits a phone").
test.use({ ...devices['Pixel 7'] });

/** How far the page reaches beyond the screen's width, px. */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const serious = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations
  .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`);

test.describe('Layout that fits a phone', () => {
  test('Screens fit a phone', async ({ page }) => {
    await openWithFolder(page, await fitFiles(40, '2026-08-20'));
    await importAll(page);
    const width = page.viewportSize()!.width;
    const height = page.viewportSize()!.height;
    const wide: string[] = [];
    const violations: string[] = [];
    const check = async (screen: string, scan = false) => {
      await page.waitForTimeout(250);
      if ((await overflow(page)) > 1) wide.push(screen);
      if (scan) violations.push(...(await serious(page)).map((v) => `${screen}: ${v}`));
    };

    // The screens are a tab bar floating at the bottom of the screen, each tab large enough for a finger; a slim bar at the top.
    const tabs = page.getByRole('navigation', { name: 'Screens' });
    await expect(tabs.getByRole('link')).toHaveText(['Runs', 'Analysis', 'Performance', 'Settings']);
    const bar = (await tabs.boundingBox())!;
    const under = height - (bar.y + bar.height);
    expect(under).toBeGreaterThan(0);
    expect(under).toBeLessThanOrEqual(24);
    expect(bar.x).toBeGreaterThan(0);
    expect(bar.width).toBeGreaterThanOrEqual(width - 32);
    expect(Math.round(bar.x * 2 + bar.width)).toBe(width);
    for (const link of await tabs.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const top = (await page.locator('.sidebar').boundingBox())!;
    expect(top.y).toBe(0);
    expect(top.height).toBeLessThanOrEqual(60);
    // Controls are touch size.
    expect((await page.getByRole('button', { name: 'Back' }).boundingBox())!.height).toBeGreaterThanOrEqual(40);

    // Runs: a week is seven compact days in one line, its name over them and its totals under them.
    const week = page.locator('.cal-week').first();
    const days = await week.locator('.cal-day').all();
    expect(days).toHaveLength(7);
    const ys = new Set(await Promise.all(days.map(async (d) => Math.round((await d.boundingBox())!.y))));
    expect(ys.size).toBe(1);
    expect((await week.locator('.cal-week-name').boundingBox())!.y).toBeLessThan([...ys][0]);
    expect((await week.locator('.cal-total').boundingBox())!.y).toBeGreaterThan([...ys][0]);
    await check('Runs · calendar', true);
    // The filter is one line that scrolls, not a block.
    expect((await page.getByRole('search', { name: 'Search runs' }).boundingBox())!.height).toBeLessThan(80);
    await page.getByRole('radio', { name: 'List' }).click();
    await check('Runs · list');
    await page.getByRole('radio', { name: 'Calendar' }).click();

    // The theme is set in Settings, not in the bars: the top bar holds the logo and the search only.
    await expect(page.locator('.sidebar').getByRole('radiogroup', { name: 'Theme' })).toHaveCount(0);
    await page.locator('.sidebar').getByRole('link', { name: /Settings$/ }).click();
    await page.getByRole('tab', { name: 'Display', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).click();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(29, 31, 35)');
    await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
    await check('Runs · dark', true);
    await page.locator('.sidebar').getByRole('link', { name: /Settings$/ }).click();
    await page.getByRole('tab', { name: 'Display', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' }).click();
    await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();

    // A run: the chart, the map, the laps and the statistics one under another; the chart menu takes the screen, over the bars.
    await page.locator('.run-tile:not(.dim)').first().click();
    await page.getByRole('img', { name: /^Run metrics · / }).waitFor();
    // The run's chart takes the width of the phone: its card from edge to edge, the plot (the lap strip over it) nearly all of it.
    const board = (await page.locator('.run-board').boundingBox())!;
    expect(Math.round(board.x)).toBe(0);
    expect(Math.round(board.width)).toBe(width);
    // The laps over the plot span it: from the first lap's left to the last one's right, the whole run shown.
    const first = (await page.locator('.lap-bar').first().boundingBox())!;
    const last = (await page.locator('.lap-bar').last().boundingBox())!;
    expect((last.x + last.width - first.x) / width).toBeGreaterThan(0.85);
    await expect(page.getByRole('table', { name: /Laps/ }).or(page.locator('.laps-table')).first()).toBeVisible();
    await check('Run', true);
    await page.getByRole('button', { name: /Chart/ }).first().click();
    const menu = (await page.locator('.chart-menu').boundingBox())!;
    expect(menu.width).toBe(width);
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.chart-menu'), [width / 2, height - 20])).toBe(true);
    await page.locator('.chart-menu').getByRole('button').first().click();

    // Analysis: each tab; the picker is a sheet over the bars.
    await nav(page, 'Analysis');
    await page.locator('.item-chip').first().waitFor({ timeout: 30_000 });
    await check('Analysis · Trends', true);
    for (const tab of ['Segments', 'A/B', 'Pace / power curve']) {
      await page.getByRole('tab', { name: tab }).click();
      await check(`Analysis · ${tab}`);
    }
    await page.getByRole('button', { name: '+ Add block or run' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add block or run' });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[role="dialog"]'), [width / 2, height - 20])).toBe(true);
    await check('Analysis · picker');
    await page.keyboard.press('Escape');

    // Performance: the overview, every view, a "Why?" open.
    await nav(page, 'Performance');
    await page.locator('.map-node[data-model]').first().waitFor({ timeout: 60_000 });
    await page.locator('.map-node[data-model="efforts"]').getByRole('button', { name: /^Why\?/ }).click();
    await check('Performance · Overview', true);
    for (const [tab, views] of [['Load', ['Form', 'Weekly load', 'Intensity']], ['Capacity', ['Best efforts', 'Critical speed and power', 'Predictions and VDOT']], ['Aerobic', ['Efficiency', 'Decoupling', 'VO2max from heart rate']], ['Response', ['On VO2max from heart rate', 'On VDOT']]] as const) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      for (const view of views) {
        await page.getByRole('radio', { name: view, exact: true }).click();
        await page.getByRole('group', { name: 'How far to trust this' }).waitFor();
        await check(`Performance · ${tab} · ${view}`);
      }
    }
    await page.getByRole('tab', { name: 'Model', exact: true }).click();
    await check('Performance · Model', true);

    // Settings: its tabs.
    await nav(page, 'Settings');
    for (const tab of ['Zones', 'Gear', 'Tags', 'Display']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await page.getByRole('region', { name: tab }).waitFor();
      await check(`Settings · ${tab}`, tab !== 'Tags');
    }
    // The Data folder screen, from the logo in the top bar.
    await page.locator('.sidebar .brand').click();
    await page.getByRole('heading', { name: 'Data folder' }).waitFor();
    await check('Data folder', true);

    // Fitness function "No screen wider than a phone" (ADR "Look and feel").
    await recordMeasure('phoneScreensWiderThanScreen', wide.length);
    expect(wide).toEqual([]);
    expect(violations).toEqual([]);
  });
});

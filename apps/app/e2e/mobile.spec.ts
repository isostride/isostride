import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import { addFromPicker, fakeFolderPicker, fitFiles, nav, putFitFiles, recordMeasure } from './support';

// A phone: its width, a touch screen (requirement "Layout that fits a phone").
test.use({ ...devices['Pixel 7'] });

/** How far the page reaches beyond the screen's width, px. */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/**
 * What does not fit though the page does ("sporo elementow sie nie miesci .. np. wizard"): an element
 * reaching beyond the screen outside a row made to scroll sideways, and a card or a dialog whose content
 * is wider than itself (cut off, or scrolling sideways inside it). The filter of Runs scrolls by design.
 */
const unfit = (page: Page) => page.evaluate(() => {
  const shown = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const name = (e: Element) => `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 2).join('.')} "${(e.textContent ?? '').trim().slice(0, 30)}"`;
  const scrolls = (e: Element) => { for (let p = e.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true; return false; };
  const out: string[] = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('svg') && e.tagName !== 'svg' || !shown(e)) continue;
    const r = e.getBoundingClientRect();
    if ((r.right > window.innerWidth + 1 || r.left < -1) && !scrolls(e) && !(e.parentElement && out.includes(name(e.parentElement)))) out.push(name(e));
  }
  for (const box of document.querySelectorAll('.card:not(.runs-toolbar), .edit-body, [role="dialog"]')) {
    if (shown(box) && box.scrollWidth > box.clientWidth + 1) out.push(`${name(box)} ${box.scrollWidth - box.clientWidth} px too narrow`);
  }
  return out;
});
const serious = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations
  .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`);

test.describe('Layout that fits a phone', () => {
  test('Screens fit a phone', async ({ page }) => {
    const width = page.viewportSize()!.width;
    const height = page.viewportSize()!.height;
    const wide: string[] = [];
    const violations: string[] = [];
    const check = async (screen: string, scan = false) => {
      await page.waitForTimeout(250);
      if ((await overflow(page)) > 1) wide.push(screen);
      wide.push(...(await unfit(page)).map((u) => `${screen}: ${u}`));
      if (scan) violations.push(...(await serious(page)).map((v) => `${screen}: ${v}`));
    };

    // The setup wizard as it opens on a folder nothing was set in (scenario "Setup wizard fits a phone"): every step on the phone's width.
    await fakeFolderPicker(page, { wizard: true });
    await page.goto('/');
    await putFitFiles(page, await fitFiles(40, '2026-08-20'));
    await check('Welcome', true);
    await page.getByRole('button', { name: 'Choose data folder' }).click();
    await page.waitForURL(/\/setup$/);
    const step = (name: string) => page.locator('section.setup-card').and(page.getByRole('region', { name, exact: true }));
    await step('Your runs').waitFor();
    // The steps in one line: their numbers, the current one's name.
    const steps = page.getByRole('list', { name: 'Steps' });
    expect(new Set(await steps.getByRole('listitem').evaluateAll((ls) => ls.map((l) => Math.round(l.getBoundingClientRect().y)))).size).toBe(1);
    await step('Your runs').getByText(/^Imported: each new file/).waitFor({ timeout: 90_000 });
    await check('Setup · Your runs', true);
    const next = page.getByRole('button', { name: 'Next', exact: true });
    for (const name of ['You', 'Zones', 'Gear', 'Load model', 'Look & feel', 'Done']) {
      await next.click();
      await step(name).waitFor();
      await step(name).locator('details:not([open]) > summary').evaluateAll((ss) => ss.forEach((s) => (s as HTMLElement).click()));
      await check(`Setup · ${name}`, true);
      // Next on the screen.
      if (name !== 'Done') expect((await next.boundingBox())!.x + (await next.boundingBox())!.width).toBeLessThanOrEqual(width);
      if (name === 'Zones') {
        // A zone's name over its field, the field the card's width.
        const label = (await step(name).locator('.setup-zone .form-row-label').first().boundingBox())!;
        const field = (await step(name).getByLabel('Heart rate zones').boundingBox())!;
        expect(label.y + label.height).toBeLessThanOrEqual(field.y);
        expect(field.width).toBeGreaterThan(width * 0.7);
      }
    }
    // The runs imported, the rest left as it is.
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await page.waitForURL(/\/dashboard$/);
    await nav(page, 'Runs');
    await page.getByRole('heading', { name: 'Runs' }).waitFor();

    // The screens are a tab bar floating at the bottom of the screen, each tab large enough for a finger; a slim bar at the top.
    const tabs = page.getByRole('navigation', { name: 'Screens' });
    expect(await tabs.getByRole('link').evaluateAll((ls) => ls.map((l) => (l.querySelector('.nav-text > span') ?? l).textContent))).toEqual(['Dashboard', 'Runs', 'Segments', 'Compare', 'Performance', 'Settings']);
    // On a phone the menu is a bar of its screens: no facts under them, no week.
    await expect(page.locator('.nav-sub').first()).toBeHidden();
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
    await page.getByRole('tab', { name: 'Look & feel', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).click();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(29, 31, 35)');
    await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
    await check('Runs · dark', true);
    await page.locator('.sidebar').getByRole('link', { name: /Settings$/ }).click();
    await page.getByRole('tab', { name: 'Look & feel', exact: true }).click();
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

    // Segments, and a new segment's rule in the dialog: each field's name over its choices.
    await nav(page, 'Segments');
    await page.getByRole('button', { name: 'New segment' }).click();
    const rule = page.getByRole('dialog');
    await rule.getByRole('group', { name: 'Period' }).waitFor();
    const period = (await rule.getByRole('group', { name: 'Period' }).boundingBox())!;
    expect((await rule.getByText('Period', { exact: true }).boundingBox())!.y).toBeLessThan(period.y);
    await check('Segments · new segment', true);
    await page.keyboard.press('Escape');

    // Analysis: each tab; the picker is a sheet over the bars.
    await nav(page, 'Compare');
    await addFromPicker(page, 'All runs');
    await page.locator('.item-chip').first().waitFor({ timeout: 30_000 });
    await check('Compare · Trends', true);
    for (const tab of ['Efforts', 'A/B', 'Pace / power curve']) {
      await page.getByRole('tab', { name: tab }).click();
      await check(`Compare · ${tab}`);
    }
    await page.getByRole('button', { name: '+ Add segment or run' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add segment or run' });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[role="dialog"]'), [width / 2, height - 20])).toBe(true);
    await check('Compare · picker');
    await page.keyboard.press('Escape');

    // Performance: the overview, every view, a "Why?" open.
    await nav(page, 'Performance');
    await page.locator('.map-node[data-model]').first().waitFor({ timeout: 60_000 });
    // The map of the models reads down the screen: every model's card the width of the map.
    const cards = await page.locator('.map-node[data-model]').evaluateAll((ns) => ns.map((n) => Math.round(n.getBoundingClientRect().width)));
    expect(new Set(cards).size).toBe(1);
    await page.locator('.map-node[data-model="efforts"]').getByRole('button', { name: /^Why\?/ }).click();
    await check('Performance · Overview', true);
    await page.keyboard.press('Escape');
    for (const [tab, views] of [['Load', ['Form', 'Weekly load', 'Intensity']], ['Capacity', ['Best efforts', 'Critical speed and power', 'Predictions and VDOT']], ['Aerobic', ['Efficiency', 'Decoupling', 'VO2max from heart rate']], ['Response', ['On VO2max from heart rate', 'On VDOT']]] as const) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      for (const view of views) {
        await page.getByRole('radio', { name: view, exact: true }).click();
        await page.getByRole('group', { name: 'How far to trust this' }).waitFor();
        await check(`Performance · ${tab} · ${view}`);
      }
    }

    // Settings: its tabs.
    await nav(page, 'Settings');
    for (const tab of ['Data', 'Models', 'Metrics', 'Gears', 'Tags', 'Look & feel', 'Language & region', 'About']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await page.getByRole('region', { name: tab }).waitFor();
      await check(`Settings · ${tab}`, tab !== 'Tags');
    }

    // Fitness function "No screen wider than a phone" (ADR "Look and feel").
    await recordMeasure('phoneScreensWiderThanScreen', wide.length);
    expect(wide).toEqual([]);
    expect(violations).toEqual([]);
  });
});

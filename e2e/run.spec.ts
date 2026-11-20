import { expect, test, type Page } from '@playwright/test';
import { fitFiles, importAll, nav, openWithFolder, readText, showList } from './support';

/** Seconds of a clock: 12:30 or 1:05:00. */
const secs = (c: string) => c.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);

async function openRun(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithFolder(page, await fitFiles(3, '2026-11-09'));
  await importAll(page);
  await showList(page);
  await page.locator('tr.row').first().click();
  const chart = page.getByRole('img', { name: /^Run metrics · / });
  await chart.waitFor();
  return chart;
}

/** The range the readout names, [from, to] s; null for the whole run. */
async function shown(page: Page): Promise<[number, number] | null> {
  const text = (await page.locator('.readout').textContent()) ?? '';
  const m = text.match(/^([\d:]+)–([\d:]+) of/);
  return m ? [secs(m[1]), secs(m[2])] : null;
}

test.describe('Run chart', () => {
  test('Metrics laid over one chart, zoomed in and out', async ({ page }) => {
    const chart = await openRun(page);
    // Four metrics by default, one line each, laid over one chart.
    await expect(chart.locator('.run-line')).toHaveCount(4);
    await expect(chart).toHaveAccessibleName('Run metrics · Pace, Heart rate, Cadence, Ground contact time');
    // The tooltip lists the value of every line under the pointer.
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const card = page.locator('.cursor-card');
    for (const name of ['Pace', 'Heart rate', 'Cadence', 'Ground contact time']) await expect(card).toContainText(name);
    await expect(card).toContainText(/\d:\d\d \/km/);
    await expect(card).toContainText(/\d+ bpm/);
    // Focusing heart rate: its scale at the left, its line on top.
    const scale = page.getByRole('group', { name: 'Scale shown' });
    await expect(scale.getByRole('button', { pressed: true })).toContainText('Pace');
    await scale.getByRole('button', { name: /^Heart rate/ }).click();
    await expect(scale.getByRole('button', { pressed: true })).toContainText('Heart rate');
    await expect(chart.locator('.run-line').last()).toHaveAttribute('data-metric', 'heartRate');
    // By default each line in its own band, top to bottom, its name in the gutter; overlaid, they share the height.
    // The chart menu (scenario "Chart set up in the side menu"): the bands, the lines, the axis are in it;
    // the metrics stay above the chart. It slides in from the right and the chart redraws while it stays open.
    const menuButton = page.getByRole('button', { name: 'Chart', exact: true });
    const menu = page.getByRole('dialog', { name: 'Chart menu' });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();
    const box2 = (await menu.boundingBox())!;
    expect(box2.x + box2.width).toBeGreaterThanOrEqual(1439);
    await expect(menu.getByRole('group', { name: 'Metrics shown' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Bands' })).toHaveAttribute('aria-checked', 'true');
    await expect(chart.locator('.band-name')).toHaveText(['Pace', 'HR', 'Cadence', 'GCT']);
    const tops = await chart.locator('.band-name rect').evaluateAll((rs) => rs.map((r) => Number(r.getAttribute('y'))));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    await page.getByRole('radio', { name: 'Overlaid' }).click();
    await expect(chart.locator('.band-name')).toHaveCount(0);
    await expect(chart.locator('.run-scale').first()).toHaveText(/^\d{2,3}$/); // heart rate's scale, focused
    await page.getByRole('radio', { name: 'Bands' }).click();
    await expect(chart.locator('.band-name')).toHaveCount(4);
    // Smooth (the default) draws the rolling mean; Raw the 10 s windows.
    await expect(page.getByRole('radio', { name: 'Smooth' })).toHaveAttribute('aria-checked', 'true');
    const smoothPath = await chart.locator('.run-line').first().getAttribute('d');
    await page.getByRole('radio', { name: 'Raw' }).click();
    await expect.poll(() => chart.locator('.run-line').first().getAttribute('d')).not.toBe(smoothPath);
    await page.getByRole('radio', { name: 'Smooth' }).click();
    await expect.poll(() => chart.locator('.run-line').first().getAttribute('d')).toBe(smoothPath);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    // A fifth metric waits until one of the four is turned off; it takes the free colour.
    const picker = page.getByRole('group', { name: 'Metrics shown' });
    const off = picker.getByRole('button', { pressed: false }).first();
    await expect(off).toBeDisabled();
    const fifth = (await off.textContent())!;
    await picker.getByRole('button', { name: 'Cadence' }).click();
    await expect(chart.locator('.run-line')).toHaveCount(3);
    await picker.getByRole('button', { name: fifth, exact: true }).click();
    await expect(chart.locator('.run-line')).toHaveCount(4);
    await expect(chart).toHaveAccessibleName(new RegExp(`· Pace, Heart rate, ${fifth}, Ground contact time$`));

    // A lap as the selection (scenario "Lap chosen as the selection"): its bar over the chart, a double click.
    const lapBars = page.getByRole('group', { name: 'Laps' }).getByRole('button');
    const lapRows = page.getByRole('table', { name: 'Laps' }).locator('tbody tr');
    const lapCount = await lapRows.count();
    await expect(lapBars).toHaveCount(lapCount);
    await expect(lapBars.first()).toHaveAccessibleName(/^Lap 1 · \d+\.\d\d km · \d+:\d\d$/);
    const clearSelection = () => page.getByRole('button', { name: 'Show the whole run' }).click();
    // Its bar: the chart zooms to the lap, the bar and the row are marked.
    await lapBars.first().click();
    await expect(lapBars.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(lapRows.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.readout')).toContainText(/ of /);
    await clearSelection();
    await expect(page.locator('.readout')).toContainText(/^Whole run · /);
    // A double click inside the last lap.
    const lastBar = (await lapBars.last().boundingBox())!;
    const plotBox = (await chart.boundingBox())!;
    await page.mouse.dblclick(lastBar.x + Math.min(4, lastBar.width / 2), plotBox.y + 60);
    await expect(lapRows.nth(lapCount - 1)).toHaveAttribute('aria-selected', 'true');
    await clearSelection();
    // The second lap: the statistics are the lap's, its time in their head.
    await lapBars.nth(1).click();
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    await expect(lapRows.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.sel-figures [data-figure="time"] dd')).toHaveText((await lapRows.nth(1).locator('td').nth(2).textContent())!);
    // The selection widget filled (scenario "Selection widget filled"): the key figures of the lap and
    // the time in zones of heart rate (default zones), its shares adding up to 100 %.
    // The left panel holds the range's own figures; a metric's average and zones are in its row.
    for (const f of ['time', 'moving', 'distance', 'elevation', 'laps', 'share']) await expect(page.locator(`.sel-figures [data-figure="${f}"] dd`)).not.toHaveText('');
    await expect(page.locator('.sel-figures [data-figure="pace"], .sel-figures [data-figure="heartRate"]')).toHaveCount(0);
    await expect(page.locator('.sel-figures [data-figure="laps"] dd')).toHaveText(`2 of ${lapCount}`);
    await expect(page.locator('.sel-figures [data-figure="share"] dd')).toHaveText(/^\d+ %$/);
    const hrZones = page.getByRole('table', { name: 'Statistics' }).getByRole('row', { name: /^Heart rate/ }).locator('.zone-bar');
    const pcts = ((await hrZones.getAttribute('aria-label'))!.match(/\d+ %/g) ?? []).map((x) => parseInt(x));
    expect(Math.abs(pcts.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(3);
    await clearSelection();
    await expect(lapRows.nth(1)).toHaveAttribute('aria-selected', 'false');

    // Zoom (scenario "Run chart zoomed in and out").
    await expect(page.locator('.readout')).toContainText(/^Whole run · /);
    await expect(page.locator('.range-stats h3')).toHaveText('Whole run');

    // Select a stretch: the chart and the map zoom to it at once, its statistics show.
    const route = page.getByRole('img', { name: 'Route' });
    const wholeZoom = Number(await route.getAttribute('data-zoom'));
    await expect(route.locator('.route-range')).toHaveCount(0);
    const area = (await chart.boundingBox())!;
    await page.mouse.move(area.x + area.width * 0.4, area.y + area.height / 2);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.6, area.y + area.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    await expect(page.locator('.readout')).toContainText(/ of /);
    const sel = (await shown(page))!;
    const span = sel[1] - sel[0];
    // The map zooms in with the chart, to the stretch shown (scenario "Map zoomed with the chart").
    await expect(route.locator('.route-range')).toHaveCount(1);
    expect(Number(await route.getAttribute('data-zoom'))).toBeGreaterThan(wholeZoom);
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    
    const stats = page.getByRole('table', { name: 'Statistics' });
    // A row for each metric shown, min, avg, max and the trend in columns ("wiersz to metryka").
    const metricRows = stats.locator('tbody th[scope="row"]');
    await expect(metricRows).toHaveText(['Pace', 'Heart rate', fifth, 'Ground contact time']);
    await expect(stats.getByRole('columnheader')).toHaveText(['Metric', 'Min', 'Avg', 'Max', 'Trend /10 min', 'Zones']);
    await expect(stats.getByRole('row', { name: /^Pace/ })).toContainText(/\d:\d\d \/km.*\d:\d\d \/km.*\d:\d\d \/km/);
    await expect(stats.getByRole('row', { name: /^Heart rate/ })).toContainText(/\d+ bpm.*\d+ bpm.*\d+ bpm/);
    // Turning a metric off removes its row; on again, it comes back.
    await picker.getByRole('button', { name: 'Heart rate' }).click();
    await expect(metricRows).toHaveCount(3);
    await picker.getByRole('button', { name: 'Heart rate' }).click();
    await expect(metricRows).toHaveCount(4);

    // Everything at once on a 1440 × 900 screen (scenario "Run screen fits one screen"): no scrolling;
    // the map on the right of the chart; the statistics under them across the width, the bar to
    // make a block in their head, covering nothing.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
    const map = (await page.getByRole('img', { name: 'Route' }).boundingBox())!;
    const table = (await page.locator('.range-stats').boundingBox())!;
    const laps = (await page.getByRole('table', { name: 'Laps' }).boundingBox())!;
    const plot = (await chart.boundingBox())!;
    expect(map.x).toBeGreaterThan(plot.x + plot.width);
    expect(table.y).toBeGreaterThan(Math.max(plot.y + plot.height, map.y + map.height));
    expect(table.width).toBeGreaterThan(plot.width + map.width);
    for (const b of [map, table, laps, plot]) expect(b.y + Math.min(b.height, 60)).toBeLessThanOrEqual(900);
    expect(table.y + table.height).toBeLessThanOrEqual(900);
    // The selection is told once: in the statistics widget, not over the chart nor in the menu.
    await expect(page.getByText(/^Selected min /)).toHaveCount(0);
    // Min, max and average marked for the metric whose scale shows (scenario "Chart smoothed, marked and
    // trended"); pointing at the Max of heart rate lights its point; the selection's trend and Pa:HR.
    await expect(chart.locator('.mark-avg')).toHaveCount(1);
    await expect(chart.locator('.mark-min')).toHaveCount(1);
    await expect(chart.locator('.mark-max')).toHaveCount(1);
    await page.locator('.stat-cell[data-metric="heartRate"][data-stat="max"]').hover();
    await expect(chart.locator('.mark-max.mark-hot')).toHaveCount(1);
    // The points lie on the line they mark, smoothed and raw.
    const marksOnLine = () => chart.evaluate((svg) => {
      const key = svg.querySelector('.mark-max')!.parentElement!.getAttribute('data-metric');
      const path = svg.querySelector(`.run-line[data-metric="${key}"]`) as SVGPathElement;
      return ['.mark-min circle', '.mark-max circle'].map((sel) => {
        const c = svg.querySelector(sel) as SVGCircleElement;
        return path.isPointInStroke(new DOMPoint(c.cx.baseVal.value, c.cy.baseVal.value));
      });
    });
    expect(await marksOnLine()).toEqual([true, true]);
    await page.mouse.move(0, 0);
    await menuButton.click();
    await page.getByRole('radio', { name: 'Raw' }).click();
    await expect.poll(marksOnLine).toEqual([true, true]);
    await page.getByRole('radio', { name: 'Smooth' }).click();
    await page.keyboard.press('Escape');
    await page.locator('.stat-cell[data-metric="heartRate"][data-stat="max"]').hover();
    await expect(chart.locator('.mark-max text')).toHaveText(/^max \d+ bpm$/);
    await expect(stats.getByRole('row', { name: /^Heart rate/ }).locator('.trend-cell')).toHaveText(/^[+−]\d+ bpm$/);
    await expect(page.locator('.range-stats .decoupling')).toHaveText(/^Pa:HR [+−]\d+\.\d %$/);
    await page.mouse.move(0, 0);
    // The statistics' head keeps only the selection and its ✕; the block types are in the chart menu.
    await expect(page.locator('.range-stats').getByRole('button')).toHaveText(['✕']);
    await menuButton.click();
    await expect(menu.getByRole('heading', { name: 'Make a block' })).toBeVisible();
    await expect(menu.locator('.menu-actions button').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // The wheel zooms around the point under the pointer (no + and − buttons): a notch out doubles the
    // range shown, a notch in halves it back; the overview's window grows and shrinks with it.
    await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zoom out' })).toHaveCount(0);
    const overview = page.getByRole('img', { name: /^Overview of the whole run/ });
    const windowWidth = async () => (await overview.locator('.overview-window').boundingBox())!.width;
    const w0 = await windowWidth();
    const mid = (await chart.boundingBox())!;
    await page.mouse.move(mid.x + mid.width * 0.5, mid.y + mid.height / 2);
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => { const o = await shown(page); return o ? o[1] - o[0] : 0; }).toBeGreaterThan(span * 1.5);
    const out = (await shown(page))!;
    expect(Math.abs(out[1] - out[0] - 2 * span)).toBeLessThanOrEqual(2);
    // The range shown is the selection ("tak zmerguj"): the statistics are those of what the wheel shows.
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    const clockOf = (v: number) => { const r = Math.round(v); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
    await expect(page.locator('.range-stats .range-span')).toHaveText(`${clockOf(out[0])}–${clockOf(out[1])}`);
    expect(await windowWidth()).toBeGreaterThan(w0 * 1.8);
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => { const o = await shown(page); return o ? o[1] - o[0] : 0; }).toBeLessThan(span * 1.5);
    const back = (await shown(page))!;
    expect(Math.abs(back[1] - back[0] - span)).toBeLessThanOrEqual(2);
    expect(Math.abs((await windowWidth()) - w0)).toBeLessThanOrEqual(2);
    // A notch of a few pixels (a mouse wheel on macOS) zooms too; so does the wheel over the overview.
    const width = async () => { const o = await shown(page); return o ? o[1] - o[0] : Infinity; };
    await page.mouse.wheel(0, -4);
    await expect.poll(width).toBeLessThan(span * 0.9);
    const ovBox = (await overview.boundingBox())!;
    await page.mouse.move(ovBox.x + ovBox.width / 2, ovBox.y + ovBox.height / 2);
    const narrow = await width();
    await page.mouse.wheel(0, 100);
    await expect.poll(width).toBeGreaterThan(narrow * 1.5);
    // No zoom buttons: the ✕ of the selection goes back to the whole run.
    await expect(page.getByRole('button', { name: 'Zoom to selection' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Whole run', exact: true })).toHaveCount(0);
    const cur = (await shown(page))!;
    expect(cur).not.toBeNull();
    // The time axis follows the range shown.
    const first = secs((await chart.locator('.run-tick').first().textContent())!);
    expect(first).toBeGreaterThanOrEqual(cur[0]);
    expect(first).toBeLessThanOrEqual(cur[1]);

    // Dragging the overview's window moves the range shown and the selection with it (its length kept);
    // dragging elsewhere selects a new stretch.
    const selected = page.locator('.range-stats .range-span');
    const length = page.locator('.sel-figures [data-figure="time"] dd');
    const before = await selected.textContent();
    const lengthBefore = await length.textContent();
    const ov = (await overview.locator('.overview-window').boundingBox())!;
    await page.mouse.move(ov.x + ov.width / 2, ov.y + ov.height / 2);
    await page.mouse.down();
    await page.mouse.move(ov.x + ov.width / 2 - 60, ov.y + ov.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(selected).not.toHaveText(before!);
    await expect(length).toHaveText(lengthBefore!);
    const moved = (await shown(page))!;
    expect(moved[0]).toBeLessThan(cur[0]);
    expect(Math.abs(moved[1] - moved[0] - (cur[1] - cur[0]))).toBeLessThanOrEqual(2);
    const strip = (await overview.boundingBox())!;
    await page.mouse.move(strip.x + strip.width * 0.85, strip.y + strip.height / 2);
    await page.mouse.down();
    await page.mouse.move(strip.x + strip.width * 0.97, strip.y + strip.height / 2, { steps: 5 });
    await page.mouse.up();
    const fresh = (await shown(page))!;
    expect(fresh[0]).toBeGreaterThan(moved[1]);
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');

    // Closing the selection shows the whole run.
    await page.getByRole('button', { name: 'Show the whole run' }).click();
    await expect(page.locator('.readout')).toContainText(/^Whole run · /);
    await expect(page.locator('.range-stats h3')).toHaveText('Whole run');
    await expect(route).toHaveAttribute('data-zoom', String(wholeZoom));
    await expect(route.locator('.route-range')).toHaveCount(0);

    // A pinch (a wheel with Ctrl held) zooms around the pointer too; the keyboard shows the whole run again.
    await page.mouse.move(area.x + area.width * 0.5, area.y + area.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await expect(page.locator('.readout')).toContainText(/ of /);
    await page.getByRole('group', { name: /^Run chart/ }).focus();
    await page.keyboard.press('0');
    await expect(page.locator('.readout')).toContainText(/^Whole run · /);

    // The map zoomed and panned by hand (scenario "Chart follows the map"): the chart shows the range of
    // time of the route in view, and the map is not snapped back.
    const startBox = (await route.locator('.route-start').boundingBox())!;
    await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
    await expect(page.locator('.readout')).toContainText(/ of /);
    const nearStart = (await shown(page))!;
    expect(nearStart[0]).toBeLessThan(120);
    // Even zoomed in as far as the map goes, the chart's two edges are points of the route in view.
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -10);
    await expect.poll(async () => Number(await route.getAttribute('data-zoom'))).toBeGreaterThan(wholeZoom + 1.5);
    const plotNow = (await chart.boundingBox())!;
    for (const fx of [0.01, 0.99]) {
      await page.mouse.move(plotNow.x + 70 + (plotNow.width - 85) * fx, plotNow.y + plotNow.height / 2);
      const at = await route.evaluate((svg) => { const m = [...svg.querySelectorAll('circle')].find((c) => c.getAttribute('r') === '6' && c.getAttribute('stroke') === 'var(--text)')!; return [Number(m.getAttribute('cx')), Number(m.getAttribute('cy'))]; });
      for (const v of at) { expect(v).toBeGreaterThanOrEqual(-2); expect(v).toBeLessThanOrEqual(322); }
    }
    const z1 = await route.getAttribute('data-zoom');
    expect(Number(z1)).toBeGreaterThan(wholeZoom);
    await page.waitForTimeout(300);
    await expect(route).toHaveAttribute('data-zoom', z1!);
    const mapBox = (await route.boundingBox())!;
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(mapBox.x + mapBox.width / 2 - 90, mapBox.y + mapBox.height / 2 - 90, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => JSON.stringify(await shown(page))).not.toBe(JSON.stringify(nearStart));
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 100);
    await expect(page.locator('.readout')).toContainText(/^Whole run · /);
    // Moved by hand, the map offers Fit route, which hands it back to the chart.
    const fit = page.getByRole('button', { name: 'Fit route' });
    await expect(fit).toBeVisible();
    await fit.click();
    await expect(fit).toHaveCount(0);
    await expect(route).toHaveAttribute('data-zoom', wholeZoom.toFixed(2));

    // The x axis by distance (scenario "Chart by distance"): km at round steps, the time under each;
    // by time, a clock with the distance under each tick.
    await expect(chart.locator('.run-tick').first()).toHaveText(/^\d+:\d\d$/);
    await expect(chart.locator('.run-tick-sub').nth(1)).toHaveText(/^\d+(\.\d+)? km$/);
    await menuButton.click();
    await page.getByRole('radio', { name: 'Distance' }).click();
    await expect(chart.locator('.run-tick').first()).toHaveText(/^\d+(\.\d+)? km$/);
    await expect(chart.locator('.run-tick-sub').nth(1)).toHaveText(/^\d+:\d\d$/);
    const kms = (await chart.locator('.run-tick').allTextContents()).map((k) => parseFloat(k));
    expect(kms.length).toBeGreaterThanOrEqual(3);
    expect(new Set(kms.slice(1).map((k, i) => Math.round((k - kms[i]) * 1000))).size).toBe(1);
    await page.getByRole('radio', { name: 'Time' }).click();
    await page.getByRole('button', { name: 'Close the chart menu' }).click();
    await expect(menu).toHaveCount(0);
    await expect(chart.locator('.run-tick').first()).toHaveText(/^\d+:\d\d$/);

    // Zones (scenario "Zones set and coloured"): heart rate zones from a maximum of 190 bpm in the
    // settings, kept in the folder; back on the run, its band striped by them, the tooltip names the zone.
    // With no settings saved, the default zones stripe heart rate and pace (cadence is off by now).
    for (const m of ['heartRate', 'speed']) await expect(chart.locator(`.zone-stripe[data-metric="${m}"]`).first()).toBeVisible();
    await nav(page, 'Settings');
    await expect(page.getByText(/^These are the default zones/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Pace/ })).toHaveValue('6:00, 5:15, 4:45, 4:15');
    await page.getByRole('textbox', { name: /^Heart rate/ }).fill('');
    await page.getByLabel('Max heart rate').fill('190');
    await page.getByRole('button', { name: 'Fill from max HR' }).click();
    await expect(page.getByRole('textbox', { name: /^Heart rate/ })).toHaveValue('114, 133, 152, 171');
    await expect(page.getByLabel('Heart rate zones').locator('.zone-chip')).toHaveText(['Z1 < 114', 'Z2 114–133', 'Z3 133–152', 'Z4 152–171', 'Z5 ≥ 171']);
    await page.getByRole('textbox', { name: /^Pace/ }).fill('5:30, fast');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.getByRole('textbox', { name: /^Pace/ }).fill('');
    await page.getByRole('textbox', { name: /^Cadence/ }).fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^These are the default zones/)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Saved');
    expect(JSON.parse(await readText(page, 'strideprism/user/settings.json'))).toEqual({ schemaVersion: 1, zones: { heartRate: [114, 133, 152, 171] } });
    await page.goBack();
    await chart.waitFor();
    await expect(chart.locator('.zone-stripe[data-metric="heartRate"]').first()).toBeVisible();
    await expect(chart.locator('.zone-stripe[data-metric="speed"]')).toHaveCount(0);
    await expect(chart.locator('.zone-name').first()).toHaveText(/^Z[1-5]$/);
    const again = (await chart.boundingBox())!;
    await page.mouse.move(again.x + again.width * 0.5, again.y + again.height / 2);
    await expect(page.locator('.cursor-card')).toContainText(/\d+ bpm Z[1-5]/);

    // The view kept in the link and remembered for the run (scenario "Run view survives a reload").
    await page.getByRole('group', { name: 'Laps' }).getByRole('button').nth(1).click();
    await menuButton.click();
    await page.getByRole('radio', { name: 'Overlaid' }).click();
    await page.getByRole('radio', { name: 'Distance' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('group', { name: 'Scale shown' }).getByRole('button', { name: /^Heart rate/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('f')).toBe('heartRate');
    const link = new URL(page.url()).searchParams;
    expect([link.get('l'), link.get('x'), link.get('s')]).toEqual(['overlay', 'distance', 'smooth']);
    expect(Number(link.get('to'))).toBeGreaterThan(Number(link.get('from')));
    expect(link.get('m')!.split(',')).toHaveLength(4);
    const range = await page.locator('.range-stats .range-span').textContent();
    const sameView = async () => {
      await chart.waitFor();
      await expect(page.locator('.range-stats .range-span')).toHaveText(range!);
      await expect(page.getByRole('group', { name: 'Laps' }).getByRole('button', { name: /^Lap 2 / })).toHaveAttribute('aria-pressed', 'true');
      await expect(chart.locator('.band-name')).toHaveCount(0); // overlaid
      await expect(chart.locator('.run-tick').first()).toHaveText(/km$/); // by distance
      await expect(page.getByRole('group', { name: 'Scale shown' }).getByRole('button', { pressed: true })).toContainText('Heart rate');
    };
    await page.reload();
    await sameView();
    // Opened again from the list, with nothing but its id in the link: the run's memory.
    await nav(page, 'Runs');
    await showList(page);
    await page.locator('tr.row').first().click();
    await sameView();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addFromPicker, chooseFolder, fakeFolderPicker, fitFiles, importAll, openRun, putFitFiles, recordMeasure } from './support';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.join(ROOT, '.next-build');
/** web-vitals, loaded by the test only (never part of the app, nothing sent over the network); found where npm put it (the workspaces' root). */
const WEB_VITALS = [ROOT, path.resolve(ROOT, '../..')].map((d) => path.join(d, 'node_modules/web-vitals/dist/web-vitals.iife.js')).find((f) => fs.existsSync(f))!;
const SCREENS = [['Runs', '/'], ['Compare', '/compare'], ['Performance', '/performance'], ['Settings', '/settings']] as const;
const BUDGET = { lcp: 2500, cls: 0, tbt: 200, inp: 200, scriptKB: 220 };

async function instrument(page: Page) {
  // The IIFE declares a top-level var; init scripts run in a function scope, so publish it.
  await page.addInitScript({ content: `${fs.readFileSync(WEB_VITALS, 'utf8')}\nwindow.webVitals = webVitals;` });
  await page.addInitScript(() => {
    const w = window as any;
    w.__vitals = { LCP: 0, CLS: 0, INP: 0, TBT: 0 };
    const keep = (m: { name: string; value: number }) => { w.__vitals[m.name] = Math.max(w.__vitals[m.name], m.value); };
    const start = () => {
      w.webVitals.onLCP(keep, { reportAllChanges: true });
      w.webVitals.onCLS(keep, { reportAllChanges: true });
      w.webVitals.onINP(keep, { reportAllChanges: true });
    };
    if (w.webVitals) start(); else addEventListener('DOMContentLoaded', start);
    // Total Blocking Time: the part of each long task beyond 50 ms.
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__vitals.TBT += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  });
}
const vitals = (page: Page) => page.evaluate(() => (window as any).__vitals as Record<'LCP' | 'CLS' | 'INP' | 'TBT', number>);

/**
 * gzip size of the route's own scripts the page loaded, from the export (the transfer size a
 * compressing host sends): those its HTML lists. Chunks the router prefetches for the screens
 * linked in the sidebar belong to those routes' budgets, not this one's.
 */
async function scriptKB(page: Page, route: string): Promise<number> {
  const html = fs.readFileSync(path.join(EXPORT, route === '/' ? 'index.html' : `${route.slice(1)}.html`), 'utf8');
  const own = new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"?]+)/gi)].map((m) => m[1]));
  const urls: string[] = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script').map((r) => new URL(r.name).pathname));
  let bytes = 0;
  for (const u of new Set(urls)) if (own.has(u)) bytes += zlib.gzipSync(fs.readFileSync(path.join(EXPORT, u))).length;
  return Math.round(bytes / 102.4) / 10;
}

test.describe('Core Web Vitals met', () => {
  test('Lab vitals within budget', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) external.push(r.url()); });
    await instrument(page);
    await fakeFolderPicker(page);
    await page.goto('/');
    await putFitFiles(page, await fitFiles(30, '2026-05-01'));
    await chooseFolder(page);
    await importAll(page);
    await page.goto('/compare');
    await addFromPicker(page, /km/);
    await page.locator('.item-chip').first().waitFor({ timeout: 30_000 });
    // Analysis opens empty: it is measured with the segment taken, by its link.
    const analysis = new URL(page.url()).pathname + new URL(page.url()).search;

    const worst = { lcp: 0, cls: 0, tbt: 0, inp: 0, scriptKB: 0 };
    const rows: string[] = [];
    for (const [name, screen] of SCREENS) {
      const url = name === 'Compare' ? analysis : screen;
      await page.goto(url);
      await page.getByRole('heading', { level: 1, name }).waitFor();
      await page.waitForTimeout(500);
      const v = await vitals(page);
      const kb = await scriptKB(page, screen);
      rows.push(`${name}: LCP ${Math.round(v.LCP)} ms, CLS ${v.CLS.toFixed(3)}, TBT ${Math.round(v.TBT)} ms, JS ${kb} KB`);
      worst.lcp = Math.max(worst.lcp, v.LCP); worst.cls = Math.max(worst.cls, v.CLS); worst.tbt = Math.max(worst.tbt, v.TBT); worst.scriptKB = Math.max(worst.scriptKB, kb);
    }
    // INP in the journeys' interactions: the trend's metric and filter, the A/B split.
    await page.goto(analysis);
    await page.getByRole('heading', { level: 1, name: 'Compare' }).waitFor();
    for (const m of ['Pace', 'Heart rate', 'Cadence', 'Pace']) {
      const b = page.getByRole('button', { name: m, exact: true });
      if (await b.count()) await b.click();
    }
    await page.getByRole('button', { name: 'Corrected' }).click();
    worst.inp = Math.max(worst.inp, (await vitals(page)).INP);
    await page.goto(`${analysis}&tab=ab`);
    const abMetrics = page.getByRole('group', { name: 'Metric' });
    await abMetrics.waitFor();
    for (const m of ['Pace', 'Heart rate', 'Ground contact']) await abMetrics.getByRole('button', { name: m, exact: true }).click();
    worst.inp = Math.max(worst.inp, (await vitals(page)).INP);
    // The run chart: a metric off and on, the scale of another, a lap selected and zoomed to, the selection closed.
    await page.goto('/');
    await openRun(page);
    await page.getByRole('img', { name: /^Run metrics · / }).waitFor();
    const picker = page.getByRole('group', { name: 'Metrics shown' });
    for (const m of ['Cadence', 'Cadence']) await picker.getByRole('button', { name: m, exact: true }).click();
    await page.getByRole('group', { name: 'Scale shown' }).getByRole('button', { name: /^Heart rate/ }).click();
    const lapBars = page.getByRole('group', { name: 'Laps' }).getByRole('button');
    await lapBars.nth(1).click();
    await page.getByRole('button', { name: 'Clear selection' }).click();
    worst.inp = Math.max(worst.inp, (await vitals(page)).INP);
    console.log(rows.join('\n'), `\nINP ${Math.round(worst.inp)} ms`);

    await recordMeasure('lcpMaxMs', Math.round(worst.lcp));
    await recordMeasure('clsMax', Math.round(worst.cls * 1000) / 1000);
    await recordMeasure('tbtMaxMs', Math.round(worst.tbt));
    await recordMeasure('inpMaxMs', Math.round(worst.inp));
    await recordMeasure('scriptMaxKB', worst.scriptKB);
    await recordMeasure('vitalsExternalRequests', external.length);
    expect(worst.lcp).toBeLessThanOrEqual(BUDGET.lcp);
    expect(worst.cls).toBeLessThanOrEqual(BUDGET.cls);
    expect(worst.tbt).toBeLessThanOrEqual(BUDGET.tbt);
    expect(worst.inp).toBeLessThanOrEqual(BUDGET.inp);
    expect(worst.scriptKB).toBeLessThanOrEqual(BUDGET.scriptKB);
    expect(external).toEqual([]);
  });
});

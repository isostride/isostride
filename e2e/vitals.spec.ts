import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { fakeFolderPicker, fitFiles, importAll, putFitFiles, recordMeasure } from './support';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.join(ROOT, '.next-build');
/** web-vitals, loaded by the test only (never part of the app, nothing sent over the network). */
const WEB_VITALS = path.join(ROOT, 'node_modules/web-vitals/dist/web-vitals.iife.js');
const SCREENS = [['Runs', '/'], ['Blocks', '/blocks'], ['Analysis', '/analysis'], ['A/B comparison', '/compare'], ['Gear and tags', '/gear']] as const;
const BUDGET = { lcp: 2500, cls: 0.1, tbt: 200, inp: 200, scriptKB: 200 };

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

/** gzip size of the scripts a page loaded, from the export (the transfer size a compressing host sends). */
async function scriptKB(page: Page): Promise<number> {
  const urls: string[] = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script').map((r) => new URL(r.name).pathname));
  let bytes = 0;
  for (const u of new Set(urls)) bytes += zlib.gzipSync(fs.readFileSync(path.join(EXPORT, u))).length;
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
    await page.getByRole('button', { name: 'Choose data folder' }).click();
    await importAll(page);
    await page.goto('/blocks');
    await page.getByRole('button', { name: 'Accept' }).first().click();
    await page.locator('.block-card:not(.suggested)').first().waitFor({ timeout: 30_000 });

    const worst = { lcp: 0, cls: 0, tbt: 0, inp: 0, scriptKB: 0 };
    const rows: string[] = [];
    for (const [name, url] of SCREENS) {
      await page.goto(url);
      await page.getByRole('heading', { level: 1, name }).waitFor();
      await page.waitForTimeout(500);
      const v = await vitals(page);
      const kb = await scriptKB(page);
      rows.push(`${name}: LCP ${Math.round(v.LCP)} ms, CLS ${v.CLS.toFixed(3)}, TBT ${Math.round(v.TBT)} ms, JS ${kb} KB`);
      worst.lcp = Math.max(worst.lcp, v.LCP); worst.cls = Math.max(worst.cls, v.CLS); worst.tbt = Math.max(worst.tbt, v.TBT); worst.scriptKB = Math.max(worst.scriptKB, kb);
    }
    // INP in the journeys' interactions: the trend's metric and filter, the A/B split.
    await page.goto('/analysis');
    await page.getByRole('heading', { level: 1, name: 'Analysis' }).waitFor();
    for (const m of ['Pace', 'Heart rate', 'Cadence', 'Pace']) {
      const b = page.getByRole('button', { name: m, exact: true });
      if (await b.count()) await b.click();
    }
    await page.getByRole('button', { name: 'Corrected' }).click();
    worst.inp = Math.max(worst.inp, (await vitals(page)).INP);
    await page.goto('/compare');
    await page.getByRole('heading', { level: 1, name: 'A/B comparison' }).waitFor();
    for (const m of ['Pace', 'Heart rate', 'Ground contact']) await page.getByRole('button', { name: m, exact: true }).click();
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

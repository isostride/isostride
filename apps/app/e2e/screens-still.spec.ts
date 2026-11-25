import { expect, test, type Page } from '@playwright/test';
import { addFromPicker, chooseFolder, fakeFolderPicker, fitFiles, importAll, nav, putFitFiles, recordMeasure } from './support';

/**
 * Every screen and tab of the app holds still (the runner's "ustaw ze layout shift ma byc 0", then
 * "sprawdz na kazdej podstronie"): opened with a data folder, left to load and read to its end, no
 * layout shift at all. Each shift is recorded with what moved, so a failure names it.
 */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) w.__shifts.push({ v: e.value, t: Math.round(e.startTime), s: (e.sources ?? []).map((s: any) => { const n = s.node?.nodeType === 3 ? s.node.parentElement : s.node; return `${s.node?.nodeName ?? '?'}<${n?.tagName}.${String(n?.className?.baseVal ?? n?.className ?? '').split(' ').slice(0, 2).join('.')}${s.node?.nodeType === 3 ? ' "' + String(s.node.textContent).slice(0, 24) + '"' : ''}> x${Math.round(s.previousRect.x)}→${Math.round(s.currentRect.x)} y${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} w${Math.round(s.previousRect.width)}→${Math.round(s.currentRect.width)} h${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`; }).join(' | ') }); }).observe({ type: 'layout-shift', buffered: true });
  });
}
async function measure(page: Page, url: string): Promise<{ url: string; total: number; what: string[] }> {
  await page.evaluate(() => { (window as any).__shifts = []; });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 700) { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(120); }
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => (window as any).__shifts as { v: number; t: number; s: string }[]);
  const shifts = s.filter((x) => x.v > 0);
  return { url, total: shifts.reduce((a, b) => a + b.v, 0), what: shifts.map((x) => `${x.v.toExponential(2)} at ${x.t} ms: ${x.s}`) };
}
test.describe('Layout shift 0', () => {
test('Every screen holds still', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await instrument(page);
  await fakeFolderPicker(page);
  await page.goto('/');
  await putFitFiles(page, await fitFiles(30, '2026-08-20'));
  await chooseFolder(page);
  await importAll(page);
  await nav(page, 'Compare');
  await addFromPicker(page, /^All runs/);
  await page.locator('.item-chip').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  const compare = page.url().replace(/^https?:\/\/[^/]+/, '');
  const run = await page.evaluate(async () => { const r = await (await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('data')).getDirectoryHandle('.isostride')).getDirectoryHandle('derived')).getFileHandle('runs-index.json'); return JSON.parse(await (await r.getFile()).text()).runs.at(-1).id; });
  const urls = ['/dashboard', '/', `/run?id=${run}`, '/segments', '/compare', compare, `${compare}&tab=segments`, `${compare}&tab=ab`, `${compare}&tab=curve`,
    '/performance', ...['load&view=form', 'load&view=weekly', 'load&view=intensity', 'capacity&view=efforts', 'capacity&view=critical', 'capacity&view=predictions', 'aerobic&view=efficiency', 'aerobic&view=decoupling', 'aerobic&view=vo2', 'response&view=hr', 'response&view=vdot', 'whatif&view=curve', 'whatif&view=load'].map((t) => `/performance?tab=${t}`),
    '/settings', ...['models', 'metrics', 'gears', 'tags', 'display', 'about'].map((t) => `/settings?tab=${t}`), '/setup', '/nothing-here'];
  // A slow machine: the CPU four times slower, so what comes late on a slow computer (or on CI) comes
  // late here too, and moves the page here if it would there.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const results = [];
  for (const u of urls) results.push(await measure(page, u));
  // Runs as a list too (the view kept in the browser), and the Dashboard reached from it in the menu
  // ("jak wchodze na runs to widze shift ... wszystkich kolumn", "tytul dashboard sie przesuwa").
  await page.evaluate(() => localStorage.setItem('strideprism.runsView', 'list'));
  results.push({ ...(await measure(page, '/')), url: '/ (list)' });
  await page.evaluate(() => { (window as any).__shifts = []; });
  await nav(page, 'Dashboard');
  await page.waitForTimeout(2500);
  const menu = (await page.evaluate(() => (window as any).__shifts as { v: number; t: number; s: string }[])).filter((x) => x.v > 0);
  results.push({ url: '/dashboard (from the menu)', total: menu.reduce((a, b) => a + b.v, 0), what: menu.map((x) => `${x.v.toExponential(2)} at ${x.t} ms: ${x.s}`) });
  await recordMeasure('screensClsMax', Math.max(...results.map((r) => r.total)));
  expect(results.filter((r) => r.total > 0)).toEqual([]);
});
});

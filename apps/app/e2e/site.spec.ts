import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { recordMeasure } from './support';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** web-vitals, loaded by the test only (the site loads no script of the kind). */
const WEB_VITALS = [ROOT, path.resolve(ROOT, '../..')].map((d) => path.join(d, 'node_modules/web-vitals/dist/web-vitals.iife.js')).find((f) => fs.existsSync(f))!;
const SITE = 'http://localhost:4174/';

/**
 * The site's home page holds still (the runner's "ustaw ze layout shift ma byc 0"): no layout shift at
 * all while it loads and while it is read to its end (its screenshots loaded lazily on the way), on a
 * desktop and on a phone, in the light and the dark theme; its largest paint within 2500 ms and no
 * serious accessibility violation.
 */
test.describe('Site without layout shift', () => {
  test('Site home page holds still', async ({ browser }) => {
    test.setTimeout(120_000);
    let cls = 0;
    let lcp = 0;
    let a11y = 0;
    for (const [width, height, colorScheme] of [[1280, 900, 'light'], [1280, 900, 'dark'], [390, 844, 'light']] as const) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme });
      const page = await ctx.newPage();
      await page.addInitScript({ content: `${fs.readFileSync(WEB_VITALS, 'utf8')}\nwindow.webVitals = webVitals;` });
      await page.addInitScript(() => {
        const w = window as any;
        w.__vitals = { CLS: 0, LCP: 0, shifts: [] as string[] };
        const start = () => {
          w.webVitals.onCLS((m: { value: number }) => { w.__vitals.CLS = Math.max(w.__vitals.CLS, m.value); }, { reportAllChanges: true });
          w.webVitals.onLCP((m: { value: number }) => { w.__vitals.LCP = Math.max(w.__vitals.LCP, m.value); }, { reportAllChanges: true });
        };
        if (w.webVitals) start(); else addEventListener('DOMContentLoaded', start);
        // What moved, to name it when the test fails.
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) w.__vitals.shifts.push(`${e.value.toFixed(4)} ${(e.sources ?? []).map((s: any) => s.node?.nodeName + '.' + (s.node?.className ?? '')).join(', ')}`);
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(SITE, { waitUntil: 'networkidle' });
      // Read to the end, a screen at a time, as a visitor scrolls (the screenshots load on the way).
      for (let y = 0; y < (await page.evaluate(() => document.body.scrollHeight)); y += height * 0.8) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(150);
      }
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const v = await page.evaluate(() => (window as any).__vitals as { CLS: number; LCP: number; shifts: string[] });
      expect(v.shifts, `${width} ${colorScheme}: what shifted`).toEqual([]);
      cls = Math.max(cls, v.CLS);
      lcp = Math.max(lcp, v.LCP);
      const axe = await new AxeBuilder({ page }).analyze();
      a11y += axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').length;
      await ctx.close();
    }
    await recordMeasure('siteClsMax', Math.round(cls * 10000) / 10000);
    await recordMeasure('siteLcpMaxMs', Math.round(lcp));
    await recordMeasure('siteA11ySeriousViolations', a11y);
    expect(cls).toBe(0);
    expect(lcp).toBeLessThanOrEqual(2500);
    expect(a11y).toBe(0);
  });

  test('Site gives the app version', async ({ page }) => {
    // The footer names the version of the app deployed with it (requirement "App version shown") and the release notes of that version.
    const version = JSON.parse(fs.readFileSync(path.resolve(ROOT, '../../package.json'), 'utf8')).version as string;
    await page.goto(SITE);
    const foot = page.locator('footer.foot');
    await expect(foot).toContainText(`IsoStride ${version.replace(/^(\d+\.\d+)\.0$/, '$1')} ·`);
    const tag = `v${version.replace(/^(\d+\.\d+)\.0$/, '$1')}`;
    await expect(foot.getByRole('link', { name: 'release notes' })).toHaveAttribute('href', `https://github.com/isostride/isostride/releases/tag/${tag}`);
  });
});

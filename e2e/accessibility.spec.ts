import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { nav, recordMeasure, setUpWithBlock } from './support';

/** WCAG 2.2 AA rules axe checks automatically (ADR "Built with React"). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function serious(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${screen}: ${v.id} (${v.impact}) ${v.nodes.length}× ${v.nodes[0]?.target.join(' ')}`);
}

test.describe('Accessible to WCAG 2.2 AA', () => {
  test('Page passes accessibility checks', async ({ page }) => {
    const found: string[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      if (scheme === 'light') await setUpWithBlock(page);
      else await page.reload();
      for (const screen of ['Runs', 'Blocks', 'Trend', 'A/B comparison', 'Gear and tags']) {
        await nav(page, screen);
        await page.getByRole('heading', { level: 1, name: screen }).waitFor();
        await page.waitForTimeout(200);
        found.push(...(await serious(page, `${screen} (${scheme})`)));
      }
      await nav(page, 'Runs');
      await page.locator('tr.row').first().click();
      await page.getByRole('img', { name: 'Pace /km', exact: true }).waitFor();
      found.push(...(await serious(page, `Run (${scheme})`)));
    }
    await recordMeasure('a11ySeriousViolations', found.length);
    expect(found).toEqual([]);
  });
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addFromPicker, nav, openPicker, openRun, recordMeasure, setUpWithBlock } from './support';

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
      for (const screen of ['Dashboard', 'Runs', 'Compare', 'Performance', 'Settings']) {
        await nav(page, screen);
        await page.getByRole('heading', { level: 1, name: screen }).waitFor();
        await page.waitForTimeout(200);
        found.push(...(await serious(page, `${screen} (${scheme})`)));
      }
      // The Data screen, under the logo.
      await page.locator('.sidebar .brand').click();
      await page.getByRole('heading', { level: 1, name: 'Data', exact: true }).waitFor();
      found.push(...(await serious(page, `Data (${scheme})`)));
      // The A/B tab of Analysis, on the block taken.
      await nav(page, 'Compare');
      await addFromPicker(page, /^1\.6 km northeast/);
      await page.getByRole('tab', { name: 'A/B' }).click();
      await page.getByRole('img', { name: 'Difference and interval' }).waitFor({ timeout: 30_000 });
      found.push(...(await serious(page, `Compare · A/B (${scheme})`)));
      // Performance: its overview, every view of every group, and the settings.
      await nav(page, 'Performance');
      await page.locator('.map-node[data-model]').first().waitFor({ timeout: 60_000 });
      found.push(...(await serious(page, `Performance · Overview (${scheme})`)));
      // With a model's "Why?" open: its assumptions, what it rests on, how to read it.
      await page.locator('.map-node[data-model="efforts"]').getByRole('button', { name: /^Why\?/ }).click();
      await page.getByRole('region', { name: /^Why:/ }).waitFor();
      found.push(...(await serious(page, `Performance · Why (${scheme})`)));
      await page.keyboard.press('Escape');
      for (const [tab, views] of [['Load', ['Form', 'Weekly load', 'Intensity']], ['Capacity', ['Best efforts', 'Critical speed and power', 'Predictions and VDOT']], ['Aerobic', ['Efficiency', 'Decoupling', 'VO2max from heart rate']], ['Response', ['On VO2max from heart rate', 'On VDOT']]] as const) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        for (const view of views) {
          await page.getByRole('radio', { name: view, exact: true }).click();
          await page.getByRole('group', { name: 'How far to trust this' }).waitFor();
          await page.waitForTimeout(200);
          found.push(...(await serious(page, `Performance · ${tab} · ${view} (${scheme})`)));
        }
      }
      await nav(page, 'Settings');
      // The tabs of Settings, each.
      for (const tab of ['Models', 'Metrics', 'Gears', 'Tags', 'Look & feel', 'Language & region', 'About']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await page.getByRole('tabpanel').getByRole('region', { name: tab }).waitFor();
        found.push(...(await serious(page, `Settings · ${tab} (${scheme})`)));
      }
      // The picker of the Analysis screen: its list.
      await nav(page, 'Compare');
      const dialog = await openPicker(page);
      found.push(...(await serious(page, `Picker list (${scheme})`)));
      await page.keyboard.press('Escape');
      // The Blocks screen, and the one editor of a block with the segments counted.
      await nav(page, 'Segments');
      found.push(...(await serious(page, `Segments (${scheme})`)));
      await page.getByRole('button', { name: 'New segment' }).click();
      await page.getByRole('dialog', { name: 'New segment' }).locator('.preview-count', { hasText: /efforts? in/ }).waitFor({ timeout: 30_000 });
      found.push(...(await serious(page, `Segment editor (${scheme})`)));
      await page.keyboard.press('Escape');
      await nav(page, 'Runs');
      await openRun(page);
      await page.getByRole('img', { name: /^Run metrics · / }).waitFor();
      found.push(...(await serious(page, `Run (${scheme})`)));
    }
    await recordMeasure('a11ySeriousViolations', found.length);
    expect(found).toEqual([]);
  });
});

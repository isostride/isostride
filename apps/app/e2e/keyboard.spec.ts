import { expect, test, type Page } from '@playwright/test';
import { fakeFolderPicker, fitFiles, importDone, putFitFiles, recordMeasure } from './support';

let presses = 0;

/** Tabs forward to the control with this accessible name; fails after 200 tabs. */
async function tabTo(page: Page, role: 'button' | 'link' | 'radio' | 'combobox' | 'tab', name: string | RegExp): Promise<void> {
  const target = page.getByRole(role, { name }).first();
  await target.waitFor();
  for (let i = 0; i < 200; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) {
      // Focus is visible: the element is on screen and draws a focus indicator.
      await expect(target).toBeInViewport();
      const ring = await target.evaluate((el) => {
        const s = getComputedStyle(el);
        return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
      });
      expect(ring, `focus ring on ${name}`).toBe(true);
      return;
    }
    await page.keyboard.press('Tab');
    presses++;
  }
  throw new Error(`${name} not reached within 200 tabs`);
}

test.describe('Accessible to WCAG 2.2 AA', () => {
  test('Main journey by keyboard', async ({ page }) => {
    await fakeFolderPicker(page);
    await page.goto('/');
    await putFitFiles(page, await fitFiles(30, '2026-05-01'));
    // Import.
    await tabTo(page, 'button', 'Choose data folder');
    await page.keyboard.press('Enter');
    // The setup wizard goes on from the folder; skipped by keyboard too.
    await page.waitForURL(/\/setup$/);
    await tabTo(page, 'button', 'Skip setup');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/dashboard$/);
    // Settings opens on its Data tab, where the import (by itself) is seen to end.
    await tabTo(page, 'link', /Settings$/);
    await page.keyboard.press('Enter');
    await page.getByLabel('What the folder holds').waitFor();
    await importDone(page);
    // Block definition: on the Analysis screen, the picker opens with the search focused; Enter takes the first block found in the runs.
    await tabTo(page, 'link', /Compare$/);
    await page.keyboard.press('Enter');
    await tabTo(page, 'button', '+ Add segment or run');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Search segments and runs' })).toBeFocused();
    await page.keyboard.type('km');
    await page.keyboard.press('Enter');
    await expect(page.locator('.item-chip')).toHaveCount(1, { timeout: 30_000 });
    // Analysis for pace.
    await tabTo(page, 'button', 'Pace');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Compare' })).toBeVisible();
    // A/B comparison, a tab of Analysis.
    await tabTo(page, 'tab', 'A/B');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'A/B' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('group', { name: 'Metric' })).toBeVisible();
    await recordMeasure('keyboardJourneyCompleted', 1);
    await recordMeasure('keyboardJourneyTabs', presses);
  });
});

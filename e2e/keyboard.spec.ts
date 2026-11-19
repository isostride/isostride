import { expect, test, type Page } from '@playwright/test';
import { fakeFolderPicker, fitFiles, putFitFiles, recordMeasure } from './support';

let presses = 0;

/** Tabs forward to the control with this accessible name; fails after 200 tabs. */
async function tabTo(page: Page, role: 'button' | 'link' | 'radio' | 'combobox', name: string | RegExp): Promise<void> {
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
    await tabTo(page, 'button', 'Import folder');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/^Imported \d+ runs?/)).toBeVisible({ timeout: 60_000 });
    // Block definition: accept the first suggestion.
    await tabTo(page, 'link', /Blocks$/);
    await page.keyboard.press('Enter');
    await tabTo(page, 'button', 'Accept');
    await page.keyboard.press('Space');
    await expect(page.locator('.block-card:not(.suggested)')).toHaveCount(1, { timeout: 30_000 });
    // Trend for pace.
    await tabTo(page, 'link', /Trend$/);
    await page.keyboard.press('Enter');
    await tabTo(page, 'button', 'Pace');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Trend' })).toBeVisible();
    // A/B comparison.
    await tabTo(page, 'link', /A\/B comparison$/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'A/B comparison' })).toBeVisible();
    await recordMeasure('keyboardJourneyCompleted', 1);
    await recordMeasure('keyboardJourneyTabs', presses);
  });
});

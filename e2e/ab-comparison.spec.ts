import { expect, test } from '@playwright/test';
import { nav, setUpWithBlock } from './support';

test.describe('Result transparency', () => {
  test('Open instances of A/B', async ({ page }) => {
    await setUpWithBlock(page);
    await nav(page, 'A/B comparison');
    await page.getByRole('button', { name: /^Instances: \d+ in · \d+ left out$/ }).click();
    const panel = page.locator('aside.sheet');
    // Both groups among the accepted instances, each marked with its group.
    await expect(panel.locator('.group-tag.gA').first()).toBeVisible();
    await expect(panel.locator('.group-tag.gB').first()).toBeVisible();
    await expect(panel.locator('.group-tag.gA').first()).toHaveAttribute('title', /Shoes/);
    // The rejected ones with the reason for rejection.
    await panel.getByRole('button', { name: /^Rejected \d+$/ }).click();
    await expect(panel.getByText(/^✗ /).first()).toBeVisible();
  });
});
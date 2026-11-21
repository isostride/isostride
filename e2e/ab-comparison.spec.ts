import { expect, test } from '@playwright/test';
import { setUpWithBlock } from './support';

test.describe('Result transparency', () => {
  test('Open instances of A/B', async ({ page }) => {
    await setUpWithBlock(page);
    // A/B is a tab of Analysis, not a screen of the navigation; the block's "Compare A/B" opens it on that block.
    await expect(page.locator('.sidebar').getByRole('link', { name: /A\/B comparison$/ })).toHaveCount(0);
    const block = new URL(page.url()).searchParams.get('items')!.split(':')[1];
    await page.getByRole('table', { name: 'Changes' }).getByRole('link', { name: 'Compare A/B →' }).click();
    await expect(page).toHaveURL(new RegExp(`tab=ab&ab=${block}`));
    await expect(page.getByRole('tab', { name: 'A/B' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: /^Instances: \d+ in · \d+ left out$/ }).click();
    const panel = page.locator('aside.sheet');
    // Both groups among the accepted instances, each marked with its group.
    await expect(panel.locator('.group-tag.gA').first()).toBeVisible();
    await expect(panel.locator('.group-tag.gB').first()).toBeVisible();
    await expect(panel.locator('.group-tag.gA').first()).toHaveAttribute('title', /Shoes/);
    // The rejected ones with the reason for rejection.
    await panel.getByRole('button', { name: /^Rejected \d+$/ }).click();
    await expect(panel.getByText(/^✗ /).first()).toBeVisible();

    // An old link of the A/B screen opens the tab with its block.
    await page.goto(`/compare?def=${block}`);
    await expect(page).toHaveURL(new RegExp(`/analysis\\?items=b%3A${block}%3A0&tab=ab&ab=${block}|/analysis\\?items=b:${block}:0&tab=ab&ab=${block}`));
    await expect(page.getByRole('img', { name: 'Timeline of the two groups' })).toBeVisible({ timeout: 30_000 });
  });
});

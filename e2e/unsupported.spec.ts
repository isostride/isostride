import { expect, test } from '@playwright/test';
import { recordMeasure } from './support';

test.describe('Unsupported browser message', () => {
  test('Firefox gets message', async ({ page, browserName }) => {
    // Run in WebKit (Safari): like Firefox it has no showDirectoryPicker.
    await page.goto('/');
    await expect(page.getByText('Browser not supported')).toBeVisible();
    await expect(page.getByText(/Chrome, Edge or Opera/)).toBeVisible();
    // It does not start: no folder picker, no screens.
    await expect(page.getByRole('button', { name: 'Choose data folder' })).toHaveCount(0);
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await recordMeasure(`unsupportedStarted_${browserName}`, 0);
  });
});

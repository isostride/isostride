import { expect, test } from '@playwright/test';
import { fitFiles, openWithFolder } from './support';

test.describe('Folder path shown', () => {
  test('Folder path typed once', async ({ page }) => {
    await openWithFolder(page, await fitFiles(1));
    // The side menu holds no line of the folder; the logo leads to the Data folder screen.
    await expect(page.locator('.sidebar .crumbs')).toHaveCount(0);
    await page.locator('.sidebar .brand').click();
    await page.getByRole('heading', { name: 'Data folder' }).waitFor();
    // The browser gives the folder's name only: the screen asks for its path, once.
    const where = page.getByLabel('Where is it on your disk?');
    await expect(where).toBeVisible();
    await where.fill('/Users/runner/Runs/other');
    await expect(page.getByText(/does not end in “data”/)).toBeVisible();
    await where.fill('/Users/runner/Runs/data');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.folder-path')).toHaveText('/Users/runner/Runs/data');
    // Kept in this browser: there after a reload.
    await page.reload();
    await page.getByRole('heading', { name: 'Data folder' }).waitFor();
    await expect(page.locator('.folder-path')).toHaveText('/Users/runner/Runs/data');
    // Edited, then forgotten: the question again.
    await page.getByRole('button', { name: 'Edit path' }).click();
    await page.getByRole('button', { name: 'Forget' }).click();
    await expect(page.getByLabel('Where is it on your disk?')).toBeVisible();
  });
});

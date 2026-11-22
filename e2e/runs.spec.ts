import { expect, test } from '@playwright/test';
import { fitFiles, importAll, openWithFolder, showList } from './support';

test.describe('Search runs', () => {
  test('Runs searched and the calendar browsed', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWithFolder(page, await fitFiles(30, '2026-08-20'));
    await importAll(page);
    // The runner titles one run, to find it by its title.
    await showList(page);
    const third = page.locator('tr.row').nth(2);
    await third.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill('COROS test');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(third).toContainText('COROS test');

    // Words: the list shows the run found, the count says so, the link holds the search.
    const found = page.locator('.runs-found');
    await page.getByLabel('Search words').fill('coros test');
    await expect(found).toHaveText('1 of 30 runs');
    await expect(page.locator('tr.row')).toHaveCount(1);
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('coros test');
    // The calendar keeps its weeks: the run found as a tile, the others as thin bars, its month counting it.
    await page.getByRole('radio', { name: 'Calendar' }).click();
    const calendar = page.getByRole('region', { name: 'Calendar of runs' });
    await expect(calendar.locator('.run-tile:not(.dim)')).toHaveCount(1);
    await expect(calendar.locator('.run-tile.dim')).toHaveCount(29);
    await expect(calendar.locator('.cal-found.some')).toHaveText(['1 found']);
    // Reloaded, the search is still there.
    await page.reload();
    await expect(page.getByLabel('Search words')).toHaveValue('coros test');
    await expect(found).toHaveText('1 of 30 runs');
    // A distance range narrows the runs; Clear shows them all.
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(found).toHaveText('30 runs');
    await page.getByLabel('From km').fill('10');
    const longer = Number((await found.textContent())!.split(' ')[0]);
    expect(longer).toBeGreaterThan(0);
    expect(longer).toBeLessThan(30);
    await expect(calendar.locator('.run-tile:not(.dim)')).toHaveCount(longer);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(calendar.locator('.run-tile.dim')).toHaveCount(0);

    // Browsing: a month's band comes to the top of the calendar; Today goes back to the current week.
    // (A month with weeks enough below it to come to the top: the second newest.)
    const months = (await page.getByLabel('Go to month').locator('option').allTextContents()).slice(1);
    expect(months.length).toBeGreaterThanOrEqual(3);
    await page.getByLabel('Go to month').selectOption({ label: months[1] });
    const band = calendar.locator('.cal-month-band', { hasText: months[1] });
    await expect.poll(async () => Math.round((await band.boundingBox())!.y)).toBeLessThan(160);
    // The search bar stays at the top of the window while the calendar scrolls, the band under it.
    const bar = (await page.getByRole('search', { name: 'Search runs' }).boundingBox())!;
    expect(bar.y).toBeLessThanOrEqual(1);
    expect((await band.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    await page.getByRole('button', { name: 'Today' }).click();
    await expect.poll(async () => Math.round((await calendar.locator('.cal-week.current').boundingBox())!.y)).toBeLessThan(200);

    // The command palette (⌘K): the screens, the latest runs and the actions in coloured groups; searched, moved through and opened from the keyboard.
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    const options = palette.getByRole('option');
    // With nothing typed: the four screens, the latest runs, the actions, each group with its count.
    await expect(palette.locator('.cmdk-group > span:first-child')).toHaveText(['Screens', 'Runs', 'Actions']);
    await expect(palette.locator('.cmdk-item.group-screens .cmdk-label')).toHaveText(['Runs', 'Segments', 'Compare', 'Performance', 'Settings']);
    await expect(palette.locator('.cmdk-item.group-runs')).toHaveCount(5);
    await expect(palette.locator('.cmdk-item.group-runs .cmdk-side').first()).toHaveText(/^\d+\.\d km$/);
    await expect(palette.locator('.cmdk-item.group-runs .cmdk-hint').first()).toHaveText(/\d+:\d\d · \d+:\d\d \/km$/);
    // A month finds the runs of it; the arrows move the item in view, Enter opens it.
    await palette.getByRole('combobox').fill('aug');
    await expect(palette.locator('.cmdk-group > span:first-child')).toHaveText(['Runs']);
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(palette.getByRole('combobox')).toHaveAttribute('aria-activedescendant', 'cmdk-1');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/run\?id=2026-?08/);
    await expect(palette).toHaveCount(0);
    // Nothing found: said so, with what to try.
    await page.keyboard.press('ControlOrMeta+k');
    await palette.getByRole('combobox').fill('zzqx');
    await expect(palette.locator('.cmdk-empty')).toContainText('Nothing found for “zzqx”');
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
  });
});

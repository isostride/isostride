import { expect, test, type Page } from '@playwright/test';

/** The names of the folders in the browser's private storage. */
const stored = (page: Page) => page.evaluate(async () => {
  const names: string[] = [];
  for await (const [name] of (await navigator.storage.getDirectory() as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(name);
  return names;
});

test.describe('Demo', () => {
  test('Demo opened from its link, looked around and left', async ({ page }) => {
    test.setTimeout(300_000);
    // The link of the site: the app opens on the demo with nothing picked, saying what it is making.
    await page.goto('/dashboard?demo');
    await expect(page.getByRole('heading', { name: 'Preparing the demo' })).toBeVisible();
    // The app on the demo's last months, said to be a sample runner's on every screen (the runner's "nie pisz zmyslony biegacz ... daj przykladowy biegacz"); the link's ?demo is gone.
    const bar = page.getByRole('complementary', { name: 'Demo data' });
    await expect(bar).toBeVisible({ timeout: 120_000 });
    await expect(bar).toContainText('A sample runner.');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    // No set-up wizard on it, and no folder was asked for.
    await expect(page).toHaveURL(/\/dashboard$/);
    // The earlier history comes in behind the app; when it is all there, two years of runs.
    await expect(bar.getByRole('status')).toHaveCount(0, { timeout: 240_000 });
    await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
    await page.getByRole('heading', { name: 'Runs' }).waitFor();
    const all = page.getByRole('region', { name: 'Weeks at a glance' });
    await expect(all).toContainText(/5\d\d runs|6\d\d runs/, { timeout: 30_000 });
    // The runner the demo shows: a critical pace of about 3:15 /km, as the app fits it to the bests.
    await page.goto('/performance?tab=capacity&view=critical');
    await expect(page.locator('.perf-widget').first()).toContainText(/3:1[0-9] \/km/, { timeout: 60_000 });
    // Opened again, the demo is there at once: nothing is made a second time.
    await page.goto('/');
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await expect(bar.getByRole('status')).toHaveCount(0);
    // Left: the choice of a folder of one's own, and the demo's data gone from the browser.
    await bar.getByRole('button', { name: 'Use your own data' }).click();
    await expect(page.getByRole('button', { name: 'Choose data folder' })).toBeVisible({ timeout: 30_000 });
    await expect(async () => expect(await stored(page)).not.toContain('IsoStride demo')).toPass({ timeout: 30_000 });
  });

  test('Demo offered on the Welcome screen', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByRole('button', { name: 'Try the demo' }).click();
    await expect(page.getByRole('complementary', { name: 'Demo data' })).toBeVisible({ timeout: 120_000 });
    // In every tab of this browser until it is left: the Runs screen opened afresh is the demo's.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('complementary', { name: 'Demo data' })).toBeVisible();
    // Settings on the demo ("czemu w demo ciagle integracja z corosem dziala?", "czy w demo w settings .. jakies opcje nie
    // powinny byc wyszarzone"): COROS off, said why; no folder to change.
    await page.goto('/settings');
    await expect(page.getByText('Off in the demo', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Change folder…' })).toBeDisabled();
    // The Dashboard's form, far down the page: 1 year chosen, the page stays where it is ("klikniecie na 90 days ...
    // powodu przeskok do samej gory dashboard").
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto('/dashboard');
    const period = page.getByRole('radiogroup', { name: 'Period' }).first();
    await period.scrollIntoViewIfNeeded({ timeout: 60_000 });
    await expect(period.getByRole('radio', { name: '90 days' })).toBeChecked();
    const before = await page.evaluate(() => scrollY);
    expect(before).toBeGreaterThan(200);
    await period.getByRole('radio', { name: '1 year' }).click();
    await expect(period.getByRole('radio', { name: '1 year' })).toBeChecked();
    expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(80);
  });
});

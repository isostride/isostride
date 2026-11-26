import { devices, expect, test, type CDPSession } from '@playwright/test';
import { fitFiles, importAll, openRun, openWithFolder } from './support';

// A phone: its width and a touch screen, no mouse.
test.use({ ...devices['Pixel 7'] });

type Finger = { x: number; y: number; id?: number };
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Finger[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, k) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id ?? k })) });

test.describe('Run chart by finger', () => {
  test('A part of a run selected and zoomed by finger', async ({ page }) => {
    // The runner's "to zrob: Zaznaczanie i zoom fragmentu biegu dotykiem na telefonie": the chart took the mouse alone.
    await openWithFolder(page, await fitFiles(3, '2026-11-09'));
    await importAll(page);
    await openRun(page);
    const chart = page.getByRole('img', { name: /^Run metrics · / });
    await chart.waitFor();
    await chart.scrollIntoViewIfNeeded();
    // The hints name the finger's gestures.
    await expect(page.getByText(/drag sideways to select · two fingers to zoom and move/)).toBeVisible();
    await expect(page.locator('.map-hint')).toHaveText('Tap two points to select');
    const window = page.locator('.overview .overview-window');
    await expect(window).toHaveCount(0);
    const cdp = await page.context().newCDPSession(page);
    const box = (await chart.boundingBox())!;
    const at = (share: number): Finger => ({ x: box.x + box.width * share, y: box.y + box.height / 2 });

    // A tap: the values at that point.
    await touch(cdp, 'touchStart', [at(0.5)]);
    await touch(cdp, 'touchEnd', []);
    await expect(page.locator('.cursor-card')).toBeVisible();
    await expect(window).toHaveCount(0);

    // A drag sideways: that part is the selection, and the chart shows it.
    await touch(cdp, 'touchStart', [at(0.3)]);
    for (const share of [0.35, 0.45, 0.55, 0.7]) await touch(cdp, 'touchMove', [at(share)]);
    await touch(cdp, 'touchEnd', []);
    await expect(window).toHaveCount(1);
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    const selected = (await window.boundingBox())!.width;

    // Two fingers moved apart: a shorter range, around the point between them.
    await touch(cdp, 'touchStart', [at(0.45)]);
    await touch(cdp, 'touchStart', [at(0.45), at(0.55)]);
    for (const d of [0.1, 0.15, 0.2, 0.25]) await touch(cdp, 'touchMove', [at(0.5 - d), at(0.5 + d)]);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(async () => (await window.boundingBox())!.width).toBeLessThan(selected * 0.6);
    const zoomed = (await window.boundingBox())!;

    // Two fingers moved together to the left: the range moves on, as long as it was.
    await touch(cdp, 'touchStart', [at(0.6)]);
    await touch(cdp, 'touchStart', [at(0.6), at(0.8)]);
    for (const d of [0.1, 0.2, 0.3]) await touch(cdp, 'touchMove', [at(0.6 - d), at(0.8 - d)]);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(async () => (await window.boundingBox())!.x).toBeGreaterThan(zoomed.x + 2);
    expect(Math.abs((await window.boundingBox())!.width - zoomed.width)).toBeLessThan(2);

    // The strip of the whole run under the chart: its window dragged back by a finger.
    await page.locator('.overview').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const moved = (await window.boundingBox())!;
    const grip: Finger = { x: moved.x + moved.width / 2, y: moved.y + moved.height / 2 };
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.overview'), [grip.x, grip.y])).toBe(true);
    await touch(cdp, 'touchStart', [grip]);
    for (const dx of [10, 20, 30]) await touch(cdp, 'touchMove', [{ x: grip.x - dx, y: grip.y }]);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(async () => (await window.boundingBox())!.x).toBeLessThan(moved.x - 10);
  });
});

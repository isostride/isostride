import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { recordMeasure } from './support';

/** The folder the static export lands in (npm run build; the end-to-end server serves it). */
const EXPORT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.next-build');
const SCREENS = ['index', 'run', 'blocks', 'analysis', 'compare', 'gear'];

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])))).flat();
}

test.describe('Static export build', () => {
  test('Static export builds', async ({ page }) => {
    // A pre-built page for each of the six screens.
    const missing = [];
    for (const s of SCREENS) if (!(await fs.stat(path.join(EXPORT, `${s}.html`)).catch(() => null))) missing.push(s);
    // No server-side code: no server bundle, API route, middleware or server function.
    const files = (await walk(EXPORT)).map((f) => path.relative(EXPORT, f));
    const serverSide = files.filter((f) => /^server\/|(^|\/)api\/|middleware|\.func\/|\.rsc\.js$|route\.js$/.test(f));
    await recordMeasure('buildStaticRoutesMissing', missing.length);
    await recordMeasure('buildServerRoutes', serverSide.length);
    expect(missing).toEqual([]);
    expect(serverSide).toEqual([]);

    // Opened from a plain static file server, the app reaches the Welcome screen.
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Choose data folder' })).toBeVisible();
  });
});

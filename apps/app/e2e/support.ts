import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const TEST_DATA = path.resolve(HERE, '../test_data/coros_fit_2026');

/**
 * Stands in for the folder picker: showDirectoryPicker returns a folder in the
 * browser's origin private file system, which supports the same handle API. The
 * permission methods the OPFS handles lack answer "granted", like a user who allows access.
 */
export async function fakeFolderPicker(page: Page, { wizard = false } = {}): Promise<void> {
  // The setup wizard opens by itself on a folder nothing was set in: the tests of the screens skip it,
  // as a runner would, unless they test it (a setup.json written in the folder, as Skip writes it).
  if (!wizard) {
    await page.addInitScript(async () => {
      // Once a tab: a test may take the file away later and reload.
      if (location.protocol.startsWith('http') && sessionStorage.getItem('setup-skip-written')) return;
      try {
        const data = await (await navigator.storage.getDirectory()).getDirectoryHandle('data', { create: true });
        const user = await (await data.getDirectoryHandle('.isostride', { create: true })).getDirectoryHandle('user', { create: true });
        try { await user.getFileHandle('setup.json'); } catch {
          const w = await (await user.getFileHandle('setup.json', { create: true })).createWritable();
          await w.write('{"state":"skipped","at":"2026-11-23T00:00:00.000Z"}');
          await w.close();
        }
        sessionStorage.setItem('setup-skip-written', '1');
      } catch { /* not the app's origin yet */ }
    });
  }
  await page.addInitScript(() => {
    const proto = (globalThis as any).FileSystemHandle?.prototype;
    if (proto) {
      proto.queryPermission ??= async () => 'granted';
      proto.requestPermission ??= async () => 'granted';
    }
    (window as any).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('data', { create: true });
  });
}

/** Copies FIT files into the fake data folder's fit/ (call after a first page load, on the app's origin). */
export async function putFitFiles(page: Page, files: string[]): Promise<void> {
  const payload = await Promise.all(files.map(async (f) => ({ name: f, b64: (await fs.readFile(path.join(TEST_DATA, f))).toString('base64') })));
  await page.evaluate(async (items) => {
    const root = await navigator.storage.getDirectory();
    const fit = await (await root.getDirectoryHandle('data', { create: true })).getDirectoryHandle('fit', { create: true });
    for (const { name, b64 } of items) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const w = await (await fit.getFileHandle(name, { create: true })).createWritable();
      await w.write(bytes);
      await w.close();
    }
  }, payload);
}

/**
 * The export as the tests were written against it (the runs up to 20 Nov 2026): a run the runner
 * adds to the folder later is left out, so it does not change what the tests count.
 */
const isFixture = (name: string): boolean => {
  if (!name.endsWith('.fit')) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(name)) return name.slice(0, 10) <= '2026-11-20';
  const id = name.match(/^(\d{15,20})_/);
  return id ? BigInt(id[1]) <= 481897427972948672n : false;
};

export async function fitFiles(count: number, from = '2026-08-03'): Promise<string[]> {
  return (await fs.readdir(TEST_DATA)).filter((f) => isFixture(f) && f >= from).sort().slice(0, count);
}

/** Records a measurement for the model's metric conditions (reports/measures-e2e.json). */
export async function recordMeasure(name: string, value: number): Promise<void> {
  const file = path.resolve(HERE, '../reports/measures-e2e.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  let all: Record<string, number> = {};
  try { all = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* first */ }
  all[name] = value;
  await fs.writeFile(file, JSON.stringify(all, null, 2));
}
/** Writes a text file into the fake data folder (path relative to it, e.g. .isostride/user/gear.json). */
export async function putText(page: Page, file: string, text: string): Promise<void> {
  await page.evaluate(async ({ file, text }) => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('data', { create: true });
    const parts = file.split('/');
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
    const w = await (await dir.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }, { file, text });
}

/** Reads a text file of the fake data folder. */
export async function readText(page: Page, file: string): Promise<string> {
  return page.evaluate(async (file) => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('data');
    const parts = file.split('/');
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
    return (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).text();
  }, file);
}

/** Logs the name of every file the page (not the worker) opens, in window.__opened. */
export async function logOpenedFiles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any;
    w.__opened = [] as string[];
    const proto = (globalThis as any).FileSystemDirectoryHandle.prototype;
    const get = proto.getFileHandle;
    proto.getFileHandle = function (name: string, opts?: unknown) {
      w.__opened.push(name);
      return get.call(this, name, opts);
    };
  });
}

/**
 * Picks the folder on the Welcome screen, the setup's first step: the wizard goes on, and the tests of
 * the screens skip it as a runner may, then open Runs.
 */
export async function chooseFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Choose data folder' }).click();
  await page.waitForURL(/\/setup$/);
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
}

/** Opens the app with the fake picker, picks the folder and returns once the Runs screen shows. */
export async function openWithFolder(page: Page, files: string[]): Promise<void> {
  await fakeFolderPicker(page);
  await page.goto('/');
  await putFitFiles(page, files);
  await chooseFolder(page);
  await page.getByRole('heading', { name: 'Runs' }).waitFor();
}

/** Imports the folder on the Data folder screen (the logo leads to it), then returns to Runs. */
export async function importAll(page: Page): Promise<void> {
  await page.locator('.sidebar .brand').click();
  await page.getByRole('heading', { name: 'Data folder' }).waitFor();
  await page.getByRole('button', { name: 'Import folder' }).click();
  await page.getByText(/^Imported \d+ runs?/).waitFor({ timeout: 60_000 });
  await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
  await page.getByRole('heading', { name: 'Runs' }).waitFor();
}

/**
 * On a run: sets its chart in Settings, Charts (each choice a radio by its name, or 'blocks on' /
 * 'blocks off' for the switch), then returns to the run as it was left.
 */
export async function setChart(page: Page, ...choices: string[]): Promise<void> {
  await page.locator('.sidebar').getByRole('link', { name: /Settings$/ }).click();
  await page.getByRole('tab', { name: 'Charts', exact: true }).click();
  const card = page.getByRole('region', { name: 'Charts' });
  for (const c of choices) {
    if (c === 'blocks on' || c === 'blocks off') await card.getByRole('checkbox', { name: /Segments on the chart/ }).setChecked(c === 'blocks on');
    else await card.getByRole('radio', { name: c, exact: true }).click();
  }
  await page.goBack();
  await page.getByRole('img', { name: /^Run metrics · / }).waitFor();
}

/** Clicks a screen in the sidebar (its link's name starts with an icon). */
export async function nav(page: Page, name: string): Promise<void> {
  await page.locator('.sidebar').getByRole('link', { name: new RegExp(`${name.replace('/', '\\/')}$`) }).click();
}

/** May 2026 in one pair of shoes, June in another: the A/B screen can split by shoes. */
export const GEAR_MAY_JUNE = {
  gear: [
    { id: 'g1', name: 'Shoes May', type: 'shoes', from: '2026-05-01', to: '2026-05-31' },
    { id: 'g2', name: 'Shoes June', type: 'shoes', from: '2026-06-01', to: null },
  ],
};

/** Since 3 Aug 2026: one watch and a change of shoes on 1 Oct. */
export const GEAR_AUTUMN = {
  gear: [
    { id: 'g1', name: 'Shoes Summer', type: 'shoes', from: '2026-08-01', to: '2026-09-30' },
    { id: 'g2', name: 'Shoes Autumn', type: 'shoes', from: '2026-10-01', to: null },
  ],
};

/** On the Analysis screen, which opens empty: removes whatever a link put there, to start from no item. */
export async function clearAnalysis(page: Page): Promise<void> {
  await page.getByRole('heading', { name: 'Compare' }).waitFor();
  const remove = page.locator('.item-chip').getByRole('button', { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
}

/** Opens the picker of the Analysis screen: its list of blocks and runs (a block is made on the Blocks screen). */
export async function openPicker(page: Page) {
  await page.getByRole('button', { name: '+ Add segment or run' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add segment or run' });
  await dialog.waitFor();
  return dialog;
}

/** On the Analysis screen: takes from the picker the block (kept or suggested) or the run whose row starts with `name`. */
export async function addFromPicker(page: Page, name: RegExp | string): Promise<void> {
  const dialog = await openPicker(page);
  await dialog.locator('.palette-item', { hasText: name }).first().click();
}

/**
 * A data folder with FIT files and a gear register, imported, with one suggested block taken on
 * the Analysis screen (kept, and shown there); file opens by the page are logged (window.__opened).
 */
export async function setUpWithBlock(page: Page, { files = fitFiles(30, '2026-05-01'), gear = GEAR_MAY_JUNE, block = /^1\.6 km northeast/ as RegExp } = {}): Promise<void> {
  await fakeFolderPicker(page);
  await logOpenedFiles(page);
  await page.goto('/');
  await putFitFiles(page, await files);
  await putText(page, '.isostride/user/gear.json', JSON.stringify(gear));
  await chooseFolder(page);
  await page.getByRole('heading', { name: 'Runs' }).waitFor();
  await importAll(page);
  await nav(page, 'Compare');
  await clearAnalysis(page);
  await addFromPicker(page, block);
  await page.locator('.item-chip').first().waitFor({ timeout: 30_000 });
}

/** On the Runs screen: the table of runs instead of the calendar (the choice is remembered). */
export async function showList(page: Page): Promise<void> {
  const list = page.getByRole('radio', { name: 'List' });
  if ((await list.getAttribute('aria-checked')) !== 'true') await list.click();
}

/** On the Runs screen: opens the n-th run of the table, the newest first. */
export async function openRun(page: Page, n = 0): Promise<void> {
  await showList(page);
  await page.locator('tr.row').nth(n).click();
}

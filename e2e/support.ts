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
export async function fakeFolderPicker(page: Page): Promise<void> {
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

export async function fitFiles(count: number, from = '2026-08-03'): Promise<string[]> {
  return (await fs.readdir(TEST_DATA)).filter((f) => f.endsWith('.fit') && f >= from).sort().slice(0, count);
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

/** Opens the app with the fake picker, picks the folder and returns once the Runs screen shows. */
export async function openWithFolder(page: Page, files: string[]): Promise<void> {
  await fakeFolderPicker(page);
  await page.goto('/');
  await putFitFiles(page, files);
  await page.getByRole('button', { name: 'Choose data folder' }).click();
  await page.getByRole('heading', { name: 'Runs' }).waitFor();
}

export async function importAll(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Import folder' }).click();
  await page.getByText(/^Imported \d+ runs?/).waitFor({ timeout: 60_000 });
}

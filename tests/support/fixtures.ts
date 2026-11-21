import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeFolder } from './nodeFolder';

/** The runner's COROS export (local only, not in git). */
export const TEST_DATA = path.resolve(__dirname, '../../test_data/coros_fit_2026');

/**
 * The export as the tests were written against it (the runs up to 20 Nov 2026): the runner keeps
 * using the folder, and a run added later (dated after that, or with a later COROS activity id)
 * would change what the tests count. Files named by date are kept up to the date, files named by
 * the activity id up to the id.
 */
export const FIXTURE_UNTIL = { date: '2026-11-20', id: 481897427972948672n };
export const isFixture = (name: string): boolean => {
  if (!name.endsWith('.fit')) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(name)) return name.slice(0, 10) <= FIXTURE_UNTIL.date;
  const id = name.match(/^(\d{15,20})_/);
  return id ? BigInt(id[1]) <= FIXTURE_UNTIL.id : false;
};
/** The FIT files of the export the tests rest on, sorted. */
export async function fitFixtures(): Promise<string[]> {
  return (await fs.readdir(TEST_DATA)).filter(isFixture).sort();
}

/** Hand-picked files with values checked by hand against the COROS app and the raw FIT records. */
export const FILES = {
  /** COROS PACE 4, 9.35 km, 3 laps, 2598 samples. */
  pace4: '2026-11-09_run_481641433162350991.fit',
  /** COROS PACE 3, last run on the old watch. */
  pace3: '2026-05-25_run_477744557522452581.fit',
  /** COROS PACE 4, first run on the new watch. */
  pace4First: '2026-05-27_run_477790828547309771.fit',
  /** A later run, copied in after the first import. */
  later: '2026-11-11_run_481688647735738371.fit',
  /** A hike: a FIT file that is not a run. */
  hike: '2026-06-07_hike_478045609496969618.fit',
} as const;

/** A fresh data folder in the OS temp dir with the given FIT files in fit/. */
export async function makeDataFolder(files: string[]): Promise<NodeFolder> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'strideprism-'));
  await fs.mkdir(path.join(root, 'fit'));
  for (const f of files) await fs.copyFile(path.join(TEST_DATA, f), path.join(root, 'fit', f));
  return new NodeFolder(root);
}

export async function addFile(folder: NodeFolder, source: string, as = source): Promise<void> {
  await fs.copyFile(path.join(TEST_DATA, source), path.join(folder.root, 'fit', as));
}

/** sha256 of every file under a directory, by relative path. */
export async function checksums(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const p = path.join(e.parentPath, e.name);
    out[path.relative(dir, p)] = crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
  }
  return out;
}

/**
 * Measurements the tests record for the model's metric conditions: one file per measure
 * (reports/measures.d/<name>.json), so test files running side by side never overwrite
 * each other; scripts/metrics.sh merges them into reports/measures.json.
 */
const MEASURES = path.resolve(__dirname, '../../reports/measures.d');
export async function recordMeasure(name: string, value: number): Promise<void> {
  await fs.mkdir(MEASURES, { recursive: true });
  await fs.writeFile(path.join(MEASURES, `${name}.json`), JSON.stringify(value));
}

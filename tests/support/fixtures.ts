import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeFolder } from './nodeFolder';

/** The runner's COROS export (local only, not in git). */
export const TEST_DATA = path.resolve(__dirname, '../../test_data/coros_fit_2026');

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

/** Measurements the tests record for the model's metric conditions (read by `radical sense json`). */
const MEASURES = path.resolve(__dirname, '../../reports/measures.json');
export async function recordMeasure(name: string, value: number): Promise<void> {
  await fs.mkdir(path.dirname(MEASURES), { recursive: true });
  let all: Record<string, number> = {};
  try {
    all = JSON.parse(await fs.readFile(MEASURES, 'utf8'));
  } catch {
    /* first measure */
  }
  all[name] = value;
  await fs.writeFile(MEASURES, JSON.stringify(all, null, 2));
}

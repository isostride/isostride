import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';
import { ALGORITHM_VERSION } from '@/lib/kernel';

/**
 * Results computed once and kept (the author's request of 21 Nov 2026: "chce aby przeliczanie
 * bylo raz i dane cache-owane"): what is computed from the run files on demand (the segments of a
 * rule, the curves) is written to derived/cache/, under the data stamp. The stamp changes when the
 * runs or their context change (an import with new runs, gear, tags, the load model, the blocks),
 * and a change drops the whole cache.
 */

interface StampFile { algorithmVersion: number; stamp: string }
interface CacheFile<T> { algorithmVersion: number; stamp: string; key: string; value: T }

const newStamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The data stamp now; a folder without one gets one. */
export async function dataStamp(folder: DataFolder): Promise<string> {
  const file = await readJson<StampFile>(folder, PATHS.dataStamp);
  if (file?.stamp && file.algorithmVersion === ALGORITHM_VERSION) return file.stamp;
  const stamp = newStamp();
  await writeJson(folder, PATHS.dataStamp, { algorithmVersion: ALGORITHM_VERSION, stamp } satisfies StampFile);
  return stamp;
}

/** The runs or their context changed: a new stamp, and the cache dropped. */
export async function bumpStamp(folder: DataFolder): Promise<void> {
  await folder.remove(PATHS.cache);
  await writeJson(folder, PATHS.dataStamp, { algorithmVersion: ALGORITHM_VERSION, stamp: newStamp() } satisfies StampFile);
}

/** A short hash of a key, for a file name (FNV-1a, 32 bits, twice with different seeds). */
export function keyHash(key: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/**
 * The value kept for a key under the current stamp, or computed now and kept. The key is stored
 * with it, so two keys with one hash never answer for each other.
 */
export async function cached<T>(folder: DataFolder, kind: string, key: string, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const stamp = await dataStamp(folder);
  const path = `${PATHS.cache}/${kind}-${keyHash(key)}.json`;
  const kept = await readJson<CacheFile<T>>(folder, path);
  if (kept && kept.stamp === stamp && kept.key === key && kept.algorithmVersion === ALGORITHM_VERSION) return { value: kept.value, hit: true };
  const value = await compute();
  await writeJson(folder, path, { algorithmVersion: ALGORITHM_VERSION, stamp, key, value } satisfies CacheFile<T>);
  return { value, hit: false };
}

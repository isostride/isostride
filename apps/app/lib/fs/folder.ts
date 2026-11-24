import { metricInfo, writtenBy, type RunFile, type Samples, type Series } from '@/lib/kernel';
/**
 * The runner's data folder, seen through one small interface so that the same
 * import and storage code runs in the browser (File System Access API) and in
 * tests (Node's fs).
 *
 * Paths are relative to the folder root and use "/" separators.
 */
export interface FolderEntry {
  name: string;
  kind: 'file' | 'directory';
}

export interface DataFolder {
  /** Display name of the folder (its last path segment). */
  readonly name: string;
  /** Lists a directory; returns [] when it does not exist. */
  list(path: string): Promise<FolderEntry[]>;
  /** Reads a file's bytes; throws when it does not exist. */
  readBytes(path: string): Promise<Uint8Array>;
  /** Reads a text file, or null when it does not exist. */
  readText(path: string): Promise<string | null>;
  /** Writes a text file, creating its parent directories. */
  writeText(path: string, text: string): Promise<void>;
  /** Writes a file's bytes, creating its parent directories (a FIT file fetched from COROS). */
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  /** Removes a file or a directory with everything in it; no-op when missing. */
  remove(path: string): Promise<void>;
}

export async function readJson<T>(folder: DataFolder, path: string): Promise<T | null> {
  const text = await folder.readText(path);
  // An empty file is one whose writing was cut off (the browser makes a file before it writes it, a
  // tab closed in between leaves it empty): no data, as a missing file, not a failure of the screen.
  return text === null || text.trim() === '' ? null : (JSON.parse(text) as T);
}

export async function writeJson(folder: DataFolder, path: string, value: unknown): Promise<void> {
  // Every object written says which version of the app wrote it (requirement "App version shown").
  const stamped = value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value, app: writtenBy() } : value;
  await folder.writeText(path, JSON.stringify(stamped));
}

/**
 * The paths of the .isostride/ layout (spec section 7): the app's own data in the runner's folder (the
 * runner's request of 23 Nov 2026: ".isostride"; strideprism/ before, moved by lib/legacy).
 */
export const PATHS = {
  fit: 'fit',
  root: '.isostride',
  /** with the rest of what is computed from the FIT files (the author's request of 21 Nov 2026) */
  manifest: '.isostride/derived/manifest.json',
  /** where versions before 21 Nov 2026 kept it; moved into derived/ on first reading */
  legacyManifest: '.isostride/manifest.json',
  user: '.isostride/user',
  gear: '.isostride/user/gear.json',
  runTags: '.isostride/user/run-tags.json',
  blockDefinitions: '.isostride/user/block-definitions.json',
  /** the analyses the runner saved, by name */
  analyses: '.isostride/user/analyses.json',
  /** the tiles of the Dashboard, in their order */
  dashboard: '.isostride/user/dashboard.json',
  settings: '.isostride/user/settings.json',
  /** the activities fetched from COROS, by their labelId, and the day of the last full fetch (requirement "Runs fetched from COROS") */
  coros: '.isostride/user/coros.json',
  /** the runs an import added that the runner has not opened yet (requirement "New runs marked new") */
  newRuns: '.isostride/user/new-runs.json',
  /** whether the setup wizard was gone through or skipped in this folder */
  setup: '.isostride/user/setup.json',
  derived: '.isostride/derived',
  runs: '.isostride/derived/runs',
  runFile: (id: string) => `.isostride/derived/runs/${id}.json`,
  runsIndex: '.isostride/derived/runs-index.json',
  /** a run's track every 10 m, for the route segments and the route blocks without its whole file (the review of 24 Nov 2026) */
  tracks: '.isostride/derived/tracks',
  trackFile: (id: string) => `.isostride/derived/tracks/${id}.json`,
  /** what the detection of the blocks kept to do only what changed: the facts of each run, the paces and counts of the suggestions */
  blocksCache: '.isostride/derived/blocks-cache.json',
  /** every metric the folder's runs hold, with its name and unit (ADR "Metrics from the file") */
  metrics: '.isostride/derived/metrics.json',
  segments: '.isostride/derived/segments.json',
  blockInstances: '.isostride/derived/block-instances.json',
  dayState: '.isostride/derived/day-state.json',
  loadSummaries: '.isostride/derived/load-summaries.json',
  dataStamp: '.isostride/derived/stamp.json',
  cache: '.isostride/derived/cache',
} as const;

/**
 * Where the FIT files are: fit/ when the folder has one (the spec's layout),
 * otherwise the folder itself, so that a plain export folder of FIT files also works.
 */
export async function fitDirectory(folder: DataFolder): Promise<string> {
  const top = await folder.list('');
  return top.some((e) => e.kind === 'directory' && e.name === PATHS.fit) ? PATHS.fit : '';
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** The FIT files of the folder (of its fit/ subfolder when it has one), as paths, sorted. */
export async function listFitFiles(folder: DataFolder): Promise<string[]> {
  const dir = await fitDirectory(folder);
  return (await folder.list(dir))
    .filter((e) => e.kind === 'file' && e.name.toLowerCase().endsWith('.fit'))
    .map((e) => joinPath(dir, e.name))
    .sort();
}

/** The metrics' keys of the run files before the metrics came from the file (schema 1). */
const SCHEMA_1_METRICS = ['speed', 'heartRate', 'cadence', 'groundContactTime', 'verticalOscillation', 'stepLength', 'power', 'altitude', 'temperature', 'effortPace', 'legSpringStiffness'];

/**
 * A run's file, derived/runs/<id>.json; one written before the metrics came from the file (schema 1,
 * each metric a field of its own) read in today's shape, so the screens work until the runner
 * recomputes. Null when there is none.
 */
export async function readRunFile(folder: DataFolder, id: string): Promise<RunFile | null> {
  if (!keepMax) return readRunFileNow(folder, id);
  const hit = kept.get(id);
  if (hit) {
    // The most recent last: the oldest are let go first.
    kept.delete(id);
    kept.set(id, hit);
    return hit;
  }
  const run = await readRunFileNow(folder, id);
  if (run) {
    kept.set(id, run);
    if (kept.size > keepMax) kept.delete(kept.keys().next().value!);
  }
  return run;
}

/**
 * The run files read last, kept in memory by the Processing Worker that stays (the review of 24 Nov
 * 2026: Compare's jobs one after another each read every run file again). Off unless keepRunFiles is
 * called; what is kept is read only, never changed by its readers.
 */
const kept = new Map<string, RunFile>();
let keepMax = 0;

/** Keeps the last `max` run files read (0: none); a change of the data calls forgetRunFiles. */
export function keepRunFiles(max: number): void {
  keepMax = max;
  if (!max) kept.clear();
}

/** Lets go of the run files kept: the runs changed (a recompute, another folder). */
export function forgetRunFiles(): void {
  kept.clear();
}

async function readRunFileNow(folder: DataFolder, id: string): Promise<RunFile | null> {
  const file = await readJson<RunFile>(folder, PATHS.runFile(id));
  if (!file || file.samples.values) return file;
  const old = file as unknown as { samples: Record<string, Series>; windows: Record<string, unknown> };
  const values: Record<string, Series> = {};
  const windows: Record<string, Series> = {};
  for (const k of SCHEMA_1_METRICS) {
    if (old.samples[k]?.some((v) => v !== null)) values[k] = old.samples[k];
    if (Array.isArray(old.windows[k]) && values[k]) windows[k] = old.windows[k] as Series;
  }
  const { t, distance, lat, lon } = old.samples as unknown as Samples;
  return {
    ...file,
    metrics: Object.keys(values).map((k) => metricInfo(k)),
    samples: { t, distance, lat, lon, values },
    windows: { start: file.windows.start, n: file.windows.n, flags: file.windows.flags, values: windows },
  };
}

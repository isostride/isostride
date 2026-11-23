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
  /** Removes a file or a directory with everything in it; no-op when missing. */
  remove(path: string): Promise<void>;
}

export async function readJson<T>(folder: DataFolder, path: string): Promise<T | null> {
  const text = await folder.readText(path);
  return text === null ? null : (JSON.parse(text) as T);
}

export async function writeJson(folder: DataFolder, path: string, value: unknown): Promise<void> {
  await folder.writeText(path, JSON.stringify(value));
}

/** The paths of the strideprism/ layout (spec section 7). */
export const PATHS = {
  fit: 'fit',
  root: 'strideprism',
  /** with the rest of what is computed from the FIT files (the author's request of 21 Nov 2026) */
  manifest: 'strideprism/derived/manifest.json',
  /** where versions before 21 Nov 2026 kept it; moved into derived/ on first reading */
  legacyManifest: 'strideprism/manifest.json',
  user: 'strideprism/user',
  gear: 'strideprism/user/gear.json',
  runTags: 'strideprism/user/run-tags.json',
  blockDefinitions: 'strideprism/user/block-definitions.json',
  /** the analyses the runner saved, by name */
  analyses: 'strideprism/user/analyses.json',
  /** the tiles of the Dashboard, in their order */
  dashboard: 'strideprism/user/dashboard.json',
  settings: 'strideprism/user/settings.json',
  /** whether the setup wizard was gone through or skipped in this folder */
  setup: 'strideprism/user/setup.json',
  derived: 'strideprism/derived',
  runs: 'strideprism/derived/runs',
  runFile: (id: string) => `strideprism/derived/runs/${id}.json`,
  runsIndex: 'strideprism/derived/runs-index.json',
  segments: 'strideprism/derived/segments.json',
  blockInstances: 'strideprism/derived/block-instances.json',
  dayState: 'strideprism/derived/day-state.json',
  loadSummaries: 'strideprism/derived/load-summaries.json',
  dataStamp: 'strideprism/derived/stamp.json',
  cache: 'strideprism/derived/cache',
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

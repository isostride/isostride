import { msg } from '@/lib/i18n';
import { ALGORITHM_VERSION, SCHEMA_VERSION } from '@/lib/kernel';
import { PATHS, listFitFiles, readJson, writeJson, type DataFolder } from './folder';

export type ImportStatus =
  | { status: 'imported'; runId: string }
  | { status: 'duplicate'; runId: string }
  | { status: 'error'; reason: string };

/**
 * Why a file could not be imported, as the manifest keeps it: in English, each a key of the app's
 * texts with its {values} filled in ("not a run (sport: cycling)"), so the files written before read
 * the same, and the Data folder screen shows it in the language in use (readReason, then t()).
 */
export const IMPORT_REASONS = {
  notFit: msg('not a FIT file'),
  damaged: msg('damaged FIT file (integrity check failed)'),
  unreadable: msg('unreadable FIT file: {error}'),
  noSession: msg('no session in the file'),
  notRun: msg('not a run (sport: {sport})'),
  noSamples: msg('no samples in the file'),
  failed: msg('could not import: {error}'),
  notFound: msg('Not found: {path}'),
};

/** A reason with its values filled in, as the manifest keeps it. */
export function importReason(key: string, vars: Record<string, string> = {}): string {
  return key.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = Object.values(IMPORT_REASONS).map((key) => {
  const names = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return { key, names, re: new RegExp(`^${key.split(/\{\w+\}/).map(escape).join('(.*)')}$`, 's') };
});

/** The key and values of a reason the manifest keeps; null for a text that is none of them. */
export function readReason(reason: string): { key: string; vars: Record<string, string> } | null {
  for (const p of PATTERNS) {
    const m = p.re.exec(reason);
    if (m) return { key: p.key, vars: Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
}

/** .isostride/derived/manifest.json */
export interface Manifest {
  schemaVersion: number;
  algorithmVersion: number;
  /** Every FIT file seen, by its path in the folder, with what became of it. */
  files: Record<string, ImportStatus>;
}

export function emptyManifest(): Manifest {
  return { schemaVersion: SCHEMA_VERSION, algorithmVersion: ALGORITHM_VERSION, files: {} };
}

/**
 * The manifest, in derived/ with the rest of what is computed from the FIT files; one left at
 * .isostride/ by an earlier version is moved there first.
 */
export async function readManifest(folder: DataFolder): Promise<Manifest | null> {
  const manifest = await readJson<Manifest>(folder, PATHS.manifest);
  if (manifest) return manifest;
  const legacy = await readJson<Manifest>(folder, PATHS.legacyManifest);
  if (!legacy) return null;
  await writeJson(folder, PATHS.manifest, legacy);
  await folder.remove(PATHS.legacyManifest);
  return legacy;
}

export async function writeManifest(folder: DataFolder, manifest: Manifest): Promise<void> {
  await writeJson(folder, PATHS.manifest, manifest);
}

/** True when the folder's derived data was built by an older algorithm than this app's (spec: offer to recompute). */
export function isOutdated(manifest: Manifest | null): boolean {
  return manifest !== null && manifest.algorithmVersion < ALGORITHM_VERSION;
}

/**
 * The FIT files of an imported folder that no import has seen: a run dropped into the folder since
 * (requirement "New runs imported by themselves"). None before the first import, which the runner
 * starts, nor a file an import failed on (it is tried again by the next import the runner starts).
 */
export async function unseenFitFiles(folder: DataFolder): Promise<string[]> {
  const manifest = await readManifest(folder);
  if (!manifest || !Object.keys(manifest.files).length) return [];
  return (await listFitFiles(folder)).filter((f) => !manifest.files[f]);
}

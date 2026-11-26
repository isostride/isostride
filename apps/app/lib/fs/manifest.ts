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
  /**
   * False from the moment an import adds runs until their context is joined and the segments found again:
   * an import cut off in between (a tab closed, a phone killing it) left its runs without load, form, gear
   * and segments for good, the next import finding nothing to do (the review of 26 Nov 2026). The next
   * import, or the app as it opens, finishes it.
   */
  joined?: boolean;
}

export function emptyManifest(): Manifest {
  return { schemaVersion: SCHEMA_VERSION, algorithmVersion: ALGORITHM_VERSION, files: {}, joined: true };
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
 * The FIT files of the folder that no import has seen (requirement "New runs imported by themselves"):
 * every file of a folder never imported, then each run dropped into it since. A file an import failed
 * on is not one of them (failedFitFiles).
 */
export async function unseenFitFiles(folder: DataFolder): Promise<string[]> {
  const manifest = await readManifest(folder);
  return (await listFitFiles(folder)).filter((f) => !manifest?.files[f]);
}

/** Reasons a whole file gives: read again, it gives them again (a hike is not a run however often it is read). */
const LASTING: string[] = [IMPORT_REASONS.notRun, IMPORT_REASONS.noSamples, IMPORT_REASONS.noSession];
/** Whether a file's reason for failing is one that lasts (LASTING). */
export const isLastingReason = (reason: string | undefined): boolean => LASTING.includes(readReason(reason ?? '')?.key ?? '');

/**
 * The FIT files of the folder an import failed on for a reason that may pass (a file cut short while
 * it was copied, unreadable for a moment): tried again when the app opens. A file that is not a run,
 * or holds no samples, is not: it would be read again at every opening for nothing.
 */
export async function failedFitFiles(folder: DataFolder): Promise<string[]> {
  return (await filesToImport(folder)).failed;
}

/** The files no import has seen and those to try again, from one reading of the manifest and one listing of the folder. */
export async function filesToImport(folder: DataFolder): Promise<{ unseen: string[]; failed: string[]; outdated: boolean; pending: boolean }> {
  const [manifest, files] = await Promise.all([readManifest(folder), listFitFiles(folder)]);
  return {
    unseen: files.filter((f) => !manifest?.files[f]),
    failed: manifest ? files.filter((f) => { const s = manifest.files[f]; return s?.status === 'error' && !isLastingReason(s.reason); }) : [],
    outdated: isOutdated(manifest),
    // Runs imported whose context and segments an import cut off never wrote.
    pending: manifest?.joined === false,
  };
}

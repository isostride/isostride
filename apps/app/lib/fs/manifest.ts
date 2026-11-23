import { ALGORITHM_VERSION, SCHEMA_VERSION } from '@/lib/kernel';
import { PATHS, listFitFiles, readJson, writeJson, type DataFolder } from './folder';

export type ImportStatus =
  | { status: 'imported'; runId: string }
  | { status: 'duplicate'; runId: string }
  | { status: 'error'; reason: string };

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

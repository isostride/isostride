import { PATHS, type DataFolder } from '@/lib/fs/folder';
import { emptyManifest, writeManifest } from '@/lib/fs/manifest';
import { importFolder, type ImportOptions, type ImportReport } from './importFolder';

/**
 * "Recompute everything": deletes derived/, forgets which files were imported,
 * and rebuilds steps 1–5 from the FIT files. user/ and the FIT files are not touched.
 */
export async function recomputeEverything(folder: DataFolder, opts: ImportOptions = {}): Promise<ImportReport> {
  await folder.remove(PATHS.derived);
  await writeManifest(folder, emptyManifest());
  return importFolder(folder, opts);
}

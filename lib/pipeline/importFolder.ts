import { joinContext } from '@/lib/context';
import { runBlocks } from '@/lib/detection';
import type { DataFolder } from '@/lib/fs';
import { importRuns, type ImportOptions, type ImportReport } from '@/lib/ingest';

/**
 * The whole import (spec data flow steps 1–5): new FIT files become runs, then the
 * context is joined onto runs-index.json and the blocks are detected again.
 */
export async function importFolder(folder: DataFolder, opts: ImportOptions = {}): Promise<ImportReport> {
  const report = await importRuns(folder, opts);
  await joinContext(folder);
  await runBlocks(folder);
  return report;
}

/** After gear or tags change: the context again, then the blocks. */
export async function refreshContext(folder: DataFolder): Promise<void> {
  await joinContext(folder);
  await runBlocks(folder);
}

/** After block definitions change: the blocks again. */
export async function refreshBlocks(folder: DataFolder): Promise<void> {
  await runBlocks(folder);
}

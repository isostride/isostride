import { readDefinitions } from '@/lib/blocks';
import { joinContext } from '@/lib/context';
import { changedFields, needsDetection, rejoinInstances, runBlocks } from '@/lib/detection';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { bumpStamp } from './cache';
import { importRuns, type ImportOptions, type ImportReport } from '@/lib/ingest';

/**
 * The whole import (spec data flow steps 1–5): new FIT files become runs, then the
 * context is joined onto runs-index.json and the blocks are detected again.
 */
export async function importFolder(folder: DataFolder, opts: ImportOptions = {}): Promise<ImportReport> {
  const report = await importRuns(folder, opts);
  await joinContext(folder);
  await runBlocks(folder);
  // New runs: what was computed from the runs before is out of date.
  if (report.imported > 0) await bumpStamp(folder);
  return report;
}

/**
 * After gear, tags or the load model change: the context again, then the blocks: detected again
 * only when the change touches what detection reads (a workout type, a field a kept rule filters
 * by); otherwise the new context is written into the instances kept, with no run file read.
 */
export async function refreshContext(folder: DataFolder): Promise<'detected' | 'rejoined'> {
  const before = (await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? [];
  const after = (await joinContext(folder))?.runs ?? [];
  const detect = needsDetection(await readDefinitions(folder), changedFields(before, after));
  if (detect) await runBlocks(folder); else await rejoinInstances(folder);
  await bumpStamp(folder);
  return detect ? 'detected' : 'rejoined';
}

/** After block definitions change: the blocks again. */
export async function refreshBlocks(folder: DataFolder): Promise<void> {
  await runBlocks(folder);
  await bumpStamp(folder);
}

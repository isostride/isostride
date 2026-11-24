import { readDefinitions } from '@/lib/blocks';
import { joinContext } from '@/lib/context';
import { changedFields, needsDetection, rejoinInstances, runBlocks } from '@/lib/detection';
import { PATHS, markRunsNew, readJson, type DataFolder } from '@/lib/fs';
import type { IndexedRun, RunsIndex } from '@/lib/kernel';
import { bumpStamp } from './cache';
import { importRuns, type ImportOptions, type ImportReport } from '@/lib/ingest';

/**
 * The whole import (spec data flow steps 1–5): new FIT files become runs, then the
 * context is joined onto runs-index.json and the blocks are detected again.
 */
export async function importFolder(folder: DataFolder, opts: ImportOptions = {}): Promise<ImportReport> {
  const before = (await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs.length ?? 0;
  const report = await importRuns(folder, opts);
  // The runs added to a folder that held runs before are new to the runner (requirement "New runs
  // marked new"); at the first import every run would be.
  if (before > 0) await markRunsNew(folder, addedRuns(report));
  // Nothing added to a folder imported before (duplicates, files that could not be read): what is
  // derived from its runs stands as it is, nothing to compute again.
  if (report.imported === 0 && before > 0) return report;
  await joinContext(folder);
  await runBlocks(folder);
  // New runs: what was computed from the runs before is out of date.
  if (report.imported > 0) await bumpStamp(folder);
  return report;
}

/** The ids of the runs an import added. */
export const addedRuns = (report: ImportReport): string[] => report.outcomes.flatMap((o) => (o.status === 'imported' && o.runId ? [o.runId] : []));

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
  // The results kept (derived/cache) read the runs' context but not their notes: a note changed alone
  // leaves them standing (the review of 24 Nov 2026, "tak zrob 1-4").
  if (contextChanged(before, after)) await bumpStamp(folder);
  return detect ? 'detected' : 'rejoined'; // i18n-ignore: what was done, for the code
}

/** Whether the runs' context changed in anything but their notes. */
export function contextChanged(before: IndexedRun[], after: IndexedRun[]): boolean {
  const withoutNote = (rows: IndexedRun[]) => JSON.stringify(rows.map(({ note: _note, ...r }) => r));
  return withoutNote(before) !== withoutNote(after);
}

/**
 * After block definitions change: the blocks again. The results kept (derived/cache) read the run
 * files and the index, not the blocks: they stand.
 */
export async function refreshBlocks(folder: DataFolder): Promise<void> {
  await runBlocks(folder);
}

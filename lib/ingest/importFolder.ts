import { ALGORITHM_VERSION, SCHEMA_VERSION } from '@/lib/version';
import { PATHS, fitDirectory, joinPath, readJson, writeJson, type DataFolder } from '@/lib/fs/folder';
import { emptyManifest, readManifest, writeManifest, type Manifest } from '@/lib/fs/manifest';
import { buildWindows, type Windows } from '@/lib/prepare/windows';
import { joinContext, type RunContext } from '@/lib/context/joinContext';
import { runBlocks } from '@/lib/blocks/pipeline';
import { FitImportError, parseFit, runId, type Lap, type Samples } from './parseFit';

/** One row of runs-index.json: everything the list and analysis screens need without opening the run file. */
export interface RunIndexRow {
  id: string;
  startTime: string;
  file: string;
  device: string;
  distance: number;
  duration: number;
  /** m/s over timer time */
  avgSpeed: number;
  avgHeartRate: number | null;
  temperature: number | null;
  hasGps: boolean;
  laps: number;
  algorithmVersion: number;
}

/** A row of runs-index.json after the context join: the run and day layers ride along. */
export type IndexedRun = RunIndexRow & Partial<RunContext>;

export interface RunsIndex {
  schemaVersion: number;
  algorithmVersion: number;
  runs: IndexedRun[];
}

/** derived/runs/<id>.json */
export interface RunFile {
  schemaVersion: number;
  algorithmVersion: number;
  id: string;
  startTime: string;
  file: string;
  device: string;
  distance: number;
  duration: number;
  elapsed: number;
  temperature: number | null;
  sources: Record<string, string>;
  laps: Lap[];
  samples: Samples;
  windows: Windows;
}

export interface FileOutcome {
  file: string;
  status: 'imported' | 'duplicate' | 'error';
  runId?: string;
  reason?: string;
  /** seconds spent on this file: parse, prepare, write */
  seconds: number;
}

export interface ImportReport {
  outcomes: FileOutcome[];
  imported: number;
  duplicates: number;
  errors: number;
  /** files already handled by an earlier import and not looked at again */
  skipped: number;
}

export interface ImportOptions {
  onProgress?: (p: { done: number; total: number; file: string }) => void;
  now?: () => number;
}

/**
 * Imports every FIT file of the folder that an earlier import has not handled
 * (spec data flow steps 1, 2 and 5 for runs): parses it, skips a run whose start
 * time is already imported, builds its 10 s windows, and writes the run file,
 * runs-index.json and manifest.json. A file that cannot be read is skipped with
 * its reason and tried again on the next import.
 */
export async function importFolder(folder: DataFolder, opts: ImportOptions = {}): Promise<ImportReport> {
  const now = opts.now ?? (() => performance.now());
  const manifest: Manifest = (await readManifest(folder)) ?? emptyManifest();
  const index: RunsIndex = (await readJson<RunsIndex>(folder, PATHS.runsIndex)) ?? {
    schemaVersion: SCHEMA_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    runs: [],
  };
  const byStart = new Map(index.runs.map((r) => [r.startTime, r.id]));

  const dir = await fitDirectory(folder);
  const files = (await folder.list(dir))
    .filter((e) => e.kind === 'file' && e.name.toLowerCase().endsWith('.fit'))
    .map((e) => joinPath(dir, e.name))
    .sort();
  // Files an earlier import handled are not read again; a file that failed is tried again.
  const todo = files.filter((f) => !manifest.files[f] || manifest.files[f].status === 'error');

  const report: ImportReport = { outcomes: [], imported: 0, duplicates: 0, errors: 0, skipped: files.length - todo.length };
  let done = 0;
  for (const file of todo) {
    opts.onProgress?.({ done, total: todo.length, file });
    const t0 = now();
    let outcome: FileOutcome;
    try {
      const run = parseFit(await folder.readBytes(file));
      const existing = byStart.get(run.startTime);
      if (existing) {
        manifest.files[file] = { status: 'duplicate', runId: existing };
        outcome = { file, status: 'duplicate', runId: existing, seconds: 0 };
        report.duplicates++;
      } else {
        const id = runId(run.startTime);
        const windows = buildWindows(run.samples);
        const runFile: RunFile = {
          schemaVersion: SCHEMA_VERSION,
          algorithmVersion: ALGORITHM_VERSION,
          id,
          startTime: run.startTime,
          file,
          device: run.device,
          distance: run.distance,
          duration: run.duration,
          elapsed: run.elapsed,
          temperature: run.temperature,
          sources: run.sources,
          laps: run.laps,
          samples: run.samples,
          windows,
        };
        await writeJson(folder, PATHS.runFile(id), runFile);
        index.runs.push(indexRow(runFile));
        byStart.set(run.startTime, id);
        manifest.files[file] = { status: 'imported', runId: id };
        outcome = { file, status: 'imported', runId: id, seconds: 0 };
        report.imported++;
      }
    } catch (e) {
      const reason = e instanceof FitImportError ? e.reason : `could not import: ${e instanceof Error ? e.message : String(e)}`;
      manifest.files[file] = { status: 'error', reason };
      outcome = { file, status: 'error', reason, seconds: 0 };
      report.errors++;
    }
    outcome.seconds = (now() - t0) / 1000;
    report.outcomes.push(outcome);
    done++;
  }

  index.runs.sort((a, b) => a.startTime.localeCompare(b.startTime));
  index.algorithmVersion = ALGORITHM_VERSION;
  manifest.algorithmVersion = ALGORITHM_VERSION;
  manifest.schemaVersion = SCHEMA_VERSION;
  await writeJson(folder, PATHS.runsIndex, index);
  await writeManifest(folder, manifest);
  await joinContext(folder);
  await runBlocks(folder);
  opts.onProgress?.({ done, total: todo.length, file: '' });
  return report;
}

function indexRow(r: RunFile): RunIndexRow {
  const hr = r.samples.heartRate.filter((v): v is number => v !== null);
  return {
    id: r.id,
    startTime: r.startTime,
    file: r.file,
    device: r.device,
    distance: r.distance,
    duration: r.duration,
    avgSpeed: r.duration > 0 ? r.distance / r.duration : 0,
    avgHeartRate: hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null,
    temperature: r.temperature,
    hasGps: r.samples.lat.some((v) => v !== null),
    laps: r.laps.length,
    algorithmVersion: r.algorithmVersion,
  };
}

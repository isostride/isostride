import { ALGORITHM_VERSION, KNOWN_METRICS, SCHEMA_VERSION, type MetricInfo, type MetricsFile, type Windows, type Lap, type Samples, type RunFile, type RunIndexRow, type RunsIndex } from '@/lib/kernel';
import { IMPORT_REASONS, PATHS, importReason, isLastingReason, listFitFiles, readJson, writeJson, type DataFolder, emptyManifest, readManifest, writeManifest, type Manifest } from '@/lib/fs';
import { buildWindows } from '@/lib/prepare';
import { FitImportError, parseFit, runId } from './parseFit';

/**
 * The index and the manifest are written each time this many files are handled, and at the end: an import
 * of a thousand files cut off (the tab closed, the phone asleep) goes on from its last such point and not
 * from its first file (the review of 26 Nov 2026).
 */
export const IMPORT_CHECKPOINT = 50;

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
  /** the files handled between two writes of the index and the manifest (IMPORT_CHECKPOINT) */
  checkpoint?: number;
}

/**
 * Imports every FIT file of the folder that an earlier import has not handled
 * (spec data flow steps 1, 2 and 5 for runs): parses it, skips a run whose start
 * time is already imported, builds its 10 s windows, and writes the run file,
 * runs-index.json and manifest.json. A file that cannot be read is skipped with
 * its reason and tried again on the next import.
 */
export async function importRuns(folder: DataFolder, opts: ImportOptions = {}): Promise<ImportReport> {
  const now = opts.now ?? (() => performance.now());
  const manifest: Manifest = (await readManifest(folder)) ?? emptyManifest();
  const index: RunsIndex = (await readJson<RunsIndex>(folder, PATHS.runsIndex)) ?? {
    schemaVersion: SCHEMA_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    runs: [],
  };
  const byStart = new Map(index.runs.map((r) => [r.startTime, r]));
  // The folder's metrics: every metric some run holds (derived/metrics.json).
  const catalog = new Map(((await readJson<MetricsFile>(folder, PATHS.metrics))?.metrics ?? []).map((m) => [m.key, m]));
  const keep = (metrics: MetricInfo[]) => {
    for (const m of metrics) if (!catalog.has(m.key)) catalog.set(m.key, m);
    // Efficiency, metres per heartbeat, wherever a run holds both pace and heart rate.
    if (metrics.some((m) => m.key === 'speed') && metrics.some((m) => m.key === 'heartRate') && !catalog.has('efficiency')) catalog.set('efficiency', KNOWN_METRICS.efficiency);
  };

  const files = await listFitFiles(folder);
  // Files an earlier import handled are not read again; a file that failed is tried again, unless it
  // failed for good (not a run, no samples: a folder of 300 rides and hikes was read and decoded whole
  // again for each new run; a recompute starts from an empty manifest and reads them once more).
  const todo = files.filter((f) => !manifest.files[f] || (manifest.files[f].status === 'error' && !isLastingReason(manifest.files[f].reason)));
  /** an import before this one wrote the index and was cut off before the manifest: its runs wait to be joined */
  let resumed = false;

  const report: ImportReport = { outcomes: [], imported: 0, duplicates: 0, errors: 0, skipped: files.length - todo.length };
  // What is known so far, written: the run files first (each as it is imported), then the index that
  // names them and the manifest that says which files are handled, so each names only what is there.
  const commit = async () => {
    index.runs.sort((a, b) => a.startTime.localeCompare(b.startTime));
    index.algorithmVersion = ALGORITHM_VERSION;
    // The manifest keeps the version it was built with: an import of new files into a folder built by an
    // older version does not make its other runs current (it took the mark for a rebuild away), and a tab
    // still running an older app does not mark a folder built by a newer one as old. A rebuild starts
    // from an empty manifest, which holds this version.
    manifest.schemaVersion = SCHEMA_VERSION;
    // The new runs wait for their context and segments (lib/pipeline finishes it, or the next import).
    if (report.imported > 0 || resumed) manifest.joined = false;
    await writeJson(folder, PATHS.runsIndex, index);
    await writeJson(folder, PATHS.metrics, { algorithmVersion: ALGORITHM_VERSION, metrics: [...catalog.values()] } satisfies MetricsFile);
    await writeManifest(folder, manifest);
  };
  let done = 0;
  for (const file of todo) {
    opts.onProgress?.({ done, total: todo.length, file });
    const t0 = now();
    let outcome: FileOutcome;
    try {
      const run = parseFit(await folder.readBytes(file));
      const existing = byStart.get(run.startTime);
      if (existing && existing.file === file) {
        // The index names this very file and the manifest does not: an import cut off between the two
        // writes. The run is there; it is no duplicate of itself, and it still waits for its context.
        manifest.files[file] = { status: 'imported', runId: existing.id };
        outcome = { file, status: 'imported', runId: existing.id, seconds: 0 };
        resumed = true;
      } else if (existing) {
        manifest.files[file] = { status: 'duplicate', runId: existing.id };
        outcome = { file, status: 'duplicate', runId: existing.id, seconds: 0 };
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
          metrics: run.metrics,
          laps: run.laps,
          samples: run.samples,
          windows,
        };
        await writeJson(folder, PATHS.runFile(id), runFile);
        const row = indexRow(runFile);
        index.runs.push(row);
        keep(run.metrics);
        byStart.set(run.startTime, row);
        manifest.files[file] = { status: 'imported', runId: id };
        outcome = { file, status: 'imported', runId: id, seconds: 0 };
        report.imported++;
      }
    } catch (e) {
      const reason = e instanceof FitImportError ? e.reason : importReason(IMPORT_REASONS.failed, { error: e instanceof Error ? e.message : String(e) });
      manifest.files[file] = { status: 'error', reason };
      outcome = { file, status: 'error', reason, seconds: 0 };
      report.errors++;
    }
    outcome.seconds = (now() - t0) / 1000;
    report.outcomes.push(outcome);
    done++;
    if (done % (opts.checkpoint ?? IMPORT_CHECKPOINT) === 0 && done < todo.length) await commit();
  }

  await commit();
  opts.onProgress?.({ done, total: todo.length, file: '' });
  return report;
}

function indexRow(r: RunFile): RunIndexRow {
  const hr = (r.samples.values.heartRate ?? []).filter((v): v is number => v !== null);
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
    metrics: r.metrics.map((m) => m.key),
    algorithmVersion: r.algorithmVersion,
  };
}

import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';
import { type RunFile, type RunIndexRow, type RunsIndex, ALGORITHM_VERSION, type RunContext } from '@/lib/kernel';
import { LOAD_SUMMARY_VERSION, formSeries, runLoads, summarizeLoad, type LoadSummary, type RunLoad } from '@/lib/load';
import { readSettings } from '@/lib/settings';
import { computeDayStates, type DayState } from './dayState';
import { dayOf, gearOn, readGear, type Gear, readRunTags, type RunTagsFile } from '@/lib/gear';


export function contextFor(row: RunIndexRow, gear: Gear[], tags: RunTagsFile, days: Record<string, DayState>, loads: Record<string, RunLoad> = {}): RunContext {
  const day = dayOf(row.startTime);
  const tag = tags.tags[row.id] ?? {};
  const override = tag.shoesOverride ? gear.find((g) => g.id === tag.shoesOverride && g.type === 'shoes') ?? null : null;
  const shoes = override ?? gearOn(gear, 'shoes', day);
  const sensor = gearOn(gear, 'hrSensor', day);
  const ds = days[day];
  return {
    shoesId: shoes?.id ?? null,
    shoes: shoes?.name ?? null,
    shoesOverridden: override !== null,
    hrSensorId: sensor?.id ?? null,
    heartRateSource: sensor ? sensor.name : `wrist (${row.device})`,
    title: tag.title ?? null,
    workoutType: tag.workoutType ?? null,
    techniqueCue: tag.techniqueCue ?? null,
    note: tag.note ?? null,
    load3: ds?.load3 ?? 0,
    load7: ds?.load7 ?? 0,
    load: loads[row.id]?.load ?? null,
    ...(loads[row.id]?.estimated ? { loadEstimated: true } : {}),
    form: ds?.form ?? 0,
  };
}

/** The file of the runs' load summaries (ADR "Load and form models"). */
export interface LoadSummariesFile {
  algorithmVersion: number;
  version: number;
  runs: Record<string, LoadSummary>;
}

/**
 * The load summary of every run of the index: those kept, and those missing summarised from their
 * run files (the first time, every run); summaries of runs no longer there are dropped.
 */
export async function loadSummaries(folder: DataFolder, rows: RunIndexRow[]): Promise<Record<string, LoadSummary>> {
  const file = await readJson<LoadSummariesFile>(folder, PATHS.loadSummaries);
  const current = file?.version === LOAD_SUMMARY_VERSION && file.algorithmVersion === ALGORITHM_VERSION;
  const kept = current ? file.runs : {};
  const runs: Record<string, LoadSummary> = {};
  let changed = !current;
  for (const r of rows) {
    if (kept[r.id]) { runs[r.id] = kept[r.id]; continue; }
    const run = await readJson<RunFile>(folder, PATHS.runFile(r.id));
    if (run) { runs[r.id] = summarizeLoad(run); changed = true; }
  }
  if (Object.keys(kept).some((id) => !runs[id])) changed = true;
  if (changed) await writeJson(folder, PATHS.loadSummaries, { algorithmVersion: ALGORITHM_VERSION, version: LOAD_SUMMARY_VERSION, runs });
  return runs;
}

/**
 * Data flow step 3: joins gear (by date, or a run's shoe override), run tags and
 * day state to the runs, and writes them into runs-index.json and day-state.json.
 * The day state holds the load of the days before and the form, by the load model of Settings.
 * Runs after every import and after every change to gear, tags or the load model.
 */
export async function joinContext(folder: DataFolder): Promise<RunsIndex | null> {
  const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
  if (!index) return null;
  const [gear, tags, settings] = await Promise.all([readGear(folder), readRunTags(folder), readSettings(folder)]);
  const summaries = await loadSummaries(folder, index.runs);
  const loads = runLoads(index.runs, summaries, settings.performance, settings.zones.heartRate ?? []);
  const withLoad = index.runs.map((r) => ({ startTime: r.startTime, duration: r.duration, load: loads[r.id]?.load ?? null }));
  const forms = Object.fromEntries(formSeries(withLoad.map((r) => ({ startTime: r.startTime, load: r.load ?? r.duration / 60 })), settings.performance).map((d) => [d.date, Math.round(d.form)]));
  const days = computeDayStates(withLoad, [], forms);
  index.runs = index.runs.map((r) => ({ ...r, ...contextFor(r, gear, tags, days, loads) }));
  await writeJson(folder, PATHS.runsIndex, index);
  await writeJson(folder, PATHS.dayState, { algorithmVersion: ALGORITHM_VERSION, days });
  return index;
}

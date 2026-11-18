import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs/folder';
import type { RunIndexRow, RunsIndex } from '@/lib/ingest/importFolder';
import { ALGORITHM_VERSION } from '@/lib/version';
import { computeDayStates, type DayState } from './dayState';
import { dayOf, gearOn, readGear, type Gear } from './gear';
import { readRunTags, type RunTagsFile } from './tags';

/** The run layer and day layer of the context, as runs-index.json carries them (denormalized). */
export interface RunContext {
  shoesId: string | null;
  shoes: string | null;
  /** true when the shoes come from the run's override, not from the date */
  shoesOverridden: boolean;
  hrSensorId: string | null;
  /** the device behind the heart rate: the registered sensor worn, or the watch's wrist sensor */
  heartRateSource: string;
  workoutType: string | null;
  techniqueCue: string | null;
  note: string | null;
  load3: number;
  load7: number;
}

export function contextFor(row: RunIndexRow, gear: Gear[], tags: RunTagsFile, days: Record<string, DayState>): RunContext {
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
    workoutType: tag.workoutType ?? null,
    techniqueCue: tag.techniqueCue ?? null,
    note: tag.note ?? null,
    load3: ds?.load3 ?? 0,
    load7: ds?.load7 ?? 0,
  };
}

/**
 * Data flow step 3: joins gear (by date, or a run's shoe override), run tags and
 * day state to the runs, and writes them into runs-index.json and day-state.json.
 * Runs after every import and after every change to gear or tags.
 */
export async function joinContext(folder: DataFolder): Promise<RunsIndex | null> {
  const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
  if (!index) return null;
  const [gear, tags] = await Promise.all([readGear(folder), readRunTags(folder)]);
  const days = computeDayStates(index.runs);
  index.runs = index.runs.map((r) => ({ ...r, ...contextFor(r, gear, tags, days) }));
  await writeJson(folder, PATHS.runsIndex, index);
  await writeJson(folder, PATHS.dayState, { algorithmVersion: ALGORITHM_VERSION, days });
  return index;
}

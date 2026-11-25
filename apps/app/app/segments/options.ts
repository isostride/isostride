import { layoutOf, patternKey, patternName, repsKey, type PatternLap } from '@/lib/blocks';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import { readGear, readRunTags } from '@/lib/gear';
import type { Lap, RunsIndex } from '@/lib/kernel';
import type { BuilderOptions } from './RuleBuilder';

/** The facts the detection keeps of each run (derived/blocks-cache.json): their laps, for the layouts of laps. */
interface KeptFacts {
  facts?: Record<string, { laps: Lap[]; duration: number; distance: number }>;
}

/**
 * What the block editor offers to choose runs by: the workout types, cues, shoes, heart rate sources and
 * devices of the folder, and the layouts of laps its runs follow (requirement "Segments by lap layout").
 */
export async function builderOptions(folder: DataFolder, rows: RunsIndex['runs']): Promise<BuilderOptions> {
  const g = await readGear(folder);
  const tags = await readRunTags(folder);
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  return {
    workoutTypes: uniq([...tags.dictionary.workoutTypes, ...rows.map((r) => r.workoutType)]),
    techniqueCues: uniq([...tags.dictionary.techniqueCues, ...rows.map((r) => r.techniqueCue)]),
    shoes: uniq([...g.filter((x) => x.type === 'shoes').map((x) => x.name), ...rows.map((r) => r.shoes)]),
    heartRateSources: uniq(rows.map((r) => r.heartRateSource)),
    devices: uniq(rows.map((r) => r.device)),
    layouts: layoutsOf(Object.values((await readJson<KeptFacts>(folder, PATHS.blocksCache))?.facts ?? {})),
  };
}

/** A layout of laps found in the runs: its laps (an effort where it is one in most of its runs), its runs, and the runs of the same reps. */
export interface FoundLayout {
  laps: PatternLap[];
  runs: number;
  /** the runs of the same reps in any layout, this one's included */
  similar: number;
}

/**
 * The layouts of laps the runs follow, the most runs first: those with an effort lap and at least two
 * set laps (a workout, not a run with one lap or auto-laps).
 */
export function layoutsOf(runs: { laps: Lap[]; duration: number; distance: number }[]): FoundLayout[] {
  const by = new Map<string, PatternLap[][]>();
  const reps = new Map<string, number>();
  for (const r of runs) {
    const p = layoutOf(r);
    if (p.filter((x) => x.kind !== 'free').length < 2 || !p.some((x) => x.effort)) continue;
    const k = patternKey(p);
    by.set(k, [...(by.get(k) ?? []), p]);
    reps.set(repsKey(p), (reps.get(repsKey(p)) ?? 0) + 1);
  }
  const out: FoundLayout[] = [];
  for (const group of by.values()) {
    const laps = group[0].map((p, i) => ({ ...p, effort: group.filter((q) => q[i].effort).length * 2 > group.length }));
    if (!laps.some((l) => l.effort)) continue;
    out.push({ laps, runs: group.length, similar: reps.get(repsKey(laps)) ?? group.length });
  }
  return out.sort((a, b) => b.runs - a.runs || patternName(a.laps).localeCompare(patternName(b.laps)));
}

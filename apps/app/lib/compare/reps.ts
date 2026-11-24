import { patternKey, patternOf, type PatternLap } from '@/lib/blocks';
import type { Direction, IndexedRun, Lap, RunFile } from '@/lib/kernel';
import { runMean } from './analysis';

/**
 * Two workouts of one layout compared rep by rep (requirements "Workouts compared rep by rep" and
 * "Previous workout of a layout"): the laps of each run read as the Segments read a lap pattern, the
 * effort laps side by side, the recoveries between them. Paces in s/km, as everywhere in compare.
 */

type Laps = Pick<RunFile, 'laps' | 'duration' | 'distance'>;

/** A run's laps read as a workout: its layout and its key, the laps run as efforts and the recoveries between them. */
export interface Workout {
  pattern: PatternLap[];
  key: string;
  /** indices of the effort laps */
  efforts: number[];
  /** indices of the recovery laps: the lap after each effort (see workoutOf) */
  recoveries: number[];
}

/** The workout a run's laps make; the effort laps given when two runs agree on them. */
export function workoutOf(run: Laps, effort?: boolean[]): Workout {
  const pattern = patternOf(run.laps, run.distance > 0 ? run.duration / run.distance : 0).map((p, i) => (effort ? { ...p, effort: effort[i] } : p));
  const efforts = pattern.flatMap((p, i) => (p.effort ? [i] : []));
  // The lap right after each effort, no effort itself and not the run's last; after the last effort only when set as the one after the first (a jog, not the cool-down).
  const after = efforts.map((i) => i + 1).filter((i) => i < pattern.length - 1 && !pattern[i].effort);
  const like = (i: number, j: number) => pattern[i].kind !== 'free' && pattern[i].kind === pattern[j].kind && pattern[i].target === pattern[j].target;
  const lastEffort = efforts[efforts.length - 1];
  const recoveries = after.filter((i) => i - 1 !== lastEffort || (after[0] !== i && like(i, after[0])));
  return { pattern, key: patternKey(pattern), efforts, recoveries };
}

/** A lap's pace from its timer time and distance, s/km; null for a lap with no distance. */
export const lapPace = (lap: Lap): number | null => (lap.distance > 0 ? (1000 * lap.duration) / lap.distance : null);

/** The change from a to b, rep by rep: each difference, their least and most and mean, and the change of the means. */
export interface Change {
  diffs: number[];
  min: number;
  max: number;
  mean: number;
  /** b's mean over a's, less 1 */
  share: number | null;
  /** better or worse when every rep's difference goes that way by the metric's direction; else none */
  verdict: 'better' | 'worse' | null;
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** The change of paired values (nulls dropped by pairs); null when no pair has both. */
export function changeOf(a: (number | null)[], b: (number | null)[], direction: Direction): Change | null {
  const pairs = a.flatMap((x, i) => (x !== null && b[i] !== null && b[i] !== undefined ? [[x, b[i]!] as const] : []));
  if (!pairs.length) return null;
  const diffs = pairs.map(([x, y]) => y - x);
  const [ma, mb] = [avg(pairs.map(([x]) => x)), avg(pairs.map(([, y]) => y))];
  const up = diffs.every((d) => d > 0);
  const down = diffs.every((d) => d < 0);
  const verdict = direction === 'higher' ? (up ? 'better' : down ? 'worse' : null) : direction === 'lower' ? (down ? 'better' : up ? 'worse' : null) : null;
  return { diffs, min: Math.min(...diffs), max: Math.max(...diffs), mean: avg(diffs), share: ma !== 0 ? mb / ma - 1 : null, verdict };
}

/** One side of the comparison: a run's effort laps and recoveries, with their figures. */
export interface RepsSide {
  run: RunFile;
  workout: Workout;
  /** each effort's pace, s/km */
  pace: (number | null)[];
  /** the effort laps' time and distance together, s and m */
  work: { duration: number; distance: number };
  /** the mean pace of the effort laps, s/km */
  meanPace: number | null;
  /** each recovery's pace, s/km, and their mean timer time, s */
  recoveries: { pace: number[]; duration: number | null };
  /** each metric's mean in each effort lap */
  metrics: Record<string, (number | null)[]>;
}

/** Two runs compared rep by rep, the older first. */
export interface RepsComparison {
  a: RepsSide;
  b: RepsSide;
  /** both runs follow one layout of laps */
  sameLayout: boolean;
  /** the reps compared: as many as both have */
  reps: number;
  /** the metrics both runs hold in their efforts, in the order given */
  metrics: string[];
}

function side(run: RunFile, workout: Workout, reps: number, metrics: string[]): RepsSide {
  const efforts = workout.efforts.slice(0, reps).map((i) => run.laps[i]);
  const work = { duration: efforts.reduce((s, l) => s + l.duration, 0), distance: efforts.reduce((s, l) => s + l.distance, 0) };
  const rec = workout.recoveries.map((i) => run.laps[i]);
  return {
    run, workout, work,
    pace: efforts.map(lapPace),
    meanPace: work.distance > 0 ? (1000 * work.duration) / work.distance : null,
    recoveries: { pace: rec.flatMap((l) => { const p = lapPace(l); return p === null ? [] : [p]; }), duration: rec.length ? avg(rec.map((l) => l.duration)) : null },
    metrics: Object.fromEntries(metrics.map((m) => [m, efforts.map((l) => runMean(run, m, { from: l.start, to: l.end }))])),
  };
}

/**
 * Two runs compared rep by rep, the older first: their effort laps paired in order. Of one layout,
 * a lap is an effort when it is in both runs (as the Segments' suggestions read a layout's efforts
 * from most of its runs); of two layouts, each run's own efforts, as many as both have. Null when
 * either run has no effort lap.
 */
export function compareReps(x: RunFile, y: RunFile, metrics: string[]): RepsComparison | null {
  const [older, newer] = x.startTime <= y.startTime ? [x, y] : [y, x];
  let [wa, wb] = [workoutOf(older), workoutOf(newer)];
  const sameLayout = wa.key === wb.key;
  if (sameLayout) {
    const both = wa.pattern.map((p, i) => p.effort && wb.pattern[i].effort);
    [wa, wb] = [workoutOf(older, both), workoutOf(newer, both)];
  }
  const reps = Math.min(wa.efforts.length, wb.efforts.length);
  if (!reps) return null;
  const a = side(older, wa, reps, metrics);
  const b = side(newer, wb, reps, metrics);
  const held = metrics.filter((m) => a.metrics[m].some((v) => v !== null) && b.metrics[m].some((v) => v !== null));
  return { a, b, sameLayout, reps, metrics: held };
}

/**
 * The runs before `newer` that follow its layout of laps, newest first: only the runs with as many
 * laps are read. `since` (an ISO time) leaves out the runs before it; `first` stops at the first found.
 */
export async function runsOfLayout(rows: Pick<IndexedRun, 'id' | 'startTime' | 'laps'>[], newer: RunFile, read: (id: string) => Promise<RunFile | null>, opts: { since?: string; first?: boolean } = {}): Promise<RunFile[]> {
  const key = workoutOf(newer).key;
  const candidates = rows
    .filter((r) => r.id !== newer.id && r.startTime < newer.startTime && r.laps === newer.laps.length && (!opts.since || r.startTime > opts.since))
    .sort((p, q) => q.startTime.localeCompare(p.startTime));
  const out: RunFile[] = [];
  for (const r of candidates) {
    const run = await read(r.id);
    if (run && workoutOf(run).key === key) {
      out.push(run);
      if (opts.first) break;
    }
  }
  return out;
}

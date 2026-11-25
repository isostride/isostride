import type { BlockInstance } from '@/lib/blocks';
import type { RunFile } from '@/lib/kernel';
import { linearFit } from '@/lib/stats';
import { runMean } from './analysis';

/**
 * A segment's efforts run by run (requirement "Workouts compared rep by rep", the Efforts tab of
 * Analysis): each run's efforts in their order with their figures, a run's mean of a figure, and the
 * trend of the runs' means over time. Paces in s/km, as everywhere in compare.
 */

/** A run's efforts of a segment, in their order, with their figures as the segment read them. */
export interface RunEfforts {
  runId: string;
  runStart: string;
  efforts: BlockInstance[];
  /** each effort's pace from its time and distance, s/km */
  pace: (number | null)[];
  /** each effort's time and distance, s and m */
  durations: number[];
  distances: number[];
  /** the efforts' pace together, s/km */
  meanPace: number | null;
  /** each metric's value in each effort */
  metrics: Record<string, (number | null)[]>;
}

/** The accepted efforts of a segment grouped by run, each run's in their order, the oldest run first. */
export function effortsByRun(efforts: BlockInstance[], metrics: string[], value: (i: BlockInstance, metric: string) => number | null): RunEfforts[] {
  const by = new Map<string, BlockInstance[]>();
  for (const e of efforts) if (e.status === 'accepted') by.set(e.runId, [...(by.get(e.runId) ?? []), e]);
  return [...by.values()].map((group) => {
    const xs = [...group].sort((p, q) => p.start - q.start);
    const time = xs.reduce((s, i) => s + i.duration, 0);
    const distance = xs.reduce((s, i) => s + i.distance, 0);
    return {
      runId: xs[0].runId, runStart: xs[0].runStart, efforts: xs,
      pace: xs.map((i) => (i.distance > 0 ? (1000 * i.duration) / i.distance : null)),
      durations: xs.map((i) => i.duration),
      distances: xs.map((i) => i.distance),
      meanPace: distance > 0 ? (1000 * time) / distance : null,
      metrics: Object.fromEntries(metrics.map((m) => [m, xs.map((i) => value(i, m))])),
    };
  }).sort((p, q) => p.runStart.localeCompare(q.runStart));
}

/** The mean of the values given, nulls left out; null when none (a run's mean of a figure of its efforts). */
export function meanOf(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/**
 * The change of a figure per week over the runs: the least-squares slope of the runs' means against
 * their days, times 7; null with fewer than 3 runs that have a mean.
 */
export function trendPerWeek(points: { at: string; value: number | null }[]): number | null {
  const xs = points.filter((p): p is { at: string; value: number } => p.value !== null);
  if (xs.length < 3) return null;
  const day = (iso: string) => new Date(iso).getTime() / 86_400_000;
  return linearFit(xs.map((p) => day(p.at)), xs.map((p) => p.value)).slope * 7;
}

/**
 * A run added whole, as efforts to the Efforts tab ("wzialem 2 biegi ... w wysilkach jest pusto"): each of
 * its laps an effort (the whole run when it has no laps), its metrics the means of the lap's moving samples
 * as a segment's are kept (a pace as a speed, m/s), under the definition id given.
 */
export function lapEfforts(run: RunFile, definitionId: string, metrics: string[]): BlockInstance[] {
  const laps = run.laps.length ? run.laps : [{ start: 0, end: run.samples.t[run.samples.t.length - 1] ?? run.duration, duration: run.duration, distance: run.distance }];
  return laps.map((lap, k) => {
    const span = { from: lap.start, to: lap.end };
    const raw = (m: string) => { const v = runMean(run, m, span); return v === null ? null : m === 'speed' || m === 'effortPace' ? (v > 0 ? 1000 / v : null) : v; };
    const values = Object.fromEntries([...new Set(['speed', 'heartRate', ...metrics])].map((m) => [m, raw(m)]));
    return {
      id: `${definitionId}:${run.id}:${k}`, definitionId, runId: run.id, runStart: run.startTime,
      start: Math.round(lap.start), end: Math.round(lap.end), duration: Math.round(lap.duration), distance: Math.round(lap.distance),
      metrics: values, profile: {},
      context: {
        block: { pace: lap.distance > 0 ? Math.round((1000 * lap.duration) / lap.distance) : 0, grade: 0, duration: Math.round(lap.duration), heading: null, cv: 0, stopped: 0, start: 'flying' },
        before: { minuteOfRun: Math.floor(lap.start / 60), kmOfRun: 0, effortBefore: null, lap: k + 1 },
        run: { device: run.device, shoes: null, heartRateSource: `wrist (${run.device})`, workoutType: null, techniqueCue: null },
        day: { load3: 0, load7: 0, temperature: run.temperature },
      },
      status: 'accepted', reasons: [],
    };
  });
}

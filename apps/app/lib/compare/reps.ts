import type { BlockInstance } from '@/lib/blocks';
import type { RunFile } from '@/lib/kernel';
import { lineWithInterval, t975 } from '@/lib/stats';
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
 * their days, times 7, and whether it is told from none (the 95 % interval of the slope leaves zero
 * out); null with fewer than 3 runs that have a mean, or all of one day.
 */
export function trendPerWeek(points: { at: string; value: number | null }[]): { perWeek: number; clear: boolean } | null {
  const xs = points.filter((p): p is { at: string; value: number } => p.value !== null);
  const day = (iso: string) => new Date(iso).getTime() / 86_400_000;
  const line = lineWithInterval(xs.map((p) => day(p.at)), xs.map((p) => p.value));
  return line && { perWeek: line.slope * 7, clear: line.ci[0] > 0 || line.ci[1] < 0 };
}

/** A change under this part of the least range a figure's axis shows (a metric's minSpan) is no change to the eye: 5 s/km of pace, 2.5 bpm. */
export const LEAST_CHANGE = 0.25;

/**
 * How far two points of a series can lie apart by chance: Student's t (95 %, n − 2 degrees) × √2 × the
 * spread of the points about their line. The runs' means against their days, or a run's efforts in their
 * order. Null under 4 points: of 3, one degree of freedom says nothing.
 */
export function differenceNoise(xs: number[], ys: number[]): number | null {
  if (xs.length < 4) return null;
  const line = lineWithInterval(xs, ys);
  return line && t975(xs.length - 2) * Math.SQRT2 * line.residual;
}

/**
 * Whether a difference of a figure is worth a colour, better or worse (the review of 26 Nov 2026: the
 * table coloured every change, a second of pace as much as a minute): it is at least `least` (the least
 * the eye takes for a change, in the figure's unit) and past every `noise` that could be measured (nulls
 * left out). What two runs differ by is a fact of those two runs, not a claim that the runner changed:
 * that is the trend's, coloured by its interval, and the A/B and Trend tabs'.
 */
export function clearDifference(difference: number, least: number, noises: (number | null)[]): boolean {
  const size = Math.abs(difference);
  return size > 0 && size >= least && !noises.some((n) => n !== null && size <= n);
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

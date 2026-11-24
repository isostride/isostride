import { isPace, secondsPerKm, type RunFile } from '@/lib/kernel';
import { blockMetricsOf, efficiencyOf } from './types';

/** A metric of a stretch: any of a block's, and the elevation. */
export type RangeMetric = string;

/** The metrics of a stretch of a run: those of its blocks, and the elevation. */
export function rangeMetricsOf(run: RunFile): RangeMetric[] {
  const own = blockMetricsOf(Object.keys(run.windows.values));
  // i18n-ignore: a metric's key
  return run.windows.values.altitude ? [...own, 'altitude'] : own;
}

/** Min, avg and max of a metric over a stretch of a run, where its min and max occur, and its trend. */
export interface RangeStat {
  min: number;
  avg: number;
  max: number;
  /** s, the centre of the window of the min and of the max */
  minAt: number;
  maxAt: number;
  /** the least-squares change per 10 minutes over the stretch (pace in s/km); null under 1 minute */
  trend: number | null;
}

/** The statistics of a stretch of a run: its length, its distance and each metric's min, avg and max. */
export interface RangeStats {
  from: number;
  to: number;
  /** s, the length of the stretch */
  seconds: number;
  /** s, the time of its 10 s windows with movement */
  moving: number;
  /** m, the climbs and the descents of its 10 s windows' elevation, each step counted */
  ascent: number | null;
  descent: number | null;
  /** m, from the cumulative distance of the samples; null with no distance */
  distance: number | null;
  /** the metrics with a value in the stretch */
  metrics: Partial<Record<RangeMetric, RangeStat>>;
  /**
   * the decoupling of pace from heart rate (Pa:HR), %: the efficiency (speed per heartbeat) of the
   * stretch's first half against its second; positive when the heart rate drifted up against the pace
   */
  decoupling: number | null;
}

const WINDOW = 10;
/** The least stretch with a trend, s. */
const TREND_MIN = 60;

/** The windows with movement whose centre lies in [from, to): their centres and the metric's values. */
function windowValues(run: RunFile, m: RangeMetric, from: number, to: number): { t: number[]; v: number[] } {
  const w = run.windows;
  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < w.start.length; i++) {
    const c = w.start[i] + WINDOW / 2;
    if (c < from || c >= to || w.flags.stopped[i]) continue;
    let x: number | null;
    if (m === 'efficiency') x = efficiencyOf((w.values.speed?.[i] ?? null), (w.values.heartRate?.[i] ?? null));
    else if (isPace(m)) x = secondsPerKm(w.values[m]?.[i] ?? null);
    else x = w.values[m]?.[i] ?? null;
    if (x !== null) { t.push(c); v.push(x); }
  }
  return { t, v };
}

/** The least-squares slope of v against t, per 10 minutes; null when the times span under a minute. */
export function trendPer10Min(t: number[], v: number[]): number | null {
  const n = t.length;
  if (n < 2 || t[n - 1] - t[0] < TREND_MIN) return null;
  const mt = t.reduce((a, b) => a + b, 0) / n;
  const mv = v.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (t[i] - mt) * (v[i] - mv); sxx += (t[i] - mt) ** 2; }
  return sxx ? (sxy / sxx) * 600 : null;
}

/**
 * Pa:HR decoupling over [from, to), % ("linie tredu ?"): the mean speed per mean heart rate of the
 * windows with movement of the first half against the second; null with fewer than 3 windows in a half.
 */
export function decouplingOf(run: RunFile, from: number, to: number): number | null {
  const w = run.windows;
  const mid = (from + to) / 2;
  const halves = [{ s: 0, h: 0, n: 0 }, { s: 0, h: 0, n: 0 }];
  for (let i = 0; i < w.start.length; i++) {
    const c = w.start[i] + WINDOW / 2;
    const sp = (w.values.speed?.[i] ?? null);
    const hr = (w.values.heartRate?.[i] ?? null);
    if (c < from || c >= to || w.flags.stopped[i] || sp === null || sp <= 0 || hr === null || hr <= 0) continue;
    const half = halves[c < mid ? 0 : 1];
    half.s += sp; half.h += hr; half.n++;
  }
  if (halves.some((x) => x.n < 3)) return null;
  const [a, b] = halves.map((x) => x.s / x.n / (x.h / x.n));
  return ((a - b) / a) * 100;
}

/** The cumulative distance at a time: that of the last sample by then, the run's distance past its last sample. */
function distanceAt(run: RunFile, at: number): number | null {
  const { t, distance } = run.samples;
  if (t.length && at > t[t.length - 1]) return run.distance;
  let v: number | null = null;
  for (let i = 0; i < t.length && t[i] <= at; i++) if (distance[i] !== null) v = distance[i];
  return v;
}

/**
 * The statistics of [from, to) s of a run, for the Run screen's selection ("po zaznaczeniu
 * pokazuje mi statystyki metryk w danym zaznaczeniu - min, max, avg"): each metric over the 10 s
 * windows with movement whose centre lies in the stretch, as the statistic of a block is taken;
 * pace in s/km, its min the fastest window, its avg from the mean speed (the stretch's distance
 * over its moving time), not the mean of the paces.
 */
export function rangeStats(run: RunFile, from: number, to: number): RangeStats {
  const metrics: Partial<Record<RangeMetric, RangeStat>> = {};
  for (const m of rangeMetricsOf(run)) {
    const { t, v } = windowValues(run, m, from, to);
    if (!v.length) continue;
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < v.length; i++) { if (v[i] < v[lo]) lo = i; if (v[i] > v[hi]) hi = i; }
    const [min, max] = [v[lo], v[hi]];
    let avg: number | null;
    if (isPace(m)) {
      // The mean speed of the windows, as a pace.
      const w = run.windows;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < w.start.length; i++) {
        const c = w.start[i] + 5;
        const v = w.values[m]?.[i] ?? null;
        if (c >= from && c < to && !w.flags.stopped[i] && v !== null && v > 0) { sum += v; n++; }
      }
      avg = n ? 1000 / (sum / n) : null;
    } else avg = v.reduce((x, y) => x + y, 0) / v.length;
    if (avg !== null) metrics[m] = { min, avg, max, minAt: t[lo], maxAt: t[hi], trend: trendPer10Min(t, v) };
  }
  const a = distanceAt(run, from);
  const b = distanceAt(run, to);
  const w = run.windows;
  let moving = 0;
  let ascent = 0;
  let descent = 0;
  let last: number | null = null;
  for (let i = 0; i < w.start.length; i++) {
    const c = w.start[i] + WINDOW / 2;
    if (c < from || c >= to) continue;
    if (!w.flags.stopped[i]) moving += WINDOW;
    const alt = (w.values.altitude?.[i] ?? null);
    if (alt === null) continue;
    if (last !== null) { if (alt > last) ascent += alt - last; else descent += last - alt; }
    last = alt;
  }
  return {
    from, to, seconds: to - from, moving, distance: a !== null && b !== null ? b - a : null,
    ascent: last === null ? null : ascent, descent: last === null ? null : descent,
    metrics, decoupling: decouplingOf(run, from, to),
  };
}

/**
 * The share of the moving time a metric spends in each of n zones over [from, to), from its 10 s
 * windows with movement ("popraw widget selection ... malo tam informacji"); `zoneOf` places a value
 * (pace in s/km) in its zone, 0 for Z1. Null when the metric has no value there.
 */
export function zoneShares(run: RunFile, metric: RangeMetric, n: number, zoneOf: (v: number) => number, from: number, to: number): number[] | null {
  const { v } = windowValues(run, metric, from, to);
  if (!v.length) return null;
  const counts = new Array(n).fill(0);
  for (const x of v) counts[Math.min(n - 1, Math.max(0, zoneOf(x)))]++;
  return counts.map((c) => c / v.length);
}

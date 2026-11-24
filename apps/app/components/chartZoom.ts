/**
 * The pure arithmetic of the run chart's zoom (ADR "Run metrics on one chart"): the range of
 * time drawn kept inside the run, zoomed around a time that keeps its place, moved, and the
 * round ticks of a time axis and of a pace scale.
 */
import { number } from '@/lib/i18n';

/** The range of time drawn, s since the start of the run. */
export type Domain = [number, number];

/** The narrowest range the chart zooms to, s: two 10 s windows, so that a short lap is shown exactly. */
export const MIN_SPAN = 20;

/** A range kept inside [0, total] and no narrower than MIN_SPAN (or the run). */
export function clampDomain([a, b]: Domain, total: number): Domain {
  const span = Math.min(total, Math.max(Math.min(MIN_SPAN, total), b - a));
  const from = Math.max(0, Math.min(a, total - span));
  return [from, from + span];
}

/** The range zoomed by `factor` (0.5: in, 2: out) around a time that keeps its place on the chart. */
export function zoomDomain(d: Domain, factor: number, around: number, total: number): Domain {
  const span = Math.min(total, Math.max(Math.min(MIN_SPAN, total), (d[1] - d[0]) * factor));
  const f = d[1] > d[0] ? (around - d[0]) / (d[1] - d[0]) : 0.5;
  return clampDomain([around - f * span, around - f * span + span], total);
}

/** The range moved by `by` s. */
export const panDomain = (d: Domain, by: number, total: number): Domain => clampDomain([d[0] + by, d[1] + by], total);

/** Round time ticks inside [a, b]: every 10 s up to every hour, about `count`. */
export function spanTicks(a: number, b: number, count = 6): number[] {
  const step = [10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600].find((s) => (b - a) / s <= count) ?? 3600;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(v);
  return out;
}

/** Ticks inside [lo, hi] at the first of `steps` giving at most `count` intervals. */
export function stepTicks(lo: number, hi: number, steps: number[], count = 4): number[] {
  const step = steps.find((s) => (hi - lo) / s <= count) ?? steps[steps.length - 1];
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

/** A run's time and distance mapped both ways, for spacing the chart by distance. */
export interface DistanceMap {
  /** m at a time, s */
  toDist: (t: number) => number;
  /** s at a distance, m: the first time the run reached it (the start of a stop) */
  toTime: (d: number) => number;
  /** the distance at the end, m */
  max: number;
}

/**
 * The map between time and distance from samples (t ascending, distance cumulative; a missing
 * distance keeps the last one): linear between samples, a stop is one distance over its time.
 */
export function distanceMap(t: number[], distance: (number | null)[]): DistanceMap {
  const ts: number[] = [];
  const ds: number[] = [];
  let last = 0;
  for (let i = 0; i < t.length; i++) {
    last = Math.max(last, distance[i] ?? last);
    ts.push(t[i]);
    ds.push(last);
  }
  const n = ts.length;
  const toDist = (time: number) => {
    if (!n) return 0;
    if (time <= ts[0]) return ds[0];
    if (time >= ts[n - 1]) return ds[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= time) lo = mid; else hi = mid; }
    return ds[lo] + ((ds[hi] - ds[lo]) * (time - ts[lo])) / (ts[hi] - ts[lo] || 1);
  };
  const toTime = (d: number) => {
    if (!n) return 0;
    if (d <= ds[0]) return ts[0];
    if (d >= ds[n - 1]) return ts[ds.indexOf(ds[n - 1])];
    // The first sample at or past d (within a micrometre: sums of speeds are not exact).
    const target = d - 1e-6;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ds[mid] >= target) hi = mid; else lo = mid; }
    const f = Math.min(1, Math.max(0, (d - ds[lo]) / (ds[hi] - ds[lo] || 1)));
    return ts[lo] + (ts[hi] - ts[lo]) * f;
  };
  return { toDist, toTime, max: n ? ds[n - 1] : 0 };
}

/** Round distance ticks inside [a, b] m: every 100 m up to every 10 km, about `count`. */
export function kmTicks(a: number, b: number, count = 6): number[] {
  const step = [100, 200, 250, 500, 1000, 2000, 5000, 10000].find((s) => (b - a) / s <= count) ?? 10000;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-6; v += step) out.push(v);
  return out;
}

/** A distance as a tick: 2 km, 2.5 km, 2.25 km. */
export const kmLabel = (m: number) => `${number(Number((m / 1000).toFixed(2)))} km`;

/**
 * The zoom factor of one wheel event: above 1 out, below 1 in. It grows with the square root of
 * the delta in pixels (lines of 33 px, pages of 800 px), so that a mouse notch of a few pixels
 * (macOS) zooms by about 15 %, a notch of 100 px (Windows) by 2, and a trackpad's small steps smoothly.
 */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaY * (deltaMode === 1 ? 33 : deltaMode === 2 ? 800 : 1);
  const step = Math.sqrt(Math.min(Math.abs(px), 400)) / 10;
  return 2 ** (Math.sign(px) * step);
}

/** The span of the smoothing for a range shown, s: 1/30 of it, from 10 s to 2 min. */
export function smoothSpan(rangeSeconds: number): number {
  return Math.min(120, Math.max(10, rangeSeconds / 30));
}

/**
 * The rolling mean of a series over `seconds` centred on each value ("jakiegos spline aby
 * odszumic": a spline only joins points, a mean removes the noise); a missing value (a stop) stays
 * missing, so the line still breaks there, and the values on either side are left out of means.
 */
export function rollingMean(x: number[], y: (number | null)[], seconds: number): (number | null)[] {
  if (seconds <= 1 || !x.length) return y;
  const half = seconds / 2;
  const out: (number | null)[] = new Array(y.length).fill(null);
  let a = 0;
  let b = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    // The window [x - half, x + half]: values enter at b and leave at a.
    while (b < x.length && x[b] <= x[i] + half) { if (y[b] !== null) { sum += y[b]!; n++; } b++; }
    while (x[a] < x[i] - half) { if (y[a] !== null) { sum -= y[a]!; n--; } a++; }
    out[i] = y[i] === null || !n ? null : sum / n;
  }
  return out;
}

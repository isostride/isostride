import { fastestFragment, fastestOver } from '@/lib/blocks';
import { PATHS, readJson, type DataFolder, readRunFile } from '@/lib/fs';
import { metricSeries, runningGap, type RunFile, type RunsIndex } from '@/lib/kernel';

/**
 * The curves of Analysis: for each length of time, the best stretch of that length inside the
 * segments of an Analysis item, whichever run it comes from. Speed (the author's request of 19 Nov
 * 2026: "os x czas, os y - tempo ... ze wszystkich prob"): the fastest stretch, as a pace. Power
 * (the author's request of 20 Nov 2026: "krzywe z wyborem predkosci i mocy"): the highest average
 * power.
 */

/** What a curve measures: speed (its value a pace, s/km, the lower the better) or power (W, the higher the better). */
export type CurveMetric = 'speed' | 'power';

/** Whether value a beats value b on the metric's curve. */
export function better(metric: CurveMetric, a: number, b: number): boolean {
  return metric === 'power' ? a > b : a < b;
}

// A sample's power (or effort pace) is held until the next one, but no longer than the gap the watch
// leaves while it records (runningGap of the kernel: 5 s, or 10 s recording smart): a pause counts as none.

/** The lengths of the curve, s: 30 s to 2 h on a logarithmic axis (model's choice). */
export const CURVE_DURATIONS = [30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200];

/** One point of the curve: the best stretch of a length, and the run it comes from. */
export interface CurvePoint {
  /** s */
  duration: number;
  /** speed: the pace, s/km; power: the average power, W */
  value: number;
  runId: string;
  date: string;
  title: string | null;
  from: number;
  to: number;
}

/** What a curve is drawn from: the stretches [from, to) s of each run, by run id, and the metric (speed when left out). */
export interface CurveSource {
  key: string;
  ranges: Record<string, [number, number][]>;
  metric?: CurveMetric;
}

type Best = { duration: number; value: number; from: number; to: number };

/**
 * The highest average power of a stretch lasting `duration` s inside [from, to): each sample's
 * power held until the next sample (at most POWER_HOLD s), a sample without power counting as none.
 * The stretch is taken whole; where no whole one fits, the longest there is when it falls 2 s short at
 * most (a segment ending on its last sample), as the fastest one.
 */
export function strongestFragment(run: RunFile, duration: number, range: [number, number]): { from: number; to: number; power: number } | null {
  const { t } = run.samples;
  const power = metricSeries(run.samples, 'power');
  const ts: number[] = [];
  const ps: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] >= range[0] && t[i] < range[1]) { ts.push(t[i]); ps.push(power[i] ?? 0); }
  // energy[i]: the work, J, from the first sample to sample i.
  const energy = [0];
  const hold = runningGap(t);
  for (let i = 1; i < ts.length; i++) energy.push(energy[i - 1] + ps[i - 1] * Math.min(ts[i] - ts[i - 1], hold));
  const short = ts.length ? duration - (ts[ts.length - 1] - ts[0]) : Infinity;
  for (const slack of short > 0 && short <= 2 ? [0, short] : [0]) {
    let best: { from: number; to: number; power: number } | null = null;
    let j = 0;
    let fits = false;
    for (let i = 0; i < ts.length; i++) {
      if (j < i) j = i;
      while (j < ts.length && ts[j] - ts[i] < duration - slack) j++;
      if (j >= ts.length) break;
      fits = true;
      const p = (energy[j] - energy[i]) / (ts[j] - ts[i]);
      if (!best || p > best.power) best = { from: ts[i], to: ts[j], power: p };
    }
    if (fits) return best && best.power > 0 ? best : null;
  }
  return null;
}

/** A best of pace descending more than this share of its length is left out: a downhill is no best of the runner (model's choice: 1 %). */
export const MAX_DESCENT = 0.01;

/**
 * Where a best of pace is read from. raw: the distance of the watch, as Analysis compares stretches.
 * effort: the effort pace where the watch gives it (grade-adjusted, as rTSS normalises it), else the
 * distance with every stretch descending more than MAX_DESCENT left out: the runs' bests of Performance.
 */
export type PaceSource = 'raw' | 'effort';

/** The fastest stretch of `duration` s of a run inside [from, to), from the pace source given. */
function fastestPace(run: RunFile, duration: number, range: [number, number], source: PaceSource): { from: number; to: number; distance: number } | null {
  if (source === 'raw') return fastestFragment(run, 'time', duration, undefined, range);
  const { t } = run.samples;
  const effort = metricSeries(run.samples, 'effortPace');
  const inside: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] >= range[0] && t[i] < range[1]) inside.push(i);
  const ts = inside.map((i) => t[i]);
  if (effort.some((v) => v !== null && v > 0)) {
    // The distance the effort pace would cover: each sample's speed held until the next, a pause as none.
    const ds = [0];
    const hold = runningGap(t);
    for (let k = 1; k < inside.length; k++) ds.push(ds[k - 1] + Math.max(0, effort[inside[k - 1]] ?? 0) * Math.min(ts[k] - ts[k - 1], hold));
    return fastestOver(ts, ds, 'time', duration);
  }
  const distance = run.samples.distance;
  const altitude = metricSeries(run.samples, 'altitude');
  const have = inside.filter((i) => distance[i] !== null);
  const alt = have.map((i) => altitude[i]);
  const ds = have.map((i) => distance[i]!);
  return fastestOver(have.map((i) => t[i]), ds, 'time', duration, undefined, (i, j) => alt[i] === null || alt[j] === null || alt[j]! - alt[i]! >= -MAX_DESCENT * (ds[j] - ds[i]));
}

/**
 * The best stretch of each length inside the given stretches of one run (the fastest, or the one of
 * the highest average power); lengths none of them covers, or with no power, are left out. Pace from
 * the source given (raw by default).
 */
export function bestsWithin(run: RunFile, ranges: [number, number][], metric: CurveMetric = 'speed', durations: number[] = CURVE_DURATIONS, source: PaceSource = 'raw'): Best[] {
  const out: Best[] = [];
  for (const duration of durations) {
    let best: Omit<Best, 'duration'> | null = null;
    for (const range of ranges) {
      if (range[1] - range[0] < duration - 2) continue;
      // A segment [from, to] runs from one sample to another: its last sample belongs to it, so a
      // 10-minute segment holds a 10-minute best (the fragment searches take [from, to) ranges).
      const within: [number, number] = [range[0], range[1] + 1];
      let cand: Omit<Best, 'duration'> | null = null;
      if (metric === 'power') {
        const f = strongestFragment(run, duration, within);
        if (f) cand = { value: f.power, from: f.from, to: f.to };
      } else {
        const f = fastestPace(run, duration, within, source);
        if (f && f.distance > 0) cand = { value: (f.to - f.from) / (f.distance / 1000), from: f.from, to: f.to };
      }
      if (cand && (!best || better(metric, cand.value, best.value))) best = cand;
    }
    if (best) out.push({ duration, ...best });
  }
  return out;
}

/** Keeps, for each length, the better of two points (the faster, or the more powerful). */
export function mergeBests(curve: CurvePoint[], more: CurvePoint[], metric: CurveMetric = 'speed'): CurvePoint[] {
  const by = new Map(curve.map((p) => [p.duration, p]));
  for (const p of more) { const have = by.get(p.duration); if (!have || better(metric, p.value, have.value)) by.set(p.duration, p); }
  return [...by.values()].sort((a, b) => a.duration - b.duration);
}

/**
 * The curves of several sources in one pass over the run files they name: each run is read
 * once, with progress.
 */
export async function curvesOf(folder: DataFolder, sources: CurveSource[], onProgress?: (p: { done: number; total: number; file: string }) => void): Promise<Record<string, CurvePoint[]>> {
  const rows = new Map(((await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? []).map((r) => [r.id, r]));
  const ids = [...new Set(sources.flatMap((s) => Object.keys(s.ranges)))].filter((id) => rows.has(id));
  const out: Record<string, CurvePoint[]> = Object.fromEntries(sources.map((s) => [s.key, []]));
  let done = 0;
  for (const id of ids) {
    const row = rows.get(id)!;
    const run = await readRunFile(folder, id);
    onProgress?.({ done: ++done, total: ids.length, file: row.file });
    if (!run) continue;
    for (const s of sources) {
      const ranges = s.ranges[id];
      if (!ranges?.length) continue;
      const metric = s.metric ?? 'speed';
      out[s.key] = mergeBests(out[s.key], bestsWithin(run, ranges, metric).map((b) => ({ ...b, runId: id, date: run.startTime, title: row.title ?? null })), metric);
    }
  }
  return out;
}

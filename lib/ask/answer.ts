import { efficiencyOf, fastestFragment, localDay, type BlockMetric } from '@/lib/blocks';
import { describeDelta, formatAmount, percentChange, runMean } from '@/lib/compare';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import type { IndexedRun, RunFile, RunsIndex } from '@/lib/kernel';
import { bootstrap, linearFit, quantile, sd } from '@/lib/stats';
import { CURVE_DURATIONS, bestKey, bestWindow, fold, metricKeyLabel, type Filters, type MetricKey, type Period, type RunSet, type Stat, type Window } from './query';

/** A series needs this many runs before it gets a verdict (as a block's trend does). */
export const MIN_TREND_RUNS = 5;
const DAY = 86_400_000;

export interface AnswerPoint {
  runId: string;
  /** the run's start, ISO */
  date: string;
  title: string | null;
  /** the metric's value: a run's statistic, or the pace of its fastest stretch (s/km) */
  value: number;
  /** the stretch, s since the run's start, for a fastest-stretch metric */
  from: number | null;
  to: number | null;
  /** the stretch's length, m */
  distance: number | null;
}

export interface AnswerFit {
  t0: number;
  t1: number;
  intercept: number;
  /** per day */
  slope: number;
  /** fitted change from the first to the last run */
  change: number;
  /** fitted value at the first run */
  start: number;
  /** standard deviation between the runs */
  noise: number;
  ci: [number, number];
  verdict: 'change' | 'no detectable change';
}

/** One metric of a run set: a point per run by date, and the line through them with enough runs. */
export interface Series {
  points: AnswerPoint[];
  fit: AnswerFit | null;
}

/** The runs a set covers: in its period, with its tag, shoes and title. */
export function selectRuns(rows: IndexedRun[], period: Period, filters: Filters): IndexedRun[] {
  const has = (v: string | null | undefined, wanted: string | null) => wanted === null || (!!v && fold(v).includes(fold(wanted)));
  return rows.filter((r) => {
    const day = localDay(r.startTime);
    return (period.from === null || day >= period.from) && (period.to === null || day <= period.to) &&
      (filters.workoutType === null || fold(r.workoutType ?? '') === fold(filters.workoutType)) &&
      has(r.shoes, filters.shoes) && has(r.title, filters.title);
  });
}

/** A line through the runs' values over time, its noise and verdict (the Trend rule applied to runs). */
export function trendOfRuns(points: AnswerPoint[], seed = 7): AnswerFit | null {
  if (points.length < MIN_TREND_RUNS) return null;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const xs = points.map((p) => (Date.parse(p.date) - t0) / DAY);
  const ys = points.map((p) => p.value);
  const span = xs[xs.length - 1];
  const f = linearFit(xs, ys);
  const pairs = xs.map((x, k) => [x, ys[k]] as const);
  const ci = bootstrap(pairs, (s) => linearFit(s.map((p) => p[0]), s.map((p) => p[1])).slope * span, seed);
  const change = f.slope * span;
  const noise = sd(ys);
  return { t0, t1, intercept: f.intercept, slope: f.slope, change, start: f.intercept, noise, ci, verdict: (ci[0] > 0 || ci[1] < 0) && Math.abs(change) > noise ? 'change' : 'no detectable change' };
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** The fastest stretch of the window in a run, as a point: its pace in s/km. */
export function bestStretch(run: RunFile, row: IndexedRun, window: Window): AnswerPoint | null {
  const f = fastestFragment(run, window.kind, window.target);
  if (!f || f.distance <= 0) return null;
  return { runId: run.id, date: run.startTime, title: row.title ?? null, value: (f.to - f.from) / (f.distance / 1000), from: f.from, to: f.to, distance: f.distance };
}

/**
 * A statistic of a metric within a run: the average over the moving samples (as the Analysis
 * screen's run points), or the median, minimum or maximum over the 10 s windows with movement.
 * Pace in s/km, so its minimum is the fastest window.
 */
export function runStat(run: RunFile, metric: BlockMetric, stat: Stat): number | null {
  if (stat === 'avg') return runMean(run, metric);
  const w = run.windows;
  const vals: number[] = [];
  for (let i = 0; i < w.start.length; i++) {
    if (w.flags.stopped[i]) continue;
    let v: number | null;
    if (metric === 'efficiency') v = efficiencyOf(w.speed[i], w.heartRate[i]);
    else if (metric === 'speed' || metric === 'effortPace') { const sp = w[metric][i]; v = sp !== null && sp > 0 ? 1000 / sp : null; }
    else v = w[metric][i];
    if (v !== null) vals.push(v);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  return stat === 'min' ? vals[0] : stat === 'max' ? vals[vals.length - 1] : quantile(vals, 0.5);
}

/** The value of a metric key for one run: its statistic, or the pace of its fastest stretch. */
export function pointOf(run: RunFile, row: IndexedRun, key: MetricKey, stat: Stat): AnswerPoint | null {
  const w = bestWindow(key);
  if (w) return bestStretch(run, row, w);
  const v = runStat(run, key as BlockMetric, stat);
  return v === null ? null : { runId: run.id, date: run.startTime, title: row.title ?? null, value: v, from: null, to: null, distance: null };
}

/** The block metric a key is read in: a fastest stretch is a pace. */
export function metricOf(key: MetricKey): BlockMetric {
  return bestWindow(key) ? 'speed' : (key as BlockMetric);
}

/**
 * The series of a run set for several metrics in one pass over its runs: the runs index, then
 * each run file once, with progress.
 */
export async function seriesOfRuns(folder: DataFolder, set: RunSet, keys: MetricKey[], onProgress?: (p: { done: number; total: number; file: string }) => void): Promise<Record<string, Series>> {
  const rows = selectRuns((await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? [], set.period, set.filters);
  const points: Record<string, AnswerPoint[]> = Object.fromEntries(keys.map((k) => [k, []]));
  let done = 0;
  for (const row of rows) {
    const run = await readJson<RunFile>(folder, PATHS.runFile(row.id));
    onProgress?.({ done: ++done, total: rows.length, file: row.file });
    if (!run) continue;
    for (const k of keys) { const p = pointOf(run, row, k, set.stat); if (p) points[k].push(p); }
  }
  const out: Record<string, Series> = {};
  for (const k of keys) {
    const pts = points[k].sort((a, b) => a.date.localeCompare(b.date));
    out[k] = { points: pts, fit: trendOfRuns(pts) };
  }
  return out;
}

/**
 * The verdict of a series in words: the start and end values, the change with its percentage,
 * and whether it is beyond the noise between runs; with too few runs, the count alone.
 */
export function seriesSentence(key: MetricKey, stat: Stat, where: string, s: Series): string {
  const metric = metricOf(key);
  const words = metricKeyLabel(key, stat);
  const label = words[0].toUpperCase() + words.slice(1);
  const n = s.points.length;
  if (!n) return `No run ${where} has a value of ${words.toLowerCase()}.`;
  if (!s.fit) return `${label} ${where}: ${n} run${n === 1 ? '' : 's'}, too few for a verdict (${MIN_TREND_RUNS} needed); the points are shown as they are.`;
  const end = s.fit.start + s.fit.change;
  // Pace reads as m:ss /km; every other metric in its unit.
  const value = (v: number) => (metric === 'speed' || metric === 'effortPace' ? `${mmss(v)} /km` : formatAmount(metric, v));
  return `${label} ${where}: ${value(s.fit.start)} → ${value(end)} over ${n} runs, ${describeDelta(metric, s.fit.change)} (${percentChange(s.fit.change, s.fit.start)}), ${s.fit.verdict === 'change' ? 'beyond' : 'within'} the noise between runs (±${formatAmount(metric, s.fit.noise)}): ${s.fit.verdict}.`;
}

/** One point of the pace curve: the fastest stretch of a length across the runs, and the run it comes from. */
export interface CurvePoint {
  /** s */
  duration: number;
  /** s/km */
  pace: number;
  runId: string;
  date: string;
  title: string | null;
  from: number;
  to: number;
}

/**
 * The pace curve of an item from its series of fastest stretches: for each length, the best
 * (lowest pace) over all its runs; lengths no run covers are left out.
 */
export function paceCurve(series: Record<string, Series>): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (const d of CURVE_DURATIONS) {
    const s = series[bestKey({ kind: 'time', target: d })];
    if (!s?.points.length) continue;
    const b = s.points.reduce((best, p) => (p.value < best.value ? p : best));
    out.push({ duration: d, pace: b.value, runId: b.runId, date: b.date, title: b.title, from: b.from!, to: b.to! });
  }
  return out;
}

/** The estimate's models need this many best stretches of at least MIN_FIT_SECONDS. */
export const MIN_FIT_POINTS = 3;
/** Stretches shorter than this are sprints the endurance models do not describe (model's choice: 3 minutes). */
export const MIN_FIT_SECONDS = 180;
/** The critical speed model holds for efforts of about 2 to 20 minutes (Jones & Vanhatalo 2017). */
export const CS_RANGE: [number, number] = [120, 1200];
/** Distances the estimate predicts a time for: 5 km, 10 km, half and full marathon. */
export const PREDICTED_DISTANCES = [5000, 10000, 21097.5, 42195];

export interface CurveEstimate {
  /** Riegel's power law, v(t) = e^a · t^(−k): speed falls by the factor 2^(−k) for every doubling of the time */
  a: number;
  k: number;
  /** best stretches the law was fitted to */
  n: number;
  /** the critical speed model, d = CS·t + D′, from the bests of 2–20 minutes; null below MIN_FIT_POINTS of them */
  cs: { cs: number; dPrime: number; n: number } | null;
  /** predicted times by distance, s, from the power law */
  predictions: { distance: number; seconds: number }[];
}

/**
 * The estimated pace curve from the measured one (the author's request of 19 Nov 2026: "dodaj
 * estymowana ... bazujac na researchu"): Riegel's power law (Riegel 1981, "Athletic records and
 * human endurance": time grows with distance to the power 1.06, that is speed falls with time to
 * the power about −0.06), its exponent fitted by least squares in log–log to the best stretches
 * of 3 minutes and more and its level raised to the strongest of them (an envelope: the law is
 * meant for maximal efforts), and the critical speed model (Monod & Scherrer 1965; Hill 1993; Jones & Vanhatalo
 * 2017) fitted to the bests of 2–20 minutes. Null with fewer than MIN_FIT_POINTS bests.
 */
export function estimateCurve(points: { duration: number; pace: number }[]): CurveEstimate | null {
  const fit = points.filter((p) => p.duration >= MIN_FIT_SECONDS);
  if (fit.length < MIN_FIT_POINTS) return null;
  const f = linearFit(fit.map((p) => Math.log(p.duration)), fit.map((p) => Math.log(1000 / p.pace)));
  const k = -f.slope;
  // The envelope (the author's choice of 19 Nov 2026): the law's slope from the fit, its level
  // raised to the strongest best, so no measured best lies above the estimate; Riegel's law is
  // meant for a maximal effort, and an easy long run is no such effort.
  const a = Math.max(...fit.map((p) => Math.log(1000 / p.pace) + k * Math.log(p.duration)));
  const csPts = points.filter((p) => p.duration >= CS_RANGE[0] && p.duration <= CS_RANGE[1]);
  let cs: CurveEstimate['cs'] = null;
  if (csPts.length >= MIN_FIT_POINTS) {
    const c = linearFit(csPts.map((p) => p.duration), csPts.map((p) => (1000 / p.pace) * p.duration));
    cs = { cs: c.slope, dPrime: c.intercept, n: csPts.length };
  }
  // d = v·t = e^a · t^(1−k)  ⇒  t = (d / e^a)^(1/(1−k)); meaningless when the law says speed rises with time.
  const predictions = k < 1 && k > -0.5 ? PREDICTED_DISTANCES.map((distance) => ({ distance, seconds: Math.pow(distance / Math.exp(a), 1 / (1 - k)) })) : [];
  return { a, k, n: fit.length, cs, predictions };
}

/** The estimated pace, s/km, at a length of time, from the power law. */
export function estimatedPace(e: CurveEstimate, duration: number): number {
  return 1000 / (Math.exp(e.a) * Math.pow(duration, -e.k));
}

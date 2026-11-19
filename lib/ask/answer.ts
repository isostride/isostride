import { efficiencyOf, fastestFragment, localDay, type BlockMetric } from '@/lib/blocks';
import { METRIC_LABEL, describeDelta, formatAmount, percentChange, runMean } from '@/lib/compare';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import type { IndexedRun, RunFile, RunsIndex } from '@/lib/kernel';
import { bootstrap, linearFit, quantile, sd } from '@/lib/stats';
import { STAT_LABEL, fold, windowName, type Filters, type Period, type Query, type Stat, type Window } from './query';

/** The answer needs this many runs before a trend gets a verdict (as a block's trend does). */
export const MIN_TREND_RUNS = 5;
const DAY = 86_400_000;

export interface AnswerPoint {
  runId: string;
  /** the run's start, ISO */
  date: string;
  title: string | null;
  /** the metric's value: a run's mean, or the pace of its fastest stretch (s/km) */
  value: number;
  /** the stretch, s since the run's start, for a "fastest" answer */
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

export interface Answer {
  query: Query;
  metric: BlockMetric;
  /** by date */
  points: AnswerPoint[];
  /** best first; the points, ranked, for "fastest" and "highest" questions */
  ranking: AnswerPoint[];
  /** for a question about change, with enough runs */
  fit: AnswerFit | null;
  sentence: string;
  /** runs the question covered */
  runs: number;
}

/** The runs a question covers: in its period, with its tag, shoes and title. */
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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "16 Sep 2026", the same on every platform (a locale would write "Sept"). */
const day = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

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

/** "maximum heart rate", or just "heart rate" for the average. */
function metricWords(metric: BlockMetric, stat: Stat): string {
  const m = METRIC_LABEL[metric].toLowerCase();
  return stat === 'avg' ? m : `${STAT_LABEL[stat]} ${m}`;
}

/** The sentence of an answer: the figure, where it was found, and for a change whether it is beyond the noise. */
export function sentenceOf(query: Query, metric: BlockMetric, points: AnswerPoint[], ranking: AnswerPoint[], fit: AnswerFit | null): string {
  const where = query.period.label === 'all runs' ? 'over all runs' : query.period.label;
  if (!points.length) return `No run ${where} has ${query.kind === 'best' ? `a stretch of ${windowName(query.window)}` : `a value of ${metricWords(metric, query.stat)}`} to answer with.`;
  if (query.kind === 'best') {
    const b = ranking[0];
    return `Fastest ${windowName(query.window)} ${where}: ${mmss(b.value)} /km on ${day(b.date)}${b.title ? ` (${b.title})` : ''}, minute ${Math.floor(b.from! / 60)}–${Math.ceil(b.to! / 60)} of the run; ${ranking.length} run${ranking.length === 1 ? '' : 's'} ranked.`;
  }
  if (query.kind === 'top') {
    const b = ranking[0];
    return `${query.direction === 'high' ? 'Highest' : 'Lowest'} ${metricWords(metric, query.stat)} ${where}: ${formatAmount(metric, b.value)} on ${day(b.date)}${b.title ? ` (${b.title})` : ''}; ${ranking.length} run${ranking.length === 1 ? '' : 's'} ranked.`;
  }
  const words = metricWords(metric, query.stat);
  const label = words[0].toUpperCase() + words.slice(1);
  if (!fit) return `${label} ${where}: ${points.length} run${points.length === 1 ? '' : 's'}, too few for a verdict (${MIN_TREND_RUNS} needed); the points are shown as they are.`;
  const end = fit.start + fit.change;
  // Pace reads as m:ss /km; every other metric in its unit.
  const value = (v: number) => (metric === 'speed' || metric === 'effortPace' ? `${mmss(v)} /km` : formatAmount(metric, v));
  const delta = describeDelta(metric, fit.change);
  return `${label} ${where}: ${value(fit.start)} → ${value(end)} over ${points.length} runs, ${delta} (${percentChange(fit.change, fit.start)}), ${fit.verdict === 'change' ? 'beyond' : 'within'} the noise between runs (±${formatAmount(metric, fit.noise)}): ${fit.verdict}.`;
}

/** Answers a question from the data folder: the runs index, then the run files the question needs. */
export async function answerQuestion(folder: DataFolder, query: Query, onProgress?: (p: { done: number; total: number; file: string }) => void): Promise<Answer> {
  const rows = selectRuns((await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? [], query.period, query.filters);
  const metric: BlockMetric = query.kind === 'best' ? 'speed' : query.metric;
  const points: AnswerPoint[] = [];
  let done = 0;
  for (const row of rows) {
    const run = await readJson<RunFile>(folder, PATHS.runFile(row.id));
    onProgress?.({ done: ++done, total: rows.length, file: row.file });
    if (!run) continue;
    if (query.kind === 'best') {
      const p = bestStretch(run, row, query.window);
      if (p) points.push(p);
    } else {
      const v = runStat(run, metric, query.stat);
      if (v !== null) points.push({ runId: run.id, date: run.startTime, title: row.title ?? null, value: v, from: null, to: null, distance: null });
    }
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  const up = query.kind === 'top' && query.direction === 'high';
  const ranking = query.kind === 'trend' ? [] : [...points].sort((a, b) => (up ? b.value - a.value : a.value - b.value)).slice(0, query.limit);
  const fit = query.kind === 'trend' ? trendOfRuns(points) : null;
  return { query, metric, points, ranking, fit, sentence: sentenceOf(query, metric, points, ranking, fit), runs: rows.length };
}

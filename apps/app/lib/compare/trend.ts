import { lineWithInterval, mean, t975 } from '@/lib/stats';
import type { BlockInstance, BlockMetric } from '@/lib/blocks';
import { correctForPace, noiseThreshold, selectInstances, sourceOf, type ContextFilter, type Rejected } from './select';

/**
 * A trend needs this many runs in a series before it gets a verdict (spec section 5: five; counted in
 * runs since the review of 26 Nov 2026: the efforts of one run are not separate measurements of the
 * trend, and counted one by one, four runs of five reps read "change" in half the series with none).
 */
export const MIN_TREND_INSTANCES = 5;
const DAY = 86_400_000;

export interface TrendPoint {
  instance: BlockInstance;
  date: string;
  raw: number;
  corrected: number;
}

export type Verdict = 'change' | 'no detectable change';

export interface TrendSeries {
  /** the device behind the metric: series never join across devices */
  source: string;
  points: TrendPoint[];
  /** the spread of the values shown: about the fitted line when there is one (the trend itself is no noise), else between the instances */
  noise: number;
  /** the runs the instances come from */
  runs: number;
  /** null below MIN_TREND_INSTANCES runs */
  fit: {
    /** per day */
    slope: number;
    intercept: number;
    /** fitted change from the first to the last instance */
    change: number;
    ci: [number, number];
    verdict: Verdict;
  } | null;
}

export interface TrendResult {
  definitionId: string;
  metric: BlockMetric;
  corrected: boolean;
  series: TrendSeries[];
  included: number;
  rejected: Rejected[];
}

/**
 * Trend (spec F11): the instances of one definition over time for one metric,
 * filtered by context, one series per device, raw or corrected for pace (by the
 * slope of pace beside time). With enough runs a series gets a line and a verdict, by
 * the A/B rule applied to the fitted change: "change" when its 95 % interval excludes
 * zero and it exceeds the noise. The run is the unit: the line goes through the runs'
 * means, its interval is that of the slope of that line (Student's t), and the noise is
 * the spread of the runs' means about it.
 */
export function computeTrend(all: BlockInstance[], definitionId: string, metric: BlockMetric, filter: ContextFilter = {}, corrected = true): TrendResult {
  const { included, rejected } = selectInstances(all, definitionId, metric, filter);
  const bySource = new Map<string, BlockInstance[]>();
  for (const i of included) {
    const s = sourceOf(i, metric);
    bySource.set(s, [...(bySource.get(s) ?? []), i]);
  }
  const series: TrendSeries[] = [];
  for (const [source, insts] of bySource) {
    const pace = correctForPace(insts, metric, { overTime: true });
    const points = pace.points.map((c) => ({ instance: c.instance, date: c.instance.runStart, raw: c.raw, corrected: c.corrected }));
    const ys = points.map((p) => (corrected ? p.corrected : p.raw));
    // Each run once: its day and the mean of its efforts.
    const byRun = new Map<string, { at: number; values: number[] }>();
    points.forEach((p, k) => { const r = byRun.get(p.instance.runId) ?? { at: Date.parse(p.date), values: [] }; r.values.push(ys[k]); byRun.set(p.instance.runId, r); });
    const runs = [...byRun.values()].sort((x, y) => x.at - y.at);
    let noise = noiseThreshold(ys);
    let fit: TrendSeries['fit'] = null;
    if (runs.length >= MIN_TREND_INSTANCES) {
      const t0 = Date.parse(points[0].date);
      const xs = runs.map((r) => (r.at - t0) / DAY);
      const span = (Date.parse(points[points.length - 1].date) - t0) / DAY;
      const line = lineWithInterval(xs, runs.map((r) => mean(r.values)));
      if (line) {
        // Corrected for pace: the interval of the slope and the spread about the line from the fit of the day
        // and the pace together, which gave the slope on pace (the line is the same, its interval wider).
        const fitted = corrected ? pace.fit : null;
        noise = fitted ? fitted.residual : line.residual;
        const change = line.slope * span;
        const half = fitted ? t975(fitted.df) * fitted.se : null;
        const ci: [number, number] = half === null ? [line.ci[0] * span, line.ci[1] * span] : [(line.slope - half) * span, (line.slope + half) * span];
        const verdict: Verdict = (ci[0] > 0 || ci[1] < 0) && Math.abs(change) > noise ? 'change' : 'no detectable change';
        fit = { slope: line.slope, intercept: line.intercept, change, ci, verdict };
      }
    }
    series.push({ source, points, noise, runs: runs.length, fit });
  }
  series.sort((a, b) => a.points[0].date.localeCompare(b.points[0].date));
  return { definitionId, metric, corrected, series, included: included.length, rejected };
}

/** Per-minute profiles of the selected instances, overlaid (spec F13). */
export function profiles(instances: BlockInstance[], metric: BlockMetric): { instance: BlockInstance; values: (number | null)[] }[] {
  return instances.map((i) => ({
    instance: i,
    values: i.profile[metric].map((v) => (v === null ? null : metric === 'speed' || metric === 'effortPace' ? (v > 0 ? 1000 / v : null) : v)),
  }));
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

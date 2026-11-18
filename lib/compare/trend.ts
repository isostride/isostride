import { bootstrap, linearFit } from '@/lib/stats/stats';
import type { BlockInstance, BlockMetric } from '@/lib/blocks/types';
import { correctForPace, noiseThreshold, selectInstances, sourceOf, type ContextFilter, type Rejected } from './select';

/** A trend needs this many instances in a series before it gets a verdict (spec section 5). */
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
  /** standard deviation between the instances, on the values shown */
  noise: number;
  /** null below MIN_TREND_INSTANCES */
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
 * filtered by context, one series per device, raw or corrected for pace. With
 * enough instances a series gets a line and a verdict, by the A/B rule applied to
 * the fitted change: "change" when its bootstrap interval excludes zero and it
 * exceeds the noise threshold.
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
    const points = correctForPace(insts, metric).map((c) => ({ instance: c.instance, date: c.instance.runStart, raw: c.raw, corrected: c.corrected }));
    const ys = points.map((p) => (corrected ? p.corrected : p.raw));
    const noise = noiseThreshold(ys);
    let fit: TrendSeries['fit'] = null;
    if (points.length >= MIN_TREND_INSTANCES) {
      const t0 = Date.parse(points[0].date);
      const xs = points.map((p) => (Date.parse(p.date) - t0) / DAY);
      const span = xs[xs.length - 1];
      const f = linearFit(xs, ys);
      const pairs = xs.map((x, k) => [x, ys[k]] as const);
      const ci = bootstrap(pairs, (s) => linearFit(s.map((p) => p[0]), s.map((p) => p[1])).slope * span, hash(definitionId + source + metric));
      const change = f.slope * span;
      const verdict: Verdict = (ci[0] > 0 || ci[1] < 0) && Math.abs(change) > noise ? 'change' : 'no detectable change';
      fit = { slope: f.slope, intercept: f.intercept, change, ci, verdict };
    }
    series.push({ source, points, noise, fit });
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

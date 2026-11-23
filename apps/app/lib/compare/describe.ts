import type { BlockMetric } from '@/lib/blocks';
import { directionOf, isPace, metricInfo, type Direction, type MetricInfo } from '@/lib/kernel';
import { MIN_TREND_INSTANCES, type TrendSeries } from './trend';

/**
 * What the words of a metric need: its name, its unit as compare shows it (pace in s/km), the decimals
 * of a change, and which way is better (requirement "Metric direction set by the runner").
 */
export interface MetricWords { name: string; unit: string; decimals: number | null; direction: Direction }

/** The words of a metric from the folder's catalog and the directions the runner set. */
export function wordsOf(metric: BlockMetric, catalog?: readonly MetricInfo[] | null, directions?: Record<string, Direction> | null): MetricWords {
  const m = metricInfo(metric, catalog);
  // A change of efficiency is in thousandths of a metre per beat, of leg stiffness in hundredths.
  const decimals = metric === 'efficiency' ? 3 : metric === 'legSpringStiffness' ? 2 : null;
  return { name: m.name, unit: isPace(metric, catalog) ? 's/km' : m.unit, decimals, direction: directionOf(m, directions) };
}

/** The unit of a metric's values as compare shows them (pace in s/km). */
export const unitOf = (metric: BlockMetric, catalog?: readonly MetricInfo[] | null) => wordsOf(metric, catalog).unit;

const roundFor = (w: MetricWords, v: number) => {
  const d = w.decimals ?? (Math.abs(v) >= 10 ? 0 : 1);
  return Math.round(v * 10 ** d) / 10 ** d;
};
const amount = (w: MetricWords, v: number) => `${roundFor(w, v)}${w.unit ? ` ${w.unit}` : ''}`;

/** An amount of a metric (a change, the noise) with the precision the metric needs and its unit. */
export function formatAmount(metric: BlockMetric, v: number, w: MetricWords = wordsOf(metric)): string {
  return amount(w, v);
}

/** A change as a share of where it started: "+4.3%" (pace: a faster pace is negative). */
export function percentChange(change: number, start: number): string {
  if (!start) return '';
  const p = (change / Math.abs(start)) * 100;
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p).toFixed(1)}%`;
}

/**
 * A difference in words: "12 s/km faster", "3 bpm lower" (pace: smaller is faster), and whether that is
 * better or worse where the metric's direction is known or set: "3 bpm lower, better"; a metric with no
 * direction says only higher or lower.
 */
export function describeDelta(metric: BlockMetric, d: number, w: MetricWords = wordsOf(metric)): string {
  const pace = w.unit === 's/km';
  const word = pace ? (d < 0 ? 'faster' : 'slower') : d > 0 ? 'higher' : 'lower';
  return `${amount(w, Math.abs(d))} ${word}${betterOrWorse(d, w)}`;
}

/** ", better" or ", worse" for a change in a metric whose direction is known or set; "" for one with none. */
function betterOrWorse(d: number, w: MetricWords): string {
  return d === 0 || w.direction === 'neutral' ? '' : (w.direction === 'higher') === d > 0 ? ', better' : ', worse';
}

export interface Description {
  headline: string;
  sentence: string;
  change: boolean;
}

/** A trend series in plain words: what changed, by how much, and whether it is beyond the noise. */
export function describeTrend(s: TrendSeries, metric: BlockMetric, fmt: (v: number) => string, w: MetricWords = wordsOf(metric)): Description {
  const label = w.name;
  const n = s.points.length;
  if (!s.fit) return { headline: 'Not enough efforts yet', sentence: `${n} effort${n === 1 ? '' : 's'} of ${label.toLowerCase()} here; a verdict needs at least ${MIN_TREND_INSTANCES}.`, change: false };
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const first = s.points[0].date;
  const last = s.points[n - 1].date;
  const start = s.fit.intercept;
  const end = s.fit.intercept + s.fit.change;
  const [a, b] = s.fit.ci;
  const what = `${label} on this segment went from ${fmt(start)} to ${fmt(end)} (fitted) between ${day(first)} and ${day(last)}, over ${n} efforts.`;
  const noise = `±${amount(w, s.noise)}`;
  const interval = `${roundFor(w, a)} to ${amount(w, b)}`;
  if (s.fit.verdict === 'change')
    return { headline: `Changed: ${describeDelta(metric, s.fit.change, w)}`, sentence: `${what} That is more than the noise between efforts (${noise}), and the 95% interval of the change (${interval}) stays on one side of zero.`, change: true };
  const why = Math.abs(s.fit.change) <= s.noise ? `within the noise between efforts (${noise})` : `not certain: the 95% interval of the change (${interval}) includes zero`;
  return { headline: 'No detectable change', sentence: `${what} That is ${why}.`, change: false };
}

/** An A/B comparison in plain words: B against A, by how much, and whether it is beyond the noise. */
export function describeAb(r: { a: { label: string; points: unknown[] }; b: { label: string; points: unknown[] }; difference: number | null; ci: [number, number] | null; noise: number | null; verdict: 'change' | 'no detectable change' | null }, metric: BlockMetric, minEach: number, w: MetricWords = wordsOf(metric)): Description {
  const label = w.name.toLowerCase();
  const counts = `${r.a.points.length} efforts with ${r.a.label}, ${r.b.points.length} with ${r.b.label}`;
  if (r.difference === null) return { headline: 'Nothing to compare yet', sentence: `${counts}.`, change: false };
  const what = `With ${r.b.label}, ${label} is ${describeDelta(metric, r.difference, { ...w, direction: 'neutral' })} than with ${r.a.label} (${counts}).`;
  if (!r.verdict || !r.ci || r.noise === null)
    return { headline: 'No verdict yet', sentence: `${what} A verdict needs at least ${minEach} efforts on each side.`, change: false };
  const noise = `±${amount(w, r.noise)}`;
  const interval = `${roundFor(w, r.ci[0])} to ${amount(w, r.ci[1])}`;
  if (r.verdict === 'change')
    return { headline: `Difference: ${describeDelta(metric, r.difference, { ...w, direction: 'neutral' })} with ${r.b.label}${betterOrWorse(r.difference, w)}`, sentence: `${what} That is more than the noise between efforts (${noise}), and the 95% interval of the difference (${interval}) stays on one side of zero.`, change: true };
  const why = Math.abs(r.difference) <= r.noise ? `within the noise between efforts (${noise})` : `not certain: the 95% interval of the difference (${interval}) includes zero`;
  return { headline: 'No detectable difference', sentence: `${what} That is ${why}.`, change: false };
}

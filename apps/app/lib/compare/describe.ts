import type { BlockMetric } from '@/lib/blocks';
import { METRIC_LABEL } from './select';
import { MIN_TREND_INSTANCES, type TrendSeries } from './trend';

/** The unit of a metric's values as compare shows them (pace in s/km). */
export const METRIC_UNIT: Record<BlockMetric, string> = {
  speed: 's/km', heartRate: 'bpm', cadence: 'spm', groundContactTime: 'ms', verticalOscillation: 'mm',
  stepLength: 'mm', power: 'W', effortPace: 's/km', legSpringStiffness: 'kN/m', efficiency: 'm/beat',
};

/** Decimals a metric needs to show a change: efficiency moves in thousandths of a metre per beat. */
const DECIMALS: Partial<Record<BlockMetric, number>> = { efficiency: 3, legSpringStiffness: 2 };
const roundFor = (metric: BlockMetric, v: number) => {
  const d = DECIMALS[metric] ?? (Math.abs(v) >= 10 ? 0 : 1);
  return Math.round(v * 10 ** d) / 10 ** d;
};

/** An amount of a metric (a change, the noise) with the precision the metric needs and its unit. */
export function formatAmount(metric: BlockMetric, v: number): string {
  return `${roundFor(metric, v)} ${METRIC_UNIT[metric]}`;
}

/** A change as a share of where it started: "+4.3%" (pace: a faster pace is negative). */
export function percentChange(change: number, start: number): string {
  if (!start) return '';
  const p = (change / Math.abs(start)) * 100;
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p).toFixed(1)}%`;
}

/** A difference in words: "12 s/km faster", "3 bpm lower" (pace: smaller is faster). */
export function describeDelta(metric: BlockMetric, d: number): string {
  const pace = metric === 'speed' || metric === 'effortPace';
  const word = pace ? (d < 0 ? 'faster' : 'slower') : d > 0 ? 'higher' : 'lower';
  return `${roundFor(metric, Math.abs(d))} ${METRIC_UNIT[metric]} ${word}`;
}

export interface Description {
  headline: string;
  sentence: string;
  change: boolean;
}

/** A trend series in plain words: what changed, by how much, and whether it is beyond the noise. */
export function describeTrend(s: TrendSeries, metric: BlockMetric, fmt: (v: number) => string): Description {
  const label = METRIC_LABEL[metric];
  const n = s.points.length;
  if (!s.fit) return { headline: 'Not enough efforts yet', sentence: `${n} effort${n === 1 ? '' : 's'} of ${label.toLowerCase()} here; a verdict needs at least ${MIN_TREND_INSTANCES}.`, change: false };
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const first = s.points[0].date;
  const last = s.points[n - 1].date;
  const start = s.fit.intercept;
  const end = s.fit.intercept + s.fit.change;
  const [a, b] = s.fit.ci;
  const what = `${label} on this segment went from ${fmt(start)} to ${fmt(end)} (fitted) between ${day(first)} and ${day(last)}, over ${n} efforts.`;
  const noise = `±${roundFor(metric, s.noise)} ${METRIC_UNIT[metric]}`;
  const interval = `${roundFor(metric, a)} to ${roundFor(metric, b)} ${METRIC_UNIT[metric]}`;
  if (s.fit.verdict === 'change')
    return { headline: `Changed: ${describeDelta(metric, s.fit.change)}`, sentence: `${what} That is more than the noise between efforts (${noise}), and the 95% interval of the change (${interval}) stays on one side of zero.`, change: true };
  const why = Math.abs(s.fit.change) <= s.noise ? `within the noise between efforts (${noise})` : `not certain: the 95% interval of the change (${interval}) includes zero`;
  return { headline: 'No detectable change', sentence: `${what} That is ${why}.`, change: false };
}

/** An A/B comparison in plain words: B against A, by how much, and whether it is beyond the noise. */
export function describeAb(r: { a: { label: string; points: unknown[] }; b: { label: string; points: unknown[] }; difference: number | null; ci: [number, number] | null; noise: number | null; verdict: 'change' | 'no detectable change' | null }, metric: BlockMetric, minEach: number): Description {
  const label = METRIC_LABEL[metric].toLowerCase();
  const counts = `${r.a.points.length} efforts with ${r.a.label}, ${r.b.points.length} with ${r.b.label}`;
  if (r.difference === null) return { headline: 'Nothing to compare yet', sentence: `${counts}.`, change: false };
  const what = `With ${r.b.label}, ${label} is ${describeDelta(metric, r.difference)} than with ${r.a.label} (${counts}).`;
  if (!r.verdict || !r.ci || r.noise === null)
    return { headline: 'No verdict yet', sentence: `${what} A verdict needs at least ${minEach} efforts on each side.`, change: false };
  const noise = `±${roundFor(metric, r.noise)} ${METRIC_UNIT[metric]}`;
  const interval = `${roundFor(metric, r.ci[0])} to ${roundFor(metric, r.ci[1])} ${METRIC_UNIT[metric]}`;
  if (r.verdict === 'change')
    return { headline: `Difference: ${describeDelta(metric, r.difference)} with ${r.b.label}`, sentence: `${what} That is more than the noise between efforts (${noise}), and the 95% interval of the difference (${interval}) stays on one side of zero.`, change: true };
  const why = Math.abs(r.difference) <= r.noise ? `within the noise between efforts (${noise})` : `not certain: the 95% interval of the difference (${interval}) includes zero`;
  return { headline: 'No detectable difference', sentence: `${what} That is ${why}.`, change: false };
}

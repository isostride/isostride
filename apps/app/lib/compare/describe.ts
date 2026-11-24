import type { BlockMetric } from '@/lib/blocks';
import { dateText, msg, number, t, tn } from '@/lib/i18n';
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
const amount = (w: MetricWords, v: number) => `${number(roundFor(w, v))}${w.unit ? ` ${w.unit}` : ''}`;
/** An interval of a change: "-14 to 9 bpm". */
const between = (w: MetricWords, a: number, b: number) => t('{from} to {to}', { from: number(roundFor(w, a)), to: amount(w, b) });

/** An amount of a metric (a change, the noise) with the precision the metric needs and its unit. */
export function formatAmount(metric: BlockMetric, v: number, w: MetricWords = wordsOf(metric)): string {
  return amount(w, v);
}

/** A change as a share of where it started: "+4.3%" (pace: a faster pace is negative). */
export function percentChange(change: number, start: number): string {
  if (!start) return '';
  const p = (change / Math.abs(start)) * 100;
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${number(Math.abs(p), 1)}%`;
}

/** A difference in words, by its way and whether it is better or worse: whole texts, so each language orders them its own way. */
const DELTA = {
  faster: [msg('{value} faster'), msg('{value} faster, better'), msg('{value} faster, worse')],
  slower: [msg('{value} slower'), msg('{value} slower, better'), msg('{value} slower, worse')],
  higher: [msg('{value} higher'), msg('{value} higher, better'), msg('{value} higher, worse')],
  lower: [msg('{value} lower'), msg('{value} lower, better'), msg('{value} lower, worse')],
} as const;

/**
 * A difference in words: "12 s/km faster", "3 bpm lower" (pace: smaller is faster), and whether that is
 * better or worse where the metric's direction is known or set: "3 bpm lower, better"; a metric with no
 * direction says only higher or lower.
 */
export function describeDelta(metric: BlockMetric, d: number, w: MetricWords = wordsOf(metric)): string {
  const pace = w.unit === 's/km';
  const word = pace ? (d < 0 ? 'faster' : 'slower') : d > 0 ? 'higher' : 'lower';
  return t(DELTA[word][betterOrWorse(d, w)], { value: amount(w, Math.abs(d)) });
}

/** 1 for a change for the better, 2 for the worse, 0 in a metric whose direction is neither known nor set. */
function betterOrWorse(d: number, w: MetricWords): 0 | 1 | 2 {
  return d === 0 || w.direction === 'neutral' ? 0 : (w.direction === 'higher') === d > 0 ? 1 : 2;
}

export interface Description {
  headline: string;
  sentence: string;
  change: boolean;
}

/** A trend series in plain words: what changed, by how much, and whether it is beyond the noise. */
export function describeTrend(s: TrendSeries, metric: BlockMetric, fmt: (v: number) => string, w: MetricWords = wordsOf(metric)): Description {
  const label = t(w.name);
  const n = s.points.length;
  if (!s.fit) return { headline: t('Not enough efforts yet'), sentence: tn(n, '{n} effort of {metric} here; a verdict needs at least {min}.', '{n} efforts of {metric} here; a verdict needs at least {min}.', { metric: label.toLowerCase(), min: MIN_TREND_INSTANCES }), change: false };
  const day = (iso: string) => dateText(iso, { day: 'numeric', month: 'short' });
  const first = s.points[0].date;
  const last = s.points[n - 1].date;
  const start = s.fit.intercept;
  const end = s.fit.intercept + s.fit.change;
  const [a, b] = s.fit.ci;
  const what = tn(n, '{metric} on this segment went from {start} to {end} (fitted) between {from} and {to}, over {n} effort.', '{metric} on this segment went from {start} to {end} (fitted) between {from} and {to}, over {n} efforts.', { metric: label, start: fmt(start), end: fmt(end), from: day(first), to: day(last) });
  const noise = `±${amount(w, s.noise)}`;
  const interval = between(w, a, b);
  if (s.fit.verdict === 'change')
    return { headline: t('Changed: {change}', { change: describeDelta(metric, s.fit.change, w) }), sentence: t('{what} That is more than the noise between efforts ({noise}), and the 95% interval of the change ({interval}) stays on one side of zero.', { what, noise, interval }), change: true };
  const sentence = Math.abs(s.fit.change) <= s.noise
    ? t('{what} That is within the noise between efforts ({noise}).', { what, noise })
    : t('{what} That is not certain: the 95% interval of the change ({interval}) includes zero.', { what, interval });
  return { headline: t('No detectable change'), sentence, change: false };
}

/** An A/B comparison in plain words: B against A, by how much, and whether it is beyond the noise. */
export function describeAb(r: { a: { label: string; points: unknown[] }; b: { label: string; points: unknown[] }; difference: number | null; ci: [number, number] | null; noise: number | null; verdict: 'change' | 'no detectable change' | null }, metric: BlockMetric, minEach: number, w: MetricWords = wordsOf(metric)): Description {
  const label = t(w.name).toLowerCase();
  const counts = tn(r.a.points.length, '{n} effort with {a}, {m} with {b}', '{n} efforts with {a}, {m} with {b}', { a: r.a.label, b: r.b.label, m: number(r.b.points.length) });
  if (r.difference === null) return { headline: t('Nothing to compare yet'), sentence: `${counts}.`, change: false };
  const delta = describeDelta(metric, r.difference, { ...w, direction: 'neutral' });
  const what = t('With {b}, {metric} is {delta} than with {a} ({counts}).', { a: r.a.label, b: r.b.label, metric: label, delta, counts });
  if (!r.verdict || !r.ci || r.noise === null)
    return { headline: t('No verdict yet'), sentence: t('{what} A verdict needs at least {min} efforts on each side.', { what, min: minEach }), change: false };
  const noise = `±${amount(w, r.noise)}`;
  const interval = between(w, r.ci[0], r.ci[1]);
  if (r.verdict === 'change') {
    const headline = [msg('Difference: {delta} with {b}'), msg('Difference: {delta} with {b}, better'), msg('Difference: {delta} with {b}, worse')][betterOrWorse(r.difference, w)];
    return { headline: t(headline, { delta, b: r.b.label }), sentence: t('{what} That is more than the noise between efforts ({noise}), and the 95% interval of the difference ({interval}) stays on one side of zero.', { what, noise, interval }), change: true };
  }
  const sentence = Math.abs(r.difference) <= r.noise
    ? t('{what} That is within the noise between efforts ({noise}).', { what, noise })
    : t('{what} That is not certain: the 95% interval of the difference ({interval}) includes zero.', { what, interval });
  return { headline: t('No detectable difference'), sentence, change: false };
}

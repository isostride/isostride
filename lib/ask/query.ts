import type { BlockMetric } from '@/lib/blocks';
import { METRIC_LABEL } from '@/lib/compare';

/**
 * Run sets (the author's request of 19 Nov 2026, merged into Analysis: "ask to tak naprawde
 * analysis"): the runs of a period that meet filters, each counted by a statistic, as an item of
 * the Analysis screen beside blocks and runs; and the fastest stretch of a length as a metric.
 * A run set lives in the screen's link.
 */

export interface Period {
  /** YYYY-MM-DD inclusive, local; null = open */
  from: string | null;
  to: string | null;
  /** the words it is shown with */
  label: string;
}

export interface Filters {
  workoutType: string | null;
  shoes: string | null;
  /** the run's title contains this */
  title: string | null;
}

export interface Window {
  kind: 'time' | 'distance';
  /** s or m */
  target: number;
}

/**
 * The statistic of a metric within a run ("avg, min, max, mediana"): the average over the moving
 * samples, or the median, minimum or maximum over the run's 10 s windows with movement, so one
 * odd sample is no extreme.
 */
export type Stat = 'avg' | 'median' | 'min' | 'max';
export const STATS: Stat[] = ['avg', 'median', 'min', 'max'];
export const STAT_LABEL: Record<Stat, string> = { avg: 'average', median: 'median', min: 'minimum', max: 'maximum' };

/** The runs of a period that meet the filters, each counted by the statistic. */
export interface RunSet {
  period: Period;
  filters: Filters;
  stat: Stat;
}

/** Letters without their Polish marks, so "Buty Łódź" and "buty lodz" read the same in a filter. */
export function fold(text: string): string {
  return text.toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => ({ ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' })[c] ?? c);
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The period presets of the screen, by key. */
export const PERIOD_PRESETS = ['all', 'month', 'quarter', 'year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export function presetPeriod(preset: PeriodPreset, now = new Date()): Period {
  const days = (n: number) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  if (preset === 'month') return { from: days(30), to: null, label: 'last 30 days' };
  if (preset === 'quarter') return { from: days(91), to: null, label: 'last 3 months' };
  if (preset === 'year') return { from: `${now.getFullYear()}-01-01`, to: null, label: `${now.getFullYear()}` };
  return { from: null, to: null, label: 'all runs' };
}

/** A period from two dates (either may be empty), labelled "since …", "to …" or "… – …". */
export function datesPeriod(from: string | null, to: string | null): Period {
  return { from: from || null, to: to || null, label: from && to ? `${from} – ${to}` : from ? `since ${from}` : to ? `to ${to}` : 'all runs' };
}

/** Lengths of a stretch the screen offers. */
export const WINDOW_PRESETS: Window[] = [
  { kind: 'time', target: 300 }, { kind: 'time', target: 600 }, { kind: 'time', target: 1200 }, { kind: 'time', target: 1800 }, { kind: 'time', target: 3600 },
  { kind: 'distance', target: 1000 }, { kind: 'distance', target: 3000 }, { kind: 'distance', target: 5000 }, { kind: 'distance', target: 10000 },
];

export function windowName(w: Window): string {
  return w.kind === 'time' ? `${+(w.target / 60).toFixed(1)} min` : `${+(w.target / 1000).toFixed(2)} km`;
}

export const ALL_RUNS: RunSet = { period: presetPeriod('all'), filters: { workoutType: null, shoes: null, title: null }, stat: 'avg' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const enc = (v: string | null) => encodeURIComponent(v ?? '');
const dec = (v: string | undefined) => (v ? decodeURIComponent(v) : null);

/** A run set as the Analysis link carries it: from|to|stat|tag|shoes|title, each part URL-encoded (no ":" or "," survive). */
export function formatRunSet(s: RunSet): string {
  return [enc(s.period.from), enc(s.period.to), s.stat, enc(s.filters.workoutType), enc(s.filters.shoes), enc(s.filters.title)].join('|');
}

/** A run set read back from the link; null when it is not one. */
export function parseRunSet(spec: string): RunSet | null {
  const parts = spec.split('|');
  if (parts.length !== 6 || !STATS.includes(parts[2] as Stat)) return null;
  const from = dec(parts[0]);
  const to = dec(parts[1]);
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return null;
  return { period: datesPeriod(from, to), stat: parts[2] as Stat, filters: { workoutType: dec(parts[3]), shoes: dec(parts[4]), title: dec(parts[5]) } };
}

/** "Runs since 2026-03-01 · tag easy · maximum": a run set in words, for its chip. */
export function describeRunSet(s: RunSet): string {
  const parts = [
    s.period.label === 'all runs' ? 'All runs' : `Runs ${s.period.label}`,
    s.filters.workoutType && `tag ${s.filters.workoutType}`, s.filters.shoes && `shoes ${s.filters.shoes}`, s.filters.title && `title “${s.filters.title}”`,
    s.stat !== 'avg' && STAT_LABEL[s.stat],
  ].filter((p): p is string => !!p);
  return parts.join(' · ');
}

/** A metric of the Analysis screen: a block metric, or the fastest stretch of a length ("best:600s", "best:5000m"). */
export type MetricKey = BlockMetric | `best:${string}`;

export function bestKey(w: Window): MetricKey {
  return `best:${w.target}${w.kind === 'time' ? 's' : 'm'}`;
}

/**
 * The lengths of the pace curve (the author's request of 19 Nov 2026: "os x czas, os y - tempo
 * ... ze wszystkich prob"): the fastest stretch of each, across all the runs of an item.
 */
export const CURVE_DURATIONS = [30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200];
export const CURVE_KEYS: MetricKey[] = CURVE_DURATIONS.map((d) => bestKey({ kind: 'time', target: d }));

/** The window of a "best:" key, or null for a block metric or an unreadable key. */
export function bestWindow(key: string): Window | null {
  const m = key.match(/^best:(\d+)([sm])$/);
  return m ? { kind: m[2] === 's' ? 'time' : 'distance', target: Number(m[1]) } : null;
}

/** "Fastest 10 min", "Heart rate"; with the statistic, "Maximum heart rate". */
export function metricKeyLabel(key: MetricKey, stat: Stat = 'avg'): string {
  const w = bestWindow(key);
  if (w) return `Fastest ${windowName(w)}`;
  const m = METRIC_LABEL[key as BlockMetric] ?? key;
  return stat === 'avg' ? m : `${STAT_LABEL[stat]} ${m.toLowerCase()}`;
}

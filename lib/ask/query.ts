import type { BlockMetric } from '@/lib/blocks';
import { METRIC_LABEL } from '@/lib/compare';

/**
 * Questions about the data (the author's request of 19 Nov 2026: "pokaz mi jak sie zmieniala
 * efektywnosc od lutego", "pokaz mi najszybszy bieg 10 min od marca"), built from controls
 * rather than typed ("nie chce wpisywac tekstu chce bardzije strukturalne wyszukiwanie"): a kind
 * of answer, a metric, a period, a window and filters. The question lives in the screen's link.
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
 * The statistic of a metric within a run (the author's request of 19 Nov 2026: "avg, min, max,
 * mediana"): the average over the moving samples, or the median, minimum or maximum over the
 * run's 10 s windows with movement, so one odd sample is no extreme.
 */
export type Stat = 'avg' | 'median' | 'min' | 'max';
export const STATS: Stat[] = ['avg', 'median', 'min', 'max'];
export const STAT_LABEL: Record<Stat, string> = { avg: 'average', median: 'median', min: 'minimum', max: 'maximum' };

export type Query =
  /** how a metric changed: one point per run, its statistic, with a fitted line and a verdict */
  | { kind: 'trend'; metric: BlockMetric; stat: Stat; period: Period; filters: Filters }
  /** the fastest stretch of a length in every run, ranked */
  | { kind: 'best'; window: Window; period: Period; filters: Filters; limit: number }
  /** runs ranked by a statistic of a metric */
  | { kind: 'top'; metric: BlockMetric; stat: Stat; direction: 'high' | 'low'; period: Period; filters: Filters; limit: number };

/** Metrics where lower is better: the "best" direction of a ranking. */
export const LOWER_IS_BETTER: Record<BlockMetric, boolean> = {
  speed: true, effortPace: true, heartRate: true, groundContactTime: true, verticalOscillation: true,
  cadence: false, stepLength: false, power: false, legSpringStiffness: false, efficiency: false,
};

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

export const DEFAULT_QUERY: Query = { kind: 'trend', metric: 'speed', stat: 'avg', period: presetPeriod('all'), filters: { workoutType: null, shoes: null, title: null } };

/** The question as the screen's link carries it: kind, metric, direction, window, from, to, tag, shoes, title, top. */
export function queryToParams(q: Query): URLSearchParams {
  const p = new URLSearchParams();
  p.set('kind', q.kind);
  if (q.kind !== 'best') p.set('metric', q.metric);
  if (q.kind !== 'best' && q.stat !== 'avg') p.set('stat', q.stat);
  if (q.kind === 'top') p.set('direction', q.direction);
  if (q.kind === 'best') p.set('window', `${q.window.target}${q.window.kind === 'time' ? 's' : 'm'}`);
  if (q.period.from) p.set('from', q.period.from);
  if (q.period.to) p.set('to', q.period.to);
  if (q.filters.workoutType) p.set('tag', q.filters.workoutType);
  if (q.filters.shoes) p.set('shoes', q.filters.shoes);
  if (q.filters.title) p.set('title', q.filters.title);
  if (q.kind !== 'trend' && q.limit !== 10) p.set('top', String(q.limit));
  return p;
}

const METRICS = new Set<string>(Object.keys(LOWER_IS_BETTER));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The question read back from a link; what the link does not say takes the default. */
export function queryFromParams(p: URLSearchParams): Query {
  const metric = (METRICS.has(p.get('metric') ?? '') ? p.get('metric') : 'speed') as BlockMetric;
  const stat = (STATS.includes(p.get('stat') as Stat) ? p.get('stat') : 'avg') as Stat;
  const period = datesPeriod(DATE.test(p.get('from') ?? '') ? p.get('from') : null, DATE.test(p.get('to') ?? '') ? p.get('to') : null);
  const filters: Filters = { workoutType: p.get('tag') || null, shoes: p.get('shoes') || null, title: p.get('title') || null };
  const limit = Math.min(100, Math.max(1, Number(p.get('top')) || 10));
  const kind = p.get('kind');
  if (kind === 'best') {
    const m = (p.get('window') ?? '').match(/^(\d+)([sm])$/);
    const window: Window = m ? { kind: m[2] === 's' ? 'time' : 'distance', target: Number(m[1]) } : { kind: 'time', target: 600 };
    return { kind, window, period, filters, limit };
  }
  if (kind === 'top') return { kind, metric, stat, direction: p.get('direction') === 'high' ? 'high' : p.get('direction') === 'low' ? 'low' : LOWER_IS_BETTER[metric] ? 'low' : 'high', period, filters, limit };
  return { kind: 'trend', metric, stat, period, filters };
}

/** The question in words, for the answer's heading. */
export function describeQuery(q: Query): string {
  const where = q.period.label === 'all runs' ? 'over all runs' : q.period.label;
  const filters = [q.filters.workoutType && `tag ${q.filters.workoutType}`, q.filters.shoes && `shoes ${q.filters.shoes}`, q.filters.title && `title “${q.filters.title}”`].filter(Boolean).join(', ');
  const what = q.kind === 'best' ? '' : q.stat === 'avg' ? METRIC_LABEL[q.metric].toLowerCase() : `${STAT_LABEL[q.stat]} ${METRIC_LABEL[q.metric].toLowerCase()}`;
  const head = q.kind === 'trend' ? `Change of ${what} ${where}` : q.kind === 'best' ? `Fastest ${windowName(q.window)} ${where}, top ${q.limit}` : `${q.direction === 'high' ? 'Highest' : 'Lowest'} ${what} ${where}, top ${q.limit}`;
  return filters ? `${head}, ${filters}` : head;
}

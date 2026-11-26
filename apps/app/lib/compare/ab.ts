import { mean, sd, t975, welch } from '@/lib/stats';
import { t } from '@/lib/i18n';
import type { BlockInstance, BlockMetric } from '@/lib/blocks';
import { CONTEXT_FIELDS, correctForPace, selectInstances, sourceOf, type ContextField, type ContextFilter, type Rejected } from './select';
import { cell } from './csv';
import { hash, type Verdict } from './trend';

/**
 * An A/B comparison needs this many runs on each side before it gets a verdict (spec section 5: four;
 * counted in runs since the review of 26 Nov 2026: the efforts of one run share its day, its heat and
 * its fatigue, and counted one by one, five reps of three runs a side read "change" in a third of the
 * comparisons of the same thing).
 */
export const MIN_AB_INSTANCES = 4;

export interface AbPoint {
  instance: BlockInstance;
  raw: number;
  corrected: number;
}

export interface AbGroup {
  label: string;
  points: AbPoint[];
  /** the mean of the runs' means: each run counts once, however many efforts it holds */
  mean: number | null;
  /** the runs the efforts come from */
  runs: number;
}

export interface AbResult {
  definitionId: string;
  metric: BlockMetric;
  corrected: boolean;
  a: AbGroup;
  b: AbGroup;
  /** mean(B) − mean(A) on the values compared (raw or corrected), each a mean of its runs' means */
  difference: number | null;
  rawDifference: number | null;
  /** Welch's 95 % interval of the difference, on the runs' means; null under two runs on a side */
  ci: [number, number] | null;
  /** pooled within-group standard deviation of the runs' means: the spread between runs in the same context */
  noise: number | null;
  /** null below MIN_AB_INSTANCES runs on a side */
  verdict: Verdict | null;
  warnings: string[];
  rejected: Rejected[];
}

export type GroupOf = (i: BlockInstance) => 'A' | 'B' | null;

/** Groups by one context field: A is one value, B another (spec F12: two sets that differ in one context field). */
export function byField(field: ContextField, a: string, b: string): GroupOf {
  return (i) => {
    const v = CONTEXT_FIELDS[field].get(i);
    return v === a ? 'A' : v === b ? 'B' : null;
  };
}

/**
 * A/B comparison (spec F12 and section 5): the difference between the two groups'
 * means, its 95 % interval and a verdict against the noise threshold: "change" when
 * the interval excludes zero and the difference exceeds the noise. The run is the unit:
 * each run counts once, by the mean of its efforts, and the interval is Welch's on those
 * means. Corrected for pace by the slope inside the groups. Warns when the groups do not
 * interleave in time (confounding with the fitness trend) and when they mix devices for
 * the metric.
 */
export function computeAb(
  all: BlockInstance[],
  definitionId: string,
  metric: BlockMetric,
  groupOf: GroupOf,
  labels: [string, string] = ['A', 'B'],
  filter: ContextFilter = {},
  corrected = true,
): AbResult {
  const sel = selectInstances(all, definitionId, metric, filter);
  const rejected = [...sel.rejected];
  const grouped: BlockInstance[] = [];
  for (const i of sel.included) {
    if (groupOf(i)) grouped.push(i);
    else rejected.push({ instance: i, reasons: [t('in neither group ({a} or {b})', { a: labels[0], b: labels[1] })] });
  }
  const { points: corr, fit: paceFit } = correctForPace(grouped, metric, { groupOf });
  const a = corr.filter((c) => groupOf(c.instance) === 'A');
  const b = corr.filter((c) => groupOf(c.instance) === 'B');
  const val = (p: AbPoint) => (corrected ? p.corrected : p.raw);
  // Each run once: the mean of its efforts.
  const byRun = (points: AbPoint[], of: (p: AbPoint) => number): number[] => {
    const runs = new Map<string, number[]>();
    for (const p of points) runs.set(p.instance.runId, [...(runs.get(p.instance.runId) ?? []), of(p)]);
    return [...runs.values()].map(mean);
  };
  const va = byRun(a, val);
  const vb = byRun(b, val);
  const ma = va.length ? mean(va) : null;
  const mb = vb.length ? mean(vb) : null;

  const warnings: string[] = [];
  const result: AbResult = {
    definitionId, metric, corrected,
    a: { label: labels[0], points: a, mean: ma, runs: va.length },
    b: { label: labels[1], points: b, mean: mb, runs: vb.length },
    difference: ma !== null && mb !== null ? mb - ma : null,
    rawDifference: a.length && b.length ? mean(byRun(b, (p) => p.raw)) - mean(byRun(a, (p) => p.raw)) : null,
    ci: null, noise: null, verdict: null, warnings, rejected,
  };
  if (!a.length || !b.length) return result;

  const dates = (points: AbPoint[]) => [...new Map(points.map((p) => [p.instance.runId, p.instance.runStart])).values()];
  if (!interleaved(dates(a), dates(b))) {
    warnings.push(t('{a} and {b} do not interleave in time, so the difference may be the fitness trend. Rotate between them for a few weeks.', { a: labels[0], b: labels[1] }));
  }
  // Mixing devices inside a group confounds; groups that are each one device (a split by device) do not.
  const sources = new Set(grouped.map((i) => sourceOf(i, metric)));
  const mixed = [a, b].some((g) => new Set(g.map((p) => sourceOf(p.instance, metric))).size > 1);
  if (mixed) warnings.push(t('The groups mix devices ({devices}); filter by one to compare like with like.', { devices: [...sources].join(', ') }));

  let pooled = Math.sqrt(((va.length - 1) * sd(va) ** 2 + (vb.length - 1) * sd(vb) ** 2) / Math.max(1, va.length + vb.length - 2));
  result.ci = welch(va, vb)?.ci ?? null;
  // Corrected for pace: the interval of the difference at one pace, from the fit that gave the slope (the
  // analysis of covariance), which holds what the slope costs; Welch's on the corrected values left it out.
  if (corrected && paceFit && va.length >= 2 && vb.length >= 2) {
    const half = t975(paceFit.df) * paceFit.se;
    result.ci = [result.difference! - half, result.difference! + half];
    pooled = paceFit.residual;
  }
  result.noise = pooled;
  if (result.ci && va.length >= MIN_AB_INSTANCES && vb.length >= MIN_AB_INSTANCES) {
    const [lo, hi] = result.ci;
    result.verdict = (lo > 0 || hi < 0) && Math.abs(result.difference!) > pooled ? 'change' : 'no detectable change';
  }
  return result;
}

/** How far apart the two groups' mean days may lie, in standard deviations of the days inside the groups (model's choice: one). */
export const INTERLEAVED_WITHIN = 1;

/**
 * Whether the two groups take turns in time: their mean days lie no further apart than INTERLEAVED_WITHIN
 * standard deviations of the days inside the groups (pooled). Groups that rotate share their mean day;
 * one group wholly before the other lies several deviations away, and one stray run of A among the runs
 * of B does not bring them together (the review of 26 Nov 2026: "more than one switch between them"
 * passed on a single stray effort).
 */
export function interleaved(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const [da, db] = [a.map((d) => Date.parse(d)), b.map((d) => Date.parse(d))];
  const pooled = Math.sqrt(((da.length - 1) * sd(da) ** 2 + (db.length - 1) * sd(db) ** 2) / Math.max(1, da.length + db.length - 2));
  return Math.abs(mean(da) - mean(db)) <= INTERLEAVED_WITHIN * pooled;
}

/** The mean per-minute profile of a group (spec: overlaid per-minute profiles on the A/B screen). */
export function meanProfile(points: AbPoint[], metric: BlockMetric): (number | null)[] {
  const n = Math.max(0, ...points.map((p) => p.instance.profile[metric].length));
  return Array.from({ length: n }, (_, k) => {
    const vs = points.map((p) => p.instance.profile[metric][k]).filter((v): v is number => v !== null && v !== undefined);
    if (!vs.length) return null;
    const m = mean(vs);
    return metric === 'speed' || metric === 'effortPace' ? 1000 / m : m;
  });
}

/** The result as CSV (spec F15). */
export function abCsv(r: AbResult, definition: string): string {
  const f = (x: number | null | undefined) => (x === null || x === undefined ? '' : x.toFixed(3));
  const rows = [
    // The runs beside the efforts: the means, the interval and the verdict count each run once.
    ['definition', 'metric', 'values', 'group_a', 'n_a', 'runs_a', 'mean_a', 'group_b', 'n_b', 'runs_b', 'mean_b', 'difference', 'raw_difference', 'ci_low', 'ci_high', 'noise', 'verdict', 'warnings'],
    [definition, r.metric, r.corrected ? 'corrected' : 'raw', r.a.label, r.a.points.length, r.a.runs, f(r.a.mean), r.b.label, r.b.points.length, r.b.runs, f(r.b.mean), f(r.difference), f(r.rawDifference), f(r.ci?.[0]), f(r.ci?.[1]), f(r.noise), r.verdict ?? 'no verdict', r.warnings.join(' ')],
  ];
  return rows.map((row) => row.map(cell).join(',')).join('\n') + '\n';
}

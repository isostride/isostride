import { fitWithCovariate, mean, sd, linearFit } from '@/lib/stats';
import { reasonText, type BlockInstance, type BlockMetric } from '@/lib/blocks';
import { msg, t } from '@/lib/i18n';
import { isPace, metricInfo, secondsPerKm, type MetricInfo } from '@/lib/kernel';

/** A metric's name, from the catalog of metrics (ADR "Metrics from the file"), in the language in use. */
export const metricLabel = (metric: BlockMetric, catalog?: readonly MetricInfo[] | null): string => t(metricInfo(metric, catalog).name);


/** Context fields a trend can be filtered by and an A/B comparison split by (labels shown through t()). */
export const CONTEXT_FIELDS = {
  shoes: { label: msg('Shoes'), get: (i: BlockInstance) => i.context.run.shoes },
  heartRateSource: { label: msg('Heart rate sensor'), get: (i: BlockInstance) => i.context.run.heartRateSource },
  device: { label: msg('Watch'), get: (i: BlockInstance) => i.context.run.device },
  workoutType: { label: msg('Workout type'), get: (i: BlockInstance) => i.context.run.workoutType },
  techniqueCue: { label: msg('Technique cue'), get: (i: BlockInstance) => i.context.run.techniqueCue },
} as const;
export type ContextField = keyof typeof CONTEXT_FIELDS;

export { contextValue } from '@/lib/blocks';
export type ContextFilter = Partial<Record<ContextField, string | null>>;

/** The value an instance has for a metric: pace in s/km for speed, else the mean. */
export function valueOf(i: BlockInstance, metric: BlockMetric): number | null {
  const v = i.metrics[metric];
  // A metric an older algorithm did not compute (missing from the file) is no value either.
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return isPace(metric) ? secondsPerKm(v) : v;
}

/** The device behind a metric: a new device starts a new series (spec section 3, provenance). */
export function sourceOf(i: BlockInstance, metric: BlockMetric): string {
  return metric === 'heartRate' ? i.context.run.heartRateSource : i.context.run.device;
}

export interface Rejected {
  instance: BlockInstance;
  reasons: string[];
}

export interface Selection {
  included: BlockInstance[];
  rejected: Rejected[];
}

/**
 * The instances of one definition that go into a result for one metric, and the
 * ones that do not with every reason: failed matching, a block too short or too
 * early for the metric, a context filter, or a fragment already counted (nesting).
 */
export function selectInstances(all: BlockInstance[], definitionId: string, metric: BlockMetric, filter: ContextFilter = {}): Selection {
  const included: BlockInstance[] = [];
  const rejected: Rejected[] = [];
  const mine = all.filter((i) => i.definitionId === definitionId).sort((a, b) => a.runStart.localeCompare(b.runStart) || a.start - b.start);
  for (const i of mine) {
    const reasons = [...i.reasons];
    if (valueOf(i, metric) === null) reasons.push(t('{metric}: not recorded', { metric: metricLabel(metric).toLowerCase() }));
    for (const [field, want] of Object.entries(filter) as [ContextField, string | null | undefined][]) {
      if (want === undefined) continue;
      const have = CONTEXT_FIELDS[field].get(i);
      if (have !== want) reasons.push(t('filtered out: {field} is {value}', { field: t(CONTEXT_FIELDS[field].label).toLowerCase(), value: have ?? t('not set') }));
    }
    // Nesting: one fragment of a run enters a result once.
    const overlap = included.find((o) => o.runId === i.runId && i.start < o.end && o.start < i.end);
    if (!reasons.length && overlap) reasons.push(t('overlaps an included effort of the same run (min {from}–{to})', { from: Math.floor(overlap.start / 60), to: Math.ceil(overlap.end / 60) }));
    if (reasons.length) rejected.push({ instance: i, reasons });
    else included.push(i);
  }
  return { included, rejected };
}

export interface Corrected {
  instance: BlockInstance;
  raw: number;
  corrected: number;
}

/**
 * What a correction for pace leaves to compare: the effect of what is compared (the difference B − A of
 * the groups, or the change per day of a trend) at one pace, its standard error and degrees of freedom,
 * and the spread of the runs about the fit (lib/stats, fitWithCovariate).
 */
export interface PaceFit {
  effect: number;
  se: number;
  df: number;
  residual: number;
}

/**
 * Corrects the metric for the residual pace difference left after strict matching (spec section 5):
 * each value moved to the mean pace by the slope of the metric on pace. A pace (pace, effort pace:
 * isPace of the kernel) is not corrected. Too few runs, or a slope the data do not settle: raw values,
 * and no fit.
 *
 * The slope must not hold what is being compared, and what it costs to estimate belongs in the interval
 * of what is compared (the reviews of 26 Nov 2026). So the metric is fitted on what is compared and on
 * pace together, the run the unit (each run once: the means of its efforts):
 * - with `groupOf` (A/B), the group and the pace: the slope inside the groups (over both together a
 *   difference between them that goes with a difference of pace became "the effect of pace" and was
 *   taken away: +5 bpm read as +0.4);
 * - with `overTime` (a trend), the day and the pace: over months the pace itself improves, and a slope
 *   on pace alone took the trend away with it. When pace and time cannot be told apart, nothing is corrected.
 * `fit` is that fit's answer for what is compared; the corrected values are for showing (their runs'
 * means lie about the same line, or differ by the same difference).
 */
export function correctForPace(instances: BlockInstance[], metric: BlockMetric, by: { groupOf?: (i: BlockInstance) => string | null; overTime?: boolean } = {}): { points: Corrected[]; fit: PaceFit | null } {
  const rows = instances.map((i) => ({ instance: i, raw: valueOf(i, metric)!, pace: i.context.block.pace }));
  const raw = () => ({ points: rows.map((r) => ({ instance: r.instance, raw: r.raw, corrected: r.raw })), fit: null });
  if (isPace(metric) || rows.length < 3) return raw();
  const byRun = new Map<string, typeof rows>();
  for (const r of rows) byRun.set(r.instance.runId, [...(byRun.get(r.instance.runId) ?? []), r]);
  const runs = [...byRun.values()].map((g) => ({ of: g[0].instance, raw: mean(g.map((r) => r.raw)), pace: mean(g.map((r) => r.pace)) }));
  let slope: number;
  let fit: PaceFit | null = null;
  if (by.groupOf || by.overTime) {
    const t0 = Math.min(...runs.map((r) => Date.parse(r.of.runStart)));
    // A group as 0 or 1 (the first group met is 0: A/B gives its instances in A's and B's order of time, and names them itself).
    const groups = by.groupOf ? [...new Set(runs.map((r) => by.groupOf!(r.of) ?? ''))].sort() : [];
    if (by.groupOf && groups.length !== 2) return raw();
    const x = runs.map((r) => (by.groupOf ? groups.indexOf(by.groupOf(r.of) ?? '') : (Date.parse(r.of.runStart) - t0) / 86_400_000));
    const f = fitWithCovariate(runs.map((r) => r.raw), x, runs.map((r) => r.pace));
    if (!f) return raw();
    slope = f.covariate;
    fit = { effect: f.effect, se: f.se, df: f.df, residual: f.residual };
  } else {
    slope = linearFit(runs.map((r) => r.pace), runs.map((r) => r.raw)).slope;
  }
  if (!Number.isFinite(slope)) return raw();
  const mp = mean(runs.map((r) => r.pace));
  return { points: rows.map((r) => ({ instance: r.instance, raw: r.raw, corrected: r.raw - slope * (r.pace - mp) })), fit };
}

/** The noise threshold: the standard deviation of the metric between instances in the same context (spec section 5). */
export function noiseThreshold(values: number[]): number {
  return sd(values);
}

/**
 * The metric a screen opens on: the first in `order` with at least `enough` instances included
 * (enough for a verdict), else the first with any, else the first; so a block whose heart rate
 * is rarely usable (too short, too early, a long stop) opens on a metric that shows a result.
 */
export function firstUsableMetric(all: BlockInstance[], definitionId: string, order: BlockMetric[], enough = 5): BlockMetric {
  const n = new Map(order.map((m) => [m, selectInstances(all, definitionId, m).included.length]));
  return order.find((m) => n.get(m)! >= enough) ?? order.find((m) => n.get(m)! > 0) ?? order[0];
}

/** The most common reasons instances were left out, e.g. "pace (12)"; the condition's name only, in the language in use. */
export function reasonSummary(rejected: Rejected[], top = 3): string[] {
  const count = new Map<string, number>();
  // The matching's reasons (kept in English) read in the language in use, then named by their condition.
  for (const r of rejected) for (const reason of new Set(r.reasons.map((x) => reasonText(x).split(':')[0]))) count.set(reason, (count.get(reason) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, n]) => `${k} (${n})`);
}

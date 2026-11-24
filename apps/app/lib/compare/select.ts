import { mean, sd, linearFit } from '@/lib/stats';
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

/** A context value as shown: the watch's own heart rate sensor, "wrist (COROS PACE 4)", in the language in use; any other (a name) as it is. */
export function contextValue(v: string): string {
  const wrist = /^wrist \((.*)\)$/.exec(v);
  return wrist ? t('wrist ({device})', { device: wrist[1] }) : v;
}
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
 * Corrects the metric for the residual pace difference left after strict matching
 * (spec section 5): regresses the metric on pace across the instances and moves each
 * value to the mean pace. Pace itself is not corrected. Too few instances: raw values.
 */
export function correctForPace(instances: BlockInstance[], metric: BlockMetric): Corrected[] {
  const rows = instances.map((i) => ({ instance: i, raw: valueOf(i, metric)!, pace: i.context.block.pace }));
  if (metric === 'speed' || rows.length < 3) return rows.map((r) => ({ instance: r.instance, raw: r.raw, corrected: r.raw }));
  const fit = linearFit(rows.map((r) => r.pace), rows.map((r) => r.raw));
  const mp = mean(rows.map((r) => r.pace));
  return rows.map((r) => ({ instance: r.instance, raw: r.raw, corrected: r.raw - fit.slope * (r.pace - mp) }));
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

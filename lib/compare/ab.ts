import { bootstrapDiff, mean, sd } from '@/lib/stats';
import type { BlockInstance, BlockMetric } from '@/lib/blocks';
import { CONTEXT_FIELDS, correctForPace, selectInstances, sourceOf, type ContextField, type ContextFilter, type Rejected } from './select';
import { hash, type Verdict } from './trend';

/** An A/B comparison needs this many instances on each side before it gets a verdict (spec section 5). */
export const MIN_AB_INSTANCES = 4;

export interface AbPoint {
  instance: BlockInstance;
  raw: number;
  corrected: number;
}

export interface AbGroup {
  label: string;
  points: AbPoint[];
  mean: number | null;
}

export interface AbResult {
  definitionId: string;
  metric: BlockMetric;
  corrected: boolean;
  a: AbGroup;
  b: AbGroup;
  /** mean(B) − mean(A) on the values compared (raw or corrected) */
  difference: number | null;
  rawDifference: number | null;
  ci: [number, number] | null;
  /** pooled within-group standard deviation: the spread between instances in the same context */
  noise: number | null;
  /** null below MIN_AB_INSTANCES on a side */
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
 * means, its bootstrap 95 % interval and a verdict against the noise threshold:
 * "change" when the interval excludes zero and the difference exceeds the noise.
 * Warns when the groups do not interleave in time (confounding with the fitness
 * trend) and when they mix devices for the metric.
 */
export function computeAb(
  all: BlockInstance[],
  definitionId: string,
  metric: BlockMetric,
  groupOf: GroupOf,
  labels: [string, string] = ['A', 'B'],
  filter: ContextFilter = {},
  corrected = true,
  seed = hash(definitionId + metric + labels.join('|')),
): AbResult {
  const sel = selectInstances(all, definitionId, metric, filter);
  const rejected = [...sel.rejected];
  const grouped: BlockInstance[] = [];
  for (const i of sel.included) {
    if (groupOf(i)) grouped.push(i);
    else rejected.push({ instance: i, reasons: [`in neither group (${labels[0]} or ${labels[1]})`] });
  }
  const corr = correctForPace(grouped, metric);
  const a = corr.filter((c) => groupOf(c.instance) === 'A');
  const b = corr.filter((c) => groupOf(c.instance) === 'B');
  const val = (p: AbPoint) => (corrected ? p.corrected : p.raw);
  const va = a.map(val);
  const vb = b.map(val);
  const ma = va.length ? mean(va) : null;
  const mb = vb.length ? mean(vb) : null;

  const warnings: string[] = [];
  const result: AbResult = {
    definitionId, metric, corrected,
    a: { label: labels[0], points: a, mean: ma },
    b: { label: labels[1], points: b, mean: mb },
    difference: ma !== null && mb !== null ? mb - ma : null,
    rawDifference: a.length && b.length ? mean(b.map((p) => p.raw)) - mean(a.map((p) => p.raw)) : null,
    ci: null, noise: null, verdict: null, warnings, rejected,
  };
  if (!a.length || !b.length) return result;

  if (!interleaved(a.map((p) => p.instance.runStart), b.map((p) => p.instance.runStart))) {
    warnings.push(`${labels[0]} and ${labels[1]} do not interleave in time, so the difference may be the fitness trend. Rotate between them for a few weeks.`);
  }
  // Mixing devices inside a group confounds; groups that are each one device (a split by device) do not.
  const sources = new Set(grouped.map((i) => sourceOf(i, metric)));
  const mixed = [a, b].some((g) => new Set(g.map((p) => sourceOf(p.instance, metric))).size > 1);
  if (mixed) warnings.push(`The groups mix devices (${[...sources].join(', ')}); filter by one to compare like with like.`);

  const pooled = Math.sqrt(((a.length - 1) * sd(va) ** 2 + (b.length - 1) * sd(vb) ** 2) / Math.max(1, a.length + b.length - 2));
  result.noise = pooled;
  result.ci = bootstrapDiff(va, vb, seed);
  if (a.length >= MIN_AB_INSTANCES && b.length >= MIN_AB_INSTANCES) {
    const [lo, hi] = result.ci;
    result.verdict = (lo > 0 || hi < 0) && Math.abs(result.difference!) > pooled ? 'change' : 'no detectable change';
  }
  return result;
}

/** False when one group is entirely before the other (at most one switch between them in time). */
export function interleaved(a: string[], b: string[]): boolean {
  const seq = [...a.map((d) => [d, 'A'] as const), ...b.map((d) => [d, 'B'] as const)].sort((x, y) => x[0].localeCompare(y[0]));
  let switches = 0;
  for (let k = 1; k < seq.length; k++) if (seq[k][1] !== seq[k - 1][1]) switches++;
  return switches > 1;
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
    ['definition', 'metric', 'values', 'group_a', 'n_a', 'mean_a', 'group_b', 'n_b', 'mean_b', 'difference', 'raw_difference', 'ci_low', 'ci_high', 'noise', 'verdict', 'warnings'],
    [definition, r.metric, r.corrected ? 'corrected' : 'raw', r.a.label, r.a.points.length, f(r.a.mean), r.b.label, r.b.points.length, f(r.b.mean), f(r.difference), f(r.rawDifference), f(r.ci?.[0]), f(r.ci?.[1]), f(r.noise), r.verdict ?? 'no verdict', r.warnings.join(' ')],
  ];
  return rows.map((row) => row.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n') + '\n';
}

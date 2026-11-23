import { efficiencyOf, type BlockInstance, type BlockMetric } from '@/lib/blocks';
import { metricSeries, type RunFile } from '@/lib/kernel';
import { computeTrend } from './trend';

/**
 * The Analysis screen's data (requirement "Analysis workspace"): blocks and runs compared on
 * the same Over time charts, one per metric. Pace metrics are in s/km, like everywhere in compare.
 */

const isPace = (m: BlockMetric) => m === 'speed' || m === 'effortPace';
const STOPPED_SPEED = 0.5;

/** A run's average of one metric over its moving samples (pace from the mean moving speed). */
export function runMean(run: RunFile, metric: BlockMetric): number | null {
  // Efficiency: the run's mean moving speed per mean heart rate, over the samples that have both.
  if (metric === 'efficiency') {
    const s = run.samples;
    let sp = 0;
    let hr = 0;
    let n = 0;
    for (let i = 0; i < s.t.length; i++) {
      const v = (s.values.speed?.[i] ?? null);
      const h = (s.values.heartRate?.[i] ?? null);
      if (v !== null && h !== null && v >= STOPPED_SPEED) { sp += v; hr += h; n++; }
    }
    return n ? efficiencyOf(sp / n, hr / n) : null;
  }
  const s = run.samples;
  const series = metricSeries(s, metric);
  const vals: number[] = [];
  for (let i = 0; i < s.t.length; i++) {
    const v = series[i];
    const sp = (s.values.speed?.[i] ?? null);
    if (v !== null && (sp === null || sp >= STOPPED_SPEED)) vals.push(v);
  }
  if (!vals.length) return null;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return isPace(metric) ? (m > 0 ? 1000 / m : null) : m;
}

/** An item of the Analysis screen: a block or a run, with its colour slot (kept while others come and go). */
export interface AnalysisItem {
  /** a kept block (its id), a run (its id), or a rule that lives in the link (its id is the rule's code) */
  kind: 'block' | 'run' | 'rule';
  id: string;
  slot: number;
}

export const MAX_ITEMS = 4;

const KINDS = { b: 'block', r: 'run', q: 'rule' } as const;

/** Items as the screen's URL keeps them: b:<id>:<slot>,r:<id>:<slot>,q:<rule code>:<slot>. */
export function parseItems(text: string | null): AnalysisItem[] {
  if (!text) return [];
  const out: AnalysisItem[] = [];
  for (const part of text.split(',')) {
    const [k, id, slot] = part.split(':');
    const kind = KINDS[k as keyof typeof KINDS];
    if (kind && id && !out.some((o) => o.id === id)) out.push({ kind, id, slot: Number(slot) || 0 });
  }
  return out.slice(0, MAX_ITEMS);
}

export function formatItems(items: AnalysisItem[]): string {
  return items.map((i) => `${i.kind === 'block' ? 'b' : i.kind === 'run' ? 'r' : 'q'}:${i.id}:${i.slot}`).join(',');
}

/** Adds an item in the lowest free colour slot; at most MAX_ITEMS, no duplicates. */
export function addItem(items: AnalysisItem[], kind: AnalysisItem['kind'], id: string): AnalysisItem[] {
  if (items.length >= MAX_ITEMS || items.some((i) => i.id === id)) return items;
  const used = new Set(items.map((i) => i.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  return [...items, { kind, id, slot }];
}

export interface MetricChange {
  metric: BlockMetric;
  /** instances in the series the change is read from (the device with the most) */
  n: number;
  change: number | null;
  /** the fitted value at the first instance (the base of a percentage) */
  start: number | null;
  noise: number | null;
  verdict: 'change' | 'no detectable change' | null;
}

/** One block's change for each metric: the fitted change of its largest series and the verdict. */
export function changesByMetric(all: BlockInstance[], definitionId: string, metrics: BlockMetric[], corrected = true): MetricChange[] {
  return metrics.map((metric) => {
    const t = computeTrend(all, definitionId, metric, {}, corrected);
    const s = [...t.series].sort((a, b) => b.points.length - a.points.length)[0];
    if (!s) return { metric, n: 0, change: null, start: null, noise: null, verdict: null };
    return { metric, n: s.points.length, change: s.fit?.change ?? null, start: s.fit?.intercept ?? null, noise: s.noise, verdict: s.fit?.verdict ?? null };
  });
}

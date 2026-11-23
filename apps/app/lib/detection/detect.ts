import type { TrackPoint } from '@/lib/geo';
import { isPace, type IndexedRun, type RunFile } from '@/lib/kernel';
import { buildInstance } from './instance';
import { blockMetricsOf, asRule, windowStat, type BlockDefinition, type BlockInstance, type Stat } from '@/lib/blocks';
import { ruleSegments } from './rule';

/** Detects the instances of one block definition in one run (spec F10). */
export function detectInstances(def: BlockDefinition, run: RunFile, row: IndexedRun, track: TrackPoint[]): BlockInstance[] {
  // One model: every block is a rule (an older kind read as one); its segments, each read by its statistic.
  const rule = asRule(def.params, def.tolerances);
  const segs = ruleSegments(rule, run, row, { track: rule.shape.type === 'route' ? track : undefined, tolerances: def.tolerances });
  return segs.map((s) => withStat(buildInstance(def, run, row, s.from, s.to, { lap: s.lap ?? null, ...(s.heading === undefined ? {} : { heading: s.heading }) }), run, rule.stat));
}

/**
 * An instance read by a statistic other than the average: each metric from the 10 s windows with
 * movement inside it (the median, the minimum or the maximum); pace statistics are of the pace,
 * so the minimum is the fastest window.
 */
function withStat(i: BlockInstance, run: RunFile, stat: Stat): BlockInstance {
  if (stat === 'avg') return i;
  const metrics = { ...i.metrics };
  for (const m of blockMetricsOf(run.metrics.map((x) => x.key))) {
    const v = windowStat(run, m, stat, i.start, i.end);
    metrics[m] = v === null ? null : isPace(m) ? Math.round((1000 / v) * 1000) / 1000 : Math.round(v * 10000) / 10000;
  }
  return { ...i, metrics };
}


'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OverTimeChart, useMetrics, SLOT_COLORS, SLOT_SHAPES, type OverTimeGroup } from '@/components';
import { RULE_TOLERANCES, decodeRule, readDefinitions, ruleName, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type BlockMetric } from '@/lib/blocks';
import { instancesInWorker, useOpenFolder } from '@/lib/client';
import { computeTrend, parseItems, runMean, type AnalysisItem } from '@/lib/compare';
import { PATHS, readJson, readRunFile } from '@/lib/fs';
import type { RunFile, RunsIndex } from '@/lib/kernel';
import { runHref } from './links';
import { runName } from './names';

const DAY = 86_400_000;

/**
 * Compare's Over time chart for an analysis, as a widget of the Dashboard (the runner's "Pin na
 * kazdej karcie-widgecie": there as on its screen): each segment's efforts with its trend line,
 * each run's average, for each metric of the analysis. Kept segments read their efforts from the
 * data folder, a rule of the link is computed in the worker; an unsaved segment is not kept, so it
 * is left out with a word saying so.
 */
export function CompareWidget({ query }: { query: string }) {
  const { folder, handle } = useOpenFolder();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const items = useMemo(() => parseItems(params.get('items')), [params]);
  const known = useMetrics();
  const metrics = useMemo(() => {
    const given = (params.get('m') ?? '').split(',');
    const out = known.blockKeys.filter((k) => given.includes(k));
    return out.length ? out : (['speed'] as BlockMetric[]);
  }, [params, known]);
  const [data, setData] = useState<{ defs: BlockDefinition[]; kept: BlockInstance[]; runs: RunsIndex['runs']; files: Map<string, RunFile> } | null>(null);
  const [adhoc, setAdhoc] = useState<Map<string, BlockInstance[]>>(new Map());

  useEffect(() => {
    let live = true;
    (async () => {
      const [defs, inst, index] = await Promise.all([readDefinitions(folder), readJson<BlockInstancesFile>(folder, PATHS.blockInstances), readJson<RunsIndex>(folder, PATHS.runsIndex)]);
      const files = new Map<string, RunFile>();
      for (const i of items.filter((x) => x.kind === 'run')) { const f = await readRunFile(folder, i.id); if (f) files.set(i.id, f); }
      if (live) setData({ defs, kept: inst?.instances ?? [], runs: index?.runs ?? [], files });
    })().catch(() => undefined);
    return () => { live = false; };
  }, [folder, items]);

  // A rule the link carries: its efforts computed in the worker, once.
  const rules = useMemo(() => items.flatMap((i) => {
    if (i.kind !== 'rule') return [];
    const rule = decodeRule(i.id);
    return rule ? [{ code: i.id, def: { id: `q:${i.id}`, name: ruleName(rule), origin: 'manual', status: 'active', createdAt: '', params: { type: 'rule', ...rule }, tolerances: { ...RULE_TOLERANCES } } as BlockDefinition }] : [];
  }), [items]);
  useEffect(() => {
    if (!rules.length) return;
    const controller = new AbortController();
    let live = true;
    instancesInWorker(rules.map((r) => r.def), handle, undefined, controller.signal)
      .then((got) => live && setAdhoc(new Map(rules.map((r) => [r.code, got[r.def.id] ?? []]))))
      .catch(() => undefined);
    return () => { live = false; controller.abort(); };
  }, [rules, handle]);

  if (!data) return <p className="muted small" role="status">Reading the analysis…</p>;
  const all = [...data.kept, ...[...adhoc.values()].flat()];
  const defOf = (i: AnalysisItem) => (i.kind === 'block' ? data.defs.find((d) => d.id === i.id) ?? null : i.kind === 'rule' ? rules.find((r) => r.code === i.id)?.def ?? null : null);
  const label = (i: AnalysisItem) => {
    if (i.kind !== 'run') return defOf(i)?.name ?? 'An unsaved segment';
    const r = data.runs.find((x) => x.id === i.id);
    return r ? `Run ${runName(r.startTime, r.distance, r.title)}` : 'run';
  };
  const groupsFor = (metric: BlockMetric): OverTimeGroup[] => items.flatMap((i): OverTimeGroup[] => {
    const base = { key: i.id, label: label(i), color: SLOT_COLORS[i.slot % SLOT_COLORS.length], shape: SLOT_SHAPES[i.slot % SLOT_SHAPES.length] };
    if (i.kind !== 'run') {
      const def = defOf(i);
      if (!def) return [];
      const t = computeTrend(all, def.id, metric, {}, false);
      return [{
        ...base,
        points: t.series.flatMap((s) => s.points.map((p) => ({ t: Date.parse(p.date), v: p.raw, instance: p.instance, note: `minute ${p.instance.context.before.minuteOfRun} of the run`, href: runHref(p.instance.runId, p.instance.start, p.instance.end) }))),
        fits: t.series.flatMap((s) => {
          if (!s.fit) return [];
          const t0 = Date.parse(s.points[0].date);
          const t1 = Date.parse(s.points[s.points.length - 1].date);
          return [{ t0, t1, v0: s.fit.intercept, v1: s.fit.intercept + s.fit.slope * ((t1 - t0) / DAY), noise: s.noise }];
        }),
      }];
    }
    const f = data.files.get(i.id);
    const v = f ? runMean(f, metric) : null;
    return f && v !== null ? [{ ...base, points: [{ t: Date.parse(f.startTime), v, note: 'average of the run', href: runHref(f.id) }], fits: [] }] : [];
  });
  const byMetric = metrics.map((mt) => ({ mt, view: known.view(mt), groups: groupsFor(mt) }));
  const allT = byMetric.flatMap((g) => g.groups.flatMap((x) => x.points.map((p) => p.t)));
  const domain: [number, number] | undefined = allT.length ? [Math.min(...allT) - 4 * DAY, Math.max(...allT) + 4 * DAY] : undefined;
  const missing = items.filter((i) => i.kind !== 'run' && !defOf(i)).length;
  return (
    <div className="dash-compare">
      {byMetric.map(({ mt, view, groups }, k) => (
        <div key={mt} className="stacked">
          <div className="metric-head"><span className="metric-title">{view.short}</span></div>
          <OverTimeChart title={view.name} groups={groups} format={view.fmt} tick={view.tick} minSpan={view.minSpan} invert={view.invert} markers={[]} domain={domain} labels={k === 0} height={metrics.length > 1 ? 160 : 220} />
        </div>
      ))}
      {missing > 0 && <p className="muted small">{missing === 1 ? 'An unsaved segment is' : `${missing} unsaved segments are`} not kept: save it in Compare to see it here.</p>}
      <Link className="row-open" href={`/compare?${query}`}>Open in Compare →</Link>
    </div>
  );
}

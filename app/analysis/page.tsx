'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ItemKey, METRIC_VIEW, OverTimeChart, SLOT_COLORS, SLOT_SHAPES, type Marker, type OverTimeGroup } from '@/components';
import { useOpenFolder } from '@/lib/client';
import { readDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type BlockMetric } from '@/lib/blocks';
import { MAX_ITEMS, addItem, changesByMetric, computeTrend, describeDelta, describeTrend, formatAmount, percentChange, firstUsableMetric, formatItems, instancesCsv, parseItems, runMean, type AnalysisItem } from '@/lib/compare';
import { PATHS, isOutdated, readJson, readManifest } from '@/lib/fs';
import { readGear, type Gear } from '@/lib/gear';
import type { RunFile, RunsIndex } from '@/lib/kernel';

const DAY = 86_400_000;
const METRICS = METRIC_VIEW;
const runName = (start: string, distance: number) =>
  `${new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${(distance / 1000).toFixed(1)} km`;

export default function AnalysisPageWrapper() {
  return <Suspense><AnalysisPage /></Suspense>;
}

/**
 * Analysis (requirement "Analysis workspace"): blocks and runs added by the runner, compared
 * for one metric on two shared charts, Over time and Inside, with each block's verdict in words.
 */
function AnalysisPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { folder } = useOpenFolder();
  const [loaded, setLoaded] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [defs, setDefs] = useState<BlockDefinition[]>([]);
  const [all, setAll] = useState<BlockInstance[]>([]);
  const [runs, setRuns] = useState<RunsIndex['runs']>([]);
  const [gear, setGear] = useState<Gear[]>([]);
  const [files, setFiles] = useState<Map<string, RunFile>>(new Map());
  const [joinPoints, setJoin] = useState(true);
  const [trendLine, setTrend] = useState(true);
  const [corrected, setCorrected] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      setDefs((await readDefinitions(folder)).filter((d) => d.status === 'active'));
      setAll((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
      setRuns((await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? []);
      setGear(await readGear(folder));
      setOutdated(isOutdated(await readManifest(folder)));
      setLoaded(true);
    })();
  }, [folder]);

  // The items live in the URL; with none given, the first block opens (as the Trend screen did).
  const items: AnalysisItem[] = useMemo(() => {
    const given = parseItems(params.get('items'));
    if (given.length || params.has('items')) return given.filter((i) => (i.kind === 'block' ? defs.some((d) => d.id === i.id) : runs.some((r) => r.id === i.id)));
    const def = params.get('def') ?? defs[0]?.id;
    return def ? [{ kind: 'block' as const, id: def, slot: 0 }] : [];
  }, [params, defs, runs]);
  const setItems = (next: AnalysisItem[]) => {
    const q = new URLSearchParams(params.toString());
    q.set('items', formatItems(next));
    router.replace(`/analysis?${q.toString()}`);
  };

  // Run files only for the runs added: blocks alone read the index files.
  useEffect(() => {
    const need = items.filter((i) => i.kind === 'run' && !files.has(i.id));
    if (!need.length) return;
    (async () => {
      const next = new Map(files);
      for (const i of need) { const f = await readJson<RunFile>(folder, PATHS.runFile(i.id)); if (f) next.set(i.id, f); }
      setFiles(next);
    })();
  }, [items, files, folder]);

  const blockItems = items.filter((i) => i.kind === 'block');
  // The metrics chosen live in the URL too (m=speed,heartRate); none given: the first with a result.
  const metrics: BlockMetric[] = useMemo(() => {
    const given = (params.get('m') ?? '').split(',').filter((k): k is BlockMetric => METRICS.some((x) => x.key === k));
    if (given.length) return METRICS.map((x) => x.key).filter((k) => given.includes(k));
    return [blockItems.length ? firstUsableMetric(all, blockItems[0].id, METRICS.map((x) => x.key)) : 'speed'];
  }, [params, all, blockItems]);
  const toggleMetric = (k: BlockMetric) => {
    const next = metrics.includes(k) ? metrics.filter((x) => x !== k) : METRICS.map((x) => x.key).filter((x) => x === k || metrics.includes(x));
    if (!next.length) return;
    const q = new URLSearchParams(params.toString());
    q.set('m', next.join(','));
    router.replace(`/analysis?${q.toString()}`);
  };
  const color = (i: AnalysisItem) => SLOT_COLORS[i.slot % SLOT_COLORS.length];
  const shape = (i: AnalysisItem) => SLOT_SHAPES[i.slot % SLOT_SHAPES.length];
  const label = (i: AnalysisItem) => {
    if (i.kind === 'block') return defs.find((d) => d.id === i.id)?.name ?? 'block';
    const r = runs.find((x) => x.id === i.id);
    return r ? `Run ${runName(r.startTime, r.distance)}` : 'run';
  };

  /** Each metric's trends of the blocks added. */
  const trendsBy = useMemo(() => new Map(metrics.map((mt) => [mt, new Map(blockItems.map((i) => [i.id, computeTrend(all, i.id, mt, {}, corrected)]))])), [all, blockItems, metrics, corrected]);

  const groupsFor = (metric: BlockMetric): OverTimeGroup[] => items.flatMap((i): OverTimeGroup[] => {
    const trends = trendsBy.get(metric)!;
    if (i.kind === 'block') {
      const t = trends.get(i.id)!;
      return [{
        key: i.id, label: label(i), color: color(i), shape: shape(i),
        points: t.series.flatMap((s) => s.points.map((p) => ({ t: Date.parse(p.date), v: corrected ? p.corrected : p.raw, instance: p.instance, note: `minute ${p.instance.context.before.minuteOfRun} of the run` }))),
        fits: t.series.flatMap((s) => {
          if (!s.fit) return [];
          const t0 = Date.parse(s.points[0].date);
          const t1 = Date.parse(s.points[s.points.length - 1].date);
          return [{ t0, t1, v0: s.fit.intercept, v1: s.fit.intercept + s.fit.slope * ((t1 - t0) / DAY), noise: s.noise }];
        }),
      }];
    }
    const f = files.get(i.id);
    const v = f ? runMean(f, metric) : null;
    return f && v !== null ? [{ key: i.id, label: label(i), color: color(i), shape: shape(i), points: [{ t: Date.parse(f.startTime), v, note: 'average of the run' }], fits: [] }] : [];
  });


  // One time range for every Over time chart, one x range for every Inside chart.
  const groupsByMetric = metrics.map((mt) => ({ mt, groups: groupsFor(mt) }));
  const allT = groupsByMetric.flatMap((g) => g.groups.flatMap((x) => x.points.map((p) => p.t)));
  const domain: [number, number] | undefined = allT.length ? [Math.min(...allT) - 4 * DAY, Math.max(...allT) + 4 * DAY] : undefined;
  const view = (mt: BlockMetric) => METRICS.find((x) => x.key === mt)!;

  const markers: Marker[] = useMemo(() => gear.map((g) => ({ date: `${g.from}T00:00:00`, label: `${g.type === 'shoes' ? '👟' : '♥'} ${g.name}` })), [gear]);

  const exportCsv = () => {
    const names = new Map(defs.map((d) => [d.id, d.name]));
    const mine = all.filter((i) => blockItems.some((b) => b.id === i.definitionId));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([instancesCsv(mine, names)], { type: 'text/csv' }));
    a.download = 'analysis-instances.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!loaded) return <div className="page"><div className="page-head"><h1>Analysis</h1></div></div>;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Analysis</h1>
        <span className="spacer" />
        {blockItems.length > 0 && <button className="btn" onClick={exportCsv}>Export CSV</button>}
      </div>

      {outdated && (
        <div className="banner warn">
          These results were computed by an older version of the app, so some metrics (such as efficiency) are missing. <Link href="/">Recompute on the Runs screen</Link> to bring them up to date.
        </div>
      )}

      <div className="items-bar">
        {items.map((i) => (
          <span key={i.id} className="item-chip">
            <ItemKey shape={shape(i)} color={color(i)} />
            <span>{label(i)}</span>
            <button className="item-remove" aria-label={`Remove ${label(i)}`} onClick={() => setItems(items.filter((x) => x.id !== i.id))}>×</button>
          </span>
        ))}
        <button className="btn" disabled={items.length >= MAX_ITEMS} onClick={() => setAdding(true)}>+ Add block or run</button>
        {items.length >= MAX_ITEMS && <span className="muted small">Up to {MAX_ITEMS} at once.</span>}
      </div>

      <div className="toolbar">
        <div className="metric-picker" role="group" aria-label="Metrics">
          {METRICS.map((x) => <button key={x.key} className={`pill ${metrics.includes(x.key) ? 'on' : ''}`} aria-pressed={metrics.includes(x.key)} title={x.name} onClick={() => toggleMetric(x.key)}>{x.short}</button>)}
        </div>
        <div className="segmented" role="group" aria-label="Block values" title="Corrected: residual pace difference removed by regression">
          <button className={!corrected ? 'on' : ''} onClick={() => setCorrected(false)}>Raw</button>
          <button className={corrected ? 'on' : ''} onClick={() => setCorrected(true)}>Corrected</button>
        </div>
        <label className="setting inline"><input type="checkbox" checked={joinPoints} onChange={(e) => setJoin(e.target.checked)} /> Join points</label>
        <label className="setting inline"><input type="checkbox" checked={trendLine} onChange={(e) => setTrend(e.target.checked)} /> Trend line</label>
      </div>

      {!items.length ? (
        <div className="card empty">Add a block or a run to compare. Blocks show every instance over time; runs show their course.</div>
      ) : (
        <>
          <div className="card chart">
            <h3 className="chart-title">Over time <span className="muted">· each block&apos;s instances and trend line, each run&apos;s average</span></h3>
            {groupsByMetric.map(({ mt, groups }, k) => (
              <div key={mt} className="stacked">
                <div className="metric-head" style={{ paddingLeft: 52 }}><span className="metric-title">{view(mt).short}<span className="muted"> · {view(mt).name.replace(/^.*\((.*)\)$/, '$1')}</span></span></div>
                <OverTimeChart title={view(mt).name} groups={groups} format={view(mt).fmt} tick={view(mt).tick} minSpan={view(mt).minSpan} invert={view(mt).invert} markers={markers}
                  domain={domain} join={joinPoints} fit={trendLine} labels={k === 0} height={metrics.length > 1 ? 210 : 300} />
              </div>
            ))}
            <div className="chart-note">Thin line: the points in date order. Thick line: the fitted trend, its band the noise between a block&apos;s instances (±1 standard deviation).</div>
          </div>

          {blockItems.length > 0 && (
            <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
              <table className="data changes" aria-label="Changes">
                <thead>
                  <tr><th>Block</th>{metrics.map((mt) => <th key={mt}>{view(mt).short}</th>)}</tr>
                </thead>
                <tbody>
                  {blockItems.map((i) => (
                    <tr key={i.id}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={shape(i)} color={color(i)} />{label(i)}</span></td>
                      {changesByMetric(all, i.id, metrics, corrected).map((c) => (
                        <td key={c.metric}>
                          {c.change === null ? (
                            <span className="muted small">{c.n ? `${c.n} instances, too few` : 'no instances'}</span>
                          ) : (
                            <div className="kpi">
                              <div className={`kpi-v ${c.verdict === 'change' ? 'change-yes' : ''}`}>{describeDelta(c.metric, c.change)}{c.start ? <span className="kpi-pct">{percentChange(c.change, c.start)}</span> : null}</div>
                              <div className="kpi-sub muted small"><span className={`verdict-chip ${c.verdict === 'change' ? 'yes' : 'no'}`}>{c.verdict === 'change' ? 'change' : 'no detectable change'}</span> · noise ±{formatAmount(c.metric, c.noise!)} · {c.n} instances</div>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="chart-note" style={{ padding: '0 12px 10px' }}>Each cell: the fitted change from the first to the last instance, whether it is beyond the noise, and the instances it rests on.</div>
            </div>
          )}

          {blockItems.map((i) => (
            <details key={i.id} className="card result" style={{ marginTop: 12 }}>
              <summary><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={shape(i)} color={color(i)} />{label(i)}: the verdicts in words</span></summary>
              {metrics.flatMap((mt) => trendsBy.get(mt)!.get(i.id)!.series.map((s) => {
                const d = describeTrend(s, mt, view(mt).fmt);
                return (
                  <div key={mt + s.source} className="result-row">
                    <div className="muted small">{view(mt).name}{trendsBy.get(mt)!.get(i.id)!.series.length > 1 ? ` · ${s.source}` : ''}</div>
                    <div className={`verdict ${d.change ? 'is-change' : ''}`}>{d.headline}</div>
                    <div className="explain">{d.sentence}</div>
                  </div>
                );
              }))}
            </details>
          ))}

        </>
      )}

      {adding && <AddDialog defs={defs} runs={runs} items={items} onAdd={(kind, id) => { setItems(addItem(items, kind, id)); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** The picker: blocks and runs, searchable; the arrow keys move, Enter adds. */
function AddDialog({ defs, runs, items, onAdd, onClose }: { defs: BlockDefinition[]; runs: RunsIndex['runs']; items: AnalysisItem[]; onAdd: (kind: AnalysisItem['kind'], id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const options = [
    ...defs.filter((d) => !items.some((i) => i.id === d.id) && match(`${d.name} block`)).map((d) => ({ kind: 'block' as const, id: d.id, text: d.name, hint: 'block' })),
    ...[...runs].reverse().filter((r) => !items.some((i) => i.id === r.id))
      .filter((r) => match(`${runName(r.startTime, r.distance)} ${r.workoutType ?? ''} ${r.startTime.slice(0, 10)} run`))
      .map((r) => ({ kind: 'run' as const, id: r.id, text: runName(r.startTime, r.distance), hint: [r.workoutType, `${Math.floor(r.duration / 60)} min`].filter(Boolean).join(' · ') })),
  ].slice(0, 60);
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Add block or run" onClick={(e) => e.stopPropagation()}>
        <input ref={input} value={q} placeholder="Search blocks and runs…" aria-label="Search blocks and runs"
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && options[active]) onAdd(options[active].kind, options[active].id);
            if (e.key === 'Escape') onClose();
          }} />
        <div className="palette-list">
          {options.map((o, k) => (
            <div key={o.id}>
              {(k === 0 || options[k - 1].kind !== o.kind) && <div className="palette-group">{o.kind === 'block' ? 'Blocks' : 'Runs'}</div>}
              <div role="option" aria-selected={k === active} className={`palette-item ${k === active ? 'on' : ''}`} onMouseEnter={() => setActive(k)} onClick={() => onAdd(o.kind, o.id)}>
                <span>{o.text}</span>
                <span className="muted small">{o.hint}</span>
              </div>
            </div>
          ))}
          {!options.length && <div className="muted small" style={{ padding: 12 }}>Nothing found.</div>}
        </div>
      </div>
    </div>
  );
}

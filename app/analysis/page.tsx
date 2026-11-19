'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ItemKey, METRIC_VIEW, OverTimeChart, PaceCurveChart, SLOT_COLORS, SLOT_SHAPES, type CurveLine, type Marker, type OverTimeGroup } from '@/components';
import { CURVE_DURATIONS, CURVE_KEYS, MIN_FIT_POINTS, MIN_FIT_SECONDS, WINDOW_PRESETS, bestKey, bestStretch, bestWindow, describeRunSet, estimateCurve, estimatedPace, metricKeyLabel, metricOf, paceCurve, parseRunSet, runStat, seriesSentence, windowName, type CurveEstimate, type MetricKey, type RunSet, type Series } from '@/lib/ask';
import { runInWorker, seriesInWorker, useOpenFolder } from '@/lib/client';
import { EMPTY_CRITERIA, definitionFromCriteria, readDefinitions, writeDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type BlockMetric } from '@/lib/blocks';
import { MAX_ITEMS, addItem, changesByMetric, computeTrend, describeDelta, describeTrend, formatAmount, percentChange, firstUsableMetric, formatItems, instancesCsv, parseItems, type AnalysisItem, type MetricChange } from '@/lib/compare';
import { PATHS, isOutdated, readJson, readManifest } from '@/lib/fs';
import { date, duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import { readGear, readRunTags, type Gear } from '@/lib/gear';
import type { RunFile, RunsIndex } from '@/lib/kernel';
import { AddDialog, runName } from './AddDialog';

const DAY = 86_400_000;
const METRICS = METRIC_VIEW;
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** How a metric key is shown: a block metric as METRIC_VIEW has it; a fastest stretch as a pace named by its length. */
function viewOf(key: MetricKey) {
  const w = bestWindow(key);
  const base = METRICS.find((x) => x.key === metricOf(key))!;
  return w ? { ...base, key, short: `Fastest ${windowName(w)}`, name: `Fastest ${windowName(w)} (min/km)` } : { ...base, key };
}

export default function AnalysisPageWrapper() {
  return <Suspense><AnalysisPage /></Suspense>;
}

/**
 * Analysis (requirement "Analysis workspace"): blocks, runs and run sets added by the runner,
 * compared for several metrics on stacked Over time charts, with each block's and set's
 * verdict in words and a table of the runs behind a set. The items live in the URL.
 */
function AnalysisPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { folder, handle } = useOpenFolder();
  const [loaded, setLoaded] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [defs, setDefs] = useState<BlockDefinition[]>([]);
  const [all, setAll] = useState<BlockInstance[]>([]);
  const [runs, setRuns] = useState<RunsIndex['runs']>([]);
  const [gear, setGear] = useState<Gear[]>([]);
  const [options, setOptions] = useState({ workoutTypes: [] as string[], shoes: [] as string[] });
  const [files, setFiles] = useState<Map<string, RunFile>>(new Map());
  const [series, setSeries] = useState<Map<string, Series>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [joinPoints, setJoin] = useState(true);
  const [trendLine, setTrend] = useState(true);
  const [corrected, setCorrected] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableItem, setTableItem] = useState<string | null>(null);
  const [tableMetric, setTableMetric] = useState<MetricKey | null>(null);
  const [sort, setSort] = useState<'date' | 'best' | 'worst'>('date');
  const [top, setTop] = useState(10);

  useEffect(() => {
    (async () => {
      setDefs((await readDefinitions(folder)).filter((d) => d.status === 'active'));
      setAll((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
      const rows = (await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? [];
      setRuns(rows);
      const g = await readGear(folder);
      setGear(g);
      const tags = await readRunTags(folder);
      const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
      setOptions({ workoutTypes: uniq([...tags.dictionary.workoutTypes, ...rows.map((r) => r.workoutType)]), shoes: uniq([...g.filter((x) => x.type === 'shoes').map((x) => x.name), ...rows.map((r) => r.shoes)]) });
      setOutdated(isOutdated(await readManifest(folder)));
      setLoaded(true);
    })();
  }, [folder]);

  // The items live in the URL; with none given, the first block opens (as the Trend screen did).
  const items: AnalysisItem[] = useMemo(() => {
    const given = parseItems(params.get('items'));
    if (given.length || params.has('items')) return given.filter((i) => (i.kind === 'block' ? defs.some((d) => d.id === i.id) : i.kind === 'run' ? runs.some((r) => r.id === i.id) : parseRunSet(i.id) !== null));
    const def = params.get('def') ?? defs[0]?.id;
    return def ? [{ kind: 'block' as const, id: def, slot: 0 }] : [];
  }, [params, defs, runs]);
  const setItems = (next: AnalysisItem[]) => {
    const q = new URLSearchParams(params.toString());
    q.set('items', formatItems(next));
    router.replace(`/analysis?${q.toString()}`);
  };

  // Run files only for the runs added: blocks alone read the index files, sets are read in the worker.
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
  const setItemsList = items.filter((i) => i.kind === 'set');
  const setOf = (i: AnalysisItem): RunSet => parseRunSet(i.id)!;
  // The metrics chosen live in the URL too (m=speed,heartRate,best:600s); none given: the first with a result.
  const metrics: MetricKey[] = useMemo(() => {
    const given = (params.get('m') ?? '').split(',').filter((k): k is MetricKey => METRICS.some((x) => x.key === k) || bestWindow(k) !== null);
    if (given.length) return given;
    return [blockItems.length ? firstUsableMetric(all, blockItems[0].id, METRICS.map((x) => x.key)) : 'speed'];
  }, [params, all, blockItems]);
  // The pace curve, switched on in the URL (curve=1): the fastest stretches of every length.
  const curve = params.get('curve') === '1';
  const setCurve = (on: boolean) => {
    const q = new URLSearchParams(params.toString());
    if (on) q.set('curve', '1'); else q.delete('curve');
    router.replace(`/analysis?${q.toString()}`);
  };
  const setMetrics = (next: MetricKey[]) => {
    if (!next.length) return;
    const q = new URLSearchParams(params.toString());
    q.set('m', next.join(','));
    router.replace(`/analysis?${q.toString()}`);
  };
  /** Block metrics in their fixed order first, then the fastest stretches in the order chosen. */
  const toggleMetric = (k: MetricKey) => {
    const chosen = metrics.includes(k) ? metrics.filter((x) => x !== k) : [...metrics, k];
    setMetrics([...METRICS.map((x) => x.key as MetricKey).filter((x) => chosen.includes(x)), ...chosen.filter((x) => bestWindow(x))]);
  };
  const color = (i: AnalysisItem) => SLOT_COLORS[i.slot % SLOT_COLORS.length];
  const shape = (i: AnalysisItem) => SLOT_SHAPES[i.slot % SLOT_SHAPES.length];
  const label = (i: AnalysisItem) => {
    if (i.kind === 'block') return defs.find((d) => d.id === i.id)?.name ?? 'block';
    if (i.kind === 'set') return describeRunSet(setOf(i));
    const r = runs.find((x) => x.id === i.id);
    return r ? `Run ${runName(r.startTime, r.distance, r.title)}` : 'run';
  };

  // The series of each run set for the metrics chosen, computed in the worker once per set and
  // metric; keyed by what is still missing, so a re-render does not restart a computation.
  const wantedKeys = useMemo(() => [...new Set<MetricKey>([...metrics, ...(curve ? CURVE_KEYS : [])])], [metrics, curve]);
  const want = useMemo(() => JSON.stringify(setItemsList.map((i) => [i.id, wantedKeys.filter((k) => !series.has(`${i.id}|${k}`))]).filter((x) => x[1].length)), [items, wantedKeys, series]);
  useEffect(() => {
    const missing = JSON.parse(want) as [string, MetricKey[]][];
    if (!missing.length) return;
    const controller = new AbortController();
    let live = true;
    (async () => {
      setProgress({ done: 0, total: 0 });
      try {
        for (const [id, keys] of missing) {
          const got = await seriesInWorker(parseRunSet(id)!, keys, handle, (p) => live && setProgress({ done: p.done, total: p.total }), controller.signal);
          if (!live) return;
          setSeries((prev) => { const next = new Map(prev); for (const k of keys) next.set(`${id}|${k}`, got[k]); return next; });
        }
      } catch { /* abandoned, or a run could not be read: the chart stays without the set */ }
      finally { if (live) setProgress(null); }
    })();
    return () => { live = false; controller.abort(); };
  }, [want, handle]);

  /** Each block metric's trends of the blocks added. */
  const trendsBy = useMemo(() => new Map(metrics.filter((mt) => !bestWindow(mt)).map((mt) => [mt, new Map(blockItems.map((i) => [i.id, computeTrend(all, i.id, mt as BlockMetric, {}, corrected)]))])), [all, blockItems, metrics, corrected]);

  const groupsFor = (key: MetricKey): OverTimeGroup[] => items.flatMap((i): OverTimeGroup[] => {
    const base = { key: i.id, label: label(i), color: color(i), shape: shape(i) };
    if (i.kind === 'block') {
      const t = trendsBy.get(key)?.get(i.id);
      if (!t) return [];
      return [{
        ...base,
        points: t.series.flatMap((s) => s.points.map((p) => ({ t: Date.parse(p.date), v: corrected ? p.corrected : p.raw, instance: p.instance, note: `minute ${p.instance.context.before.minuteOfRun} of the run` }))),
        fits: t.series.flatMap((s) => {
          if (!s.fit) return [];
          const t0 = Date.parse(s.points[0].date);
          const t1 = Date.parse(s.points[s.points.length - 1].date);
          return [{ t0, t1, v0: s.fit.intercept, v1: s.fit.intercept + s.fit.slope * ((t1 - t0) / DAY), noise: s.noise }];
        }),
      }];
    }
    if (i.kind === 'set') {
      const s = series.get(`${i.id}|${key}`);
      if (!s) return [];
      return [{ ...base, points: s.points.map((p) => ({ t: Date.parse(p.date), v: p.value, note: p.title ?? undefined })), fits: s.fit ? [{ t0: s.fit.t0, t1: s.fit.t1, v0: s.fit.start, v1: s.fit.start + s.fit.change, noise: s.fit.noise }] : [] }];
    }
    const f = files.get(i.id);
    const row = runs.find((r) => r.id === i.id);
    if (!f || !row) return [];
    const w = bestWindow(key);
    const v = w ? bestStretch(f, row, w)?.value ?? null : runStat(f, key as BlockMetric, 'avg');
    return v !== null ? [{ ...base, points: [{ t: Date.parse(f.startTime), v, note: w ? 'fastest stretch of the run' : 'average of the run' }], fits: [] }] : [];
  });

  // One time range for every Over time chart.
  const groupsByMetric = metrics.map((mt) => ({ mt, groups: groupsFor(mt) }));
  const allT = groupsByMetric.flatMap((g) => g.groups.flatMap((x) => x.points.map((p) => p.t)));
  const domain: [number, number] | undefined = allT.length ? [Math.min(...allT) - 4 * DAY, Math.max(...allT) + 4 * DAY] : undefined;

  /** One pace curve per run set (from its series) and per run (from its file), each with its estimate; blocks have none. */
  const curveLines: (CurveLine & { estimated: CurveEstimate | null })[] = curve ? items.flatMap((i) => {
    const base = { key: i.id, label: label(i), color: color(i), shape: shape(i) };
    let points: CurveLine['points'] = [];
    if (i.kind === 'set') {
      const got = Object.fromEntries(CURVE_KEYS.flatMap((k) => { const s = series.get(`${i.id}|${k}`); return s ? [[k, s]] : []; }));
      points = paceCurve(got).map((p) => ({ duration: p.duration, pace: p.pace, note: `${date(p.date)}${p.title ? ` · ${p.title}` : ''} · ${mmss(p.from)}–${mmss(p.to)}` }));
    } else if (i.kind === 'run') {
      const f = files.get(i.id);
      const row = runs.find((r) => r.id === i.id);
      if (!f || !row) return [];
      points = CURVE_DURATIONS.flatMap((d) => { const b = bestStretch(f, row, { kind: 'time', target: d }); return b ? [{ duration: d, pace: b.value, note: `${mmss(b.from!)}–${mmss(b.to!)} of the run` }] : []; });
    } else return [];
    const estimated = estimateCurve(points);
    // The estimate drawn from 3 minutes to the end of the axis, 24 steps on the logarithmic scale.
    const d0 = Math.log(MIN_FIT_SECONDS);
    const d1 = Math.log(CURVE_DURATIONS[CURVE_DURATIONS.length - 1]);
    const estimate = estimated ? Array.from({ length: 25 }, (_, k) => { const d = Math.exp(d0 + ((d1 - d0) * k) / 24); return { duration: d, pace: estimatedPace(estimated, d) }; }) : undefined;
    return [{ ...base, points, estimate, estimated, estimateAt: estimated ? (d: number) => estimatedPace(estimated, d) : undefined }];
  }) : [];
  const raceName = (m: number) => (m === 42195 ? 'marathon' : m === 21097.5 ? 'half' : `${m / 1000} km`);

  const markers: Marker[] = useMemo(() => gear.map((g) => ({ date: `${g.from}T00:00:00`, label: `${g.type === 'shoes' ? '👟' : '♥'} ${g.name}` })), [gear]);

  /** The change of an item for a metric key: a block's from its instances, a set's from its series. */
  const changeOf = (i: AnalysisItem, key: MetricKey): MetricChange | null => {
    if (i.kind === 'block') return bestWindow(key) ? null : changesByMetric(all, i.id, [key as BlockMetric], corrected)[0];
    const s = series.get(`${i.id}|${key}`);
    if (!s) return null;
    return { metric: metricOf(key), n: s.points.length, change: s.fit?.change ?? null, start: s.fit?.start ?? null, noise: s.fit?.noise ?? null, verdict: s.fit?.verdict ?? null };
  };

  const exportCsv = () => {
    const names = new Map(defs.map((d) => [d.id, d.name]));
    const mine = all.filter((i) => blockItems.some((b) => b.id === i.definitionId));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([instancesCsv(mine, names)], { type: 'text/csv' }));
    a.download = 'analysis-instances.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** A run set kept as a block from criteria: its runs become instances, so it gets A/B and a place on the Blocks screen. */
  const saveAsBlock = async (i: AnalysisItem) => {
    const s = setOf(i);
    if (!confirm(`Keep "${describeRunSet(s)}" as a block? Its runs become the block's instances, measured as every block is (their averages).`)) return;
    setSaving(true);
    const def = definitionFromCriteria(describeRunSet(s), { ...EMPTY_CRITERIA, title: s.filters.title ?? '', workoutTypes: s.filters.workoutType ? [s.filters.workoutType] : [], shoes: s.filters.shoes ? [s.filters.shoes] : [], dateFrom: s.period.from, dateTo: s.period.to }, 'run');
    await writeDefinitions(folder, [...(await readDefinitions(folder)), def]);
    await runInWorker('blocks', handle);
    setDefs((await readDefinitions(folder)).filter((d) => d.status === 'active'));
    setAll((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
    setSaving(false);
    setItems(items.map((x) => (x.id === i.id ? { kind: 'block', id: def.id, slot: x.slot } : x)));
  };

  if (!loaded) return <div className="page"><div className="page-head"><h1>Analysis</h1></div></div>;

  const tableFor = setItemsList.find((i) => i.id === tableItem) ?? setItemsList[0];
  const tableKey = tableMetric && metrics.includes(tableMetric) ? tableMetric : metrics[0];
  const tableSeries = tableFor ? series.get(`${tableFor.id}|${tableKey}`) : undefined;
  const tableView = viewOf(tableKey);
  const lowerBetter = tableView.invert === true || ['heartRate', 'groundContactTime', 'verticalOscillation'].includes(metricOf(tableKey));
  const tableRows = tableSeries ? (sort === 'date' ? [...tableSeries.points].reverse() : [...tableSeries.points].sort((a, b) => ((sort === 'best') === lowerBetter ? a.value - b.value : b.value - a.value)).slice(0, top)) : [];

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
            {i.kind === 'set' && <button className="item-save" title="Keep as a block" disabled={saving} onClick={() => saveAsBlock(i)}>Save as block</button>}
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
        <label className="setting inline" title="For each length of time, the fastest stretch of that length across the item's runs"><input type="checkbox" checked={curve} onChange={(e) => setCurve(e.target.checked)} /> Pace curve</label>
      </div>
      <div className="toolbar">
        <span className="muted small">Fastest stretch:</span>
        <div className="metric-picker" role="group" aria-label="Fastest stretch" title="The fastest stretch of this length in each run and run set; blocks have none">
          {WINDOW_PRESETS.map((w) => { const k = bestKey(w); return <button key={k} className={`pill ${metrics.includes(k) ? 'on' : ''}`} aria-pressed={metrics.includes(k)} onClick={() => toggleMetric(k)}>{windowName(w)}</button>; })}
        </div>
      </div>

      {progress && <div className="card" style={{ padding: '10px 14px', marginBottom: 12 }}><span className="muted">Reading the runs of a set… {progress.done} / {progress.total || '…'}</span><div className="progress"><div style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '3%' }} /></div></div>}

      {!items.length ? (
        <div className="card empty">Add a block, a run or the runs matching a period and filters. Blocks and run sets show every instance over time; runs show their average.</div>
      ) : (
        <>
          <div className="card chart">
            <h3 className="chart-title">Over time <span className="muted">· each block&apos;s instances, each run set&apos;s runs, each run&apos;s average; trend lines per block and set</span></h3>
            {groupsByMetric.map(({ mt, groups }, k) => {
              const v = viewOf(mt);
              return (
                <div key={mt} className="stacked">
                  <div className="metric-head" style={{ paddingLeft: 52 }}><span className="metric-title">{v.short}<span className="muted"> · {v.name.replace(/^.*\((.*)\)$/, '$1')}</span></span></div>
                  <OverTimeChart title={v.name} groups={groups} format={v.fmt} tick={v.tick} minSpan={v.minSpan} invert={v.invert} markers={markers}
                    domain={domain} join={joinPoints} fit={trendLine} labels={k === 0} height={metrics.length > 1 ? 210 : 300} />
                </div>
              );
            })}
            <div className="chart-note">Thin line: the points in date order. Thick line: the fitted trend, its band the noise between a block&apos;s instances or a set&apos;s runs (±1 standard deviation).</div>
          </div>

          {curve && (
            <div className="card chart" style={{ marginTop: 12 }}>
              <h3 className="chart-title">Pace curve <span className="muted">· for each length of time, the fastest stretch of that length across the item&apos;s runs; blocks have none</span></h3>
              <PaceCurveChart lines={curveLines} durations={CURVE_DURATIONS} format={(v) => `${fmtPace(1000 / v)} /km`} tick={viewOf('speed').tick} minSpan={viewOf('speed').minSpan} />
              {curveLines.map((l) => (
                <div key={l.key} className="chart-note curve-note">
                  <ItemKey shape={l.shape} color={l.color} /> {l.label}: {l.estimated ? (
                    <>
                      <b>Estimate</b> (Riegel power law through your strongest best, exponent {(1 + l.estimated.k).toFixed(2)} from {l.estimated.n} bests of {MIN_FIT_SECONDS / 60} min and more): {l.estimated.predictions.map((p) => `${raceName(p.distance)} ${fmtDuration(Math.round(p.seconds))}`).join(' · ')}
                      {l.estimated.cs ? <> · <b>Critical speed</b> {fmtPace(l.estimated.cs.cs)} /km, D′ {Math.round(l.estimated.cs.dPrime)} m (Monod–Scherrer, {l.estimated.cs.n} bests of 2–20 min)</> : ' · critical speed needs 3 bests of 2–20 min'}
                    </>
                  ) : `no estimate yet: it needs ${MIN_FIT_POINTS} bests of ${MIN_FIT_SECONDS / 60} min and more`}
                </div>
              ))}
              <div className="chart-note">Solid: the fastest stretch of each length among the item&apos;s runs. Dashed: the estimate, a power law of time (Riegel 1981) with its slope fitted to those bests and its level raised to the strongest of them, so no best lies above it; the dotted strokes are each best&apos;s gap to it; move the pointer along the chart to read the estimate at any length. The predicted times follow it, and an easy long run steepens its slope. Critical speed and D′ from the critical speed model (Monod &amp; Scherrer 1965; Jones &amp; Vanhatalo 2017), fitted to the bests of 2–20 min.</div>
            </div>
          )}

          {(blockItems.length > 0 || setItemsList.length > 0) && (
            <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
              <table className="data changes" aria-label="Changes">
                <thead>
                  <tr><th>Item</th>{metrics.map((mt) => <th key={mt}>{viewOf(mt).short}</th>)}</tr>
                </thead>
                <tbody>
                  {items.filter((i) => i.kind !== 'run').map((i) => (
                    <tr key={i.id}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={shape(i)} color={color(i)} />{label(i)}</span></td>
                      {metrics.map((mt) => {
                        const c = changeOf(i, mt);
                        const what = i.kind === 'block' ? 'instances' : 'runs';
                        return (
                          <td key={mt}>
                            {!c ? (
                              <span className="muted small">{i.kind === 'block' ? 'blocks have no stretch' : '…'}</span>
                            ) : c.change === null ? (
                              <span className="muted small">{c.n ? `${c.n} ${what}, too few` : `no ${what}`}</span>
                            ) : (
                              <div className="kpi">
                                <div className={`kpi-v ${c.verdict === 'change' ? 'change-yes' : ''}`}>{describeDelta(c.metric, c.change)}{c.start ? <span className="kpi-pct">{percentChange(c.change, c.start)}</span> : null}</div>
                                <div className="kpi-sub muted small"><span className={`verdict-chip ${c.verdict === 'change' ? 'yes' : 'no'}`}>{c.verdict === 'change' ? 'change' : 'no detectable change'}</span> · noise ±{formatAmount(c.metric, c.noise!)} · {c.n} {what}</div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="chart-note" style={{ padding: '0 12px 10px' }}>Each cell: the fitted change from the first to the last point, whether it is beyond the noise, and the points it rests on.</div>
            </div>
          )}

          {items.filter((i) => i.kind !== 'run').map((i) => (
            <details key={i.id} className="card result" style={{ marginTop: 12 }}>
              <summary><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={shape(i)} color={color(i)} />{label(i)}: the verdicts in words</span></summary>
              {i.kind === 'block'
                ? metrics.filter((mt) => !bestWindow(mt)).flatMap((mt) => (trendsBy.get(mt)?.get(i.id)?.series ?? []).map((s) => {
                  const d = describeTrend(s, mt as BlockMetric, viewOf(mt).fmt);
                  return (
                    <div key={mt + s.source} className="result-row">
                      <div className="muted small">{viewOf(mt).name}{(trendsBy.get(mt)?.get(i.id)?.series.length ?? 0) > 1 ? ` · ${s.source}` : ''}</div>
                      <div className={`verdict ${d.change ? 'is-change' : ''}`}>{d.headline}</div>
                      <div className="explain">{d.sentence}</div>
                    </div>
                  );
                }))
                : metrics.map((mt) => {
                  const s = series.get(`${i.id}|${mt}`);
                  const set = setOf(i);
                  return (
                    <div key={mt} className="result-row">
                      <div className="muted small">{metricKeyLabel(mt, set.stat)}</div>
                      <div className={`verdict ${s?.fit?.verdict === 'change' ? 'is-change' : ''}`} style={{ fontSize: 16 }}>{s ? seriesSentence(mt, set.stat, set.period.label === 'all runs' ? 'over all runs' : set.period.label, s) : 'Reading the runs…'}</div>
                    </div>
                  );
                })}
            </details>
          ))}

          {tableFor && (
            <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
              <div className="toolbar" style={{ padding: '12px 18px 0' }}>
                <span className="chart-title" style={{ margin: 0 }}>Runs behind the answer</span>
                {setItemsList.length > 1 && (
                  <select className="select small" aria-label="Run set" value={tableFor.id} onChange={(e) => setTableItem(e.target.value)}>
                    {setItemsList.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
                  </select>
                )}
                <select className="select small" aria-label="Table metric" value={tableKey} onChange={(e) => setTableMetric(e.target.value as MetricKey)}>
                  {metrics.map((mt) => <option key={mt} value={mt}>{viewOf(mt).short}</option>)}
                </select>
                <div className="segmented" role="radiogroup" aria-label="Order">
                  {([['date', 'By date'], ['best', 'Best first'], ['worst', 'Worst first']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}
                </div>
                {sort !== 'date' && (
                  <select className="select small" aria-label="Top" value={top} onChange={(e) => setTop(Number(e.target.value))}>
                    {[5, 10, 20, 50].map((n) => <option key={n} value={n}>top {n}</option>)}
                  </select>
                )}
              </div>
              <table className="data" aria-label="Runs behind the answer">
                <thead><tr>{sort !== 'date' && <th>#</th>}<th>Date</th><th>Title</th><th className="num">{tableView.name}</th>{bestWindow(tableKey) && <th>Stretch</th>}<th /></tr></thead>
                <tbody>
                  {tableRows.map((p, k) => (
                    <tr key={p.runId + (p.from ?? '')}>
                      {sort !== 'date' && <td className="muted">{k + 1}</td>}
                      <td className="strong">{date(p.date)}</td>
                      <td>{p.title ?? <span className="muted">–</span>}</td>
                      <td className="num">{tableView.fmt(p.value)}</td>
                      {bestWindow(tableKey) && <td className="muted">{mmss(p.from!)}–{mmss(p.to!)} · {(p.distance! / 1000).toFixed(2)} km</td>}
                      <td className="num"><Link className="muted" href={`/run?id=${p.runId}${p.from !== null ? `&from=${Math.round(p.from)}&to=${Math.round(p.to!)}` : ''}`}>Open run →</Link></td>
                    </tr>
                  ))}
                  {!tableRows.length && <tr><td colSpan={6} className="muted small">{tableSeries ? 'No run has a value for this metric.' : 'Reading the runs…'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {adding && <AddDialog defs={defs} runs={runs} items={items} options={options} onAdd={(kind, id) => { setItems(addItem(items, kind, id)); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

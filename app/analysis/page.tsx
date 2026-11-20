'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ItemKey, METRIC_VIEW, OverTimeChart, PaceCurveChart, SLOT_COLORS, SLOT_SHAPES, type CurveLine, type Marker, type OverTimeGroup } from '@/components';
import { RECOMMENDATIONS_PATH, RULE_TOLERANCES, decodeRule, definitionFromRule, encodeRule, fromRecommendation, readDefinitions, ruleName, writeDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type BlockMetric, type Recommendation, type Rule } from '@/lib/blocks';
import { curvesInWorker, instancesInWorker, runInWorker, useOpenFolder } from '@/lib/client';
import { MAX_ITEMS, addItem, changesByMetric, computeTrend, describeDelta, describeTrend, formatAmount, percentChange, firstUsableMetric, formatItems, instancesCsv, parseItems, reasonSummary, runMean, selectInstances, valueOf, type AnalysisItem } from '@/lib/compare';
import { CURVE_DURATIONS, MIN_FIT_POINTS, MIN_FIT_SECONDS, estimateCurve, estimatedPace, type CurveEstimate, type CurvePoint, type CurveSource } from '@/lib/curve';
import { PATHS, isOutdated, readJson, readManifest } from '@/lib/fs';
import { date, duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import { readGear, readRunTags, type Gear } from '@/lib/gear';
import type { RunFile, RunsIndex } from '@/lib/kernel';
import { AddDialog, TYPE_LABEL, runName } from './AddDialog';
import { BlockSheet } from './BlockSheet';
import type { BuilderOptions } from './RuleBuilder';

const DAY = 86_400_000;
const METRICS = METRIC_VIEW;
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const view = (mt: BlockMetric) => METRICS.find((x) => x.key === mt)!;
/** What sets a block apart, shown under its name: its kind, how its segments start, where its heart rate is read from. */
function attributes(d: BlockDefinition | null): string[] {
  if (!d) return [];
  const start = d.params.type === 'rule' ? d.params.conditions.start : d.tolerances.start;
  return [
    TYPE_LABEL[d.params.type],
    ...(start !== 'any' ? [`${start} start`] : []),
    ...(d.tolerances.hrSkip !== null ? [`heart rate from minute ${d.tolerances.hrSkip / 60}`] : []),
  ];
}
/** The run screen of a run, with a stretch of it selected when one is given. */
const runHref = (id: string, from?: number, to?: number) => `/run?id=${id}${from !== undefined && to !== undefined ? `&from=${Math.round(from)}&to=${Math.round(to)}` : ''}`;
/** The id the instances of a rule that lives in the link carry. */
const ruleId = (code: string) => `q:${code}`;

export default function AnalysisPageWrapper() {
  return <Suspense><AnalysisPage /></Suspense>;
}

/**
 * Analysis (requirements "Analysis workspace" and "Blocks defined in Analysis"): the runner
 * chooses the data, blocks built from a rule here, kept blocks, blocks found in the runs, or
 * single runs; the app selects their segments and compares them for several metrics on stacked
 * Over time charts, with each block's verdict in words, its segments listed and a pace curve.
 * The items live in the URL.
 */
function AnalysisPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { folder, handle } = useOpenFolder();
  const [loaded, setLoaded] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [defs, setDefs] = useState<BlockDefinition[]>([]);
  const [kept, setKept] = useState<BlockInstance[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [runs, setRuns] = useState<RunsIndex['runs']>([]);
  const [gear, setGear] = useState<Gear[]>([]);
  const [options, setOptions] = useState<BuilderOptions>({ workoutTypes: [], techniqueCues: [], shoes: [], heartRateSources: [], devices: [] });
  const [files, setFiles] = useState<Map<string, RunFile>>(new Map());
  const [adhoc, setAdhoc] = useState<Map<string, BlockInstance[]>>(new Map());
  const [curves, setCurves] = useState<Map<string, CurvePoint[]>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [joinPoints, setJoin] = useState(true);
  const [trendLine, setTrend] = useState(true);
  const [corrected, setCorrected] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AnalysisItem | null>(null);
  const [tableItem, setTableItem] = useState<string | null>(null);
  const [tableMetric, setTableMetric] = useState<BlockMetric | null>(null);
  const [sort, setSort] = useState<'date' | 'best' | 'worst'>('date');
  const [top, setTop] = useState(10);

  const load = useCallback(async () => {
    setDefs((await readDefinitions(folder)).filter((d) => d.status === 'active'));
    setKept((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
    setRecs((await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))?.recommendations ?? []);
    const rows = (await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? [];
    setRuns(rows);
    const g = await readGear(folder);
    setGear(g);
    const tags = await readRunTags(folder);
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    setOptions({
      workoutTypes: uniq([...tags.dictionary.workoutTypes, ...rows.map((r) => r.workoutType)]),
      techniqueCues: uniq([...tags.dictionary.techniqueCues, ...rows.map((r) => r.techniqueCue)]),
      shoes: uniq([...g.filter((x) => x.type === 'shoes').map((x) => x.name), ...rows.map((r) => r.shoes)]),
      heartRateSources: uniq(rows.map((r) => r.heartRateSource)),
      devices: uniq(rows.map((r) => r.device)),
    });
    setOutdated(isOutdated(await readManifest(folder)));
    setLoaded(true);
  }, [folder]);
  useEffect(() => { load(); }, [load]);

  // The items live in the URL; with none given, the first kept block opens.
  const items: AnalysisItem[] = useMemo(() => {
    const given = parseItems(params.get('items'));
    if (given.length || params.has('items')) return given.filter((i) => (i.kind === 'block' ? defs.some((d) => d.id === i.id) : i.kind === 'run' ? runs.some((r) => r.id === i.id) : decodeRule(i.id) !== null));
    const def = params.get('def') ?? defs[0]?.id;
    return def && defs.some((d) => d.id === def) ? [{ kind: 'block' as const, id: def, slot: 0 }] : [];
  }, [params, defs, runs]);
  // The latest items, ahead of the link: a change after a save must build on what is shown.
  const latest = useRef(items);
  useEffect(() => { latest.current = items; }, [items]);
  const setItems = (next: AnalysisItem[]) => {
    latest.current = next;
    const q = new URLSearchParams(params.toString());
    q.set('items', formatItems(next));
    router.replace(`/analysis?${q.toString()}`);
  };

  /** The definition behind a block item: a kept one, or the rule its link carries. */
  const defOf = (i: AnalysisItem): BlockDefinition | null => {
    if (i.kind === 'block') return defs.find((d) => d.id === i.id) ?? null;
    if (i.kind !== 'rule') return null;
    const rule = decodeRule(i.id);
    return rule ? { id: ruleId(i.id), name: ruleName(rule), origin: 'manual', status: 'active', createdAt: '', params: { type: 'rule', ...rule }, tolerances: { ...RULE_TOLERANCES } } : null;
  };
  const defId = (i: AnalysisItem) => (i.kind === 'rule' ? ruleId(i.id) : i.id);
  const blocks = useMemo(() => items.filter((i) => i.kind !== 'run'), [items]);

  // Run files only for the single runs added: kept blocks read the index files, rules are computed in the worker.
  useEffect(() => {
    const need = items.filter((i) => i.kind === 'run' && !files.has(i.id));
    if (!need.length) return;
    (async () => {
      const next = new Map(files);
      for (const i of need) { const f = await readJson<RunFile>(folder, PATHS.runFile(i.id)); if (f) next.set(i.id, f); }
      setFiles(next);
    })();
  }, [items, files, folder]);

  // The segments of the rules that live in the link, computed now in the worker, once per rule.
  const want = useMemo(() => JSON.stringify(items.filter((i) => i.kind === 'rule' && !adhoc.has(i.id)).map((i) => i.id)), [items, adhoc]);
  useEffect(() => {
    const codes = JSON.parse(want) as string[];
    if (!codes.length) return;
    const controller = new AbortController();
    let live = true;
    const wanted = codes.flatMap((code) => { const rule = decodeRule(code); return rule ? [{ id: ruleId(code), name: '', origin: 'manual' as const, status: 'active' as const, createdAt: '', params: { type: 'rule' as const, ...rule }, tolerances: { ...RULE_TOLERANCES } }] : []; });
    setProgress({ done: 0, total: 0 });
    instancesInWorker(wanted, handle, (p) => live && setProgress({ done: p.done, total: p.total }), controller.signal)
      .then((got) => live && setAdhoc((prev) => { const next = new Map(prev); for (const code of codes) next.set(code, got[ruleId(code)] ?? []); return next; }))
      .catch(() => undefined)
      .finally(() => live && setProgress(null));
    return () => { live = false; controller.abort(); };
  }, [want, handle]);

  const all = useMemo(() => [...kept, ...[...adhoc.values()].flat()], [kept, adhoc]);

  // The metrics chosen live in the URL too (m=speed,heartRate); none given: the first with a result.
  const firstBlock = blocks[0] ? defId(blocks[0]) : null;
  const metrics: BlockMetric[] = useMemo(() => {
    const given = (params.get('m') ?? '').split(',').filter((k): k is BlockMetric => METRICS.some((x) => x.key === k));
    if (given.length) return METRICS.map((x) => x.key).filter((k) => given.includes(k));
    return [firstBlock ? firstUsableMetric(all, firstBlock, METRICS.map((x) => x.key)) : 'speed'];
  }, [params, all, firstBlock]);
  const toggleMetric = (k: BlockMetric) => {
    const next = metrics.includes(k) ? metrics.filter((x) => x !== k) : METRICS.map((x) => x.key).filter((x) => x === k || metrics.includes(x));
    if (!next.length) return;
    const q = new URLSearchParams(params.toString());
    q.set('m', next.join(','));
    router.replace(`/analysis?${q.toString()}`);
  };
  // The pace curve, switched on in the URL (curve=1).
  const curve = params.get('curve') === '1';
  const setCurve = (on: boolean) => {
    const q = new URLSearchParams(params.toString());
    if (on) q.set('curve', '1'); else q.delete('curve');
    router.replace(`/analysis?${q.toString()}`);
  };

  const color = (i: AnalysisItem) => SLOT_COLORS[i.slot % SLOT_COLORS.length];
  const shape = (i: AnalysisItem) => SLOT_SHAPES[i.slot % SLOT_SHAPES.length];
  const label = (i: AnalysisItem) => {
    if (i.kind !== 'run') return defOf(i)?.name ?? 'block';
    const r = runs.find((x) => x.id === i.id);
    return r ? `Run ${runName(r.startTime, r.distance, r.title)}` : 'run';
  };

  /** Each metric's trends of the blocks added. */
  const trendsBy = useMemo(() => new Map(metrics.map((mt) => [mt, new Map(blocks.map((i) => [i.id, computeTrend(all, i.kind === 'rule' ? ruleId(i.id) : i.id, mt, {}, corrected)]))])), [all, blocks, metrics, corrected]);

  const groupsFor = (metric: BlockMetric): OverTimeGroup[] => items.flatMap((i): OverTimeGroup[] => {
    const base = { key: i.id, label: label(i), color: color(i), shape: shape(i) };
    if (i.kind !== 'run') {
      const t = trendsBy.get(metric)?.get(i.id);
      if (!t) return [];
      return [{
        ...base,
        points: t.series.flatMap((s) => s.points.map((p) => ({ t: Date.parse(p.date), v: corrected ? p.corrected : p.raw, instance: p.instance, note: `minute ${p.instance.context.before.minuteOfRun} of the run`, href: runHref(p.instance.runId, p.instance.start, p.instance.end) }))),
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
    return f && v !== null ? [{ ...base, points: [{ t: Date.parse(f.startTime), v, note: 'average of the run', href: runHref(f.id) }], fits: [] }] : [];
  });

  // One time range for every Over time chart.
  const groupsByMetric = metrics.map((mt) => ({ mt, groups: groupsFor(mt) }));
  const allT = groupsByMetric.flatMap((g) => g.groups.flatMap((x) => x.points.map((p) => p.t)));
  const domain: [number, number] | undefined = allT.length ? [Math.min(...allT) - 4 * DAY, Math.max(...allT) + 4 * DAY] : undefined;
  const markers: Marker[] = useMemo(() => gear.map((g) => ({ date: `${g.from}T00:00:00`, label: `${g.type === 'shoes' ? '👟' : '♥'} ${g.name}` })), [gear]);

  // The pace curve of each item, from the stretches it holds: a block's segments, a run whole.
  const sourcesKey = useMemo(() => {
    if (!curve) return '[]';
    const sources: CurveSource[] = items.map((i) => {
      if (i.kind === 'run') return { key: i.id, ranges: { [i.id]: [[0, 1e9] as [number, number]] } };
      const id = i.kind === 'rule' ? ruleId(i.id) : i.id;
      const ranges: Record<string, [number, number][]> = {};
      for (const x of all) if (x.definitionId === id && x.status === 'accepted') (ranges[x.runId] ??= []).push([x.start, x.end]);
      return { key: i.id, ranges };
    });
    return JSON.stringify(sources);
  }, [curve, items, all]);
  useEffect(() => {
    const list = JSON.parse(sourcesKey) as CurveSource[];
    if (!list.length) return;
    const controller = new AbortController();
    let live = true;
    setProgress({ done: 0, total: 0 });
    curvesInWorker(list, handle, (p) => live && setProgress({ done: p.done, total: p.total }), controller.signal)
      .then((got) => live && setCurves(new Map(Object.entries(got))))
      .catch(() => undefined)
      .finally(() => live && setProgress(null));
    return () => { live = false; controller.abort(); };
  }, [sourcesKey, handle]);

  const curveLines: (CurveLine & { estimated: CurveEstimate | null })[] = curve ? items.flatMap((i) => {
    const pts = curves.get(i.id);
    if (!pts) return [];
    const points = pts.map((p) => ({ duration: p.duration, pace: p.pace, note: `${date(p.date)}${p.title ? ` · ${p.title}` : ''} · ${mmss(p.from)}–${mmss(p.to)}`, href: runHref(p.runId, p.from, p.to) }));
    const estimated = estimateCurve(points);
    // The estimate drawn from 3 minutes to the end of the axis, 24 steps on the logarithmic scale.
    const d0 = Math.log(MIN_FIT_SECONDS);
    const d1 = Math.log(CURVE_DURATIONS[CURVE_DURATIONS.length - 1]);
    const estimate = estimated ? Array.from({ length: 25 }, (_, k) => { const d = Math.exp(d0 + ((d1 - d0) * k) / 24); return { duration: d, pace: estimatedPace(estimated, d) }; }) : undefined;
    return [{ key: i.id, label: label(i), color: color(i), shape: shape(i), points, estimate, estimated, estimateAt: estimated ? (d: number) => estimatedPace(estimated, d) : undefined }];
  }) : [];
  const raceName = (m: number) => (m === 42195 ? 'marathon' : m === 21097.5 ? 'half' : `${m / 1000} km`);

  const exportCsv = () => {
    const names = new Map(blocks.map((i) => [defId(i), label(i)]));
    const mine = all.filter((i) => names.has(i.definitionId));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([instancesCsv(mine, names)], { type: 'text/csv' }));
    a.download = 'analysis-instances.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Writes the kept definitions as `change` makes them, detects their segments again and reloads. */
  const keep = async (what: string, change: (all: BlockDefinition[]) => BlockDefinition[]) => {
    setBusy(what);
    try {
      await writeDefinitions(folder, change(await readDefinitions(folder)));
      await runInWorker('blocks', handle);
      await load();
    } finally { setBusy(null); }
  };
  const acceptSuggestion = async (rec: Recommendation) => {
    setAdding(false);
    const def = fromRecommendation(rec, 'active');
    await keep(`Adding ${rec.name}`, (d) => [...d, def]);
    setItems(addItem(latest.current, 'block', def.id));
  };
  const dismissSuggestion = (rec: Recommendation) => keep(`Dismissing ${rec.name}`, (d) => [...d, fromRecommendation(rec, 'rejected')]);
  const addRule = async (rule: Rule, name: string, save: boolean) => {
    setAdding(false);
    if (!save) return setItems(addItem(latest.current, 'rule', encodeRule(rule)));
    const def = definitionFromRule(name, rule);
    await keep(`Saving ${def.name}`, (d) => [...d, def]);
    setItems(addItem(latest.current, 'block', def.id));
  };
  /** A rule that lives in the link kept in the folder: it stays in the list and can be compared A/B. */
  const saveItem = async (i: AnalysisItem) => {
    const rule = decodeRule(i.id);
    if (!rule) return;
    const def = definitionFromRule('', rule);
    await keep(`Saving ${def.name}`, (d) => [...d, def]);
    setItems(latest.current.map((x) => (x.id === i.id ? { kind: 'block', id: def.id, slot: x.slot } : x)));
  };
  const saveEdited = async (i: AnalysisItem, d: BlockDefinition) => {
    setEditing(null);
    if (i.kind === 'block') return keep(`Re-detecting ${d.name}`, (ds) => ds.map((x) => (x.id === d.id ? d : x)));
    if (d.params.type !== 'rule') return;
    const { type: _type, ...rule } = d.params;
    setItems(latest.current.map((x) => (x.id === i.id ? { ...x, id: encodeRule(rule as Rule) } : x)));
  };
  const deleteBlock = async (i: AnalysisItem, d: BlockDefinition) => {
    setEditing(null);
    setItems(latest.current.filter((x) => x.id !== i.id));
    await keep(`Deleting ${d.name}`, (ds) => ds.filter((x) => x.id !== d.id));
  };

  if (!loaded) return <div className="page"><div className="page-head"><h1>Analysis</h1></div></div>;

  const tableFor = blocks.find((i) => i.id === tableItem) ?? blocks[0];
  const tableKey = tableMetric && metrics.includes(tableMetric) ? tableMetric : metrics[0];
  const tableView = view(tableKey);
  const selection = tableFor ? selectInstances(all, defId(tableFor), tableKey) : null;
  const lowerBetter = tableView.invert === true || ['heartRate', 'groundContactTime', 'verticalOscillation'].includes(tableKey);
  const segments = selection ? selection.included.map((i) => ({ i, v: valueOf(i, tableKey)! })) : [];
  const tableRows = sort === 'date' ? [...segments].reverse() : [...segments].sort((a, b) => ((sort === 'best') === lowerBetter ? a.v - b.v : b.v - a.v)).slice(0, top);
  const titleOf = (runId: string) => runs.find((r) => r.id === runId)?.title ?? null;
  const computing = items.some((i) => i.kind === 'rule' && !adhoc.has(i.id));
  const editingDef = editing ? defOf(editing) : null;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Analysis</h1>
        <span className="spacer" />
        {busy && <span className="chip">⟳ {busy}…</span>}
        {blocks.length > 0 && <button className="btn" onClick={exportCsv}>Export CSV</button>}
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
            {i.kind === 'rule' && <button className="item-save" title="Keep this block in the folder: it stays in the list and can be compared A/B" disabled={!!busy} onClick={() => saveItem(i)}>Save</button>}
            {i.kind !== 'run' && <button className="item-save" aria-label={`Edit ${label(i)}`} disabled={!!busy} onClick={() => setEditing(i)}>Edit</button>}
            <button className="item-remove" aria-label={`Remove ${label(i)}`} onClick={() => setItems(items.filter((x) => x.id !== i.id))}>×</button>
          </span>
        ))}
        <button className="btn" disabled={items.length >= MAX_ITEMS || !!busy} onClick={() => setAdding(true)}>+ Add block or run</button>
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
        <label className="setting inline" title="For each length of time, the fastest stretch of that length inside the item's segments"><input type="checkbox" checked={curve} onChange={(e) => setCurve(e.target.checked)} /> Pace curve</label>
      </div>

      {progress && <div className="card" style={{ padding: '10px 14px', marginBottom: 12 }}><span className="muted">Reading the runs… {progress.done} / {progress.total || '…'}</span><div className="progress"><div style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '3%' }} /></div></div>}

      {!items.length ? (
        <div className="card empty">
          Choose the data to analyse: press <b>+ Add block or run</b> and build a block from a rule (the fastest 5 minutes with the heart rate above 160, the laps of 3 to 5 km, the runs since March…), take one found in your runs, or add a single run.
        </div>
      ) : (
        <>
          <div className="card chart">
            <h3 className="chart-title">Over time <span className="muted">· each block&apos;s segments with its trend line, each run&apos;s average</span></h3>
            {groupsByMetric.map(({ mt, groups }, k) => (
              <div key={mt} className="stacked">
                <div className="metric-head" style={{ paddingLeft: 52 }}><span className="metric-title">{view(mt).short}<span className="muted"> · {view(mt).name.replace(/^.*\((.*)\)$/, '$1')}</span></span></div>
                <OverTimeChart title={view(mt).name} groups={groups} format={view(mt).fmt} tick={view(mt).tick} minSpan={view(mt).minSpan} invert={view(mt).invert} markers={markers}
                  domain={domain} join={joinPoints} fit={trendLine} labels={k === 0} height={metrics.length > 1 ? 210 : 300} />
              </div>
            ))}
            <div className="chart-note">Thin line: the points in date order. Thick line: the fitted trend, its band the noise between a block&apos;s segments (±1 standard deviation). Click a point to open its run.</div>
          </div>

          {curve && (
            <div className="card chart" style={{ marginTop: 12 }}>
              <h3 className="chart-title">Pace curve <span className="muted">· for each length of time, the fastest stretch of that length inside the item&apos;s segments</span></h3>
              <PaceCurveChart lines={curveLines} durations={CURVE_DURATIONS} format={(v) => `${fmtPace(1000 / v)} /km`} tick={view('speed').tick} minSpan={view('speed').minSpan} />
              {curveLines.map((l) => (
                <div key={l.key} className="chart-note curve-note">
                  <ItemKey shape={l.shape} color={l.color} /> {l.label}: {l.estimated ? (
                    <>
                      <b>Estimate</b> (Riegel power law through your strongest best, exponent {(1 + l.estimated.k).toFixed(2)} from {l.estimated.n} bests of {MIN_FIT_SECONDS / 60} min and more): {l.estimated.predictions.map((p) => `${raceName(p.distance)} ${fmtDuration(Math.round(p.seconds))}`).join(' · ')}
                      {l.estimated.cs ? <> · <b>Critical speed</b> {fmtPace(l.estimated.cs.cs)} /km, D′ {Math.round(l.estimated.cs.dPrime)} m (Monod–Scherrer, {l.estimated.cs.n} bests of 2–20 min)</> : ' · critical speed needs 3 bests of 2–20 min'}
                    </>
                  ) : `no estimate: it needs ${MIN_FIT_POINTS} bests of ${MIN_FIT_SECONDS / 60} min and more, so segments at least that long`}
                </div>
              ))}
              <div className="chart-note">Solid: the fastest stretch of each length inside the item&apos;s segments (a block of whole runs covers every length its runs do). Dashed: the estimate, a power law of time (Riegel 1981) with its slope fitted to those bests and its level raised to the strongest of them, so no best lies above it; the dotted strokes are each best&apos;s gap to it; move the pointer along the chart to read the estimate at any length. Critical speed and D′ from the critical speed model (Monod &amp; Scherrer 1965; Jones &amp; Vanhatalo 2017), fitted to the bests of 2–20 min.</div>
            </div>
          )}

          {blocks.length > 0 && (
            <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
              <table className="data changes" aria-label="Changes">
                <thead>
                  <tr><th>Block</th>{metrics.map((mt) => <th key={mt}>{view(mt).short}</th>)}</tr>
                </thead>
                <tbody>
                  {blocks.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={shape(i)} color={color(i)} />{label(i)}</span>
                        <div className="attrs">
                          {attributes(defOf(i)).map((a) => <span key={a} className="chip">{a}</span>)}
                          {i.kind === 'block' && <Link className="muted small" href={`/compare?def=${i.id}`}>Compare A/B →</Link>}
                        </div>
                      </td>
                      {i.kind === 'rule' && !adhoc.has(i.id)
                        ? metrics.map((mt) => <td key={mt}><span className="muted small">…</span></td>)
                        : changesByMetric(all, defId(i), metrics, corrected).map((c) => (
                          <td key={c.metric}>
                            {c.change === null ? (
                              <span className="muted small">{c.n ? `${c.n} segments, too few` : 'no segments'}</span>
                            ) : (
                              <div className="kpi">
                                <div className={`kpi-v ${c.verdict === 'change' ? 'change-yes' : ''}`}>{describeDelta(c.metric, c.change)}{c.start ? <span className="kpi-pct">{percentChange(c.change, c.start)}</span> : null}</div>
                                <div className="kpi-sub muted small"><span className={`verdict-chip ${c.verdict === 'change' ? 'yes' : 'no'}`}>{c.verdict === 'change' ? 'change' : 'no detectable change'}</span> · noise ±{formatAmount(c.metric, c.noise!)} · {c.n} segments</div>
                              </div>
                            )}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="chart-note" style={{ padding: '0 12px 10px' }}>Each cell: the fitted change from the first to the last segment, whether it is beyond the noise, and the segments it rests on.</div>
            </div>
          )}

          {blocks.map((i) => (
            <details key={i.id} className="card result" style={{ marginTop: 12 }}>
              <summary><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={shape(i)} color={color(i)} />{label(i)}: the verdicts in words</span></summary>
              {metrics.flatMap((mt) => (trendsBy.get(mt)?.get(i.id)?.series ?? []).map((s) => {
                const d = describeTrend(s, mt, view(mt).fmt);
                return (
                  <div key={mt + s.source} className="result-row">
                    <div className="muted small">{view(mt).name}{(trendsBy.get(mt)?.get(i.id)?.series.length ?? 0) > 1 ? ` · ${s.source}` : ''}</div>
                    <div className={`verdict ${d.change ? 'is-change' : ''}`}>{d.headline}</div>
                    <div className="explain">{d.sentence}</div>
                  </div>
                );
              }))}
            </details>
          ))}

          {tableFor && selection && (
            <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
              <div className="toolbar" style={{ padding: '12px 18px 0' }}>
                <span className="chart-title" style={{ margin: 0 }}>Segments</span>
                {blocks.length > 1 && (
                  <select className="select small" aria-label="Block" value={tableFor.id} onChange={(e) => setTableItem(e.target.value)}>
                    {blocks.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
                  </select>
                )}
                <select className="select small" aria-label="Table metric" value={tableKey} onChange={(e) => setTableMetric(e.target.value as BlockMetric)}>
                  {metrics.map((mt) => <option key={mt} value={mt}>{view(mt).short}</option>)}
                </select>
                <div className="segmented" role="radiogroup" aria-label="Order">
                  {([['date', 'By date'], ['best', 'Best first'], ['worst', 'Worst first']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}
                </div>
                {sort !== 'date' && (
                  <select className="select small" aria-label="Top" value={top} onChange={(e) => setTop(Number(e.target.value))}>
                    {[5, 10, 20, 50].map((n) => <option key={n} value={n}>top {n}</option>)}
                  </select>
                )}
                <span className="muted small">{segments.length} in · {selection.rejected.length} left out{selection.rejected.length ? `: ${reasonSummary(selection.rejected).join(', ')}` : ''}</span>
              </div>
              <table className="data" aria-label="Segments">
                <thead><tr>{sort !== 'date' && <th>#</th>}<th>Date</th><th>Title</th><th className="num">{tableView.name}</th><th>Stretch</th><th /></tr></thead>
                <tbody>
                  {tableRows.map(({ i, v }, k) => (
                    <tr key={i.id}>
                      {sort !== 'date' && <td className="muted">{k + 1}</td>}
                      <td className="strong">{date(i.runStart)}</td>
                      <td>{titleOf(i.runId) ?? <span className="muted">–</span>}</td>
                      <td className="num">{tableView.fmt(v)}</td>
                      <td className="muted">{mmss(i.start)}–{mmss(i.end)} · {(i.distance / 1000).toFixed(2)} km</td>
                      <td className="num"><Link className="muted" href={`/run?id=${i.runId}&from=${i.start}&to=${i.end}`}>Open run →</Link></td>
                    </tr>
                  ))}
                  {!tableRows.length && <tr><td colSpan={6} className="muted small">{computing ? 'Reading the runs…' : 'No segment has a value for this metric.'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {adding && <AddDialog defs={defs} recs={recs} runs={runs} items={items} options={options} handle={handle}
        onAdd={(kind, id) => { setItems(addItem(items, kind, id)); setAdding(false); }} onAccept={acceptSuggestion} onDismiss={dismissSuggestion} onRule={addRule} onClose={() => setAdding(false)} />}
      {editing && editingDef && <BlockSheet def={editingDef} kept={editing.kind === 'block'} options={options} handle={handle} onClose={() => setEditing(null)} onSave={(d) => saveEdited(editing, d)} onDelete={(d) => deleteBlock(editing, d)} />}
    </div>
  );
}

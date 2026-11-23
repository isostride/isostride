'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ItemKey, METRIC_VIEW, useDataVersion, OverTimeChart, SLOT_COLORS, SLOT_SHAPES, type Marker, type OverTimeGroup } from '@/components';
import { RECOMMENDATIONS_PATH, RULE_TOLERANCES, asRule, definitionFromProfile, definitionFromRoute, shapeName, decodeRule, definitionFromRule, encodeRule, fromRecommendation, readDefinitions, ruleName, writeDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type BlockMetric, type Recommendation, type Rule, ruleOf } from '@/lib/blocks';
import { curvesInWorker, instancesInWorker, runInWorker, similarInWorker, useOpenFolder } from '@/lib/client';
import { MAX_ITEMS, addItem, computeTrend, firstUsableMetric, formatItems, instancesCsv, parseItems, reasonSummary, runMean, selectInstances, valueOf, type AnalysisItem } from '@/lib/compare';
import type { CurveMetric, CurvePoint, CurveSource } from '@/lib/curve';
import { PATHS, isOutdated, readJson, readManifest } from '@/lib/fs';
import { date } from '@/lib/format';
import { readGear, type Gear } from '@/lib/gear';
import type { RunFile, RunsIndex } from '@/lib/kernel';
import { TYPE_LABEL, runName } from './names';
import { mmss, runHref } from './links';
import type { BuilderOptions } from '../segments/RuleBuilder';
import { isUnsaved, keepUnsaved, readUnsaved } from './unsaved';

// The curve tab's chart, figures and table load when the tab is first opened (ADR "Built with React": 200 KB of script per route).
const AbTab = dynamic(() => import('./AbTab').then((m) => m.AbTab), { ssr: false, loading: () => <div className="card chart muted small" style={{ padding: 18 }}>Loading the A/B comparison…</div> });
/** The picker and the sheet that edits a block, loaded when they open. */
/** The saved analyses: loaded after the screen (requirement "Saved analyses"). */
/** The verdicts under the trends' charts: loaded with the tab. */
const TrendVerdicts = dynamic(() => import('./TrendVerdicts').then((m) => m.TrendVerdicts), { ssr: false });
const SavedAnalyses = dynamic(() => import('./SavedAnalyses').then((m) => m.SavedAnalyses), { ssr: false });
/** The efforts chosen on the Efforts tab on one chart as rich as the run's: loaded when one is chosen. */
const EffortsChart = dynamic(() => import('./EffortsChart').then((m) => m.EffortsChart), { ssr: false });
/** Pin to the Dashboard, in the Over time card's corner: loaded after the screen, as the budget wants. */
const PinButton = dynamic(() => import('../dashboard/PinButton').then((m) => m.PinButton), { ssr: false });
const SavedList = dynamic(() => import('./SavedAnalyses').then((m) => m.SavedList), { ssr: false });
const AddDialog = dynamic(() => import('./AddDialog').then((m) => m.AddDialog), { ssr: false });
const BlockSheet = dynamic(() => import('../segments/BlockSheet').then((m) => m.BlockSheet), { ssr: false });
const SegmentsTable = dynamic(() => import('./SegmentsTable').then((m) => m.SegmentsTable), { ssr: false, loading: () => <div className="muted small" style={{ padding: 18 }}>Loading the efforts…</div> });
const CurveTab = dynamic(() => import('./CurveTab').then((m) => m.CurveTab), { ssr: false, loading: () => <div className="card chart muted small" style={{ padding: 18 }}>Loading the curve…</div> });

const DAY = 86_400_000;
const METRICS = METRIC_VIEW;
/** The item Analysis opens with: every run, whole (a rule with nothing set). */
const ALL_RUNS = encodeRule(ruleOf({ type: 'run' }));

const view = (mt: BlockMetric) => METRICS.find((x) => x.key === mt)!;

/** The sections of the screen, one at a time (requirement "Analysis sections as tabs"). */
type Tab = 'trends' | 'segments' | 'ab' | 'curve';
const TABS: [Tab, string][] = [['trends', 'Trends'], ['segments', 'Efforts'], ['ab', 'A/B'], ['curve', 'Pace / power curve']];
/** What sets a block apart, shown under its name: its kind, how its segments start, where its heart rate is read from. */
function attributes(d: BlockDefinition | null): string[] {
  if (!d) return [];
  const start = d.params.type === 'rule' ? d.params.conditions.start : d.tolerances.start;
  return [
    shapeName(asRule(d.params, d.tolerances).shape),
    ...(start !== 'any' ? [`${start} start`] : []),
    ...(d.tolerances.hrSkip !== null ? [`heart rate from minute ${d.tolerances.hrSkip / 60}`] : []),
  ];
}
/** The run screen of a run, with a stretch of it selected when one is given. */
/** A part of a run as a link carries it: <run id>~<from s>~<to s>; null when it is not one. */
function partOf(text: string | null): { runId: string; from: number; to: number } | null {
  const [runId, a, b] = (text ?? '').split('~');
  const [from, to] = [Number(a), Number(b)];
  return runId && Number.isFinite(from) && Number.isFinite(to) && to > from ? { runId, from, to } : null;
}
/** The id the instances of a rule that lives in the link carry. */
const ruleId = (code: string) => `q:${code}`;
/** The definition a link item carries: an unsaved segment of this tab (t~…), or a rule in the link. */
function linkDef(code: string): BlockDefinition | null {
  const unsaved = readUnsaved(code);
  if (unsaved) return { ...unsaved, id: ruleId(code) };
  const rule = decodeRule(code);
  return rule ? { id: ruleId(code), name: ruleName(rule), origin: 'manual', status: 'active', createdAt: '', params: { type: 'rule', ...rule }, tolerances: { ...RULE_TOLERANCES } } : null;
}

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
  const [optionsRead, setOptionsRead] = useState(false);
  const [files, setFiles] = useState<Map<string, RunFile>>(new Map());
  const [adhoc, setAdhoc] = useState<Map<string, BlockInstance[]>>(new Map());
  // The curves computed, with the metric they were computed for (a curve of the other metric is not shown).
  const [curves, setCurves] = useState<{ metric: CurveMetric; by: Map<string, CurvePoint[]> }>({ metric: 'speed', by: new Map() });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [joinPoints, setJoin] = useState(true);
  const [trendLine, setTrend] = useState(true);
  const [corrected, setCorrected] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AnalysisItem | null>(null);
  // What the editor offers to choose runs by: read when the editor first opens (the screen's script stays small).
  useEffect(() => {
    if (optionsRead || !editing) return;
    setOptionsRead(true);
    import('../segments/options').then((m) => m.builderOptions(folder, runs)).then(setOptions).catch(() => undefined);
  }, [optionsRead, editing, folder, runs]);
  const [tableItem, setTableItem] = useState<string | null>(null);
  const [tableMetric, setTableMetric] = useState<BlockMetric | null>(null);
  const [sort, setSort] = useState<'date' | 'best' | 'worst'>('date');
  /** the efforts drawn on the overlay of the Efforts tab, per segment, by key (run:start) */
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [top, setTop] = useState(10);

  const load = useCallback(async () => {
    setDefs((await readDefinitions(folder)).filter((d) => d.status === 'active'));
    setKept((await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))?.instances ?? []);
    setRecs((await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))?.recommendations ?? []);
    const rows = (await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? [];
    setRuns(rows);
    setGear(await readGear(folder));
    setOutdated(isOutdated(await readManifest(folder)));
    setLoaded(true);
  }, [folder]);
  // Read again when an import or a recompute ends (one started by itself included).
  const dataVersion = useDataVersion();
  useEffect(() => { load(); }, [load, dataVersion]);

  // The items live in the URL; with none given, none ("powinno byc puste .. ale chce miec mozliwosc
  // zapisania analiz": a saved analysis opens what it kept), or the segment a link names (def=…).
  const items: AnalysisItem[] = useMemo(() => {
    const given = parseItems(params.get('items'));
    if (given.length || params.has('items')) return given.filter((i) => (i.kind === 'block' ? defs.some((d) => d.id === i.id) : i.kind === 'run' ? runs.some((r) => r.id === i.id) : linkDef(i.id) !== null));
    const def = params.get('def');
    return def && defs.some((d) => d.id === def) ? [{ kind: 'block' as const, id: def, slot: 0 }] : [];
  }, [params, defs, runs]);
  // The latest items, ahead of the link: a change after a save must build on what is shown.
  const latest = useRef(items);
  useEffect(() => { latest.current = items; }, [items]);
  const setItems = (next: AnalysisItem[]) => {
    latest.current = next;
    const q = new URLSearchParams(params.toString());
    q.set('items', formatItems(next));
    router.replace(`/compare?${q.toString()}`);
  };

  /** The definition behind a block item: a kept one, or the rule its link carries (or an unsaved segment of this tab). */
  const defOf = (i: AnalysisItem): BlockDefinition | null => {
    if (i.kind === 'block') return defs.find((d) => d.id === i.id) ?? null;
    return i.kind === 'rule' ? linkDef(i.id) : null;
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
    const wanted = codes.flatMap((code) => { const d = linkDef(code); return d ? [d] : []; });
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
    router.replace(`/compare?${q.toString()}`);
  };
  // The tab, in the URL (tab=segments, tab=curve; Trends when left out; an older link with curve= opens the curve tab).
  const tabParam = params.get('tab');
  // A part of a run to compare with the efforts like it (Compare similar on the Run screen, Similar by an
  // effort): similar=<run id>~<from s>~<to s>. Its efforts on the same route and of the same profile are found
  // in the worker and come in as unsaved segments, each only when it finds some; the part stays the
  // reference (ref=…), marked among their efforts on the Efforts tab, which opens.
  const similar = useMemo(() => partOf(params.get('similar')), [params]);
  const reference = useMemo(() => partOf(params.get('ref')), [params]);
  const [finding, setFinding] = useState<string | null>(null);
  useEffect(() => {
    if (!similar) return;
    const controller = new AbortController();
    setFinding('Finding the efforts like this part…');
    similarInWorker(similar, handle, undefined, controller.signal).then((r) => {
      const ref = r.reference;
      const what = ref ? `${date(ref.runStart)} · ${(ref.distance / 1000).toFixed(1)} km · ${Math.floor(ref.pace / 60)}:${String(Math.round(ref.pace % 60)).padStart(2, '0')} /km ±10 %` : 'the selection';
      const add: BlockDefinition[] = [];
      if (r.route.length && r.track.length) add.push({ ...definitionFromRoute(r.track, r.key?.pace ?? null), name: `Same route as ${what}` });
      if (r.profile.length && r.key) add.push({ ...definitionFromProfile(r.key), name: `Same profile as ${what}` });
      let next = latest.current;
      const codes: string[] = [];
      for (const d of add) { const code = keepUnsaved(d); codes.push(code); next = addItem(next, 'rule', code); }
      const q = new URLSearchParams(params.toString());
      q.delete('similar');
      q.set('ref', `${similar.runId}~${similar.from}~${similar.to}`);
      q.set('items', formatItems(next));
      q.set('tab', 'segments');
      if (codes[0]) setTableItem(codes[0]);
      setFinding(add.length ? null : 'No other run passes over this part, and no effort of another run is alike enough.');
      router.replace(`/compare?${q.toString()}`);
    }).catch((e: unknown) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setFinding(e instanceof Error ? e.message : String(e)); });
    return () => controller.abort();
    // The search follows the part asked for only.
  }, [similar]);
  const tab: Tab = TABS.some(([t]) => t === tabParam) ? (tabParam as Tab) : params.has('curve') ? 'curve' : 'trends';
  // The form, a tab of Analysis at first, is the Performance screen: its old links open there.
  useEffect(() => { if (tabParam === 'form') router.replace('/performance?tab=load'); }, [tabParam, router]);
  // The A/B screen's old links (/compare?def=…, before A/B was a tab here) open A/B on that segment.
  const legacyDef = params.has('items') ? null : params.get('def');
  useEffect(() => {
    if (legacyDef) router.replace(`/compare?items=b:${encodeURIComponent(legacyDef)}:0&tab=ab&ab=${encodeURIComponent(legacyDef)}`);
  }, [legacyDef, router]);
  const setTab = (t: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (t === 'trends') q.delete('tab'); else q.set('tab', t);
    router.replace(`/compare?${q.toString()}`);
  };
  // The item the A/B tab splits, in the URL (ab=<item id>); the first block or rule when left out.
  const abChosen = params.get('ab');
  const chooseAb = (id: string) => {
    const q = new URLSearchParams(params.toString());
    q.set('ab', id);
    router.replace(`/compare?${q.toString()}`);
  };
  /** The link of this screen on the A/B tab, splitting an item. */
  const abHref = (id: string) => { const q = new URLSearchParams(params.toString()); q.set('tab', 'ab'); q.set('ab', id); return `/compare?${q.toString()}`; };
  // The curve, Speed or Power (curve=power; Speed when left out), read from the runs only while its tab is open.
  const curveMetric: CurveMetric = params.get('curve') === 'power' ? 'power' : 'speed';
  const curve: CurveMetric | null = tab === 'curve' ? curveMetric : null;
  const setCurve = (m: CurveMetric) => {
    const q = new URLSearchParams(params.toString());
    q.set('tab', 'curve');
    if (m === 'power') q.set('curve', 'power'); else q.delete('curve');
    router.replace(`/compare?${q.toString()}`);
  };

  const color = (i: AnalysisItem) => SLOT_COLORS[i.slot % SLOT_COLORS.length];
  const shape = (i: AnalysisItem) => SLOT_SHAPES[i.slot % SLOT_SHAPES.length];
  const label = (i: AnalysisItem) => {
    if (i.kind !== 'run') return defOf(i)?.name ?? 'segment';
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

  // The analysis as its Dashboard widget keeps it: its items and metrics.
  const pinQuery = `items=${formatItems(items)}&m=${metrics.join(',')}`;
  // One time range for every Over time chart.
  const groupsByMetric = metrics.map((mt) => ({ mt, groups: groupsFor(mt) }));
  const allT = groupsByMetric.flatMap((g) => g.groups.flatMap((x) => x.points.map((p) => p.t)));
  const domain: [number, number] | undefined = allT.length ? [Math.min(...allT) - 4 * DAY, Math.max(...allT) + 4 * DAY] : undefined;
  const markers: Marker[] = useMemo(() => gear.map((g) => ({ date: `${g.from}T00:00:00`, label: `${g.type === 'shoes' ? '👟' : '♥'} ${g.name}` })), [gear]);

  // The curve of each item, from the stretches it holds: a block's segments, a run whole.
  const sourcesKey = useMemo(() => {
    if (!curve) return '[]';
    const sources: CurveSource[] = items.map((i) => {
      if (i.kind === 'run') return { key: i.id, metric: curve, ranges: { [i.id]: [[0, 1e9] as [number, number]] } };
      const id = i.kind === 'rule' ? ruleId(i.id) : i.id;
      const ranges: Record<string, [number, number][]> = {};
      for (const x of all) if (x.definitionId === id && x.status === 'accepted') (ranges[x.runId] ??= []).push([x.start, x.end]);
      return { key: i.id, metric: curve, ranges };
    });
    return JSON.stringify(sources);
  }, [curve, items, all]);
  useEffect(() => {
    const list = JSON.parse(sourcesKey) as CurveSource[];
    if (!list.length) return;
    const controller = new AbortController();
    let live = true;
    curvesInWorker(list, handle, (p) => live && setProgress({ done: p.done, total: p.total }), controller.signal)
      .then((got) => live && setCurves({ metric: list[0].metric ?? 'speed', by: new Map(Object.entries(got)) }))
      .catch(() => undefined)
      .finally(() => live && setProgress(null));
    return () => { live = false; controller.abort(); };
  }, [sourcesKey, handle]);

  // The items drawn on the curve, once their bests are read for the metric shown.
  const curveItems = curve && curves.metric === curve ? items.filter((i) => curves.by.has(i.id)).map((i) => ({ key: i.id, label: label(i), color: color(i), shape: shape(i) })) : [];

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
  /** A rule that lives in the link kept in the folder: it stays in the list and can be compared A/B. */
  const saveItem = async (i: AnalysisItem) => {
    const d = linkDef(i.id);
    if (!d) return;
    const def = { ...definitionFromRule(isUnsaved(i.id) ? d.name : '', asRule(d.params, d.tolerances)), tolerances: d.tolerances };
    await keep(`Saving ${def.name}`, (d) => [...d, def]);
    setItems(latest.current.map((x) => (x.id === i.id ? { kind: 'block', id: def.id, slot: x.slot } : x)));
  };
  const saveEdited = async (i: AnalysisItem, d: BlockDefinition) => {
    setEditing(null);
    if (i.kind === 'block') return keep(`Re-detecting ${d.name}`, (ds) => ds.map((x) => (x.id === d.id ? d : x)));
    if (d.params.type !== 'rule') return;
    // An unsaved segment changes under a new code (its efforts are found again); a rule of the link, in the link.
    if (isUnsaved(i.id)) { const code = keepUnsaved({ ...d, id: '' }); return setItems(latest.current.map((x) => (x.id === i.id ? { ...x, id: code } : x))); }
    const { type: _type, ...rule } = d.params;
    setItems(latest.current.map((x) => (x.id === i.id ? { ...x, id: encodeRule(rule as Rule) } : x)));
  };
  const deleteBlock = async (i: AnalysisItem, d: BlockDefinition) => {
    setEditing(null);
    setItems(latest.current.filter((x) => x.id !== i.id));
    await keep(`Deleting ${d.name}`, (ds) => ds.filter((x) => x.id !== d.id));
  };

  if (!loaded) return <div className="page wide-page"><div className="page-head"><h1>Compare</h1></div></div>;

  const tableFor = blocks.find((i) => i.id === tableItem) ?? blocks[0];
  /** True for the effort that is the part compared from: in its run, over at least half of it. */
  const isReference = (e: BlockInstance) => !!reference && e.runId === reference.runId && Math.min(e.end, reference.to) - Math.max(e.start, reference.from) > 0.5 * (reference.to - reference.from);
  const tableKey = tableMetric ?? metrics[0];
  const tableView = view(tableKey);
  const selection = tableFor ? selectInstances(all, defId(tableFor), tableKey) : null;
  const lowerBetter = tableView.invert === true || ['heartRate', 'groundContactTime', 'verticalOscillation'].includes(tableKey);
  const segments = selection ? selection.included.map((i) => ({ i, v: valueOf(i, tableKey)! })) : [];
  // Drawn on the overlay: the efforts chosen; at first the part compared from with the two newest others.
  const keyOfEffort = (e: BlockInstance) => `${e.runId}:${e.start}`;
  const byKey = new Map(segments.map(({ i }) => [keyOfEffort(i), i]));
  const firstChoice = () => {
    const ref = segments.find(({ i }) => isReference(i));
    if (!ref) return [];
    const others = segments.filter(({ i }) => i !== ref.i).map(({ i }) => i).sort((a, b) => b.runStart.localeCompare(a.runStart)).slice(0, 2);
    return [ref.i, ...others].map(keyOfEffort);
  };
  const chosen = (tableFor && picked[tableFor.id]) ?? firstChoice();
  const drawn = chosen.flatMap((k) => { const e = byKey.get(k); return e ? [{ runId: e.runId, from: e.start, to: e.end, reference: isReference(e) }] : []; });
  const tableRows = sort === 'date' ? [...segments].reverse() : [...segments].sort((a, b) => ((sort === 'best') === lowerBetter ? a.v - b.v : b.v - a.v)).slice(0, top);
  const titleOf = (runId: string) => runs.find((r) => r.id === runId)?.title ?? null;
  const computing = items.some((i) => i.kind === 'rule' && !adhoc.has(i.id));
  const editingDef = editing ? defOf(editing) : null;

  return (
    <div className="page wide-page">
      <div className="page-head">
        <h1>Compare</h1>
        <span className="spacer" />
        {busy && <span className="chip">⟳ {busy}…</span>}
        <SavedAnalyses folder={folder} query={params.toString()} labels={items.map(label)} hasItems={items.length > 0} onOpen={(q) => router.replace(`/compare${q ? `?${q}` : ''}`)} />
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
            {i.kind === 'rule' && <button className="item-save" title="Keep this segment in the folder: it stays in the list and can be compared A/B" disabled={!!busy} onClick={() => saveItem(i)}>Save</button>}
            {i.kind !== 'run' && <button className="item-save" aria-label={`Edit ${label(i)}`} disabled={!!busy} onClick={() => setEditing(i)}>Edit</button>}
            <button className="item-remove" aria-label={`Remove ${label(i)}`} onClick={() => setItems(items.filter((x) => x.id !== i.id))}>×</button>
          </span>
        ))}
        <button className="btn" disabled={items.length >= MAX_ITEMS || !!busy} onClick={() => setAdding(true)}>+ Add segment or run</button>
        {items.length >= MAX_ITEMS && <span className="muted small">Up to {MAX_ITEMS} at once.</span>}
      </div>


      <>
        {/* The progress stands in the row of the tabs, which keeps its height: nothing below moves (Core Web Vitals). */}
        <div className="tabs-row">
          <div className="tabs analysis-tabs" role="tablist" aria-label="Compare sections">
            {TABS.map(([t, name]) => (
              <button key={t} type="button" role="tab" id={`tab-${t}`} aria-controls={tab === t ? `panel-${t}` : undefined} aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{name}</button>
            ))}
          </div>
          {progress && (
            <span className="tabs-progress" role="status">
              <span className="muted small">Reading the runs… {progress.done} / {progress.total || '…'}</span>
              <span className="progress"><span style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '3%' }} /></span>
            </span>
          )}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="analysis-panel">
          {finding && <div className="card empty" role="status">{finding}</div>}
          {!items.length && !similar && (
            <>
              <SavedList folder={folder} onOpen={(q) => router.replace(`/compare${q ? `?${q}` : ''}`)} />
              <div className="card empty">
                Choose the data to analyse: press <b>+ Add segment or run</b> and add one of your segments (your best 5 minutes with the heart rate above 160, the laps of 3 to 5 km, a route…), one found in your runs, All runs, or a single run; or open an analysis you saved. New segments are made on the Segments screen.
              </div>
            </>
          )}
          {items.length > 0 && tab === 'trends' && (
            <>
              <div className="toolbar">
                <div className="metric-picker" role="group" aria-label="Metrics">
                  {METRICS.map((x) => <button key={x.key} className={`pill ${metrics.includes(x.key) ? 'on' : ''}`} aria-pressed={metrics.includes(x.key)} title={x.name} onClick={() => toggleMetric(x.key)}>{x.short}</button>)}
                </div>
                <div className="segmented" role="group" aria-label="Segment values" title="Corrected: residual pace difference removed by regression">
                  <button className={!corrected ? 'on' : ''} onClick={() => setCorrected(false)}>Raw</button>
                  <button className={corrected ? 'on' : ''} onClick={() => setCorrected(true)}>Corrected</button>
                </div>
                <label className="setting inline"><input type="checkbox" checked={joinPoints} onChange={(e) => setJoin(e.target.checked)} /> Join points</label>
                <label className="setting inline"><input type="checkbox" checked={trendLine} onChange={(e) => setTrend(e.target.checked)} /> Trend line</label>
              </div>
              <div className="card chart pin-host">
                <PinButton folder={folder} kind="compare" target={pinQuery} name={`Over time · ${items.map(label).join(', ')}`} />
                <h3 className="chart-title">Over time <span className="muted">· each segment&apos;s efforts with its trend line, each run&apos;s average</span></h3>
                {/* While a rule's segments are read, the charts' room is kept, so nothing below moves when they come. */}
                {computing && <div className="chart-loading muted small" style={{ height: metrics.length > 1 ? metrics.length * 236 : 326 }}>Reading the runs…</div>}
                {!computing && groupsByMetric.map(({ mt, groups }, k) => (
                  <div key={mt} className="stacked">
                    <div className="metric-head" style={{ paddingLeft: 52 }}><span className="metric-title">{view(mt).short}<span className="muted"> · {view(mt).name.replace(/^.*\((.*)\)$/, '$1')}</span></span></div>
                    <OverTimeChart title={view(mt).name} groups={groups} format={view(mt).fmt} tick={view(mt).tick} minSpan={view(mt).minSpan} invert={view(mt).invert} markers={markers}
                      domain={domain} join={joinPoints} fit={trendLine} labels={k === 0} height={metrics.length > 1 ? 210 : 300} />
                  </div>
                ))}
                <div className="chart-note">Thin line: the points in date order. Thick line: the fitted trend, its band the noise between a segment&apos;s efforts (±1 standard deviation). Click a point to open its run.</div>
              </div>

              <TrendVerdicts metrics={metrics} all={all} corrected={corrected} trendsBy={trendsBy}
                rows={blocks.map((i) => ({ id: i.id, defId: defId(i), label: label(i), shape: shape(i), color: color(i), attributes: attributes(defOf(i)), abHref: abHref(i.id), pending: i.kind === 'rule' && !adhoc.has(i.id) }))} />
            </>
          )}
          {items.length > 0 && tab === 'segments' && (
            <>
              {tableFor && selection && (
                <div className="card" style={{ overflowX: 'auto' }}>
                  <div className="toolbar" style={{ padding: '12px 18px 0' }}>
                    <span className="chart-title" style={{ margin: 0 }}>Efforts</span>
                    {blocks.length > 1 && (
                      <select className="select small" aria-label="Segment" value={tableFor.id} onChange={(e) => setTableItem(e.target.value)}>
                        {blocks.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
                      </select>
                    )}
                    <select className="select small" aria-label="Table metric" value={tableKey} onChange={(e) => setTableMetric(e.target.value as BlockMetric)}>
                      {METRICS.map((x) => <option key={x.key} value={x.key}>{x.short}</option>)}
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
                  {/* The efforts chosen, drawn over each other by distance ("tak" to the overlay for any segment's efforts). */}
                  {drawn.length > 0 && <EffortsChart efforts={drawn} handle={handle} folder={folder} />}
                  <SegmentsTable rows={tableRows} ranked={sort !== 'date'} lowerBetter={lowerBetter} metricName={tableView.name} fmt={tableView.fmt} titleOf={titleOf} computing={computing}
                    similarHref={(e) => { const q = new URLSearchParams(params.toString()); q.set('similar', `${e.runId}~${e.start}~${e.end}`); return `/compare?${q.toString()}`; }}
                    chosen={chosen} onToggle={(e) => { const k = `${e.runId}:${e.start}`; setPicked((p) => ({ ...p, [tableFor.id]: chosen.includes(k) ? chosen.filter((x) => x !== k) : chosen.length >= 4 ? chosen : [...chosen, k] })); }}
                    isReference={isReference} />
                </div>
              )}
            </>
          )}
          {items.length > 0 && tab === 'ab' && (
            <AbTab items={blocks.map((i) => ({ id: i.id, defId: defId(i), label: label(i) }))} all={all} chosen={abChosen} onChoose={chooseAb} computing={computing} />
          )}
          {items.length > 0 && tab === 'curve' && (
            <>
              <div className="toolbar">
                <div className="segmented" role="group" aria-label="Curve" title="For each length of time, the best effort of that length inside the item's efforts: the fastest, or the highest average power">
                  {([['speed', 'Speed'], ['power', 'Power']] as const).map(([m, name]) => (
                    <button key={m} className={curveMetric === m ? 'on' : ''} aria-pressed={curveMetric === m} onClick={() => setCurve(m)}>{name}</button>
                  ))}
                </div>
                <span className="muted small">{curveMetric === 'speed' ? 'The best effort of each length of time, as a pace.' : 'The highest average power of each length of time.'}</span>
              </div>
              {curve && <CurveTab metric={curve} items={curveItems} bests={curves.by} missingPower={curve === 'power' && curves.metric === 'power' && items.some((i) => (curves.by.get(i.id)?.length ?? 0) === 0)} />}

            </>
          )}
        </div>
      </>

      {adding && <AddDialog defs={defs} recs={recs} runs={runs} items={items} allRuns={ALL_RUNS}
        onAdd={(kind, id) => { setItems(addItem(items, kind, id)); setAdding(false); }} onAccept={acceptSuggestion} onDismiss={dismissSuggestion} onClose={() => setAdding(false)} />}
      {editing && editingDef && <BlockSheet def={editingDef} kept={editing.kind === 'block'} options={options} handle={handle} onClose={() => setEditing(null)} onSave={(d) => saveEdited(editing, d)} onDelete={(d) => deleteBlock(editing, d)} />}
    </div>
  );
}

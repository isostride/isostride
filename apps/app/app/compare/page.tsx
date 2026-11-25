'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditButton, ItemKey, useDataVersion, useMetrics, OverTimeChart, SLOT_COLORS, SLOT_SHAPES, type Marker, type OverTimeGroup, eager } from '@/components';
import { RECOMMENDATIONS_PATH, RULE_TOLERANCES, asRule, definitionFromProfile, definitionFromRoute, decodeRule, definitionFromRule, encodeRule, fromRecommendation, readDefinitions, ruleName, writeDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type BlockMetric, type Recommendation, type Rule, ruleOf } from '@/lib/blocks';
import { instancesInWorker, runInWorker, similarInWorker, useChartSettings, useOpenFolder } from '@/lib/client';
import { MAX_ITEMS, addItem, lapEfforts, computeTrend, firstUsableMetric, formatItems, instancesCsv, parseItems, runMean, type AnalysisItem } from '@/lib/compare';
import { PATHS, isOutdated, readJson, readManifest, readRunFile } from '@/lib/fs';
import { msg, t } from '@/lib/i18n';
import { readGear, type Gear } from '@/lib/gear';
import type { RunFile, RunsIndex } from '@/lib/kernel';
import { runName, segmentName, similarName } from './names';
import { runHref } from './links';
import type { BuilderOptions } from '../segments/RuleBuilder';
import { isUnsaved, keepUnsaved, readUnsaved } from './unsaved';

// The tabs' parts load when the tab is first opened (ADR "Built with React": 200 KB of script per route).
const AbTab = eager(() => import('./AbTab').then((m) => m.AbTab), () => <div className="card chart muted small" style={{ padding: 18 }}>{t('Loading the A/B comparison…')}</div>);
/** The picker and the sheet that edits a block, loaded when they open. */
/** The saved analyses: loaded after the screen (requirement "Saved analyses"). */
const SavedAnalyses = eager(() => import('./SavedAnalyses').then((m) => m.SavedAnalyses));
/** Pin to the Dashboard, in the Over time card's corner: loaded after the screen, as the budget wants. */
const PinButton = eager(() => import('../dashboard/PinButton').then((m) => m.PinButton));
const SavedList = eager(() => import('./SavedAnalyses').then((m) => m.SavedList));
const AddDialog = eager(() => import('./AddDialog').then((m) => m.AddDialog));
const BlockSheet = eager(() => import('../segments/BlockSheet').then((m) => m.BlockSheet));
const EffortsPanel = eager(() => import('./EffortsPanel').then((m) => m.EffortsPanel), () => <div className="card muted small" style={{ padding: 18 }}>{t('Loading the efforts…')}</div>);

const DAY = 86_400_000;
/** The item Analysis opens with: every run, whole (a rule with nothing set). */
const ALL_RUNS = encodeRule(ruleOf({ type: 'run' }));


/** The sections of the screen, one at a time (requirement "Analysis sections as tabs"). */
// No pace or power curve here ("czy krzywa tempa i mocy ma sens w analizie segmentow?" ... "usun"): the Performance screen has the best efforts.
type Tab = 'trends' | 'segments' | 'ab';
const TABS: [Tab, string][] = [['trends', msg('Trends')], ['segments', msg('Efforts')], ['ab', 'A/B']];
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
 * Over time charts, its efforts by run, and A/B.
 * The items live in the URL.
 */
function AnalysisPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { folder, handle } = useOpenFolder();
  // The folder's metrics (requirement "Every metric offered everywhere") and how each is shown.
  const known = useMetrics();
  const view = known.view;
  const METRICS = useMemo(() => known.blockKeys.map(known.view), [known]);
  const [loaded, setLoaded] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [defs, setDefs] = useState<BlockDefinition[]>([]);
  const [kept, setKept] = useState<BlockInstance[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [runs, setRuns] = useState<RunsIndex['runs']>([]);
  const [gear, setGear] = useState<Gear[]>([]);
  const [options, setOptions] = useState<BuilderOptions>({ workoutTypes: [], techniqueCues: [], shoes: [], heartRateSources: [], devices: [], layouts: [] });
  const [optionsRead, setOptionsRead] = useState(false);
  const [files, setFiles] = useState<Map<string, RunFile>>(new Map());
  const [adhoc, setAdhoc] = useState<Map<string, BlockInstance[]>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Join points and the trend line: in Settings, Charts ("lacz punkty, linia trenigu ma byc w settingach").
  const [{ join: joinPoints, trend: trendLine }] = useChartSettings();
  // Each segment's values evened out to the same pace, or as recorded: one choice for Trends and A/B, kept in the
  // link (pace=raw when off) ("w wielu miejscach mam skorygowana i surowa").
  const corrected = params.get('pace') !== 'raw';
  const setCorrected = (on: boolean) => {
    const q = new URLSearchParams(params.toString());
    if (on) q.delete('pace'); else q.set('pace', 'raw');
    router.replace(`/compare?${q.toString()}`);
  };
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AnalysisItem | null>(null);
  // What the editor offers to choose runs by: read when the editor first opens (the screen's script stays small).
  useEffect(() => {
    if (optionsRead || !editing) return;
    setOptionsRead(true);
    import('../segments/options').then((m) => m.builderOptions(folder, runs)).then(setOptions).catch(() => undefined);
  }, [optionsRead, editing, folder, runs]);
  const [tableItem, setTableItem] = useState<string | null>(null);
  /** the efforts drawn on the overlay of the Efforts tab, per segment, by key (run:start) */

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
      for (const i of need) { const f = await readRunFile(folder, i.id); if (f) next.set(i.id, f); }
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
  // The runs added whole, on the Efforts tab as one more choice: each run a row, its laps its efforts ("w wysilkach jest pusto").
  const runIds = useMemo(() => items.filter((i) => i.kind === 'run').map((i) => i.id), [items]);
  // i18n-ignore: an id, never shown
  const RUNS_ITEM = '~runs';
  const runEfforts = useMemo(() => runIds.flatMap((id) => { const f = files.get(id); return f ? lapEfforts(f, RUNS_ITEM, known.blockKeys) : []; }), [runIds, files, known.blockKeys]);

  // The metrics chosen live in the URL too (m=speed,heartRate); none given: the first with a result.
  const firstBlock = blocks[0] ? defId(blocks[0]) : null;
  const metrics: BlockMetric[] = useMemo(() => {
    const given = (params.get('m') ?? '').split(',').filter((k): k is BlockMetric => METRICS.some((x) => x.key === k));
    if (given.length) return METRICS.map((x) => x.key).filter((k) => given.includes(k));
    // i18n-ignore: a metric's key
    return [firstBlock ? firstUsableMetric(all, firstBlock, METRICS.map((x) => x.key)) : 'speed'];
  }, [params, all, firstBlock, METRICS]);
  const toggleMetric = (k: BlockMetric) => {
    const next = metrics.includes(k) ? metrics.filter((x) => x !== k) : METRICS.map((x) => x.key).filter((x) => x === k || metrics.includes(x));
    if (!next.length) return;
    const q = new URLSearchParams(params.toString());
    q.set('m', next.join(','));
    router.replace(`/compare?${q.toString()}`);
  };
  // The tab, in the URL (tab=segments, tab=ab; Trends when left out).
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
    setFinding(t('Finding the efforts like this part…'));
    similarInWorker(similar, handle, undefined, controller.signal).then((r) => {
      const ref = r.reference;
      const add: BlockDefinition[] = [];
      if (r.route.length && r.track.length) add.push({ ...definitionFromRoute(r.track, r.key?.pace ?? null), name: similarName('route', ref) });
      if (r.profile.length && r.key) add.push({ ...definitionFromProfile(r.key), name: similarName('profile', ref) });
      let next = latest.current;
      const codes: string[] = [];
      for (const d of add) { const code = keepUnsaved(d); codes.push(code); next = addItem(next, 'rule', code); }
      const q = new URLSearchParams(params.toString());
      q.delete('similar');
      q.set('ref', `${similar.runId}~${similar.from}~${similar.to}`);
      q.set('items', formatItems(next));
      q.set('tab', 'segments');
      if (codes[0]) setTableItem(codes[0]);
      setFinding(add.length ? null : t('No other run passes over this part, and no effort of another run is alike enough.'));
      router.replace(`/compare?${q.toString()}`);
    }).catch((e: unknown) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setFinding(e instanceof Error ? e.message : String(e)); });
    return () => controller.abort();
    // The search follows the part asked for only.
  }, [similar]);
  // The Rep by rep tab, merged into Efforts ("Połącz w „Wysiłki”"): its links open Efforts.
  // Links of the tabs gone: Rep by rep opens Efforts, the curve Trends.
  const tab: Tab = tabParam === 'reps' ? 'segments' : TABS.some(([k]) => k === tabParam) ? (tabParam as Tab) : 'trends';
  // The form, a tab of Analysis at first, is the Performance screen: its old links open there.
  useEffect(() => { if (tabParam === 'form') router.replace('/performance?tab=load'); }, [tabParam, router]);
  // The A/B screen's old links (/compare?def=…, before A/B was a tab here) open A/B on that segment.
  const legacyDef = params.has('items') ? null : params.get('def');
  useEffect(() => {
    if (legacyDef) router.replace(`/compare?items=b:${encodeURIComponent(legacyDef)}:0&tab=ab&ab=${encodeURIComponent(legacyDef)}`);
  }, [legacyDef, router]);
  const setTab = (k: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (k === 'trends') q.delete('tab'); else q.set('tab', k);
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

  const color = (i: AnalysisItem) => SLOT_COLORS[i.slot % SLOT_COLORS.length];
  const shape = (i: AnalysisItem) => SLOT_SHAPES[i.slot % SLOT_SHAPES.length];
  const label = (i: AnalysisItem) => {
    if (i.kind !== 'run') { const d = defOf(i); return d ? segmentName(d) : t('segment'); }
    const r = runs.find((x) => x.id === i.id);
    return r ? t('Run {name}', { name: runName(r.startTime, r.distance, r.title) }) : t('run');
  };

  /** Each metric's trends of the blocks added. */
  const trendsBy = useMemo(() => new Map(metrics.map((mt) => [mt, new Map(blocks.map((i) => [i.id, computeTrend(all, i.kind === 'rule' ? ruleId(i.id) : i.id, mt, {}, corrected)]))])), [all, blocks, metrics, corrected]);

  const groupsFor = (metric: BlockMetric): OverTimeGroup[] => items.flatMap((i): OverTimeGroup[] => {
    const base = { key: i.id, label: label(i), color: color(i), shape: shape(i) };
    if (i.kind !== 'run') {
      const tr = trendsBy.get(metric)?.get(i.id);
      if (!tr) return [];
      return [{
        ...base,
        points: tr.series.flatMap((s) => s.points.map((p) => ({ t: Date.parse(p.date), v: corrected ? p.corrected : p.raw, instance: p.instance, note: t('minute {minute} of the run', { minute: p.instance.context.before.minuteOfRun }), href: runHref(p.instance.runId, p.instance.start, p.instance.end) }))),
        fits: tr.series.flatMap((s) => {
          if (!s.fit) return [];
          const t0 = Date.parse(s.points[0].date);
          const t1 = Date.parse(s.points[s.points.length - 1].date);
          return [{ t0, t1, v0: s.fit.intercept, v1: s.fit.intercept + s.fit.slope * ((t1 - t0) / DAY), noise: s.noise }];
        }),
      }];
    }
    const f = files.get(i.id);
    const v = f ? runMean(f, metric) : null;
    return f && v !== null ? [{ ...base, points: [{ t: Date.parse(f.startTime), v, note: t('average of the run'), href: runHref(f.id) }], fits: [] }] : [];
  });

  // The analysis as its Dashboard widget keeps it: its items and metrics.
  const pinQuery = `items=${formatItems(items)}&m=${metrics.join(',')}`;
  // One time range for every Over time chart.
  const groupsByMetric = metrics.map((mt) => ({ mt, groups: groupsFor(mt) }));
  const allT = groupsByMetric.flatMap((g) => g.groups.flatMap((x) => x.points.map((p) => p.t)));
  const domain: [number, number] | undefined = allT.length ? [Math.min(...allT) - 4 * DAY, Math.max(...allT) + 4 * DAY] : undefined;
  const markers: Marker[] = useMemo(() => gear.map((g) => ({ date: `${g.from}T00:00:00`, label: `${g.type === 'shoes' ? '👟' : '♥'} ${g.name}` })), [gear]);

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
    await keep(t('Adding {name}', { name: segmentName(rec) }), (d) => [...d, def]);
    setItems(addItem(latest.current, 'block', def.id));
  };
  const dismissSuggestion = (rec: Recommendation) => keep(t('Dismissing {name}', { name: segmentName(rec) }), (d) => [...d, fromRecommendation(rec, 'rejected')]);
  /** A rule that lives in the link kept in the folder: it stays in the list and can be compared A/B. */
  const saveItem = async (i: AnalysisItem) => {
    const d = linkDef(i.id);
    if (!d) return;
    const def = { ...definitionFromRule(isUnsaved(i.id) ? d.name : '', asRule(d.params, d.tolerances)), tolerances: d.tolerances };
    await keep(t('Saving {name}', { name: segmentName(def) }), (d) => [...d, def]);
    setItems(latest.current.map((x) => (x.id === i.id ? { kind: 'block', id: def.id, slot: x.slot } : x)));
  };
  const saveEdited = async (i: AnalysisItem, d: BlockDefinition) => {
    setEditing(null);
    if (i.kind === 'block') return keep(t('Re-detecting {name}', { name: segmentName(d) }), (ds) => ds.map((x) => (x.id === d.id ? d : x)));
    if (d.params.type !== 'rule') return;
    // An unsaved segment changes under a new code (its efforts are found again); a rule of the link, in the link.
    if (isUnsaved(i.id)) { const code = keepUnsaved({ ...d, id: '' }); return setItems(latest.current.map((x) => (x.id === i.id ? { ...x, id: code } : x))); }
    const { type: _type, ...rule } = d.params;
    setItems(latest.current.map((x) => (x.id === i.id ? { ...x, id: encodeRule(rule as Rule) } : x)));
  };
  const deleteBlock = async (i: AnalysisItem, d: BlockDefinition) => {
    setEditing(null);
    setItems(latest.current.filter((x) => x.id !== i.id));
    await keep(t('Deleting {name}', { name: segmentName(d) }), (ds) => ds.filter((x) => x.id !== d.id));
  };

  if (!loaded) return <div className="page wide-page"><div className="page-head"><h1>{t('Compare')}</h1></div></div>;

  const titleOf = (runId: string) => runs.find((r) => r.id === runId)?.title ?? null;
  const computing = items.some((i) => i.kind === 'rule' && !adhoc.has(i.id));
  const editingDef = editing ? defOf(editing) : null;

  return (
    <div className="page wide-page">
      <div className="page-head">
        <h1>{t('Compare')}</h1>
        <span className="spacer" />
        {busy && <span className="chip">⟳ {busy}…</span>}
        <SavedAnalyses folder={folder} query={params.toString()} labels={items.map(label)} hasItems={items.length > 0} onOpen={(q) => router.replace(`/compare${q ? `?${q}` : ''}`)} />
        {blocks.length > 0 && <button className="btn" onClick={exportCsv}>{t('Export CSV')}</button>}
        {/* At the right of the head, as New segment on Segments ("add segment or run daj po prawej tak samo jak w segments"). */}
        <button className="btn primary" disabled={items.length >= MAX_ITEMS || !!busy} onClick={() => setAdding(true)}>{t('+ Add segment or run')}</button>
      </div>

      {outdated && (
        <div className="banner warn">
          {t('These results were computed by an older version of the app, so some metrics (such as efficiency) are missing.')} <Link href="/">{t('Recompute on the Runs screen')}</Link> {t('to bring them up to date.')}
        </div>
      )}

      {/* What is compared, apart from the tabs that show it ("filtry sie zlewaja z podstronami"): the data, then the metrics
          and how the values are read, one choice for Trends, Efforts and A/B. */}
      {items.length > 0 && (
        <section className="card analysis-filters" aria-label={t('What is compared')}>
          <div className="filter-row">
            <span className="filter-label">{t('Data')}</span>
            <div className="items-bar">
            {items.map((i) => (
              <span key={i.id} className="item-chip">
                <ItemKey shape={shape(i)} color={color(i)} />
                <span>{label(i)}</span>
                {i.kind === 'rule' && <button className="item-save" title={t('Keep this segment in the folder: it stays in the list and can be compared A/B')} disabled={!!busy} onClick={() => saveItem(i)}>{t('Save')}</button>}
                {i.kind !== 'run' && <EditButton small name={label(i)} disabled={!!busy} onClick={() => setEditing(i)} />}
                <button className="item-remove" aria-label={t('Remove {name}', { name: label(i) })} onClick={() => setItems(items.filter((x) => x.id !== i.id))}>×</button>
              </span>
            ))}
            {items.length >= MAX_ITEMS && <span className="muted small">{t('Up to {n} at once.', { n: MAX_ITEMS })}</span>}
            </div>
          </div>
          <div className="filter-row">
            <span className="filter-label">{t('Metrics')}</span>
            <div className="metric-picker" role="group" aria-label={t('Metrics')}>
              {METRICS.map((x) => <button key={x.key} className={`pill ${metrics.includes(x.key) ? 'on' : ''}`} aria-pressed={metrics.includes(x.key)} title={x.name} onClick={() => toggleMetric(x.key)}>{x.short}</button>)}
            </div>
            <label className="setting inline pace-even" title={t('Each value moved to the segment’s mean pace, by how the metric goes with the pace across its efforts: what is left is what the pace does not explain (technique, form). The pace itself is never moved.')}>
              <input type="checkbox" checked={corrected} onChange={(e) => setCorrected(e.target.checked)} /> {t('Even out to the same pace')}
            </label>
          </div>
        </section>
      )}

      {/* No analysis chosen: no tabs to show nothing ("zobacz co widze gdy nie wybiore zadnej analizy"); the analyses saved, then a start. */}
      {!items.length && (
        <div className="analysis-empty">
          {finding && <div className="card empty" role="status">{finding}</div>}
          {!similar && (
            <>
              {/* The analyses saved; none: one line (the head's button starts one, its list makes a new segment too: "czym sie rozni przycisk na dole od tego w prawym gornym rogu?"). */}
              <SavedList folder={folder} onOpen={(q) => router.replace(`/compare${q ? `?${q}` : ''}`)}
                empty={<p className="muted analysis-start">{t('Start an analysis with + Add segment or run.')}</p>} />
            </>
          )}
        </div>
      )}

      {items.length > 0 && <>
        {/* The progress stands in the row of the tabs, which keeps its height: nothing below moves (Core Web Vitals). */}
        <div className="tabs-row">
          <div className="tabs analysis-tabs" role="tablist" aria-label={t('Compare sections')}>
            {TABS.map(([k, name]) => (
              <button key={k} type="button" role="tab" id={`tab-${k}`} aria-controls={tab === k ? `panel-${k}` : undefined} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(name)}</button>
            ))}
          </div>
          {progress && (
            <span className="tabs-progress" role="status" aria-label={progress.total ? t('Reading the runs: {done} of {total}', { done: progress.done, total: progress.total }) : t('Reading the runs: {done} of all', { done: progress.done })}>
              <span className="progress"><span style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '3%' }} /></span>
              {/* No count that changes as it goes: a text that changes its width moves (layout shift 0); the bar shows how far, the label says it. */}
              <span className="muted small" aria-hidden="true">{t('Reading the runs…')}</span>
            </span>
          )}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="analysis-panel">
          {finding && <div className="card empty" role="status">{finding}</div>}
          {items.length > 0 && tab === 'trends' && (
            <>
              <div className="card chart pin-host">
                <PinButton folder={folder} kind="compare" target={pinQuery} name={t('Over time · {items}', { items: items.map(label).join(', ') })} />
                <h3 className="chart-title">{t('Over time')} <span className="muted">· {t("each segment's efforts with its trend line, each run's average")}</span></h3>
                {/* While a rule's segments are read, the charts' room is kept, so nothing below moves when they come. */}
                {computing && <div className="chart-loading muted small" style={{ height: metrics.length > 1 ? metrics.length * 228 + (metrics.length - 1) * 21 : 318 }}>{t('Reading the runs…')}</div>}
                {!computing && groupsByMetric.map(({ mt, groups }, k) => (
                  <div key={mt} className="stacked">
                    <div className="metric-head" style={{ paddingLeft: 52 }}><span className="metric-title">{view(mt).short}<span className="muted"> · {view(mt).name.replace(/^.*\((.*)\)$/, '$1')}</span></span></div>
                    <OverTimeChart title={view(mt).name} groups={groups} format={view(mt).fmt} tick={view(mt).tick} minSpan={view(mt).minSpan} invert={view(mt).invert} markers={markers}
                      domain={domain} join={joinPoints} fit={trendLine} labels={k === 0} height={metrics.length > 1 ? 210 : 300} />
                  </div>
                ))}
                <div className="chart-note">{t("Thin line: the points in date order. Thick line: the fitted trend, its band the noise between a segment's efforts (±1 standard deviation). Click a point to open its run.")}</div>
              </div>

              {/* No table of changes under the charts ("ok usun mi to wogole z dolu"): the Efforts tab has the changes by run. */}
            </>
          )}
          {items.length > 0 && tab === 'segments' && (blocks.length > 0 || runIds.length > 0) && (
            <EffortsPanel blocks={[...blocks.map((i) => ({ id: i.id, defId: defId(i), label: label(i) })), ...(runIds.length ? [{ id: RUNS_ITEM, defId: RUNS_ITEM, label: t('The runs added, lap by lap') }] : [])]} item={tableItem} onItem={setTableItem} all={runEfforts.length ? [...all, ...runEfforts] : all} metric={metrics[0]} metrics={metrics}
              reference={reference} titleOf={titleOf} computing={computing} handle={handle} folder={folder} />
          )}
          {items.length > 0 && tab === 'ab' && (
            <AbTab items={blocks.map((i) => ({ id: i.id, defId: defId(i), label: label(i) }))} all={all} chosen={abChosen} onChoose={chooseAb} computing={computing} corrected={corrected} metrics={metrics} />
          )}
        </div>
      </>}

      {adding && <AddDialog defs={defs} recs={recs} runs={runs} items={items} allRuns={ALL_RUNS}
        onAdd={(kind, id) => { setItems(addItem(items, kind, id)); setAdding(false); }} onAccept={acceptSuggestion} onDismiss={dismissSuggestion} onClose={() => setAdding(false)} />}
      {editing && editingDef && <BlockSheet def={editingDef} kept={editing.kind === 'block'} options={options} handle={handle} onClose={() => setEditing(null)} onSave={(d) => saveEdited(editing, d)} onDelete={(d) => deleteBlock(editing, d)} />}
    </div>
  );
}

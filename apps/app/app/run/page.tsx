'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { MIN_SPAN, RouteMap, RunChart, clampDomain, clock, distanceMap, mergeParams, rollingMean, smoothSpan, viewFromParams, viewToParams, SCREEN_LEAVE, type Domain, type MapCamera, type RunLine, type RunMark, type RunView, backTarget, previousPage, runStartOf, eager } from '@/components';
import { readChartSettings, runInWorker, useChartSettings, useLocale, useOpenFolder } from '@/lib/client';
import { msg, number, t, tn } from '@/lib/i18n';
import { readGear, readRunTags, writeRunTags, type Gear, type RunTag, type RunTagsFile } from '@/lib/gear';
import { PATHS, readJson, readRunFile, markRunsSeen } from '@/lib/fs';
import type { RunFile, RunsIndex } from '@/lib/kernel';
import { asRule, efficiencyOf, rangeStats, readDefinitions, reasonText, shownName, zoneShares, type BlockInstance, type Rule } from '@/lib/blocks';
import { date, duration, km, pace, time } from '@/lib/format';
import { LOAD_MODELS, readSettings, zoneOf, zoneTint } from '@/lib/settings';
import { runMetricsOf, secondsOf, seriesOf, withSecondExtremes, type WindowKey } from './metrics';

/** Pin to the Dashboard, in the board's corner: loaded after the screen, as the budget wants. */
const PinButton = eager(() => import('../dashboard/PinButton').then((m) => m.PinButton));
/** The editor of the run's tags: loaded when it opens. */
const TagEditor = eager(() => import('./TagEditor').then((m) => m.TagEditor));
/** Compare with the previous run of a workout's layout: loaded after the screen. */
const WorkoutLink = eager(() => import('./WorkoutLink').then((m) => m.WorkoutLink));
/** The map made large, coloured by a metric: loaded when it opens. */
const RouteExpanded = eager(() => import('./RouteExpanded').then((m) => m.RouteExpanded));

/** The metrics shown, at most 4: a slot each, the slot giving the colour, so a metric keeps its colour while shown. */
const SLOTS_KEY = 'strideprism.runChart';
const SLOT_COUNT = 4;
const DEFAULT_SLOTS: (WindowKey | null)[] = ['speed', 'heartRate', 'cadence', 'groundContactTime'];
/** A metric's key in a link or a saved view: any metric's (ADR "Metrics from the file"); a run without it shows none. */
const KEYS = { has: (k: string) => /^[A-Za-z][\w.]*$/.test(k) };
/** The least and the most height of the chart's plot, px. */
const MIN_CHART = 180;
const MAX_CHART = 560;

/** The key of a run's remembered view in the browser. */
const viewKey = (id: string) => `strideprism.runView.${id}`; // i18n-ignore
/** The key of the view a run was left with before its link was written: the link it was left at, and the view. */
const leftKey = (id: string) => `strideprism.runViewLeft.${id}`; // i18n-ignore

/**
 * The browser's own key of the history entry shown (the Navigation API of the Chromium browsers the
 * app runs in): the view a run was left with belongs to its entry, so going back to it finds the view,
 * and opening the run anew (a new entry) does not. Null without the API.
 */
const entryKey = (): string | null => (window as unknown as { navigation?: { currentEntry?: { key?: string } } }).navigation?.currentEntry?.key ?? null;

/** The last choices made on any run: the base of a run opened with nothing in its link nor memory. */
function lastChoices(): RunView {
  const v: RunView = { range: null, slots: DEFAULT_SLOTS, focus: null, layout: 'bands', axis: 'time', smooth: true, blocks: false, map: null };
  try {
    const saved = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length === SLOT_COUNT && saved.every((k) => k === null || KEYS.has(k))) v.slots = saved;
    Object.assign(v, readChartSettings());
  } catch { /* the defaults */ }
  return v;
}

export default function RunPageWrapper() {
  return (
    <Suspense>
      <RunOf />
    </Suspense>
  );
}

/** One page per run: opening another run starts from its own view. */
function RunOf() {
  const id = useSearchParams().get('id') ?? '';
  return <RunPage key={id} />;
}

/** Run: metrics over time on 10 s windows, the route, laps and quality-flagged windows. */
function RunPage() {
  const lang = useLocale();
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const { folder, handle } = useOpenFolder();
  const router = useRouter();
  // A run opened is no longer new (requirement "New runs marked new").
  useEffect(() => { if (id) markRunsSeen(folder, [id]).catch(() => undefined); }, [folder, id]);
  // The back link (requirement "Back to the previous screen"): what was shown before the run, as the back
  // arrow goes, from the browser's history; without its Navigation API, the screen the tab remembers.
  const [back, setBack] = useState<{ href: string; label: string; run?: string | null; steps: number }>({ href: '/', label: msg('Runs'), steps: 0 });
  useEffect(() => {
    const nav = (window as unknown as { navigation?: { currentEntry: { index: number } | null; entries: () => { url: string | null }[] } }).navigation;
    const path = (u: string | null) => { if (!u) return ''; const a = new URL(u); return a.origin === location.origin ? a.pathname + a.search : ''; };
    const prev = nav?.currentEntry ? previousPage(nav.entries().map((e) => path(e.url)), nav.currentEntry.index) : null;
    if (prev || nav) { setBack(prev ?? { href: '/', label: msg('Runs'), steps: 0 }); return; }
    const kept = backTarget(window.sessionStorage);
    setBack({ href: kept.href, label: kept.label, steps: kept.viaHistory ? 1 : 0 });
  }, [id]);
  const goBack = (e: MouseEvent) => { if (back.steps && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); history.go(-back.steps); } };
  const backName = back.run !== undefined ? (runStartOf(back.run ?? null) ? t('Run of {date}', { date: date(runStartOf(back.run ?? null)!) }) : t('Run')) : t(back.label);
  const [run, setRun] = useState<RunFile | null | undefined>(undefined);
  const [title, setTitle] = useState<string | null>(null);
  /** the run's workout type, technique cue and note, as the index holds them */
  const [tagged, setTagged] = useState<{ workoutType: string | null; techniqueCue: string | null; note: string | null }>({ workoutType: null, techniqueCue: null, note: null });
  /** the tags and the gear, read when the editor of the run's tags opens */
  const [tagEdit, setTagEdit] = useState<{ file: RunTagsFile; gear: Gear[] } | null>(null);
  /** read again after the run's tags are saved */
  const [tagsSaved, setTagsSaved] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  /** the efforts of segments in this run, each with its segment's saved name and rule (its name shown in the language in use) */
  const [found, setFound] = useState<(BlockInstance & { saved: string; rule: Rule | null })[]>([]);
  const blocks = useMemo(() => found.map((b) => ({ ...b, name: b.rule ? shownName(b.saved, b.rule) : b.saved })), [found, lang]);
  /** the zones of the metrics, from the settings */
  const [zones, setZones] = useState<Record<string, number[]>>({});
  // The run's load by the model of Settings, and the form that morning (requirement "Load model chosen in Settings").
  const [effort, setEffort] = useState<{ load: number; estimated: boolean; unit: string; model: string; form: number } | null>(null);
  // The view the page opens with ("chce aby wszystko bylo endkodowane w url"): the link's, then the
  // run's memory, then the last choices made on any run. A run opened afresh, its link naming nothing
  // but the run (from the list, the calendar, the palette), starts clean: no selection, zoom, scale or
  // map from before ("przy otwarciu runa ... chce abys wyczyscil poprzednie parametry .. tzn selection");
  // the metrics shown and the chart's settings are the last chosen. A link with a view (a reload, the
  // history, a link from Compare) opens as it says.
  const [start] = useState<RunView>(() => {
    let memory: URLSearchParams | null = null;
    let link = new URLSearchParams(params.toString());
    const afresh = [...link.keys()].every((k) => k === 'id');
    try {
      const m = afresh ? null : localStorage.getItem(viewKey(id));
      if (m) memory = new URLSearchParams(m);
      // Back at the very link the run was left at, before its last change reached it: that change wins;
      // never for a run opened afresh (its link naming only the run), which starts clean.
      // The entry of the history it was left in, when the browser tells it; else its link, not for a run opened afresh.
      const left = JSON.parse(localStorage.getItem(leftKey(id)) ?? 'null') as { link: string; entry?: string | null; view: string } | null;
      localStorage.removeItem(leftKey(id));
      const same = left && (left.entry ? left.entry === entryKey() : !afresh && left.link === params.toString());
      if (left && same) link = new URLSearchParams(left.view);
    } catch { /* none */ }
    return viewFromParams(mergeParams(link, memory), lastChoices(), KEYS);
  });
  const [slots, setSlots] = useState<(WindowKey | null)[]>(start.slots as (WindowKey | null)[]);
  const [focus, setFocus] = useState<string | null>(start.focus);
  /**
   * The range of time drawn, which is also the selection ("tak zmerguj"): the statistics, the marks,
   * the trend and the blocks work on it; null: the whole run. A stretch named in the link (a
   * segment opened from Analysis) opens as it.
   */
  const [zoom, setZoom] = useState<Domain | null>(start.range);
  const selection = zoom ? { from: zoom[0], to: zoom[1] } : null;
  /** the range shown was set by moving the map by hand: the map is not fitted back to it */
  const [mapLed, setMapLed] = useState(start.map !== null);
  /** the camera of the map moved by hand, for the link */
  const [mapCam, setMapCam] = useState<MapCamera | null>(start.map);
  // How the chart draws, from Settings, Charts ("ustawienia z charts przenies do settings - charts"):
  // each line in its own band (the default) or all over the whole height; smoothed by a rolling mean
  // that follows the zoom (the default) or the raw windows; the x axis by time (the default) or by
  // distance; the kept blocks drawn on it (off by default, "jest to nieczytelne") or only the one
  // pointed at in the list. The link records them; Settings decide them.
  const [chartSettings] = useChartSettings();
  const { layout, axis, smooth, blocks: showBlocks } = chartSettings;
  /** a statistic pointed at in the table, lit on the chart */
  const [hot, setHot] = useState<{ key: string; stat: 'min' | 'avg' | 'max' } | null>(null);
  /** the map made large, its route coloured by a metric ("moge powiekszyc widok mapy") */
  const [bigMap, setBigMap] = useState(false);
  const [pointed, setPointed] = useState<string | null>(null);
  // The chart takes the height the rest of the screen leaves it, so the screen needs no scrolling:
  // the room left under the page (or missing) is given to (or taken from) the chart.
  const [chartHeight, setChartHeight] = useState(240);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const fit = () => setChartHeight((h) => {
      const slack = innerHeight - (el.getBoundingClientRect().bottom + scrollY);
      const next = Math.max(MIN_CHART, Math.min(MAX_CHART, Math.round(h + slack)));
      return Math.abs(next - h) < 2 ? h : next;
    });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    addEventListener('resize', fit);
    return () => { ro.disconnect(); removeEventListener('resize', fit); };
  }, [run]);
  // Every change of the view goes into the link (replaced, no new history entry), the run's memory and
  // the last choices; a quarter of a second after the last one, as a wheel makes many in a row.
  // The view not yet written when the screen is left (within that quarter of a second) goes into the
  // run's memory as it closes, so coming back finds it (the link of the page left cannot change then).
  const unsaved = useRef<string | null>(null);
  /** the query of the link as last written (or as opened) */
  const written = useRef(params.toString());
  /** the history entry the run is shown in, read as it opens (at its close the browser is in the next one) */
  const entry = useRef<string | null>(null);
  useEffect(() => { entry.current = entryKey(); }, []);
  // A link to another screen clicked, or another screen chosen in the search: the link of this one is no longer written (the router, still loading
  // the next screen, would take that write for a return here and stay); the view goes into the run's
  // memory as the screen closes.
  const leaving = useRef(false);
  useEffect(() => {
    const click = (e: globalThis.MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a && !a.target && new URL(a.href, location.href).pathname !== location.pathname) leaving.current = true;
    };
    document.addEventListener('click', click, true);
    // Left from the search (⌘K): the same.
    const leave = () => { leaving.current = true; };
    window.addEventListener(SCREEN_LEAVE, leave);
    return () => { document.removeEventListener('click', click, true); window.removeEventListener(SCREEN_LEAVE, leave); };
  }, []);
  useEffect(() => {
    const view: RunView = { range: zoom, slots, focus, layout, axis, smooth, blocks: showBlocks, map: mapLed ? mapCam : null };
    const query = viewToParams(id, view).toString();
    unsaved.current = query;
    const timer = setTimeout(() => {
      if (leaving.current) return;
      unsaved.current = null;
      if (location.search !== `?${query}`) window.history.replaceState(null, '', `${location.pathname}?${query}`);
      written.current = query;
      try {
        localStorage.setItem(viewKey(id), query);
        localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
      } catch { /* not kept */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [id, zoom, slots, focus, layout, axis, smooth, showBlocks, mapLed, mapCam]);
  useEffect(() => () => {
    if (!unsaved.current) return;
    try {
      localStorage.setItem(viewKey(id), unsaved.current);
      localStorage.setItem(leftKey(id), JSON.stringify({ link: written.current, entry: entry.current, view: unsaved.current }));
    } catch { /* not kept */ }
  }, [id]);

  useEffect(() => {
    readRunFile(folder, id).then(setRun).catch(() => setRun(null));
    Promise.all([readSettings(folder), readJson<RunsIndex>(folder, PATHS.runsIndex)]).then(([s, idx]) => {
      setZones(s.zones);
      const row = idx?.runs.find((r) => r.id === id);
      setTitle(row?.title ?? null);
      setTagged({ workoutType: row?.workoutType ?? null, techniqueCue: row?.techniqueCue ?? null, note: row?.note ?? null });
      const model = LOAD_MODELS.find((m) => m.key === s.performance.load)!;
      setEffort(row && row.load !== null && row.load !== undefined ? { load: row.load, estimated: !!row.loadEstimated, unit: model.unit, model: model.name, form: row.form ?? 0 } : null);
    }).catch(() => setZones({}));
    (async () => {
      const defs = new Map((await readDefinitions(folder)).map((d) => [d.id, d]));
      const all = (await readJson<{ instances: BlockInstance[] }>(folder, PATHS.blockInstances))?.instances ?? [];
      setFound(all.filter((i) => i.runId === id).map((i) => {
        const d = defs.get(i.definitionId);
        return { ...i, saved: d?.name ?? i.definitionId, rule: d ? asRule(d.params, d.tolerances) : null };
      }).sort((a, b) => a.start - b.start));
    })();
  }, [folder, id, tagsSaved]);
  // The run's tags edited here as on the Runs list: saved, the context recomputed, the screen read again.
  const editTags = async () => setTagEdit({ file: await readRunTags(folder), gear: await readGear(folder) });
  const saveTags = async (tag: RunTag) => {
    if (!tagEdit) return;
    await writeRunTags(folder, { ...tagEdit.file, tags: { ...tagEdit.file.tags, [id]: tag } });
    await runInWorker('context', handle);
    setTagEdit(null);
    setTagsSaved((n) => n + 1);
  };

  const view = useMemo(() => {
    if (!run) return null;
    const w = run.windows;
    const WINDOW_SECONDS = w.start.length > 1 ? w.start[1] - w.start[0] : 10;
    // The chart second by second; the large map's colours by the 10 s windows.
    const wx = w.start.map((s) => s + WINDOW_SECONDS / 2);
    const { x, series } = secondsOf(run);
    const flagged: { from: number; to: number }[] = [];
    w.start.forEach((s, i) => {
      if (w.flags.stopped[i] || w.flags.grade[i] || w.flags.missingSignal[i]) flagged.push({ from: s, to: s + WINDOW_SECONDS });
    });
    const laps = run.laps.map((l, i) => ({ from: l.start, to: l.end, label: t('Lap {n} · {km} km · {time}', { n: i + 1, km: km(l.distance), time: duration(l.duration) }), short: t('Lap {n} · {km} km', { n: i + 1, km: km(l.distance) }) }));
    const wseries = seriesOf(run);
    const hr = (run.samples.values.heartRate ?? []).filter((v): v is number => v !== null);
    const avgHr = hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null;
    // Elevation gain from the 10 s windows (smoothed by them), climbs of at least 1 m.
    let gain = 0;
    const alt = (w.values.altitude ?? []).filter((v): v is number => v !== null);
    for (let i = 1; i < alt.length; i++) if (alt[i] - alt[i - 1] > 0) gain += alt[i] - alt[i - 1];
    // The run's length: to its last record.
    const last = run.samples.t.length ? run.samples.t[run.samples.t.length - 1] : 0;
    const total = last > 0 ? last : w.start.length ? w.start[w.start.length - 1] + WINDOW_SECONDS : 1;
    const dmap = distanceMap(run.samples.t, run.samples.distance);
    return { w, x, wx, total, dmap, flagged, laps, series, wseries, avgHr, gain: alt.length ? Math.round(gain) : null };
    // The laps' names follow the language.
  }, [run, lang]);

  // The statistics of the selection, the range shown; with none, of the whole run.
  const stats = useMemo(() => {
    if (!run || !view) return null;
    const [from, to] = zoom ?? [0, view.total];
    // The lowest and highest values second by second, as the chart draws them.
    const r = rangeStats(run, from, to);
    return { ...r, metrics: withSecondExtremes(r.metrics, view.x, view.series, from, to), what: zoom ? msg('Selection') : msg('Whole run') };
  }, [run, view, zoom]);


  // The run's metrics and the chart's lines, computed again only when what they show changes: not on
  // each move of the pointer over the chart (the cursor), which draws the page again.
  const metricsOfRun = useMemo(() => (run ? runMetricsOf(run) : []), [run, lang]);
  const shownSpan = view ? (zoom ? zoom[1] - zoom[0] : view.total) : 0;
  const span = smooth ? smoothSpan(shownSpan) : 0;
  const lines = useMemo<RunLine[]>(() => {
    if (!view) return [];
    return slots.flatMap((k, i) => {
      const m = metricsOfRun.find((x) => x.key === k);
      return m && view.series[m.key]?.some((v) => v !== null) ? [{ key: m.key, title: m.title, short: m.short, unit: m.unit, y: rollingMean(view.x, view.series[m.key], span), color: `var(--series-${i + 1})`, format: m.format, tick: m.tick, minSpan: m.minSpan, invert: m.invert, steps: m.steps, zones: zones[m.key] }] : [];
    });
  }, [view, slots, span, zones, metricsOfRun]);
  const mapMetrics = useMemo(() => (bigMap && view ? metricsOfRun.filter((m) => view.series[m.key]?.some((v) => v !== null)).map((m) => ({ key: m.key, title: m.title, format: m.format, invert: m.invert, values: rollingMean(view.wx, view.wseries[m.key], 30), zones: zones[m.key] })) : []), [bigMap, view, metricsOfRun, zones]);

  if (run === undefined) return <div className="page muted">{t('Loading…')}</div>;
  if (!run || !view) return <div className="page">{t('Run not found.')} <Link href={back.href} onClick={goBack} className="muted">← {backName}</Link></div>;
  const { x, laps, series, total, dmap } = view;
  /** the x axis drawn: by distance only when the run has one */
  const xAxis = axis === 'distance' && dmap.max > 0 ? 'distance' : 'time';
  // A stretch chosen anyhow becomes the range shown, exactly: the selection is the range.
  const select = (b: { from: number; to: number }) => setDomain(clampDomain([b.from, b.to], total));
  const clear = () => { setZoom(null); setMapLed(false); };
  const has = (k: WindowKey) => !!series[k]?.some((v) => v !== null);
  const METRICS = metricsOfRun;
  const domain: Domain = zoom ?? [0, total];
  const setDomain = (d: Domain) => { setMapLed(false); setZoom(d[0] <= 0 && d[1] >= total ? null : d); };
  // The map zoomed or panned by hand: the chart shows the range of time of the route in view.
  const fromMap = (r: { from: number; to: number } | null) => {
    setMapLed(true);
    // A stretch shorter than the chart's least range sits in the middle of it.
    const mid = r ? (r.from + r.to) / 2 : 0;
    const d = r ? clampDomain(r.to - r.from < MIN_SPAN ? [mid - MIN_SPAN / 2, mid + MIN_SPAN / 2] : [r.from, r.to], total) : null;
    setZoom(d && (d[0] > 0 || d[1] < total) ? d : null);
  };
  // A slot is free when empty or holding a metric this run has no data of.
  const free = slots.findIndex((k) => k === null || !has(k));
  const toggle = (k: WindowKey) => {
    const i = slots.indexOf(k);
    if (i < 0 && free < 0) return;
    const next = slots.map((s, j) => (j === i ? null : j === free && i < 0 ? k : s));
    setSlots(next);
    if (i >= 0 && focus === k) setFocus(null);
  };
  // Smooth: each line the rolling mean of its seconds over 1/30 of the range shown (span); Raw: every second.
  const colourOf = (k: WindowKey) => lines.find((l) => l.key === k)?.color;
  // The tooltip's head: the time, the distance and the lap.
  const head = (at: number) => {
    const i = run.samples.t.findIndex((s) => s >= at);
    const lap = run.laps.findIndex((l) => at >= l.start && at < l.end);
    return `${clock(at)}${i >= 0 && run.samples.distance[i] !== null ? ` · ${km(run.samples.distance[i]!)} km` : ''}${lap >= 0 ? ` · ${t('lap {n}', { n: lap + 1 })}` : ''}`;
  };
  const zoomed = zoom !== null;
  // The lap the selection is, if it is one.
  const lapIndex = selection ? run.laps.findIndex((l) => l.start === selection.from && l.end === selection.to) : -1;
  // The pace bars of the laps: from the slowest lap (a short bar) to the fastest (a full one).
  const lapSpeeds = run.laps.map((l) => (l.duration ? l.distance / l.duration : 0)).filter((v) => v > 0);
  const [slowestLap, fastestLap] = [Math.min(...lapSpeeds), Math.max(...lapSpeeds)];
  const lapBar = (v: number) => (v <= 0 ? 0 : fastestLap > slowestLap ? 25 + (75 * (v - slowestLap)) / (fastestLap - slowestLap) : 100);

  const shownStats = stats ? lines.flatMap((l) => { const v = stats.metrics[l.key as WindowKey]; return v ? [{ line: l, v }] : []; }) : [];
  // The key figures of the range ("popraw widget selection ... malo tam informacji").
  const covered = stats ? run.laps.flatMap((l, i) => (Math.min(l.end, stats.to) - Math.max(l.start, stats.from) > 1 ? [i + 1] : [])) : [];
  const figures: [string, string, string][] = stats ? [
    ['time', t('time'), duration(stats.seconds)],
    ['moving', t('moving time'), duration(stats.moving)],
    ['distance', t('distance'), stats.distance !== null ? `${km(stats.distance)} km` : '–'],
    ['elevation', t('elevation'), stats.ascent !== null ? `+${Math.round(stats.ascent)} / −${Math.round(stats.descent ?? 0)} m` : '–'],
    ['laps', covered.length > 1 ? t('laps') : t('lap'), covered.length === 0 ? '–' : t('{lap} of {n}', { lap: covered.length === 1 ? covered[0] : `${covered[0]}–${covered[covered.length - 1]}`, n: run.laps.length })],
    ['share', t('of the run'), `${Math.round(((stats.to - stats.from) / total) * 100)} %`],
  ] : [];
  // The time in zones of each metric shown that has zones.
  const zoneBars: { line: RunLine; shares: number[] }[] = stats ? lines.flatMap((l) => {
    if (!l.zones?.length) return [];
    const shares = zoneShares(run, l.key as WindowKey, l.zones.length + 1, (v) => zoneOf(l.key, l.zones!, v), stats.from, stats.to);
    return shares ? [{ line: l, shares }] : [];
  }) : [];

  return (
    <div ref={pageRef} className="page run-page">
      <div className="page-head run-head">
        <div>
          <div className="eyebrow"><Link href={back.href} onClick={goBack}>← {backName}</Link>{title && <span> · {date(run.startTime)} · {time(run.startTime)}</span>}</div>
          <h1>{title ?? <>{date(run.startTime)} <span className="muted">· {time(run.startTime)}</span></>}</h1>
        </div>
        <dl className="run-figures">
          <div><dt>{t('distance')}</dt><dd>{km(run.distance)} km</dd></div>
          <div><dt>{t('moving time')}</dt><dd>{duration(run.duration)}</dd></div>
          <div><dt>{t('average pace')}</dt><dd>{pace(run.distance / run.duration)} /km</dd></div>
          <div><dt>{t('average heart rate')}</dt><dd>{view.avgHr ?? '–'}{view.avgHr ? ' bpm' : ''}</dd></div>
          <div><dt>{t('elevation gain')}</dt><dd>{view.gain ?? '–'}{view.gain !== null ? ' m' : ''}</dd></div>
          {effort && <div className="run-load" title={(effort.estimated ? t('{model}, estimated from the duration: the run lacks what the model needs; form that morning {form}', { model: t(effort.model), form: `${effort.form > 0 ? '+' : ''}${number(effort.form)}` }) : t('{model}; form that morning {form}', { model: t(effort.model), form: `${effort.form > 0 ? '+' : ''}${number(effort.form)}` }))}><dt>{t('load')}</dt><dd>{Math.round(effort.load)}{effort.estimated ? '*' : ''} {effort.unit}</dd></div>}
          {effort && <div><dt>{t('form that morning')}</dt><dd>{effort.form > 0 ? '+' : ''}{number(effort.form)}</dd></div>}
        </dl>
        <span className="spacer" />
        <span className="chip">{run.device}</span>
        <span className="chip">{tn(run.laps.length, '{n} lap', '{n} laps')}</span>
        {run.temperature !== null && <span className="chip">{number(run.temperature)} °C</span>}
        {[tagged.workoutType, tagged.techniqueCue].filter(Boolean).map((tag) => <span key={tag} className="chip run-tag">{tag}</span>)}
        {tagged.note && <span className="muted small run-note" title={tagged.note}>✉ {tagged.note}</span>}
        <button type="button" className="btn" onClick={() => void editTags()} title={t("The run's title, workout type, technique cue, shoes and a note")}>{t('Tags and note')}</button>
        <Link className="btn" href={`/compare?items=r:${run.id}:0`} title={t('Open this run in Compare, beside your segments and other runs')}>{t('Compare this run')}</Link>
        <WorkoutLink run={run} />
      </div>
      {tagEdit && <TagEditor title={title ?? `${date(run.startTime)} ${time(run.startTime)}`} tag={tagEdit.file.tags[id] ?? {}} gear={tagEdit.gear} dictionary={tagEdit.file.dictionary} onSave={(tag) => void saveTags(tag)} onCancel={() => setTagEdit(null)} />}
      <div className="card run-board pin-host">
        <PinButton folder={folder} kind="run" target={run.id} name={title ?? `${date(run.startTime)} ${time(run.startTime)}`} opts={slots.filter((k) => k !== null).join(',')} />
        <div className="metrics-bar">
          <div className="metric-picker" role="group" aria-label={t('Metrics shown')}>
            {METRICS.filter((m) => has(m.key)).map((m) => {
              const on = slots.includes(m.key);
              return (
                <button key={m.key} className={`pill ${on ? 'on' : ''}`} aria-pressed={on} disabled={!on && free < 0} title={!on && free < 0 ? t('Up to {n} metrics at once: turn one off first', { n: SLOT_COUNT }) : undefined} onClick={() => toggle(m.key)}>
                  {on && <i className="key-line" style={{ background: colourOf(m.key) }} />}{m.title}
                </button>
              );
            })}
          </div>
          <span className="chart-summary muted small">{layout === 'bands' ? t('Bands') : t('Overlaid')} · {xAxis === 'distance' ? t('by distance') : t('by time')}{showBlocks && blocks.length ? ` · ${tn(blocks.length, '{n} segment', '{n} segments')}` : ''}</span>
          <span className="readout sr-only" aria-live="polite">
            {zoomed ? t('{range} of {total}', { range: `${clock(domain[0])}–${clock(domain[1])}`, total: clock(total) }) : `${t('Whole run')} · ${clock(total)}`}
          </span>
          {/* Clear selection, top right of the chart (the runner's request: "chce miec clear selection w prawym gornym rogu"): there while a stretch is selected. */}
          {selection && (
            <button className="btn sm clear-selection" title={t('Clear the selection and show the whole run')} onClick={clear}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              {t('Clear selection')}
            </button>
          )}
        </div>
        <div className="run-top">
          <div className="run-chart-col">
            <RunChart x={x} total={total} lines={lines} focus={focus} onFocus={setFocus} domain={domain} onDomain={setDomain} laps={laps}
              blocks={blocks.filter((b) => showBlocks || b.id === pointed).map((b) => ({ from: b.start, to: b.end, ok: b.status === 'accepted', name: b.name }))}
              cursor={cursor} onCursor={setCursor} selection={null} onSelect={select} head={head} height={chartHeight} layout={layout} axis={xAxis} dmap={dmap}
              marks={Object.fromEntries(shownStats.map(({ line, v }) => [line.key, v]))} hot={hot} />
            {/* The efforts of the runner's segments in this run, under the chart: pointed at, lit on it; clicked, selected. */}
            {blocks.length > 0 && (
              <div className="run-efforts" role="group" aria-label={t('Efforts of your segments in this run')}>
                <span className="muted small">{t('Your segments here')}</span>
                {blocks.map((b) => (
                  <button key={b.id} type="button" className={`run-block${b.status === 'accepted' ? '' : ' rejected'}`} title={b.reasons.length ? t('Not counted: {reasons}', { reasons: b.reasons.map(reasonText).join(' · ') }) : t('Select it on the chart')}
                    onMouseEnter={() => setPointed(b.id)} onMouseLeave={() => setPointed(null)} onFocus={() => setPointed(b.id)} onBlur={() => setPointed(null)} onClick={() => select({ from: b.start, to: b.end })}>
                    <span className="dot" style={{ background: b.status === 'accepted' ? 'var(--ok)' : 'var(--muted)' }} />
                    <b>{b.name}</b><span className="muted"> · min {Math.floor(b.start / 60)}–{Math.ceil(b.end / 60)} · {pace(b.metrics.speed)} /km</span>
                  </button>
                ))}
              </div>
            )}
            <div className="legend chart-foot">
              <span><i style={{ background: 'var(--surface-2)' }} />{t('alternate laps')}</span>
              {(showBlocks || pointed) && <span><i style={{ background: 'var(--band)', borderTop: '2px solid var(--series-1)' }} />{t('effort of a segment (top line: accepted)')}</span>}
              <span>{t('each line on its own scale · drag to select · scroll to zoom at the pointer · what is shown is the selection')}</span>
            </div>
          </div>
          <div className="run-side">
            <RouteMap lat={run.samples.lat} lon={run.samples.lon} t={run.samples.t} cursor={cursor} selection={null} onSelect={select} view={zoom ? { from: zoom[0], to: zoom[1] } : null} follow={!mapLed} onView={fromMap} onFit={() => setMapLed(false)} camera={start.map} onCamera={setMapCam} onExpand={() => setBigMap(true)} />
            <div className="laps-panel">
              <div className="laps-head"><h3>{t('Laps')}</h3><span className="muted tnum">{run.laps.length}</span><span className="muted small laps-hint">{t('click one to show it')}</span></div>
              <div className="run-list" role="region" aria-label={t('Laps of the run')} tabIndex={0}>
                <table className="data laps-table" aria-label={t('Laps')}>
                  <thead><tr><th>{t('Lap')}</th><th className="num">km</th><th className="num">{t('Time')}</th><th>{t('Pace')}</th></tr></thead>
                  <tbody>
                    {run.laps.map((l, i) => {
                      const v = l.duration ? l.distance / l.duration : 0;
                      return (
                        <tr key={i} className={i === lapIndex ? 'on' : ''} aria-selected={i === lapIndex} onClick={() => select({ from: l.start, to: l.end })}>
                          <td className="lap-no">{i + 1}</td>
                          <td className="num">{km(l.distance)}</td>
                          <td className="num">{duration(l.duration)}</td>
                          <td className="lap-pace">
                            <span className="lap-pace-bar" aria-hidden="true"><i style={{ width: `${lapBar(v)}%` }} /></span>
                            <span className="tnum">{pace(v)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      {stats && (
        <div className="card range-stats">
          <div className="range-head">
            <h3>{t(stats.what)}</h3>
            <span className="muted tnum range-span">{clock(stats.from)}–{clock(stats.to)}</span>
            {selection && stats.decoupling !== null && (
              <span className="chip tnum decoupling" title={t("Decoupling of pace from heart rate: the efficiency (speed per heartbeat) of the selection's first half against its second; above 5 % the heart rate drifted up against the pace")}>
                {t('Pa:HR {value} %', { value: `${stats.decoupling >= 0 ? '+' : '−'}${number(Math.abs(stats.decoupling), 1)}` })}
              </span>
            )}
            <span className="spacer" />
            {selection && (
              <Link className="btn sm primary" title={t('Compare this part with the efforts like it in your other runs: the same route, or the same distance, terrain and pace')} href={`/compare?similar=${encodeURIComponent(`${id}~${selection.from}~${selection.to}`)}`}>
                {t('Compare similar')}
              </Link>
            )}
            {!selection && <span className="muted small">{t('Select a part of the run on the chart, the map or a lap to see its statistics.')}</span>}
          </div>
          <div className="range-body">
          <div className="range-side">
            <dl className="sel-figures">
              {figures.map(([k, label, value]) => <div key={k} data-figure={k}><dt>{label}</dt><dd className="tnum">{value}</dd></div>)}
            </dl>
          </div>
          {shownStats.length ? (
            // The table scrolls sideways on a narrow screen: the region takes the focus, so the keyboard can scroll it.
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('Statistics of the part shown')}>
            <table className="data stats-grid" aria-label={t('Statistics')}>
              <thead>
                <tr>
                  <th scope="col">{t('Metric')}</th>
                  <th scope="col" className="num">{t('Min')}</th><th scope="col" className="num">{t('Avg')}</th><th scope="col" className="num">{t('Max')}</th>
                  {selection && <th scope="col" className="num" title={t('The least-squares change of the metric per 10 minutes over the selection')}>{t('Trend /10 min')}</th>}
                  {zoneBars.length > 0 && <th scope="col" title={t('The share of the moving time in each zone (Settings)')}>{t('Zones')}</th>}
                </tr>
              </thead>
              <tbody>
                {shownStats.map(({ line, v }) => (
                  <tr key={line.key}>
                    <th scope="row"><i className="key-line" style={{ background: line.color }} /> {line.title}</th>
                    {(['min', 'avg', 'max'] as const).map((k) => (
                      <td key={k} className={`num stat-cell ${hot?.key === line.key && hot.stat === k ? 'hot' : ''}`} data-metric={line.key} data-stat={k}
                        onMouseEnter={() => setHot({ key: line.key, stat: k })} onMouseLeave={() => setHot(null)}>
                        {k === 'avg' ? <b>{line.format(v[k])}</b> : line.format(v[k])}
                      </td>
                    ))}
                    {selection && <td className="num trend-cell">{v.trend === null ? '–' : `${v.trend >= 0 ? '+' : '−'}${line.format(Math.abs(v.trend))}`}</td>}
                    {zoneBars.length > 0 && <td className="zones-cell">{(() => {
                      const zb = zoneBars.find((z) => z.line.key === line.key);
                      if (!zb) return <span className="muted">–</span>;
                      return (
                        <div className="zone-bar" role="img" aria-label={t('{metric} time in zones: {shares}', { metric: line.title, shares: zb.shares.map((p, i) => `Z${i + 1} ${Math.round(p * 100)} %`).join(', ') })}>
                          {zb.shares.map((p, i) => p > 0 && (
                            <span key={i} className="zone-share" style={{ width: `${p * 100}%`, background: zoneTint(i, zb.shares.length, 35) }} title={`Z${i + 1} · ${Math.round(p * 100)} %`}>
                              {p >= 0.18 ? `Z${i + 1} ${Math.round(p * 100)}%` : ''}
                            </span>
                          ))}
                        </div>
                      );
                    })()}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="muted small range-foot">{t('Turn a metric on above the chart to see its statistics here.')}</div>
          )}
          </div>
        </div>
      )}
      {bigMap && (
        <RouteExpanded lat={run.samples.lat} lon={run.samples.lon} t={run.samples.t} start={view.w.start[0] ?? 0} step={view.w.start.length > 1 ? view.w.start[1] - view.w.start[0] : 10}
          metrics={mapMetrics}
          initial={focus ?? slots.find((k) => k !== null) ?? 'speed'} onClose={() => setBigMap(false)} />
      )}
    </div>
  );
}

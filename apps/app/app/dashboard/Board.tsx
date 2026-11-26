'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ReadError, useDataVersion, useWidth, eager } from '@/components';
import { readDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile } from '@/lib/blocks';
import { useLocale, useOpenFolder } from '@/lib/client';
import type { SavedAnalysesFile, SavedAnalysis } from '@/lib/compare';
import { TILE_KINDS, addTile, moveTile, paceProfile, readDashboard, removeTile, resizeTile, sizeOf, weekFigures, weeklyDistance, writeDashboard, type Tile, type TileKind } from '@/lib/dashboard';
import { date, km, pace } from '@/lib/format';
import { dateText, msg, number, t, tn } from '@/lib/i18n';
import { PATHS, readJson, type DataFolder, readRunFile } from '@/lib/fs';
import type { IndexedRun, RunFile, RunsIndex } from '@/lib/kernel';
import { formSeries, type ModelKey } from '@/lib/load';
import { TABS, performanceHref, type Tab } from '../performance/structure';
import { readSettings } from '@/lib/settings';
import { DashboardHead, todayText } from './Head';
import { minSec } from '@/lib/kernel';

/** The tiles resting on the models: loaded only when the Dashboard has one. */
const ModelTiles = eager(() => import('./ModelTiles').then((m) => m.ModelTiles));
/** The widgets pinned from their cards, as on their screens: each loaded only when the Dashboard has one. */
const RunWidget = eager(() => import('../run/RunWidget').then((m) => m.RunWidget));
const CompareWidget = eager(() => import('../compare/CompareWidget').then((m) => m.CompareWidget));
const PerformanceView = eager(() => import('../performance/Body').then((m) => m.Body));

/** The models a tile can show, by key, as Performance names them (keys, shown with t()). */
const MODELS: [string, string][] = [
  ['load', msg('Load of a run')], ['form', msg('Fitness and fatigue (impulse–response)')], ['acwr', msg('Acute:chronic ratio')], ['weekly', msg('Weekly load, monotony and strain')],
  ['intensity', msg('Intensity distribution')], ['efforts', msg('Best efforts of 2–20 min')], ['cs', msg('Critical speed and D′')], ['predictions', msg('Predicted race times')],
  ['vdot', msg('VO2max as VDOT')], ['powerEfforts', msg('Best power of 2–20 min')], ['cp', msg('Critical power and W′')], ['ef', msg('Efficiency factor')],
  ['decoupling', msg('Aerobic decoupling')], ['vo2hr', msg('VO2max from heart rate')], ['uth', msg('VO2max by Uth’s ratio')],
  ['fittedHr', msg('Fitted response · VO2max from heart rate')], ['fittedVdot', msg('Fitted response · VDOT')],
];
/** The initials of the days of a week, Monday first, in the language in use (1 Jan 2024 was a Monday). */
const days = () => Array.from({ length: 7 }, (_, i) => dateText(new Date(2024, 0, 1 + i, 12), { weekday: 'narrow' }));
/** A tile's widths in Customize, by thirds of the row: as the button shows it and as it is read out. */
const WIDTH_MARKS = ['⅓', '⅔', msg('Full')];
const WIDTH_NAMES = [msg('one third'), msg('two thirds'), msg('the whole row')];
const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
const mmss = (s: number) => minSec(s);
// The sign of the value as it is written: one that writes as zero has none (−0.04 km read "−0.0 km").
const signed = (v: number, digits = 0) => { const r = Number(v.toFixed(digits)); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${number(Math.abs(v), digits)}`; };
/** Fills a count's place with a mark, so Counted can put the number in its own element. */
const MARK = { n: '\u0000' };
/**
 * A count with its noun in the language in use, the number in its own element (a big figure on a
 * tile): the text of tn(n, one, other, MARK) split where the number goes.
 */
function Counted({ n, text, className }: { n: number; text: string; className: string }) {
  const [before, after = ''] = text.split(MARK.n);
  return <>{before}<span className={className}>{number(n)}</span>{after}</>;
}
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Data {
  runs: IndexedRun[];
  defs: BlockDefinition[];
  efforts: BlockInstance[];
  analyses: SavedAnalysis[];
  fitnessDays: number;
  fatigueDays: number;
}

/**
 * The Dashboard, first in the menu (the runner's request of 22 Nov 2026: "dodaj jeszcze jedna sekcje
 * na sama gore - dashboard ... tam uzytkownik bedzie mogl zobaczyc najwazniejsze dla niego rzeczy";
 * requirement "Dashboard of the runner's tiles"): the tiles the runner chose, in their order — this
 * week, the weekly distance, the last run, the form, recent runs, a segment's trend, a saved
 * analysis, a model's value, what to do for the models; Customize adds, orders and removes them,
 * kept in the data folder.
 */
export function DashboardPage() {
  const { folder } = useOpenFolder();
  const version = useDataVersion();
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [data, setData] = useState<Data | null>(null);
  /** the folder could not be read; `again` counts the tries */
  const [failed, setFailed] = useState(false);
  const [again, setAgain] = useState(0);
  const [editing, setEditing] = useState(false);
  // The tiles in the language in use, drawn again when it changes.
  useLocale();

  useEffect(() => {
    let live = true;
    (async () => {
      const [list, index, defs, inst, saved, settings] = await Promise.all([
        readDashboard(folder), readJson<RunsIndex>(folder, PATHS.runsIndex), readDefinitions(folder),
        readJson<BlockInstancesFile>(folder, PATHS.blockInstances), readJson<SavedAnalysesFile>(folder, PATHS.analyses), readSettings(folder),
      ]);
      if (!live) return;
      setTiles(list);
      setData({
        runs: [...(index?.runs ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime)), defs: defs.filter((d) => d.status === 'active'),
        efforts: inst?.instances ?? [], analyses: saved?.analyses ?? [], fitnessDays: settings.performance.fitnessDays, fatigueDays: settings.performance.fatigueDays,
      });
    })().catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [folder, version, again]);

  const change = useCallback((next: Tile[]) => { setTiles(next); writeDashboard(folder, next).catch(() => undefined); }, [folder]);

  if (failed && (!tiles || !data)) return <div className="page wide-page dashboard-page"><DashboardHead /><ReadError onRetry={() => { setFailed(false); setAgain((n) => n + 1); }} /></div>;
  if (!tiles || !data) return <div className="page wide-page dashboard-page"><DashboardHead /><p className="muted small" role="status">{t('Reading your data…')}</p></div>;

  /**
   * A tile's frame: its title, and in Customize its moves, its width and its removal. A tile takes
   * a third of the row, two or the whole row, by its kind or as the runner set it; the grid fills
   * the gaps with the tiles after (the runner's "lepiej ukladaj widgety na dashboardzie").
   */
  const frame = (id: string, title: string, body: ReactNode) => {
    const i = tiles.findIndex((x) => x.id === id);
    const size = sizeOf(tiles[i] ?? { id, kind: 'week' });
    return (
      <section key={id} className={`card dash-tile size-${size}`} aria-label={title} style={{ order: i }}>
        <div className="dash-tile-head">
          <h2>{title}</h2>
          {editing && (
            <span className="dash-tile-tools">
              <button type="button" className="btn sm icon" aria-label={t('Move {title} up', { title })} disabled={i === 0} onClick={() => change(moveTile(tiles, id, -1))}>↑</button>
              <button type="button" className="btn sm icon" aria-label={t('Move {title} down', { title })} disabled={i === tiles.length - 1} onClick={() => change(moveTile(tiles, id, 1))}>↓</button>
              <button type="button" className="btn sm" aria-label={t('Width of {title}: {width}', { title, width: t(WIDTH_NAMES[size - 1]) })} title={t('Width: one third, two thirds, the whole row')} onClick={() => change(resizeTile(tiles, id))}>{t(WIDTH_MARKS[size - 1])}</button>
              <button type="button" className="btn sm icon" aria-label={t('Remove {title}', { title })} title={t('Remove from the dashboard')} onClick={() => change(removeTile(tiles, id))}>×</button>
            </span>
          )}
        </div>
        <div className="dash-body">{body}</div>
      </section>
    );
  };

  const today = new Date();
  const last = data.runs[data.runs.length - 1] ?? null;
  const modelKeys = tiles.filter((x) => x.kind === 'model' && x.ref).map((x) => x.ref!) as ModelKey[];

  return (
    <div className="page wide-page dashboard-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{todayText(today)}</div>
          <h1>{t('Dashboard')}</h1>
        </div>
        <span className="spacer" />
        <button type="button" className={`btn ${editing ? 'primary' : ''}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? t('Done') : t('Customize')}</button>
      </div>
      {editing && <AddTile tiles={tiles} data={data} onAdd={(kind, ref, name) => change(addTile(tiles, kind, ref, { name }))} onReset={() => change([])} />}
      {!tiles.length && <div className="card empty">{t('No tile yet. Press')} <b>{t('Customize')}</b> {t('and add what matters to you.')}</div>}
      <div className="dash-grid">
        {tiles.map((tile) => {
          if (tile.kind === 'week') return frame(tile.id, t('This week'), <WeekTile runs={data.runs} today={today} />);
          if (tile.kind === 'weekly') return frame(tile.id, t('Weekly distance'), <WeeklyTile runs={data.runs} today={today} />);
          if (tile.kind === 'last') return frame(tile.id, t('Last run'), last ? <RunTile folder={folder} run={last} named /> : <p className="muted small">{t('No run yet.')}</p>);
          if (tile.kind === 'run') {
            const r = data.runs.find((x) => x.id === tile.ref);
            return frame(tile.id, r ? runTitle(r) : tile.name ?? t('Run'), r ? <RunWidget folder={folder} id={r.id} metrics={tile.opts} /> : <p className="muted small">{t('This run is not there any more.')}</p>);
          }
          if (tile.kind === 'perf' && tile.ref) {
            const [tab, view] = tile.ref.split('/');
            // Named as Performance names the view now, in the language in use; the name kept at pinning if the view is gone.
            return frame(tile.id, perfKnown(tile.ref) ? perfName(tile.ref) : tile.name ?? perfName(tile.ref), (
              <div className="dash-perf">
                <PerformanceView tab={tab as Tab} view={view} embedded />
                <Link className="row-open" href={performanceHref(tab, view)}>{t('Performance →')}</Link>
              </div>
            ));
          }
          if (tile.kind === 'compare' && tile.ref) return frame(tile.id, tile.name ?? t('Over time'), <CompareWidget query={tile.ref} />);
          if (tile.kind === 'form') return frame(tile.id, t('Form today'), <FormTile runs={data.runs} fitnessDays={data.fitnessDays} fatigueDays={data.fatigueDays} />);
          if (tile.kind === 'recent') return frame(tile.id, t('Recent runs'), <RecentTile runs={data.runs} />);
          if (tile.kind === 'segment') {
            const d = data.defs.find((x) => x.id === tile.ref);
            return frame(tile.id, d?.name ?? t('Segment'), d ? <SegmentTile def={d} efforts={data.efforts} /> : <p className="muted small">{t('This segment is not there any more.')}</p>);
          }
          if (tile.kind === 'analysis') {
            const a = data.analyses.find((x) => x.id === tile.ref);
            return frame(tile.id, a?.name ?? t('Saved analysis'), a ? <CompareWidget query={a.query} /> : <p className="muted small">{t('This analysis is not there any more.')}</p>);
          }
          return null;
        })}
        {modelKeys.length > 0 && <ModelTiles folder={folder} models={modelKeys} render={(id, title, body) => frame(id, title, body)} />}
      </div>
    </div>
  );
}

/** Customize: a tile to add, with the segment, the analysis or the model it shows. */
function AddTile({ tiles, data, onAdd, onReset }: { tiles: Tile[]; data: Data; onAdd: (kind: TileKind, ref?: string, name?: string) => void; onReset: () => void }) {
  const [kind, setKind] = useState<TileKind>('week');
  const of = TILE_KINDS.find((k) => k.kind === kind)?.of;
  const choices: [string, string][] = of === 'perf' ? TABS.filter((x) => x.key !== 'whatif').flatMap((x) => x.views.map((v): [string, string] => [`${x.key}/${v.key}`, perfName(`${x.key}/${v.key}`)])) : of === 'run' ? [...data.runs].reverse().map((r) => [r.id, `${runTitle(r)} · ${km(r.distance)} km`]) : of === 'segment' ? data.defs.map((d) => [d.id, d.name]) : of === 'analysis' ? data.analyses.map((a) => [a.id, a.name]) : of === 'model' ? MODELS.map(([k, n]) => [k, t(n)]) : [];
  const [ref, setRef] = useState('');
  const chosen = of ? (choices.some(([id]) => id === ref) ? ref : choices[0]?.[0] ?? '') : undefined;
  const taken = tiles.some((x) => x.kind === kind && x.ref === (chosen || undefined));
  // Kept in the data folder in English, as Performance's pin keeps it; shown in the language in use.
  const name = of === 'perf' && chosen ? perfName(chosen, false) : undefined;
  return (
    <div className="card dash-add" role="group" aria-label={t('Add a tile')}>
      <label className="field"><span>{t('Tile')}</span>
        <select className="select" aria-label={t('Tile')} value={kind} onChange={(e) => { setKind(e.target.value as TileKind); setRef(''); }}>
          {TILE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{t(k.title)}</option>)}
        </select>
      </label>
      {of && (
        <label className="field"><span>{t('Which')}</span>
          {choices.length ? (
            <select className="select" aria-label={t('Which')} value={chosen} onChange={(e) => setRef(e.target.value)}>
              {choices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          ) : <span className="muted small">{of === 'run' ? t('No run yet: import your runs.') : of === 'segment' ? t('No segment yet: make one on the Segments screen.') : t('No saved analysis yet: save one in Compare.')}</span>}
        </label>
      )}
      <button type="button" className="btn primary" disabled={taken || (!!of && !chosen)} onClick={() => onAdd(kind, chosen || undefined, name)}>{taken ? t('On the dashboard') : t('Add')}</button>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onReset}>{t('Remove all')}</button>
    </div>
  );
}

function WeekTile({ runs, today }: { runs: IndexedRun[]; today: Date }) {
  const w = weekFigures(runs, today);
  const top = Math.max(...w.byDay, 1);
  const day = (today.getDay() + 6) % 7;
  const diff = w.km - w.lastWeekKm;
  const initials = days();
  return (
    <div className="dash-week">
      <div className="dash-figures">
        <div><span className="dash-big tnum">{number(w.km, 1)}</span> km</div>
        <div><Counted n={w.runs} text={tn(w.runs, '{n} run', '{n} runs', MARK)} className="dash-mid tnum" /></div>
        <div><span className="dash-mid tnum">{hm(w.time)}</span> h</div>
      </div>
      <p className="muted small">{w.lastWeekKm ? t('{diff} km on last week ({km} km)', { diff: signed(diff, 1), km: number(w.lastWeekKm, 1) }) : t('Nothing last week')}</p>
      <div className="dash-days" role="img" aria-label={t('Kilometres by day: {days}', { days: w.byDay.map((v, i) => `${initials[i]} ${number(v, 1)}`).join(', ') })}>
        {w.byDay.map((v, i) => (
          <span key={i} className={i === day ? 'today' : ''}>
            <i style={{ height: `${v ? Math.max(6, (v / top) * 100) : 0}%` }} />
            <small>{initials[i]}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The last 12 weeks' kilometres as columns, each with its value on pointing. */
function WeeklyTile({ runs, today }: { runs: IndexedRun[]; today: Date }) {
  const weeks = weeklyDistance(runs, 12, today);
  const [box, width] = useWidth(600);
  const [hover, setHover] = useState<number | null>(null);
  const H = 200, B = 22, top = Math.max(...weeks.map((w) => w.km), 1);
  const colW = (width - 8) / weeks.length;
  const avg = weeks.reduce((s, w) => s + w.km, 0) / weeks.length;
  return (
    <div ref={box} className="dash-weekly">
      <p className="muted small">{t('On average {km} km a week over 12 weeks', { km: number(avg, 1) })}</p>
      <svg width={width} height={H} role="img" aria-label={t('Kilometres a week, the last 12 weeks: {weeks}', { weeks: weeks.map((w) => `${date(w.monday)} ${number(w.km, 1)}`).join(', ') })} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={width} y1={H - B} y2={H - B} stroke="var(--axis)" />
        {weeks.map((w, i) => {
          const h = (w.km / top) * (H - B - 18);
          const x = 4 + i * colW + colW * 0.18;
          return (
            <g key={w.monday} onMouseEnter={() => setHover(i)}>
              <rect x={4 + i * colW} y={0} width={colW} height={H} fill="transparent" />
              {h > 0 && <path d={`M${x},${H - B}V${H - B - h + 4}a4,4 0 0 1 4,-4h${colW * 0.64 - 8}a4,4 0 0 1 4,4V${H - B}Z`} fill={i === weeks.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 55%, transparent)'} />}
              {i % 2 === (weeks.length - 1) % 2 && <text x={x + colW * 0.32} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{dateText(`${w.monday}T12:00:00`, { day: 'numeric', month: 'short' })}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip dash-tip" style={{ left: Math.min(width - 160, 4 + hover * colW) }}>
          <b>{t('Week of {date}', { date: date(weeks[hover].monday) })}</b>
          <div className="tnum">{number(weeks[hover].km, 1)} km · {tn(weeks[hover].runs, '{n} run', '{n} runs')}</div>
        </div>
      )}
    </div>
  );
}

/** A view of Performance by its tab and view ("load/form"), as the screen names them: in the language in use, or in English (kept in the file). */
function perfName(ref: string, shown = true): string {
  const [tab, view] = ref.split('/');
  const tr = (s: string) => (shown ? t(s) : s);
  const found = TABS.find((x) => x.key === tab);
  const viewName = found?.views.find((v) => v.key === view)?.name;
  return `${found ? tr(found.name) : tr('Performance')} · ${viewName ? tr(viewName) : view}`;
}
/** Whether Performance still has the view of a tile ("load/form"). */
const perfKnown = (ref: string) => { const [tab, view] = ref.split('/'); return !!TABS.find((x) => x.key === tab)?.views.some((v) => v.key === view); };

/** A run's name on its tile: its title, else its day and time. */
const runTitle = (r: IndexedRun) => r.title ?? dateText(r.startTime, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * The last run: its figures and its pace along the run as a line, faster higher, scaled to the
 * middle 90 % of its paces so a slow start or a stop does not flatten the rest. Named: its title as
 * a link.
 */
function RunTile({ folder, run, named = false }: { folder: DataFolder; run: IndexedRun; named?: boolean }) {
  const [profile, setProfile] = useState<number[] | null>(null);
  useEffect(() => {
    let live = true;
    readRunFile(folder, run.id).then((f) => { if (live) setProfile(f ? paceProfile(f.samples.values.speed ?? []) : []); }).catch(() => undefined);
    return () => { live = false; };
  }, [folder, run.id]);
  const shown = profile && profile.length > 1 ? profile : null;
  const sorted = shown ? [...shown].sort((a, b) => a - b) : [];
  const [lo, hi] = shown ? [sorted[Math.floor(sorted.length * 0.05)], sorted[Math.ceil(sorted.length * 0.95) - 1]] : [0, 1];
  const y = (p: number) => 4 + ((Math.min(hi, Math.max(lo, p)) - lo) / (hi - lo || 1)) * 40;
  const path = shown?.map((p, i) => `${i ? 'L' : 'M'}${(i / (shown.length - 1)) * 100},${y(p).toFixed(1)}`).join('');
  return (
    <div className="dash-last">
      {named && <Link className="dash-last-title" href={`/run?id=${run.id}`}>{run.title ?? date(run.startTime)}</Link>}
      {(named || run.title) && <span className="muted small">{dateText(run.startTime, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
      <dl className="dash-facts">
        <div><dt>{t('Distance')}</dt><dd className="tnum">{km(run.distance)} km</dd></div>
        <div><dt>{t('Time')}</dt><dd className="tnum">{hm(run.duration)}</dd></div>
        <div><dt>{t('Pace')}</dt><dd className="tnum">{pace(run.avgSpeed)} /km</dd></div>
        <div><dt>{t('Heart rate')}</dt><dd className="tnum">{run.avgHeartRate ? `${number(Math.round(run.avgHeartRate))} bpm` : '–'}</dd></div>
        {typeof run.load === 'number' && <div><dt>{t('Load')}</dt><dd className="tnum">{number(Math.round(run.load))}</dd></div>}
      </dl>
      {/* The chart's room held while the run's file is read, so the row of tiles never moves (layout shift 0). */}
      {!shown && <svg viewBox="0 0 100 48" preserveAspectRatio="none" className="dash-spark dash-run-pace" aria-hidden="true" />}
      {shown && (
        <svg viewBox="0 0 100 48" preserveAspectRatio="none" className="dash-spark dash-run-pace" role="img" aria-label={t('Pace along the run, from {from} to {to} /km, fastest {fastest} /km', { from: mmss(shown[0]), to: mmss(shown[shown.length - 1]), fastest: mmss(sorted[0]) })}>
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <Link className="row-open" href={`/run?id=${run.id}`}>{t('Open the run →')}</Link>
    </div>
  );
}

/** Fitness, fatigue and form today, and the form of the last six weeks as a line. */
function FormTile({ runs, fitnessDays, fatigueDays }: { runs: IndexedRun[]; fitnessDays: number; fatigueDays: number }) {
  const days = useMemo(() => formSeries(runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), { fitnessDays, fatigueDays }, localDay(new Date())), [runs, fitnessDays, fatigueDays]);
  const now = days[days.length - 1];
  if (!now) return <p className="muted small">{t("No load yet: the form needs the runs' loads.")}</p>;
  const recent = days.slice(-42);
  const [lo, hi] = [Math.min(0, ...recent.map((d) => d.form)), Math.max(0, ...recent.map((d) => d.form))];
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * 52;
  const path = recent.map((d, i) => `${i ? 'L' : 'M'}${(i / (recent.length - 1 || 1)) * 100},${y(d.form).toFixed(1)}`).join('');
  return (
    <div className="dash-form">
      <div className="dash-figures">
        <div><span className="dash-big tnum">{signed(now.form)}</span> {t('form')}</div>
        <div><span className="dash-mid tnum">{number(Math.round(now.fitness))}</span> {t('fitness')}</div>
        <div><span className="dash-mid tnum">{number(Math.round(now.fatigue))}</span> {t('fatigue')}</div>
      </div>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="dash-spark" role="img" aria-label={tn(recent.length, 'Form over the last {n} day, from {from} to {to}', 'Form over the last {n} days, from {from} to {to}', { from: signed(recent[0].form), to: signed(now.form) })}>
        <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <Link className="row-open" href="/performance?tab=load&view=form">{t('Performance →')}</Link>
    </div>
  );
}

/** The last runs as a short list: the day and the title, the distance and the pace. */
function RecentTile({ runs }: { runs: IndexedRun[] }) {
  const recent = [...runs].reverse().slice(0, 6);
  if (!recent.length) return <p className="muted small">{t('No run yet.')}</p>;
  return (
    <ul className="dash-recent">
      {recent.map((r) => (
        <li key={r.id}>
          <span className="dash-recent-what">
            <Link className="strong" href={`/run?id=${r.id}`}>{dateText(r.startTime, { weekday: 'short', day: 'numeric', month: 'short' })}</Link>
            {r.title && <span className="muted small">{r.title}</span>}
          </span>
          <span className="tnum">{km(r.distance)} km</span>
          <span className="tnum muted">{pace(r.avgSpeed)} /km</span>
        </li>
      ))}
      <li className="dash-more"><Link className="row-open" href="/">{t('All runs →')}</Link></li>
    </ul>
  );
}

/** A segment: its efforts' pace over time as a line, the latest and its count. */
function SegmentTile({ def, efforts }: { def: BlockDefinition; efforts: BlockInstance[] }) {
  const mine = efforts.filter((e) => e.definitionId === def.id && e.status === 'accepted' && e.metrics.speed).sort((a, b) => a.runStart.localeCompare(b.runStart));
  if (!mine.length) return <p className="muted small">{t('No effort yet.')}</p>;
  const paces = mine.map((e) => 1000 / e.metrics.speed!);
  const [lo, hi] = [Math.min(...paces), Math.max(...paces)];
  // Faster higher.
  const y = (p: number) => 4 + ((p - lo) / (hi - lo || 1)) * 52;
  const path = paces.map((p, i) => `${i ? 'L' : 'M'}${(i / (paces.length - 1 || 1)) * 100},${y(p).toFixed(1)}`).join('');
  const lastE = mine[mine.length - 1];
  const change = paces.length > 1 ? paces[paces.length - 1] - paces[0] : 0;
  return (
    <div className="dash-segment">
      <div className="dash-figures">
        <div><span className="dash-big tnum">{mmss(paces[paces.length - 1])}</span> /km</div>
        <div><Counted n={mine.length} text={tn(mine.length, '{n} effort', '{n} efforts', MARK)} className="dash-mid tnum" /></div>
      </div>
      <p className="muted small">{t('Latest {date}', { date: date(lastE.runStart) })}{paces.length > 1 ? ` · ${change <= 0 ? t('{time} faster than the first', { time: mmss(-change) }) : t('{time} slower than the first', { time: mmss(change) })}` : ''}</p>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="dash-spark" role="img" aria-label={tn(mine.length, 'Pace of its {n} effort over time', 'Pace of its {n} efforts over time')}>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <Link className="row-open" href={`/compare?items=b:${def.id}:0`}>{t('Compare →')}</Link>
    </div>
  );
}

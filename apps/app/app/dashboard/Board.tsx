'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Expandable, ReadError, niceTicks, useDataVersion, useExpandedHeight, useWidth, eager } from '@/components';
import { readDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile } from '@/lib/blocks';
import { useLocale, useOpenFolder } from '@/lib/client';
import type { SavedAnalysesFile, SavedAnalysis } from '@/lib/compare';
import { TILE_KINDS, addTile, moveTile, paceProfile, readDashboard, removeTile, resizeTile, sizeOf, weekContext, weekFigures, weeklyDistance, writeDashboard, type Tile, type TileKind } from '@/lib/dashboard';
import { date, km, pace } from '@/lib/format';
import { dateText, distanceUnit, msg, number, paceUnit, t, tn, toDistance, toPace } from '@/lib/i18n';
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
/** A pace in s/km as m:ss in the unit shown (min/km or min/mi). */
const mmss = (s: number) => minSec(toPace(s));
/** Kilometres in the unit of distance shown (km or mi). */
const inUnit = (km: number) => toDistance(km * 1000);
// The sign of the value as it is written: one that writes as zero has none (−0.04 km read "−0.0 km").
const signed = (v: number, digits = 0) => { const r = Number(v.toFixed(digits)); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${number(Math.abs(v), digits)}`; };
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
  // A tile with a chart has Expand in its head (components/Expandable: the tile on the whole screen); not while the
  // tiles are being arranged, when the head holds their tools.
  const frame = (id: string, title: string, body: ReactNode, chart = false) => {
    const i = tiles.findIndex((x) => x.id === id);
    const size = sizeOf(tiles[i] ?? { id, kind: 'week' });
    const head = (expand: ReactNode) => (
      <div className="dash-tile-head">
        <h2>{title}</h2>
        {!editing && expand}
        {editing && (
          <span className="dash-tile-tools">
            <button type="button" className="btn sm icon" aria-label={t('Move {title} up', { title })} disabled={i === 0} onClick={() => change(moveTile(tiles, id, -1))}>↑</button>
            <button type="button" className="btn sm icon" aria-label={t('Move {title} down', { title })} disabled={i === tiles.length - 1} onClick={() => change(moveTile(tiles, id, 1))}>↓</button>
            <button type="button" className="btn sm" aria-label={t('Width of {title}: {width}', { title, width: t(WIDTH_NAMES[size - 1]) })} title={t('Width: one third, two thirds, the whole row')} onClick={() => change(resizeTile(tiles, id))}>{t(WIDTH_MARKS[size - 1])}</button>
            <button type="button" className="btn sm icon" aria-label={t('Remove {title}', { title })} title={t('Remove from the dashboard')} onClick={() => change(removeTile(tiles, id))}>×</button>
          </span>
        )}
      </div>
    );
    if (chart) return (
      <Expandable key={id} as="section" className={`card dash-tile size-${size}`} label={title} title={title} style={{ order: i }}>
        {(expand) => <>{head(expand)}<div className="dash-body">{body}</div></>}
      </Expandable>
    );
    return (
      <section key={id} className={`card dash-tile size-${size}`} aria-label={title} style={{ order: i }}>
        {head(null)}
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
          if (tile.kind === 'weekly') return frame(tile.id, t('Weekly distance'), <WeeklyTile runs={data.runs} today={today} />, true);
          if (tile.kind === 'last') return frame(tile.id, t('Last run'), last ? <RunTile folder={folder} run={last} named /> : <p className="muted small">{t('No run yet.')}</p>, !!last);
          if (tile.kind === 'run') {
            const r = data.runs.find((x) => x.id === tile.ref);
            return frame(tile.id, r ? runTitle(r) : tile.name ?? t('Run'), r ? <RunWidget folder={folder} id={r.id} metrics={tile.opts} /> : <p className="muted small">{t('This run is not there any more.')}</p>, !!r);
          }
          if (tile.kind === 'perf' && tile.ref) {
            const [tab, view] = tile.ref.split('/');
            // Named as Performance names the view now, in the language in use; the name kept at pinning if the view is gone.
            return frame(tile.id, perfKnown(tile.ref) ? perfName(tile.ref) : tile.name ?? perfName(tile.ref), (
              <div className="dash-perf">
                <PerformanceView tab={tab as Tab} view={view} embedded />
                <Link className="row-open" href={performanceHref(tab, view)}>{t('Performance →')}</Link>
              </div>
            ), true);
          }
          if (tile.kind === 'compare' && tile.ref) return frame(tile.id, tile.name ?? t('Over time'), <CompareWidget query={tile.ref} />, true);
          if (tile.kind === 'form') return frame(tile.id, t('Form today'), <FormTile runs={data.runs} fitnessDays={data.fitnessDays} fatigueDays={data.fatigueDays} />, true);
          if (tile.kind === 'recent') return frame(tile.id, t('Recent runs'), <RecentTile runs={data.runs} />);
          if (tile.kind === 'segment') {
            const d = data.defs.find((x) => x.id === tile.ref);
            return frame(tile.id, d?.name ?? t('Segment'), d ? <SegmentTile def={d} efforts={data.efforts} /> : <p className="muted small">{t('This segment is not there any more.')}</p>, !!d);
          }
          if (tile.kind === 'analysis') {
            const a = data.analyses.find((x) => x.id === tile.ref);
            return frame(tile.id, a?.name ?? t('Saved analysis'), a ? <CompareWidget query={a.query} /> : <p className="muted small">{t('This analysis is not there any more.')}</p>, !!a);
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
  const choices: [string, string][] = of === 'perf' ? TABS.filter((x) => x.key !== 'whatif').flatMap((x) => x.views.map((v): [string, string] => [`${x.key}/${v.key}`, perfName(`${x.key}/${v.key}`)])) : of === 'run' ? [...data.runs].reverse().map((r) => [r.id, `${runTitle(r)} · ${km(r.distance)} ${distanceUnit()}`]) : of === 'segment' ? data.defs.map((d) => [d.id, d.name]) : of === 'analysis' ? data.analyses.map((a) => [a.id, a.name]) : of === 'model' ? MODELS.map(([k, n]) => [k, t(n)]) : [];
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

/** A change with its direction: ▲ 2, ▼ 3, or – when it rounds to none; read out in words. */
function Change({ value }: { value: number }) {
  const r = Math.round(value);
  if (!r) return <span className="dash-change" aria-label={t('no change')}>–</span>;
  return <span className="dash-change" aria-label={r > 0 ? t('up {n}', { n: number(r) }) : t('down {n}', { n: number(-r) })}>{r > 0 ? '▲' : '▼'} {number(Math.abs(r))}</span>;
}

/** Where the pointer is along a chart drawn from `left` over `plot` px, as an index of its `n` points. */
function pointAt(e: MouseEvent<SVGSVGElement>, left: number, plot: number, n: number): number {
  const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
  return Math.min(n - 1, Math.max(0, Math.round(((px - left) / (plot || 1)) * (n - 1))));
}

/**
 * This week: its distance, read against the runner's own weeks (the share of the mean of the four weeks
 * before, and last week up to the same day: a week half run against a whole one always reads behind),
 * and its days as columns with their kilometres.
 */
/**
 * Where a tile's tooltip stands over the point at `px` of a chart `width` wide: on the left half its left edge
 * near the point, on the right half its right edge, so a tooltip wider than guessed (Polish) stays inside the tile.
 */
function tipAt(px: number, width: number): CSSProperties {
  return px <= width / 2 ? { left: Math.max(0, px - 24) } : { right: Math.max(0, width - px - 24) };
}

function WeekTile({ runs, today }: { runs: IndexedRun[]; today: Date }) {
  const w = weekFigures(runs, today);
  const c = weekContext(runs, today);
  const top = Math.max(...w.byDay, 1);
  const day = (today.getDay() + 6) % 7;
  const initials = days();
  const share = c.averageKm ? w.km / c.averageKm : null;
  const unit = distanceUnit();
  // The average named by the weeks it is of: a runner two weeks in has two weeks to average.
  const vars = { percent: number(Math.round(share ? share * 100 : 0)), km: number(inUnit(c.averageKm ?? 0), 1), unit };
  const against = share === null ? '' : c.weeks >= 4 ? t('{percent} % of your 4-week average, {km} {unit}', vars) : c.weeks === 1 ? t('{percent} % of last week, {km} {unit}', vars) : t('{percent} % of your average of {n} weeks, {km} {unit}', { ...vars, n: c.weeks });
  return (
    <div className="dash-week">
      <div className="dash-hero">
        <p className="dash-hero-value"><b>{number(inUnit(w.km), 1)}</b> {unit}</p>
        <dl className="dash-stats">
          <div><dt>{t('Runs')}</dt><dd className="tnum">{number(w.runs)}</dd></div>
          <div><dt>{t('Time')}</dt><dd className="tnum">{hm(w.time)} h</dd></div>
          <div><dt>{t('Last week by this day')}</dt><dd className="tnum">{number(inUnit(c.lastWeekToDateKm), 1)} {unit}</dd></div>
        </dl>
      </div>
      {share !== null && (
        <div className="dash-meter">
          <div className="dash-meter-track" role="img" aria-label={against}><i style={{ width: `${Math.min(100, share * 100)}%` }} /></div>
          <span className="muted small" aria-hidden="true">{against}</span>
        </div>
      )}
      <div className="dash-days" role="img" aria-label={t('{unit} by day: {days}', { unit: distanceUnit() === 'mi' ? t('Miles') : t('Kilometres'), days: w.byDay.map((v, i) => `${initials[i]} ${number(inUnit(v), 1)}`).join(', ') })}>
        {w.byDay.map((v, i) => {
          const h = v ? Math.max(5, (v / top) * 100) : 0;
          return (
            <span key={i} className={`dash-day ${i === day ? 'today' : i > day ? 'ahead' : ''}`}>
              <span className="dash-day-bar">
                {v > 0 && <em className="tnum" style={{ bottom: `calc(${h}% + 4px)` }}>{number(v, v >= 10 ? 0 : 1)}</em>}
                <i style={{ height: `${h}%` }} />
              </span>
              <small>{initials[i]}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The last 12 weeks' kilometres as columns on a scale, the mean of the whole weeks before this one drawn
 * across them, this week's value on its column; each week's on pointing.
 */
function WeeklyTile({ runs, today }: { runs: IndexedRun[]; today: Date }) {
  // In the unit of distance shown: its ticks round in it.
  const weeks = weeklyDistance(runs, 12, today).map((w) => ({ ...w, km: inUnit(w.km) }));
  const [box, width] = useWidth(600);
  const [hover, setHover] = useState<number | null>(null);
  const H = useExpandedHeight(300);
  const M = { l: 34, r: 64, t: 20, b: 24 };
  const whole = weeks.slice(0, -1);
  const avg = whole.length ? whole.reduce((s, w) => s + w.km, 0) / whole.length : 0;
  const most = Math.max(...weeks.map((w) => w.km), 1);
  const ticks = niceTicks(0, most, 4);
  // The scale reaches past the longest week: a tick more where the last one falls short of it.
  while (ticks[ticks.length - 1] < most) ticks.push(ticks[ticks.length - 1] + (ticks[1] - ticks[0]));
  const yMax = ticks[ticks.length - 1];
  const plot = width - M.l - M.r;
  const colW = plot / weeks.length;
  const barW = Math.min(24, colW * 0.6);
  const y = (v: number) => M.t + (1 - v / yMax) * (H - M.t - M.b);
  const shown = hover ?? weeks.length - 1;
  return (
    <div ref={box} className="dash-weekly">
      <p className="muted small">{t('{km} {unit} a week on average over the {n} whole weeks before this one', { km: number(avg, 1), unit: distanceUnit(), n: number(whole.length) })}</p>
      <svg width={width} height={H} role="img" aria-label={t('{unit} a week, the last 12 weeks: {weeks}', { unit: distanceUnit() === 'mi' ? t('Miles') : t('Kilometres'),  weeks: weeks.map((w) => `${date(w.monday)} ${number(w.km, 1)}`).join(', ') })} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={M.l + plot} y1={y(v)} y2={y(v)} stroke={v ? 'var(--line)' : 'var(--axis)'} />
            <text x={M.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted)">{number(v)}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = M.l + i * colW + (colW - barW) / 2;
          const top = y(w.km);
          const r = Math.min(4, (H - M.b - top) / 2);
          return (
            <g key={w.monday} onMouseEnter={() => setHover(i)}>
              <rect x={M.l + i * colW} y={0} width={colW} height={H} fill="transparent" />
              {w.km > 0 && <path d={`M${x},${H - M.b}V${top + r}a${r},${r} 0 0 1 ${r},${-r}h${barW - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${H - M.b}Z`} fill={i === weeks.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, var(--surface))'} opacity={hover === null || hover === i ? 1 : 0.55} />}
              {i === shown && w.km > 0 && <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize="11.5" fontWeight="650" fill="var(--text)">{number(w.km, 1)}</text>}
              {(weeks.length - 1 - i) % Math.max(1, Math.ceil(52 / colW)) === 0 && <text x={x + barW / 2} y={H - 7} textAnchor="middle" fontSize="10.5" fill={i === weeks.length - 1 ? 'var(--text)' : 'var(--muted)'} fontWeight={i === weeks.length - 1 ? 650 : 400}>{dateText(`${w.monday}T12:00:00`, { day: 'numeric', month: 'short' })}</text>}
            </g>
          );
        })}
        {avg > 0 && (
          <g pointerEvents="none">
            <line x1={M.l} x2={M.l + plot + 6} y1={y(avg)} y2={y(avg)} stroke="var(--text-2)" strokeWidth="1" />
            <text x={M.l + plot + 10} y={y(avg) + 3.5} fontSize="10.5" fill="var(--text-2)">{t('avg {km}', { km: number(avg, 1) })}</text>
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="tooltip dash-tip" style={tipAt(M.l + (hover + 0.5) * colW, width)}>
          <b>{t('Week of {date}', { date: date(weeks[hover].monday) })}</b>
          <div className="tnum">{number(weeks[hover].km, 1)} {distanceUnit()} · {tn(weeks[hover].runs, '{n} run', '{n} runs')}</div>
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
 * The last run: what it was (its type, its shoes), its figures, and its pace along the run on a scale,
 * faster higher, scaled to the middle 90 % of its paces so a slow start or a stop does not flatten the
 * rest, with the run's mean drawn across; the pace at a point on pointing. Named: its title as a link.
 */
function RunTile({ folder, run, named = false }: { folder: DataFolder; run: IndexedRun; named?: boolean }) {
  const [profile, setProfile] = useState<number[] | null>(null);
  const [box, width] = useWidth(360);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    readRunFile(folder, run.id).then((f) => { if (live) setProfile(f ? paceProfile(f.samples.values.speed ?? []) : []); }).catch(() => undefined);
    return () => { live = false; };
  }, [folder, run.id]);
  const shown = profile && profile.length > 1 ? profile : null;
  const sorted = shown ? [...shown].sort((a, b) => a - b) : [];
  const [lo, hi] = shown ? [sorted[Math.floor(sorted.length * 0.05)], sorted[Math.ceil(sorted.length * 0.95) - 1]] : [0, 1];
  const H = useExpandedHeight(96);
  const M = { l: 36, r: 6, t: 8, b: 8 };
  const plot = width - M.l - M.r;
  const y = (p: number) => M.t + ((Math.min(hi, Math.max(lo, p)) - lo) / (hi - lo || 1)) * (H - M.t - M.b);
  const x = (i: number) => M.l + (i / ((shown?.length ?? 2) - 1)) * plot;
  const line = shown?.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join('') ?? '';
  const mean = run.avgSpeed > 0 ? 1000 / run.avgSpeed : null;
  return (
    <div className="dash-last">
      {named && <Link className="dash-last-title" href={`/run?id=${run.id}`}>{run.title ?? date(run.startTime)}</Link>}
      <div className="dash-last-meta">
        {(named || run.title) && <span className="muted small">{dateText(run.startTime, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
        {run.workoutType && <span className="chip">{run.workoutType}</span>}
        {run.shoes && <span className="chip">{run.shoes}</span>}
      </div>
      <dl className="dash-facts">
        <div><dt>{t('Distance')}</dt><dd className="tnum">{km(run.distance)} {distanceUnit()}</dd></div>
        <div><dt>{t('Time')}</dt><dd className="tnum">{hm(run.duration)}</dd></div>
        <div><dt>{t('Pace')}</dt><dd className="tnum">{pace(run.avgSpeed)} {paceUnit()}</dd></div>
        <div><dt>{t('Heart rate')}</dt><dd className="tnum">{run.avgHeartRate ? `${number(Math.round(run.avgHeartRate))} bpm` : '–'}</dd></div>
        {typeof run.load === 'number' && <div><dt>{t('Load')}</dt><dd className="tnum">{number(Math.round(run.load))}</dd></div>}
      </dl>
      {/* The chart's room held while the run's file is read, so the row of tiles never moves (layout shift 0). */}
      <div ref={box} className="dash-chart" style={{ height: H }}>
        {shown && (
          <svg width={width} height={H} role="img" aria-label={t('Pace along the run, from {from} to {to} {unit}, fastest {fastest} {unit}', { unit: paceUnit(), from: mmss(shown[0]), to: mmss(shown[shown.length - 1]), fastest: mmss(sorted[0]) })} onMouseMove={(e) => setHover(pointAt(e, M.l, plot, shown.length))} onMouseLeave={() => setHover(null)}>
            <text x={M.l - 8} y={M.t + 7} textAnchor="end" fontSize="10.5" fill="var(--muted)">{mmss(lo)}</text>
            <text x={M.l - 8} y={H - M.b} textAnchor="end" fontSize="10.5" fill="var(--muted)">{mmss(hi)}</text>
            <line x1={M.l} x2={M.l + plot} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" />
            <path d={`${line}L${x(shown.length - 1)},${H - M.b}L${M.l},${H - M.b}Z`} fill="var(--accent)" opacity="0.1" />
            {mean !== null && mean > lo && mean < hi && <line x1={M.l} x2={M.l + plot} y1={y(mean)} y2={y(mean)} stroke="var(--text-2)" strokeWidth="1" opacity="0.55" />}
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && <><line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="var(--axis)" /><circle cx={x(hover)} cy={y(shown[hover])} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" /></>}
          </svg>
        )}
        {shown && hover !== null && shown[hover] !== undefined && <div className="tooltip dash-tip" style={tipAt(x(hover), width)}><b className="tnum">{mmss(shown[hover])} {paceUnit()}</b><div className="muted">{t('{percent} % into the run', { percent: number(Math.round((hover / (shown.length - 1)) * 100)) })}</div></div>}
      </div>
      <Link className="row-open" href={`/run?id=${run.id}`}>{t('Open the run →')}</Link>
    </div>
  );
}

/**
 * Fitness, fatigue and form today, each of the first two with its change in 7 days, and the form of the
 * last six weeks on a scale around zero; the day's three figures on pointing.
 */
function FormTile({ runs, fitnessDays, fatigueDays }: { runs: IndexedRun[]; fitnessDays: number; fatigueDays: number }) {
  const days = useMemo(() => formSeries(runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), { fitnessDays, fatigueDays }, localDay(new Date())), [runs, fitnessDays, fatigueDays]);
  const [box, width] = useWidth(360);
  const [hover, setHover] = useState<number | null>(null);
  const now = days[days.length - 1];
  if (!now) return <p className="muted small">{t("No load yet: the form needs the runs' loads.")}</p>;
  const recent = days.slice(-42);
  const before = days[Math.max(0, days.length - 8)];
  const forms = recent.map((d) => d.form);
  // Zero always on the scale, and room enough that a flat form is not drawn as a mountain.
  const lo = Math.min(-2, ...forms);
  const hi = Math.max(2, ...forms);
  const H = useExpandedHeight(150);
  const M = { l: 30, r: 40, t: 10, b: 22 };
  const plot = width - M.l - M.r;
  const x = (i: number) => M.l + (i / (recent.length - 1 || 1)) * plot;
  const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const line = recent.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.form).toFixed(1)}`).join('');
  const end = recent.length - 1;
  // The ends of the scale beside zero, where they do not sit on its label.
  const ticks = [hi, lo].filter((v) => Math.abs(y(v) - y(0)) >= 13);
  const at = hover === null ? null : recent[hover];
  return (
    <div className="dash-form">
      <div className="dash-hero">
        <p className="dash-hero-value"><b>{signed(now.form)}</b> {t('form')}</p>
        <dl className="dash-stats">
          <div><dt>{t('Fitness')}</dt><dd className="tnum">{number(Math.round(now.fitness))} <Change value={Math.round(now.fitness) - Math.round(before.fitness)} /></dd></div>
          <div><dt>{t('Fatigue')}</dt><dd className="tnum">{number(Math.round(now.fatigue))} <Change value={Math.round(now.fatigue) - Math.round(before.fatigue)} /></dd></div>
        </dl>
      </div>
      <p className="muted small">{t('Form is fitness less fatigue; ▲ ▼ the change in 7 days.')}</p>
      <div ref={box} className="dash-chart" style={{ height: H }}>
        <svg width={width} height={H} role="img" aria-label={tn(recent.length, 'Form over the last {n} day, from {from} to {to}', 'Form over the last {n} days, from {from} to {to}', { from: signed(recent[0].form), to: signed(now.form) })} onMouseMove={(e) => setHover(pointAt(e, M.l, plot, recent.length))} onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + plot} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={M.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted)">{signed(v)}</text>
            </g>
          ))}
          <line x1={M.l} x2={M.l + plot} y1={y(0)} y2={y(0)} stroke="var(--axis)" />
          <text x={M.l - 8} y={y(0) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted)">0</text>
          <path d={`${line}L${x(end)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--accent)" opacity="0.12" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(end)} cy={y(now.form)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          <text x={x(end) + 9} y={y(now.form) + 4} fontSize="11.5" fontWeight="650" fill="var(--text)">{signed(now.form)}</text>
          <text x={M.l} y={H - 5} fontSize="10.5" fill="var(--muted)">{dateText(`${recent[0].date}T12:00:00`, { day: 'numeric', month: 'short' })}</text>
          <text x={x(end)} y={H - 5} textAnchor="end" fontSize="10.5" fill="var(--muted)">{t('Today')}</text>
          {at && <><line x1={x(hover!)} x2={x(hover!)} y1={M.t} y2={H - M.b} stroke="var(--axis)" /><circle cx={x(hover!)} cy={y(at.form)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" /></>}
        </svg>
        {at && (
          <div className="tooltip dash-tip" style={tipAt(x(hover!), width)}>
            <b>{dateText(`${at.date}T12:00:00`, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
            <div className="tnum">{t('form')} {signed(at.form)} · {t('fitness')} {number(Math.round(at.fitness))} · {t('fatigue')} {number(Math.round(at.fatigue))}</div>
          </div>
        )}
      </div>
      <Link className="row-open" href="/performance?tab=load&view=form">{t('Performance →')}</Link>
    </div>
  );
}

/**
 * The last runs as a short list, each row the way to its run: the day, what it was (its title, its
 * type), its distance as a bar against the longest of them, and its pace.
 */
function RecentTile({ runs }: { runs: IndexedRun[] }) {
  const recent = [...runs].reverse().slice(0, 6);
  if (!recent.length) return <p className="muted small">{t('No run yet.')}</p>;
  const longest = Math.max(...recent.map((r) => r.distance), 1);
  return (
    <ul className="dash-recent">
      {recent.map((r) => (
        <li key={r.id}>
          <Link className="dash-recent-row" href={`/run?id=${r.id}`}>
            <span className="dash-recent-day"><b>{dateText(r.startTime, { weekday: 'short' })}</b><small className="tnum">{dateText(r.startTime, { day: 'numeric', month: 'short' })}</small></span>
            <span className="dash-recent-what">
              <span className="dash-recent-name">{r.title ?? r.workoutType ?? t('Run')}</span>
              {r.title && r.workoutType && <small>{r.workoutType}</small>}
            </span>
            <span className="dash-recent-km"><span className="tnum">{km(r.distance)} {distanceUnit()}</span><i aria-hidden="true"><i style={{ width: `${Math.max(4, (r.distance / longest) * 100)}%` }} /></i></span>
            <span className="dash-recent-pace tnum">{pace(r.avgSpeed)} {paceUnit()}</span>
          </Link>
        </li>
      ))}
      <li className="dash-more"><Link className="row-open" href="/">{t('All runs →')}</Link></li>
    </ul>
  );
}

/**
 * A segment: the pace of its latest effort, read against its first and its fastest, and every effort's
 * pace over time on a scale, faster higher (each a dot while they are few); an effort's on pointing.
 */
function SegmentTile({ def, efforts }: { def: BlockDefinition; efforts: BlockInstance[] }) {
  const [box, width] = useWidth(360);
  const [hover, setHover] = useState<number | null>(null);
  const mine = efforts.filter((e) => e.definitionId === def.id && e.status === 'accepted' && e.metrics.speed).sort((a, b) => a.runStart.localeCompare(b.runStart));
  if (!mine.length) return <p className="muted small">{t('No effort yet.')}</p>;
  const paces = mine.map((e) => 1000 / e.metrics.speed!);
  const [lo, hi] = [Math.min(...paces), Math.max(...paces)];
  const H = useExpandedHeight(110);
  const M = { l: 36, r: 10, t: 8, b: 20 };
  const plot = width - M.l - M.r;
  const end = paces.length - 1;
  const x = (i: number) => M.l + (end ? i / end : 0.5) * plot;
  // Faster higher.
  const y = (p: number) => M.t + ((p - lo) / (hi - lo || 1)) * (H - M.t - M.b);
  const line = paces.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join('');
  const lastE = mine[end];
  const change = paces.length > 1 ? paces[end] - paces[0] : 0;
  return (
    <div className="dash-segment">
      <div className="dash-hero">
        <p className="dash-hero-value"><b>{mmss(paces[end])}</b> {paceUnit()}</p>
        <dl className="dash-stats">
          <div><dt>{t('Efforts')}</dt><dd className="tnum">{number(mine.length)}</dd></div>
          <div><dt>{t('Fastest')}</dt><dd className="tnum">{mmss(lo)}</dd></div>
        </dl>
      </div>
      <p className="muted small">{t('Latest {date}', { date: date(lastE.runStart) })}{paces.length > 1 ? ` · ${change <= 0 ? t('{time} faster than the first', { time: mmss(-change) }) : t('{time} slower than the first', { time: mmss(change) })}` : ''}</p>
      <div ref={box} className="dash-chart" style={{ height: H }}>
        <svg width={width} height={H} role="img" aria-label={tn(mine.length, 'Pace of its {n} effort over time', 'Pace of its {n} efforts over time')} onMouseMove={(e) => setHover(pointAt(e, M.l, plot, paces.length))} onMouseLeave={() => setHover(null)}>
          <text x={M.l - 8} y={M.t + 7} textAnchor="end" fontSize="10.5" fill="var(--muted)">{mmss(lo)}</text>
          {hi > lo && <text x={M.l - 8} y={H - M.b} textAnchor="end" fontSize="10.5" fill="var(--muted)">{mmss(hi)}</text>}
          <line x1={M.l} x2={M.l + plot} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" />
          {end > 0 && <path d={`${line}L${x(end)},${H - M.b}L${x(0)},${H - M.b}Z`} fill="var(--accent)" opacity="0.1" />}
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {paces.length <= 40 && paces.map((p, i) => <circle key={i} cx={x(i)} cy={y(p)} r={i === end ? 4 : 2.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={i === end ? 2 : 1} />)}
          {paces.length > 40 && <circle cx={x(end)} cy={y(paces[end])} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
          <text x={M.l} y={H - 5} fontSize="10.5" fill="var(--muted)">{date(mine[0].runStart)}</text>
          {end > 0 && <text x={M.l + plot} y={H - 5} textAnchor="end" fontSize="10.5" fill="var(--muted)">{date(lastE.runStart)}</text>}
          {hover !== null && <><line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="var(--axis)" /><circle cx={x(hover)} cy={y(paces[hover])} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" /></>}
        </svg>
        {hover !== null && mine[hover] && <div className="tooltip dash-tip" style={tipAt(x(hover), width)}><b className="tnum">{mmss(paces[hover])} {paceUnit()}</b><div className="muted">{date(mine[hover].runStart)}</div></div>}
      </div>
      <Link className="row-open" href={`/compare?items=b:${def.id}:0`}>{t('Compare →')}</Link>
    </div>
  );
}

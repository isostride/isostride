'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDataVersion, useWidth } from '@/components';
import { readDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile } from '@/lib/blocks';
import { useOpenFolder } from '@/lib/client';
import type { SavedAnalysesFile, SavedAnalysis } from '@/lib/compare';
import { TILE_KINDS, addTile, moveTile, paceProfile, readDashboard, removeTile, resizeTile, sizeOf, weekFigures, weeklyDistance, writeDashboard, type Tile, type TileKind } from '@/lib/dashboard';
import { date, km, pace } from '@/lib/format';
import { PATHS, readJson, type DataFolder, readRunFile } from '@/lib/fs';
import type { IndexedRun, RunFile, RunsIndex } from '@/lib/kernel';
import { formSeries, type ModelKey } from '@/lib/load';
import { TABS, performanceHref, type Tab } from '../performance/structure';
import { readSettings } from '@/lib/settings';

/** The tiles resting on the models: loaded only when the Dashboard has one. */
const ModelTiles = dynamic(() => import('./ModelTiles').then((m) => m.ModelTiles), { ssr: false });
/** The widgets pinned from their cards, as on their screens: each loaded only when the Dashboard has one. */
const RunWidget = dynamic(() => import('../run/RunWidget').then((m) => m.RunWidget), { ssr: false });
const CompareWidget = dynamic(() => import('../compare/CompareWidget').then((m) => m.CompareWidget), { ssr: false });
const PerformanceView = dynamic(() => import('../performance/Body').then((m) => m.Body), { ssr: false });

/** The models a tile can show, by key, as Performance names them. */
const MODELS: [string, string][] = [
  ['load', 'Load of a run'], ['form', 'Fitness and fatigue (impulse–response)'], ['acwr', 'Acute:chronic ratio'], ['weekly', 'Weekly load, monotony and strain'],
  ['intensity', 'Intensity distribution'], ['efforts', 'Best efforts of 2–20 min'], ['cs', 'Critical speed and D′'], ['predictions', 'Predicted race times'],
  ['vdot', 'VO2max as VDOT'], ['powerEfforts', 'Best power of 2–20 min'], ['cp', 'Critical power and W′'], ['ef', 'Efficiency factor'],
  ['decoupling', 'Aerobic decoupling'], ['vo2hr', 'VO2max from heart rate'], ['uth', 'VO2max by Uth’s ratio'],
  ['fittedHr', 'Fitted response · VO2max from heart rate'], ['fittedVdot', 'Fitted response · VDOT'],
];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const signed = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
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
  const [editing, setEditing] = useState(false);

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
    })().catch(() => undefined);
    return () => { live = false; };
  }, [folder, version]);

  const change = useCallback((next: Tile[]) => { setTiles(next); writeDashboard(folder, next).catch(() => undefined); }, [folder]);

  if (!tiles || !data) return <div className="page wide-page"><div className="page-head"><h1>Dashboard</h1></div><p className="muted small" role="status">Reading your data…</p></div>;

  /**
   * A tile's frame: its title, and in Customize its moves, its width and its removal. A tile takes
   * a third of the row, two or the whole row, by its kind or as the runner set it; the grid fills
   * the gaps with the tiles after (the runner's "lepiej ukladaj widgety na dashboardzie").
   */
  const frame = (id: string, title: string, body: ReactNode) => {
    const i = tiles.findIndex((t) => t.id === id);
    const size = sizeOf(tiles[i] ?? { id, kind: 'week' });
    return (
      <section key={id} className={`card dash-tile size-${size}`} aria-label={title} style={{ order: i }}>
        <div className="dash-tile-head">
          <h2>{title}</h2>
          {editing && (
            <span className="dash-tile-tools">
              <button type="button" className="btn sm icon" aria-label={`Move ${title} up`} disabled={i === 0} onClick={() => change(moveTile(tiles, id, -1))}>↑</button>
              <button type="button" className="btn sm icon" aria-label={`Move ${title} down`} disabled={i === tiles.length - 1} onClick={() => change(moveTile(tiles, id, 1))}>↓</button>
              <button type="button" className="btn sm" aria-label={`Width of ${title}: ${['one third', 'two thirds', 'the whole row'][size - 1]}`} title="Width: one third, two thirds, the whole row" onClick={() => change(resizeTile(tiles, id))}>{['⅓', '⅔', 'Full'][size - 1]}</button>
              <button type="button" className="btn sm icon" aria-label={`Remove ${title}`} onClick={() => change(removeTile(tiles, id))}>✕</button>
            </span>
          )}
        </div>
        <div className="dash-body">{body}</div>
      </section>
    );
  };

  const today = new Date();
  const last = data.runs[data.runs.length - 1] ?? null;
  const modelKeys = tiles.filter((t) => t.kind === 'model' && t.ref).map((t) => t.ref!) as ModelKey[];
  const hasTodo = tiles.some((t) => t.kind === 'todo');

  return (
    <div className="page wide-page dashboard-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>Dashboard</h1>
        </div>
        <span className="spacer" />
        <button type="button" className={`btn ${editing ? 'primary' : ''}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Customize'}</button>
      </div>
      {editing && <AddTile tiles={tiles} data={data} onAdd={(kind, ref, name) => change(addTile(tiles, kind, ref, { name }))} onReset={() => change([])} />}
      {!tiles.length && <div className="card empty">No tile yet. Press <b>Customize</b> and add what matters to you.</div>}
      <div className="dash-grid">
        {tiles.map((t) => {
          if (t.kind === 'week') return frame(t.id, 'This week', <WeekTile runs={data.runs} today={today} />);
          if (t.kind === 'weekly') return frame(t.id, 'Weekly distance', <WeeklyTile runs={data.runs} today={today} />);
          if (t.kind === 'last') return frame(t.id, 'Last run', last ? <RunTile folder={folder} run={last} named /> : <p className="muted small">No run yet.</p>);
          if (t.kind === 'run') {
            const r = data.runs.find((x) => x.id === t.ref);
            return frame(t.id, r ? runTitle(r) : t.name ?? 'Run', r ? <RunWidget folder={folder} id={r.id} metrics={t.opts} /> : <p className="muted small">This run is not there any more.</p>);
          }
          if (t.kind === 'perf' && t.ref) {
            const [tab, view] = t.ref.split('/');
            return frame(t.id, t.name ?? perfName(t.ref), (
              <div className="dash-perf">
                <PerformanceView tab={tab as Tab} view={view} embedded />
                <Link className="row-open" href={performanceHref(tab, view)}>Performance →</Link>
              </div>
            ));
          }
          if (t.kind === 'compare' && t.ref) return frame(t.id, t.name ?? 'Over time', <CompareWidget query={t.ref} />);
          if (t.kind === 'form') return frame(t.id, 'Form today', <FormTile runs={data.runs} fitnessDays={data.fitnessDays} fatigueDays={data.fatigueDays} />);
          if (t.kind === 'recent') return frame(t.id, 'Recent runs', <RecentTile runs={data.runs} />);
          if (t.kind === 'segment') {
            const d = data.defs.find((x) => x.id === t.ref);
            return frame(t.id, d?.name ?? 'Segment', d ? <SegmentTile def={d} efforts={data.efforts} /> : <p className="muted small">This segment is not there any more.</p>);
          }
          if (t.kind === 'analysis') {
            const a = data.analyses.find((x) => x.id === t.ref);
            return frame(t.id, a?.name ?? 'Saved analysis', a ? <CompareWidget query={a.query} /> : <p className="muted small">This analysis is not there any more.</p>);
          }
          return null;
        })}
        {(modelKeys.length > 0 || hasTodo) && <ModelTiles folder={folder} models={modelKeys} todo={hasTodo} render={(id, title, body) => frame(id, title, body)} />}
      </div>
    </div>
  );
}

/** Customize: a tile to add, with the segment, the analysis or the model it shows. */
function AddTile({ tiles, data, onAdd, onReset }: { tiles: Tile[]; data: Data; onAdd: (kind: TileKind, ref?: string, name?: string) => void; onReset: () => void }) {
  const [kind, setKind] = useState<TileKind>('week');
  const of = TILE_KINDS.find((k) => k.kind === kind)?.of;
  const choices: [string, string][] = of === 'perf' ? TABS.flatMap((t) => t.views.map((v): [string, string] => [`${t.key}/${v.key}`, perfName(`${t.key}/${v.key}`)])) : of === 'run' ? [...data.runs].reverse().map((r) => [r.id, `${runTitle(r)} · ${km(r.distance)} km`]) : of === 'segment' ? data.defs.map((d) => [d.id, d.name]) : of === 'analysis' ? data.analyses.map((a) => [a.id, a.name]) : of === 'model' ? MODELS : [];
  const [ref, setRef] = useState('');
  const chosen = of ? (choices.some(([id]) => id === ref) ? ref : choices[0]?.[0] ?? '') : undefined;
  const taken = tiles.some((t) => t.kind === kind && t.ref === (chosen || undefined));
  const name = of === 'perf' && chosen ? perfName(chosen) : undefined;
  return (
    <div className="card dash-add" role="group" aria-label="Add a tile">
      <label className="field"><span>Tile</span>
        <select className="select" aria-label="Tile" value={kind} onChange={(e) => { setKind(e.target.value as TileKind); setRef(''); }}>
          {TILE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.title}</option>)}
        </select>
      </label>
      {of && (
        <label className="field"><span>Which</span>
          {choices.length ? (
            <select className="select" aria-label="Which" value={chosen} onChange={(e) => setRef(e.target.value)}>
              {choices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          ) : <span className="muted small">{of === 'run' ? 'No run yet: import your runs.' : of === 'segment' ? 'No segment yet: make one on the Segments screen.' : 'No saved analysis yet: save one in Compare.'}</span>}
        </label>
      )}
      <button type="button" className="btn primary" disabled={taken || (!!of && !chosen)} onClick={() => onAdd(kind, chosen || undefined, name)}>{taken ? 'On the dashboard' : 'Add'}</button>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onReset}>Remove all</button>
    </div>
  );
}

function WeekTile({ runs, today }: { runs: IndexedRun[]; today: Date }) {
  const w = weekFigures(runs, today);
  const top = Math.max(...w.byDay, 1);
  const day = (today.getDay() + 6) % 7;
  const diff = w.km - w.lastWeekKm;
  return (
    <div className="dash-week">
      <div className="dash-figures">
        <div><span className="dash-big tnum">{w.km.toFixed(1)}</span> km</div>
        <div><span className="dash-mid tnum">{w.runs}</span> run{w.runs === 1 ? '' : 's'}</div>
        <div><span className="dash-mid tnum">{hm(w.time)}</span> h</div>
      </div>
      <p className="muted small">{w.lastWeekKm ? `${signed(diff, 1)} km on last week (${w.lastWeekKm.toFixed(1)} km)` : 'Nothing last week'}</p>
      <div className="dash-days" role="img" aria-label={`Kilometres by day: ${w.byDay.map((v, i) => `${DAYS[i]} ${v.toFixed(1)}`).join(', ')}`}>
        {w.byDay.map((v, i) => (
          <span key={i} className={i === day ? 'today' : ''}>
            <i style={{ height: `${v ? Math.max(6, (v / top) * 100) : 0}%` }} />
            <small>{DAYS[i]}</small>
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
      <p className="muted small">On average {avg.toFixed(1)} km a week over 12 weeks</p>
      <svg width={width} height={H} role="img" aria-label={`Kilometres a week, the last 12 weeks: ${weeks.map((w) => `${date(w.monday)} ${w.km.toFixed(1)}`).join(', ')}`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={width} y1={H - B} y2={H - B} stroke="var(--axis)" />
        {weeks.map((w, i) => {
          const h = (w.km / top) * (H - B - 18);
          const x = 4 + i * colW + colW * 0.18;
          return (
            <g key={w.monday} onMouseEnter={() => setHover(i)}>
              <rect x={4 + i * colW} y={0} width={colW} height={H} fill="transparent" />
              {h > 0 && <path d={`M${x},${H - B}V${H - B - h + 4}a4,4 0 0 1 4,-4h${colW * 0.64 - 8}a4,4 0 0 1 4,4V${H - B}Z`} fill={i === weeks.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 55%, transparent)'} />}
              {i % 2 === (weeks.length - 1) % 2 && <text x={x + colW * 0.32} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{new Date(`${w.monday}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip dash-tip" style={{ left: Math.min(width - 160, 4 + hover * colW) }}>
          <b>Week of {date(weeks[hover].monday)}</b>
          <div className="tnum">{weeks[hover].km.toFixed(1)} km · {weeks[hover].runs} run{weeks[hover].runs === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  );
}

/** A view of Performance by its tab and view ("load/form"), as the screen names them. */
function perfName(ref: string): string {
  const [tab, view] = ref.split('/');
  const t = TABS.find((x) => x.key === tab);
  return `${t?.name ?? 'Performance'} · ${t?.views.find((v) => v.key === view)?.name ?? view}`;
}

/** A run's name on its tile: its title, else its day and time. */
const runTitle = (r: IndexedRun) => r.title ?? new Date(r.startTime).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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
      {(named || run.title) && <span className="muted small">{new Date(run.startTime).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
      <dl className="dash-facts">
        <div><dt>Distance</dt><dd className="tnum">{km(run.distance)} km</dd></div>
        <div><dt>Time</dt><dd className="tnum">{hm(run.duration)}</dd></div>
        <div><dt>Pace</dt><dd className="tnum">{pace(run.avgSpeed)} /km</dd></div>
        <div><dt>Heart rate</dt><dd className="tnum">{run.avgHeartRate ? `${Math.round(run.avgHeartRate)} bpm` : '–'}</dd></div>
        {typeof run.load === 'number' && <div><dt>Load</dt><dd className="tnum">{Math.round(run.load)}</dd></div>}
      </dl>
      {shown && (
        <svg viewBox="0 0 100 48" preserveAspectRatio="none" className="dash-spark dash-run-pace" role="img" aria-label={`Pace along the run, from ${mmss(shown[0])} to ${mmss(shown[shown.length - 1])} /km, fastest ${mmss(sorted[0])} /km`}>
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <Link className="row-open" href={`/run?id=${run.id}`}>Open the run →</Link>
    </div>
  );
}

/** Fitness, fatigue and form today, and the form of the last six weeks as a line. */
function FormTile({ runs, fitnessDays, fatigueDays }: { runs: IndexedRun[]; fitnessDays: number; fatigueDays: number }) {
  const days = useMemo(() => formSeries(runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), { fitnessDays, fatigueDays }, localDay(new Date())), [runs, fitnessDays, fatigueDays]);
  const now = days[days.length - 1];
  if (!now) return <p className="muted small">No load yet: the form needs the runs&apos; loads.</p>;
  const recent = days.slice(-42);
  const [lo, hi] = [Math.min(0, ...recent.map((d) => d.form)), Math.max(0, ...recent.map((d) => d.form))];
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * 52;
  const path = recent.map((d, i) => `${i ? 'L' : 'M'}${(i / (recent.length - 1 || 1)) * 100},${y(d.form).toFixed(1)}`).join('');
  return (
    <div className="dash-form">
      <div className="dash-figures">
        <div><span className="dash-big tnum">{signed(now.form)}</span> form</div>
        <div><span className="dash-mid tnum">{Math.round(now.fitness)}</span> fitness</div>
        <div><span className="dash-mid tnum">{Math.round(now.fatigue)}</span> fatigue</div>
      </div>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="dash-spark" role="img" aria-label={`Form over the last ${recent.length} days, from ${signed(recent[0].form)} to ${signed(now.form)}`}>
        <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <Link className="row-open" href="/performance?tab=load&view=form">Performance →</Link>
    </div>
  );
}

/** The last runs as a short list: the day and the title, the distance and the pace. */
function RecentTile({ runs }: { runs: IndexedRun[] }) {
  const recent = [...runs].reverse().slice(0, 6);
  if (!recent.length) return <p className="muted small">No run yet.</p>;
  return (
    <ul className="dash-recent">
      {recent.map((r) => (
        <li key={r.id}>
          <span className="dash-recent-what">
            <Link className="strong" href={`/run?id=${r.id}`}>{new Date(r.startTime).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</Link>
            {r.title && <span className="muted small">{r.title}</span>}
          </span>
          <span className="tnum">{km(r.distance)} km</span>
          <span className="tnum muted">{pace(r.avgSpeed)} /km</span>
        </li>
      ))}
      <li className="dash-more"><Link className="row-open" href="/">All runs →</Link></li>
    </ul>
  );
}

/** A segment: its efforts' pace over time as a line, the latest and its count. */
function SegmentTile({ def, efforts }: { def: BlockDefinition; efforts: BlockInstance[] }) {
  const mine = efforts.filter((e) => e.definitionId === def.id && e.status === 'accepted' && e.metrics.speed).sort((a, b) => a.runStart.localeCompare(b.runStart));
  if (!mine.length) return <p className="muted small">No effort yet.</p>;
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
        <div><span className="dash-mid tnum">{mine.length}</span> efforts</div>
      </div>
      <p className="muted small">Latest {date(lastE.runStart)}{paces.length > 1 ? ` · ${change <= 0 ? `${mmss(-change)} faster` : `${mmss(change)} slower`} than the first` : ''}</p>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="dash-spark" role="img" aria-label={`Pace of its ${mine.length} efforts over time`}>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <Link className="row-open" href={`/compare?items=b:${def.id}:0`}>Compare →</Link>
    </div>
  );
}

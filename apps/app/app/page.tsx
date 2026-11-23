'use client';

import Link from 'next/link';
import { CellBar, columnPath, useWidth } from '@/components';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOpenFolder, runInWorker, watchJob } from '@/lib/client';
import { PATHS, readJson, isOutdated, readManifest, type Manifest } from '@/lib/fs';
import { type RunsIndex, ALGORITHM_VERSION } from '@/lib/kernel';
import { date, duration, km, pace, time } from '@/lib/format';
import { readGear, type Gear, readRunTags, writeRunTags, type RunTag, type RunTagsFile } from '@/lib/gear';
import { NO_SEARCH, isSearching, isoWeek, matchesSearch, monthsOf, searchFromParams, searchToParams, weeksOf, type LogWeek, type RunSearch } from '@/lib/log';
import type { IndexedRun } from '@/lib/kernel';
import { LOAD_MODELS, readSettings } from '@/lib/settings';

/** The view of the Runs screen, remembered in the browser. */
const VIEW_KEY = 'strideprism.runsView';
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayNumber = (d: string) => Number(d.slice(8));
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const monthName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
/** A week's dates: "21–27 Sept", or "28 Sept – 4 Oct" across two months. */
const weekDates = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${dayNumber(a)}–${shortDate(b)}` : `${shortDate(a)} – ${shortDate(b)}`);
const kmOf = (m: number) => (m / 1000).toFixed(m >= 100000 ? 0 : 1);

/** Runs: the imported runs, the import with its progress, and the files that could not be imported. */
export default function RunsPageWrapper() {
  return <Suspense><RunsPage /></Suspense>;
}

function RunsPage() {
  const { folder, handle } = useOpenFolder();
  const router = useRouter();
  const params = useSearchParams();
  const actionDone = useRef(false);
  const [index, setIndex] = useState<RunsIndex | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [gear, setGear] = useState<Gear[]>([]);
  const [tags, setTags] = useState<RunTagsFile | null>(null);
  // The unit of the load model chosen in Settings (requirement "Load model chosen in Settings").
  const [loadUnit, setLoadUnit] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  /** the calendar of weeks (the default) or the table of runs */
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === 'list') setView('list'); } catch { /* the default */ } }, []);
  const choose = (v: 'calendar' | 'list') => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* not kept */ } };
  // The search of the runs, kept in the link ("wyszukiwaniem treningow").
  const [search, setSearch] = useState<RunSearch>(() => searchFromParams(new URLSearchParams(params.toString())));
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchToParams(search, new URLSearchParams(location.search)).toString();
      if (location.search.replace(/^\?/, '') !== next) window.history.replaceState(null, '', `${location.pathname}${next ? `?${next}` : ''}`);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const match = (r: IndexedRun) => matchesSearch(r, search);

  const load = useCallback(async () => {
    setIndex(await readJson<RunsIndex>(folder, PATHS.runsIndex));
    setManifest(await readManifest(folder));
    setGear(await readGear(folder));
    setTags(await readRunTags(folder));
    const s = await readSettings(folder);
    setLoadUnit(LOAD_MODELS.find((m) => m.key === s.performance.load)?.unit ?? '');
  }, [folder]);

  const saveTag = async (runId: string, tag: RunTag) => {
    if (!tags) return;
    await writeRunTags(folder, { ...tags, tags: { ...tags.tags, [runId]: tag } });
    await runInWorker('context', handle);
    setEditing(null);
    await load();
  };

  useEffect(() => {
    load();
  }, [load]);

  // A job started before this screen opened (or from another screen) keeps showing its progress,
  // and the list reloads when it ends.
  useEffect(() => {
    let was = false;
    return watchJob((j) => {
      if (j && (j.job === 'import' || j.job === 'recompute')) {
        was = true;
        setProgress({ done: j.done, total: j.total });
      } else if (was) {
        was = false;
        setProgress(null);
        load();
      }
    });
  }, [load]);

  // An old link with ?action=import opens the Data folder screen, which imports.
  useEffect(() => {
    if (params.get('action') === 'import' && !actionDone.current) {
      actionDone.current = true;
      router.replace('/folder?action=import');
    }
  });

  const runs = [...(index?.runs ?? [])].reverse();
  /** The longest run, the scale of the distance bars of the list. */
  const longest = Math.max(1, ...runs.map((r) => r.distance ?? 0));
  const totalKm = runs.reduce((a, r) => a + r.distance, 0) / 1000;
  const weeks = useMemo(() => weeksOf(index?.runs ?? []), [index]);

  return (
    <div className="page wide-page">
      <div className="page-head">
        <h1>Runs</h1>
        <span className="spacer" />
        {runs.length > 0 && (
          <div className="segmented" role="radiogroup" aria-label="View">
            {([['calendar', 'Calendar'], ['list', 'List']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={view === k} className={view === k ? 'on' : ''} onClick={() => choose(k)}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {isOutdated(manifest) && (
        <div className="banner warn">
          ⚠ Data in this folder was built with algorithm v{manifest!.algorithmVersion}; this app is v{ALGORITHM_VERSION}: recompute it on the <Link href="/folder">Data folder</Link> screen, under the IsoStride logo.
        </div>
      )}
      {progress && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
          <span className="muted">Working in the background · {progress.done} / {progress.total || '…'} files</span>
          <div className="progress"><div style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '3%' }} /></div>
        </div>
      )}

      {runs.length > 0 && <WeeksAtAGlance weeks={weeks} runs={runs.length} totalKm={totalKm} since={runs[runs.length - 1].startTime} />}

      {runs.length > 0 && (
        <RunsToolbar search={search} onSearch={setSearch} found={runs.filter(match).length} total={runs.length}
          types={[...new Set(runs.map((r) => r.workoutType).filter((t): t is string => !!t))].sort()} months={view === 'calendar' ? monthsOf(weeks).map((m) => m.month) : []} />
      )}
      {runs.length > 0 && view === 'calendar' ? <Calendar weeks={weeks} match={match} searching={isSearching(search)} loadUnit={loadUnit} /> : (
      <div className="card">
        {runs.length === 0 ? (
          <div className="empty">{index ? 'No runs yet.' : 'Nothing imported yet.'} Put your COROS FIT files in this folder (or its fit/ subfolder), then open the <Link href="/folder">Data folder</Link> screen (the IsoStride logo) and press <b>Import folder</b>.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date</th><th>Start</th><th>Title</th><th className="num">Distance km</th><th className="num">Time</th><th className="num">Pace /km</th><th className="num">Avg HR</th><th>HR from</th><th>Shoes</th><th>Tags</th><th className="num">Load{loadUnit ? ` ${loadUnit}` : ''}</th><th />
              </tr>
            </thead>
            <tbody>
              {runs.filter(match).map((r) => (
                <Fragment key={r.id}>
                  <tr className="row" onClick={() => router.push(`/run?id=${r.id}`)}>
                    <td className="strong">{date(r.startTime)}</td>
                    <td className="muted">{time(r.startTime)}</td>
                    <td>{r.title ? <span className="title-cell">{r.title}</span> : <span className="muted">–</span>}</td>
                    <td className="num"><CellBar share={r.distance / longest} />{km(r.distance)}</td>
                    <td className="num">{duration(r.duration)}</td>
                    <td className="num strong">{pace(r.avgSpeed)}</td>
                    <td className="num">{r.avgHeartRate ?? '–'}</td>
                    <td><span className="chip">{(r.heartRateSource ?? r.device).replace('COROS ', '')}</span></td>
                    <td>{r.shoes ? <span className="chip" title={r.shoesOverridden ? 'set for this run' : 'by date'}>{r.shoes}{r.shoesOverridden ? ' ✎' : ''}</span> : <span className="muted">–</span>}</td>
                    <td>
                      {[r.workoutType, r.techniqueCue].filter(Boolean).map((t) => <span key={t} className="chip" style={{ marginRight: 4 }}>{t}</span>)}
                      {r.note && <span className="muted" title={r.note}>✉</span>}
                    </td>
                    <td className="num muted" title={r.loadEstimated ? 'estimated from the duration: the run lacks what the load model needs' : undefined}>{r.load === null || r.load === undefined ? '–' : `${Math.round(r.load)}${r.loadEstimated ? '*' : ''}`}</td>
                    <td>
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); setEditing(editing === r.id ? null : r.id); }}>Edit</button>
                    </td>
                  </tr>
                  {editing === r.id && tags && (
                    <tr>
                      <td colSpan={12} style={{ background: 'var(--surface-2)' }}>
                        <TagEditor tag={tags.tags[r.id] ?? {}} gear={gear} dictionary={tags.dictionary} onSave={(t) => saveTag(r.id, t)} onCancel={() => setEditing(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}

/**
 * The weeks at a glance ("statystyki na tydzien ?"): this week against the average of the 4 weeks
 * before, all the runs, and the distance of the last 12 weeks as bars, the current one marked.
 */
function WeeksAtAGlance({ weeks, runs, totalKm, since }: { weeks: LogWeek[]; runs: number; totalKm: number; since: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, width] = useWidth();
  const now = weeks[0];
  const before = weeks.slice(1, 5);
  const avg = before.length ? before.reduce((a, w) => a + w.distance, 0) / before.length : 0;
  const bars = weeks.slice(0, 12).reverse();
  const max = Math.max(1, ...bars.map((w) => w.distance));
  const W = width;
  const H = 96;
  const bw = W / 12;
  const change = avg ? Math.round(((now.distance - avg) / avg) * 100) : null;
  return (
    <section className="card glance" aria-label="Weeks at a glance">
      <div className="glance-figures">
        <div className="glance-now">
          <span className="muted small">{now.current ? 'This week' : `Week of ${shortDate(now.start)}`}</span>
          <b className="tnum">{kmOf(now.distance)} km</b>
          <span className="muted small tnum">{duration(now.duration)} · {now.count} run{now.count === 1 ? '' : 's'}{change !== null && ` · ${change >= 0 ? '+' : '−'}${Math.abs(change)} % vs 4-week avg`}</span>
        </div>
        <dl className="glance-dl">
          <div><dt>4-week average</dt><dd className="tnum">{kmOf(avg)} km / week</dd></div>
          <div><dt>All runs</dt><dd className="tnum">{runs} runs · {totalKm.toFixed(0)} km</dd></div>
          <div><dt>Since</dt><dd>{date(since)}</dd></div>
        </dl>
      </div>
      <div ref={box} className="glance-chart">
        <svg width={W} height={H + 18} role="img" aria-label={`Distance of the last ${bars.length} weeks: ${bars.map((w) => `${shortDate(w.start)} ${kmOf(w.distance)} km`).join(', ')}`} onMouseLeave={() => setHover(null)}>
          <line x1={0} x2={W} y1={H} y2={H} stroke="var(--axis)" strokeWidth="1" />
          {bars.map((w, i) => {
            const h = (w.distance / max) * (H - 14);
            return (
              <g key={w.start} className="glance-bar" onMouseEnter={() => setHover(i)}>
                <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
                {w.distance > 0 && <path d={columnPath(i * bw + Math.max(4, (bw - Math.min(24, bw * 0.64)) / 2), Math.min(24, bw * 0.64), H - h, H)} fill={w.current ? 'var(--accent)' : 'var(--series-1)'} opacity={hover === null || hover === i ? 1 : 0.45} />}
                {(W > 640 || i % 3 === 2 || w.current) && <text x={i === bars.length - 1 ? W - 2 : i * bw + bw / 2} y={H + 13} fontSize="9.5" textAnchor={i === bars.length - 1 ? 'end' : 'middle'} fill="var(--muted)">{shortDate(w.start)}</text>}
              </g>
            );
          })}
          {hover !== null && (() => {
            const w = bars[hover];
            const x = Math.min(W - 70, Math.max(70, hover * bw + bw / 2));
            return <text x={x} y={11} fontSize="11" fontWeight="600" textAnchor="middle" fill="var(--text)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke">{shortDate(w.start)} · {kmOf(w.distance)} km · {w.count} run{w.count === 1 ? '' : 's'}</text>;
          })()}
        </svg>
        <span className="muted small">Distance per week, the last {bars.length} weeks</span>
      </div>
    </section>
  );
}

/**
 * The calendar of runs ("moze kalendarz ?"): a row per week, newest first, Monday to Sunday, each
 * run a tile in its day opening the run, the month named where it begins, the week's totals at the end.
 */
function Calendar({ weeks, match, searching, loadUnit }: { weeks: LogWeek[]; match: (r: IndexedRun) => boolean; searching: boolean; loadUnit: string }) {
  const today = new Date();
  const todayDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // The weeks grouped by month ("miesiac pokazuj lepiej ... pogrupowac wiersze").
  const months = monthsOf(weeks);
  return (
    <section className="card calendar" aria-label="Calendar of runs">
      <div className="cal-row cal-head" aria-hidden="true">
        <span>Week</span>
        {DAY_NAMES.map((d) => <span key={d}>{d}</span>)}
        <span>Total</span>
      </div>
      {months.map((m) => (
        <div key={m.month} className="cal-month" data-month={m.month}>
          <div className="cal-month-band">
            <h3>{monthName(`${m.month}-01`)}</h3>
            {m.count > 0 ? (
              <span className="muted tnum">{kmOf(m.distance)} km · {duration(m.duration)} · {m.count} run{m.count === 1 ? '' : 's'}</span>
            ) : <span className="muted">no runs</span>}
            {searching && (() => {
              const n = m.weeks.flatMap((w) => w.days).filter((d) => d.date.slice(0, 7) === m.month).flatMap((d) => d.runs).filter(match).length;
              return <span className={`cal-found ${n ? 'some' : ''}`}>{n} found</span>;
            })()}
          </div>
          {m.weeks.map((w) => (
            <div key={w.start} className={`cal-row cal-week ${w.current ? 'current' : ''}`} data-week={w.start}>
              <span className="cal-week-name"><b>W{isoWeek(w.start)}</b><span className="muted">{weekDates(w.start, w.days[6].date)}</span></span>
              {w.days.map((d) => (
                <div key={d.date} className={`cal-day ${d.date === todayDay ? 'today' : ''} ${d.date.slice(0, 7) !== m.month ? 'other' : ''}`}>
                  <span className="cal-date">{dayNumber(d.date)}</span>
                  {d.runs.map((r) => (!match(r) ? (
                    // A run the search did not find: a thin bar, still a way to it.
                    <Link key={r.id} href={`/run?id=${r.id}`} className="run-tile dim" aria-label={`${kmOf(r.distance)} km, not found by the search`} title={`${kmOf(r.distance)} km`} />
                  ) : (
                    <Link key={r.id} href={`/run?id=${r.id}`} className="run-tile" title={[r.title, r.workoutType, r.note].filter(Boolean).join(' · ') || undefined}>
                      <b className="tnum">{kmOf(r.distance)} km</b>
                      <span className="tnum">{duration(r.duration)} · {pace(r.avgSpeed)}</span>
                      {(r.title || r.workoutType) && <span className="run-tile-tag">{r.title ?? r.workoutType}</span>}
                    </Link>
                  )))}
                </div>
              ))}
              <div className="cal-total">
                {w.count ? (
                  <>
                    <b className="tnum">{kmOf(w.distance)} km</b>
                    <span className="muted tnum">{duration(w.duration)} · {w.count} run{w.count === 1 ? '' : 's'}</span>
                    <span className="muted tnum">{pace(w.distance / w.duration)} /km{w.heartRate ? ` · ${Math.round(w.heartRate)} bpm` : ''}</span>
                    {(() => {
                      // The week's load by the model of Settings.
                      const load = w.days.flatMap((d) => d.runs).reduce((sum, r) => sum + (r.load ?? 0), 0);
                      return load > 0 ? <span className="muted tnum cal-load">{Math.round(load)} {loadUnit}</span> : null;
                    })()}
                  </>
                ) : <span className="muted small">rest</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function TagEditor({ tag, gear, dictionary, onSave, onCancel }: {
  tag: RunTag;
  gear: Gear[];
  dictionary: RunTagsFile['dictionary'];
  onSave: (t: RunTag) => void;
  onCancel: () => void;
}) {
  const [t, setT] = useState<RunTag>(tag);
  const set = (k: keyof RunTag, v: string) => setT({ ...t, [k]: v || undefined });
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0' }}>
      <label className="muted">Title <input value={t.title ?? ''} placeholder="e.g. COROS test" onChange={(e) => set('title', e.target.value)} style={{ width: 180 }} /></label>
      <label className="muted">Shoe override{' '}
        <select value={t.shoesOverride ?? ''} onChange={(e) => set('shoesOverride', e.target.value)}>
          <option value="">by date</option>
          {gear.filter((g) => g.type === 'shoes').map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <label className="muted">Type{' '}
        <select value={t.workoutType ?? ''} onChange={(e) => set('workoutType', e.target.value)}>
          <option value="">–</option>
          {dictionary.workoutTypes.map((v) => <option key={v}>{v}</option>)}
        </select>
      </label>
      <label className="muted">Technique cue{' '}
        <select value={t.techniqueCue ?? ''} onChange={(e) => set('techniqueCue', e.target.value)}>
          <option value="">–</option>
          {dictionary.techniqueCues.map((v) => <option key={v}>{v}</option>)}
        </select>
      </label>
      <label className="muted">Note <input value={t.note ?? ''} onChange={(e) => set('note', e.target.value)} style={{ width: 200 }} /></label>
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={onCancel}>Cancel</button>
      <button className="btn primary" onClick={() => onSave(t)}>Save</button>
    </div>
  );
}

/**
 * The search and the browsing of the runs ("doloz podstawowe sprawy dotyczace z przesukiwaniem
 * kalendarza i wyszuiwaniem treningow"): words, a workout type, a distance range, the count found,
 * and on the calendar a month to go to and today.
 */
function RunsToolbar({ search, onSearch, found, total, types, months }: { search: RunSearch; onSearch: (s: RunSearch) => void; found: number; total: number; types: string[]; months: string[] }) {
  const set = (patch: Partial<RunSearch>) => onSearch({ ...search, ...patch });
  // The bar stays at the top while the calendar scrolls ("filtr powinien zostac przy przesuwaniu
  // kalendarza"); its height tells the calendar's sticky heads where to stay, under it.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    const page = el?.parentElement;
    if (!el || !page) return;
    const ro = new ResizeObserver(() => page.style.setProperty('--runs-bar', `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const km = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));
  const goTo = (month: string) => document.querySelector(`.cal-month[data-month="${month}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const today = () => document.querySelector('.cal-week.current')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div ref={bar} className="runs-toolbar card" role="search" aria-label="Search runs">
      <input className="runs-q" type="search" aria-label="Search words" placeholder="Search title, note, type, shoes, date…" value={search.text} onChange={(e) => set({ text: e.target.value })} />
      <select aria-label="Workout type" value={search.type ?? ''} onChange={(e) => set({ type: e.target.value || null })}>
        <option value="">All types</option>
        {types.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <span className="runs-km">
        <input type="number" min={0} step={0.5} aria-label="From km" placeholder="from" value={search.minKm ?? ''} onChange={(e) => set({ minKm: km(e.target.value) })} />
        <span className="muted">–</span>
        <input type="number" min={0} step={0.5} aria-label="To km" placeholder="to" value={search.maxKm ?? ''} onChange={(e) => set({ maxKm: km(e.target.value) })} />
        <span className="muted small">km</span>
      </span>
      <span className="runs-found tnum" aria-live="polite">{isSearching(search) ? `${found} of ${total} runs` : `${total} runs`}</span>
      {isSearching(search) && <button type="button" className="btn sm" onClick={() => onSearch(NO_SEARCH)}>Clear</button>}
      {months.length > 0 && (
        <span className="runs-nav">
          <select aria-label="Go to month" value="" onChange={(e) => e.target.value && goTo(e.target.value)}>
            <option value="">Go to month…</option>
            {months.map((m) => <option key={m} value={m}>{monthName(`${m}-01`)}</option>)}
          </select>
          <button type="button" className="btn sm" onClick={today}>Today</button>
        </span>
      )}
    </div>
  );
}

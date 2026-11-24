'use client';

import Link from 'next/link';
import { CellBar, EditButton, columnPath, useWidth } from '@/components';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useOpenFolder, runInWorker, watchJob } from '@/lib/client';
import { locale, localeTag, msg, number, t, tn } from '@/lib/i18n';
import { PATHS, readJson, isOutdated, markRunsSeen, readManifest, readNewRuns, type Manifest } from '@/lib/fs';
import { type RunsIndex, ALGORITHM_VERSION } from '@/lib/kernel';
import { date, duration, km, pace, time } from '@/lib/format';
import { readGear, type Gear, readRunTags, writeRunTags, type RunTag, type RunTagsFile } from '@/lib/gear';
import { TagEditor } from './run/TagEditor';
import { NO_SEARCH, isSearching, isoWeek, matchesSearch, monthsOf, searchFromParams, searchToParams, weeksOf, type LogWeek, type RunSearch } from '@/lib/log';
import type { IndexedRun } from '@/lib/kernel';
import { LOAD_MODELS, readSettings } from '@/lib/settings';

/** The view of the Runs screen, remembered in the browser. */
const VIEW_KEY = 'strideprism.runsView';
const DAY_NAMES = [msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat'), msg('Sun')];
const dayNumber = (d: string) => Number(d.slice(8));
/** The calendar's dates day first: British in English ("23 Nov"), else the language's own ("23 lis"). */
const calendarTag = () => (locale() === 'en' ? 'en-GB' : localeTag());
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(calendarTag(), { day: 'numeric', month: 'short' });
/** A month and its year as a heading: "November 2026", "Listopad 2026". */
const monthName = (d: string) => {
  const s = new Date(`${d}T12:00:00`).toLocaleDateString(calendarTag(), { month: 'long', year: 'numeric' });
  return s.charAt(0).toLocaleUpperCase(localeTag()) + s.slice(1);
};
/** A week's dates: "21–27 Sept", or "28 Sept – 4 Oct" across two months. */
const weekDates = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${dayNumber(a)}–${shortDate(b)}` : `${shortDate(a)} – ${shortDate(b)}`);
const kmOf = (m: number) => number(m / 1000, m >= 100000 ? 0 : 1);
/** The source of a run's heart rate: a strap by its name, or the watch's wrist sensor ("wrist (PACE 4)", as the context names it). */
const hrFrom = (source: string) => { const m = /^wrist \((.*)\)$/.exec(source); return m ? t('wrist ({device})', { device: m[1] }) : source; };

/** Runs: the imported runs, the import with its progress, and the files that could not be imported. */
export default function RunsPageWrapper() {
  return <Suspense><RunsPage /></Suspense>;
}

function RunsPage() {
  useLocale();
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
  /** the runs an import added that the runner has not opened (requirement "New runs marked new") */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  /** the folder read: until then nothing is drawn, so nothing comes in above what was drawn */
  const [loaded, setLoaded] = useState(false);
  /** the calendar of weeks (the default) or the table of runs */
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === 'list') setView('list'); } catch { /* the default */ } }, []);
  const choose = (v: 'calendar' | 'list') => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* not kept */ } };
  // The search of the runs, kept in the link ("wyszukiwaniem treningow").
  const [search, setSearch] = useState<RunSearch>(() => searchFromParams(new URLSearchParams(params.toString())));
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchToParams(search, new URLSearchParams(location.search)).toString();
      if (location.search.replace(/^\?/, '') !== next) window.history.replaceState(null, '', `${location.pathname}${next ? `?${next}` : ''}`);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const match = (r: IndexedRun) => matchesSearch(r, search);

  // Everything the screen shows read first, then set at once: the list and its columns drawn once, not
  // widening as the gear, the tags and the load's unit come in one after another (layout shift 0:
  // "jak wchodze na runs to widze shift ... wszystkich kolumn").
  const load = useCallback(async () => {
    const [i, m, g, tg, s, n] = await Promise.all([readJson<RunsIndex>(folder, PATHS.runsIndex), readManifest(folder), readGear(folder), readRunTags(folder), readSettings(folder), readNewRuns(folder)]);
    setIndex(i);
    setFresh(new Set(n));
    setManifest(m);
    setGear(g);
    setTags(tg);
    setLoadUnit(LOAD_MODELS.find((x) => x.key === s.performance.load)?.unit ?? '');
    setLoaded(true);
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
      router.replace('/data?action=import');
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
        <h1>{t('Runs')}</h1>
        <span className="spacer" />
        {runs.length > 0 && (
          <div className="segmented" role="radiogroup" aria-label={t('View')}>
            {([['calendar', msg('Calendar')], ['list', msg('List')]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={view === k} className={view === k ? 'on' : ''} onClick={() => choose(k)}>{t(l)}</button>
            ))}
          </div>
        )}
      </div>

      {isOutdated(manifest) && (
        <div className="banner warn">
          {t('⚠ The data of this folder were built with algorithm v{old}; this app is v{now}: they are rebuilt by themselves now.', { old: manifest!.algorithmVersion, now: ALGORITHM_VERSION })}
        </div>
      )}
      {progress && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
          <span className="muted">{t('Working in the background · {done} / {total} files', { done: progress.done, total: progress.total || '…' })}</span>
          <div className="progress"><div style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '3%' }} /></div>
        </div>
      )}

      {runs.length > 0 && <WeeksAtAGlance weeks={weeks} runs={runs.length} totalKm={totalKm} since={runs[runs.length - 1].startTime} />}

      {runs.length > 0 && (
        <RunsToolbar search={search} onSearch={setSearch} found={runs.filter(match).length} total={runs.length}
          types={[...new Set(runs.map((r) => r.workoutType).filter((type): type is string => !!type))].sort()} months={view === 'calendar' ? monthsOf(weeks).map((m) => m.month) : []} />
      )}
      {loaded && runs.some((r) => fresh.has(r.id)) && (
        <div className="new-runs-bar">
          <span className="new-chip">{t('New')}</span>
          <span className="muted small">{tn(runs.filter((r) => fresh.has(r.id)).length, '{n} run added since you last looked; it stays marked until you open it.', '{n} runs added since you last looked; each stays marked until you open it.')}</span>
          <button type="button" className="link-button small" onClick={async () => { await markRunsSeen(folder, 'all'); setFresh(new Set()); }}>{t('Mark as seen')}</button>
        </div>
      )}
      {!loaded ? null : runs.length > 0 && view === 'calendar' ? <Calendar weeks={weeks} match={match} searching={isSearching(search)} loadUnit={loadUnit} fresh={fresh} /> : (
      <div className="card">
        {runs.length === 0 ? (
          <div className="empty">{index ? t('No runs yet.') : t('Nothing imported yet.')} {t('Put your FIT files in this folder (or its fit/ subfolder): they are imported by themselves. The')} <Link href="/data">{t('Data')}</Link> {t('screen (the IsoStride logo) shows the import and the files that could not be read.')}</div>
        ) : (
          <table className="data runs-table">
            <thead>
              <tr>
                <th>{t('Date')}</th><th className="wide-col">{t('Start')}</th><th className="wide-col">{t('Title')}</th><th className="num">{t('Distance km')}</th><th className="num">{t('Time')}</th><th className="num">{t('Pace /km')}</th><th className="num wide-col">{t('Avg HR')}</th><th className="wide-col">{t('HR from')}</th><th className="wide-col">{t('Shoes')}</th><th className="wide-col">{t('Tags')}</th><th className="num wide-col">{t('Load')}{loadUnit ? ` ${loadUnit}` : ''}</th><th className="wide-col" />
              </tr>
            </thead>
            <tbody>
              {runs.filter(match).map((r) => (
                <Fragment key={r.id}>
                  <tr className="row" onClick={() => router.push(`/run?id=${r.id}`)}>
                    <td className="strong">{date(r.startTime)}{fresh.has(r.id) && <span className="new-chip">{t('New')}</span>}</td>
                    <td className="muted wide-col">{time(r.startTime)}</td>
                    <td className="wide-col">{r.title ? <span className="title-cell">{r.title}</span> : <span className="muted">–</span>}</td>
                    <td className="num"><CellBar share={r.distance / longest} />{km(r.distance)}</td>
                    <td className="num">{duration(r.duration)}</td>
                    <td className="num strong">{pace(r.avgSpeed)}</td>
                    <td className="num wide-col">{r.avgHeartRate ?? '–'}</td>
                    <td className="wide-col"><span className="chip">{hrFrom((r.heartRateSource ?? r.device).replace('COROS ', ''))}</span></td>
                    <td className="wide-col">{r.shoes ? <span className="chip" title={r.shoesOverridden ? t('set for this run') : t('by date')}>{r.shoes}{r.shoesOverridden ? ' ✎' : ''}</span> : <span className="muted">–</span>}</td>
                    <td className="wide-col">
                      {[r.workoutType, r.techniqueCue].filter(Boolean).map((tag) => <span key={tag} className="chip" style={{ marginRight: 4 }}>{tag}</span>)}
                      {r.note && <span className="muted" title={r.note}>✉</span>}
                    </td>
                    <td className="num muted wide-col" title={r.loadEstimated ? t('estimated from the duration: the run lacks what the load model needs') : undefined}>{r.load === null || r.load === undefined ? '–' : `${Math.round(r.load)}${r.loadEstimated ? '*' : ''}`}</td>
                    {/* On a phone the run's own screen edits its tags (Tags and note): the column left out. */}
                    <td className="wide-col">
                      <EditButton name={r.title ?? `${date(r.startTime)} ${time(r.startTime)}`} onClick={(e) => { e.stopPropagation(); setEditing(editing === r.id ? null : r.id); }} />
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
      {/* A run's tags edited in the app's one editor, in the middle of the screen. */}
      {editing && tags && (() => {
        const r = runs.find((x) => x.id === editing);
        return r ? <TagEditor title={r.title ?? `${date(r.startTime)} ${time(r.startTime)}`} tag={tags.tags[r.id] ?? {}} gear={gear} dictionary={tags.dictionary} onSave={(tag) => saveTag(r.id, tag)} onCancel={() => setEditing(null)} /> : null;
      })()}
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
    <section className="card glance" aria-label={t('Weeks at a glance')}>
      <div className="glance-figures">
        <div className="glance-now">
          <span className="muted small">{now.current ? t('This week') : t('Week of {date}', { date: shortDate(now.start) })}</span>
          <b className="tnum">{kmOf(now.distance)} km</b>
          <span className="muted small tnum">{duration(now.duration)} · {tn(now.count, '{n} run', '{n} runs')}{change !== null && ` · ${t('{change} % vs 4-week avg', { change: `${change >= 0 ? '+' : '−'}${number(Math.abs(change))}` })}`}</span>
        </div>
        <dl className="glance-dl">
          <div><dt>{t('4-week average')}</dt><dd className="tnum">{t('{km} km / week', { km: kmOf(avg) })}</dd></div>
          <div><dt>{t('All runs')}</dt><dd className="tnum">{tn(runs, '{n} run', '{n} runs')} · {number(totalKm, 0)} km</dd></div>
          <div><dt>{t('Since')}</dt><dd>{date(since)}</dd></div>
        </dl>
      </div>
      <div ref={box} className="glance-chart">
        <svg width={W} height={H + 18} role="img" aria-label={t('Distance of the last {n} weeks: {weeks}', { n: number(bars.length), weeks: bars.map((w) => `${shortDate(w.start)} ${kmOf(w.distance)} km`).join(', ') })} onMouseLeave={() => setHover(null)}>
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
            return <text x={x} y={11} fontSize="11" fontWeight="600" textAnchor="middle" fill="var(--text)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke">{shortDate(w.start)} · {kmOf(w.distance)} km · {tn(w.count, '{n} run', '{n} runs')}</text>;
          })()}
        </svg>
        <span className="muted small">{tn(bars.length, 'Distance per week, the last {n} week', 'Distance per week, the last {n} weeks')}</span>
      </div>
    </section>
  );
}

/**
 * The calendar of runs ("moze kalendarz ?"): a row per week, newest first, Monday to Sunday, each
 * run a tile in its day opening the run, the month named where it begins, the week's totals at the end.
 */
function Calendar({ weeks, match, searching, loadUnit, fresh }: { weeks: LogWeek[]; match: (r: IndexedRun) => boolean; searching: boolean; loadUnit: string; fresh: Set<string> }) {
  const today = new Date();
  const todayDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // The weeks grouped by month ("miesiac pokazuj lepiej ... pogrupowac wiersze").
  const months = monthsOf(weeks);
  return (
    <section className="card calendar" aria-label={t('Calendar of runs')}>
      <div className="cal-row cal-head" aria-hidden="true">
        <span>{t('Week')}</span>
        {DAY_NAMES.map((d) => <span key={d}>{t(d)}</span>)}
        <span>{t('Total')}</span>
      </div>
      {months.map((m) => (
        <div key={m.month} className="cal-month" data-month={m.month}>
          <div className="cal-month-band">
            <h3>{monthName(`${m.month}-01`)}</h3>
            {m.count > 0 ? (
              <span className="muted tnum">{kmOf(m.distance)} km · {duration(m.duration)} · {tn(m.count, '{n} run', '{n} runs')}</span>
            ) : <span className="muted">{t('no runs')}</span>}
            {searching && (() => {
              const n = m.weeks.flatMap((w) => w.days).filter((d) => d.date.slice(0, 7) === m.month).flatMap((d) => d.runs).filter(match).length;
              return <span className={`cal-found ${n ? 'some' : ''}`}>{t('{n} found', { n: number(n) })}</span>;
            })()}
          </div>
          {m.weeks.map((w) => (
            <div key={w.start} className={`cal-row cal-week ${w.current ? 'current' : ''}`} data-week={w.start}>
              <span className="cal-week-name"><b>{t('W{week}', { week: isoWeek(w.start) })}</b><span className="muted">{weekDates(w.start, w.days[6].date)}</span></span>
              {w.days.map((d) => (
                <div key={d.date} className={`cal-day ${d.date === todayDay ? 'today' : ''} ${d.date.slice(0, 7) !== m.month ? 'other' : ''}`}>
                  <span className="cal-date">{dayNumber(d.date)}</span>
                  {d.runs.map((r) => (!match(r) ? (
                    // A run the search did not find: a thin bar, still a way to it.
                    <Link key={r.id} href={`/run?id=${r.id}`} className="run-tile dim" aria-label={t('{km} km, not found by the search', { km: kmOf(r.distance) })} title={`${kmOf(r.distance)} km`} />
                  ) : (
                    <Link key={r.id} href={`/run?id=${r.id}`} className={`run-tile ${fresh.has(r.id) ? 'new' : ''}`} title={[r.title, r.workoutType, r.note].filter(Boolean).join(' · ') || undefined}>
                      <b className="tnum">{kmOf(r.distance)} km{fresh.has(r.id) && <span className="new-chip">{t('New')}</span>}</b>
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
                    <span className="muted tnum">{duration(w.duration)} · {tn(w.count, '{n} run', '{n} runs')}</span>
                    <span className="muted tnum">{pace(w.distance / w.duration)} /km{w.heartRate ? ` · ${Math.round(w.heartRate)} bpm` : ''}</span>
                    {(() => {
                      // The week's load by the model of Settings; its line held while the loads are read (layout shift 0).
                      const load = w.days.flatMap((d) => d.runs).reduce((sum, r) => sum + (r.load ?? 0), 0);
                      return <span className="muted tnum cal-load">{load > 0 ? `${Math.round(load)} ${loadUnit}` : '\u00a0'}</span>;
                    })()}
                  </>
                ) : <span className="muted small">{t('rest')}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
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
    <div ref={bar} className="runs-toolbar card" role="search" aria-label={t('Search runs')}>
      <input className="runs-q" type="search" aria-label={t('Search words')} placeholder={t('Search title, note, type, shoes, date…')} value={search.text} onChange={(e) => set({ text: e.target.value })} />
      <select aria-label={t('Workout type')} value={search.type ?? ''} onChange={(e) => set({ type: e.target.value || null })}>
        <option value="">{t('All types')}</option>
        {types.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      <span className="runs-km">
        <input type="number" min={0} step={0.5} aria-label={t('From km')} placeholder={t('from')} value={search.minKm ?? ''} onChange={(e) => set({ minKm: km(e.target.value) })} />
        <span className="muted">–</span>
        <input type="number" min={0} step={0.5} aria-label={t('To km')} placeholder={t('to')} value={search.maxKm ?? ''} onChange={(e) => set({ maxKm: km(e.target.value) })} />
        <span className="muted small">km</span>
      </span>
      <span className="runs-found tnum" aria-live="polite">{isSearching(search) ? tn(total, '{found} of {n} run', '{found} of {n} runs', { found: number(found) }) : tn(total, '{n} run', '{n} runs')}</span>
      {isSearching(search) && <button type="button" className="btn sm" onClick={() => onSearch(NO_SEARCH)}>{t('Clear')}</button>}
      {months.length > 0 && (
        <span className="runs-nav">
          <select aria-label={t('Go to month')} value="" onChange={(e) => e.target.value && goTo(e.target.value)}>
            <option value="">{t('Go to month…')}</option>
            {months.map((m) => <option key={m} value={m}>{monthName(`${m}-01`)}</option>)}
          </select>
          <button type="button" className="btn sm" onClick={today}>{t('Today')}</button>
        </span>
      )}
    </div>
  );
}

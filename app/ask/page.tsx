'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { METRIC_VIEW, OverTimeChart, type OverTimeGroup } from '@/components';
import { LOWER_IS_BETTER, PERIOD_PRESETS, STATS, STAT_LABEL, WINDOW_PRESETS, datesPeriod, describeQuery, presetPeriod, queryFromParams, queryToParams, windowName, type Answer, type PeriodPreset, type Query, type Window } from '@/lib/ask';
import { askInWorker, useOpenFolder } from '@/lib/client';
import { PATHS, readJson } from '@/lib/fs';
import { date } from '@/lib/format';
import { readGear, readRunTags } from '@/lib/gear';
import type { RunsIndex } from '@/lib/kernel';

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const PRESET_LABEL: Record<PeriodPreset, string> = { all: 'All runs', month: 'Last 30 days', quarter: 'Last 3 months', year: 'This year' };

export default function AskPageWrapper() {
  return <Suspense><AskPage /></Suspense>;
}

/**
 * Ask (requirement "Questions about the data"): a question built from controls — the kind of
 * answer, the metric, the length of a stretch, the period and the filters — answered as a
 * control changes with a sentence, a chart over time and a table of the runs behind it.
 * The question lives in the link. Nothing leaves the computer.
 */
function AskPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { folder, handle } = useOpenFolder();
  const query = useMemo(() => queryFromParams(new URLSearchParams(params.toString())), [params]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState({ workoutTypes: [] as string[], shoes: [] as string[] });
  const [preset, setPreset] = useState<PeriodPreset | null>(query.period.from === null && query.period.to === null ? 'all' : null);

  useEffect(() => {
    (async () => {
      const runs = (await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? [];
      const tags = await readRunTags(folder);
      const gear = await readGear(folder);
      const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
      setOptions({ workoutTypes: uniq([...tags.dictionary.workoutTypes, ...runs.map((r) => r.workoutType)]), shoes: uniq([...gear.filter((g) => g.type === 'shoes').map((g) => g.name), ...runs.map((r) => r.shoes)]) });
    })();
  }, [folder]);

  // The answer follows the controls: a short pause after the last change, then the worker reads the runs.
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setError(null);
      setProgress({ done: 0, total: 0 });
      askInWorker(query, handle, (p) => live && setProgress({ done: p.done, total: p.total }), controller.signal)
        .then((a) => live && setAnswer(a))
        .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => live && setProgress(null));
    }, 350);
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [query, handle]);

  // The latest question, ahead of the link: two quick changes must build on each other, not on the link's lag.
  const latest = useRef(query);
  useEffect(() => { latest.current = query; }, [query]);
  const set = (next: Query) => { latest.current = next; router.replace(`/ask?${queryToParams(next).toString()}`); };
  const patch = (p: Partial<Query>) => set({ ...latest.current, ...p } as Query);
  const setKind = (kind: Query['kind']) => {
    const q = latest.current;
    if (kind === q.kind) return;
    const base = { period: q.period, filters: q.filters };
    const metric = q.kind === 'best' ? 'speed' : q.metric;
    const limit = q.kind === 'trend' ? 10 : q.limit;
    const stat = q.kind === 'best' ? 'avg' : q.stat;
    if (kind === 'trend') set({ kind, metric, stat, ...base });
    else if (kind === 'best') set({ kind, window: { kind: 'time', target: 600 }, limit, ...base });
    else set({ kind, metric, stat, direction: LOWER_IS_BETTER[metric] ? 'low' : 'high', limit, ...base });
  };
  const setPeriodPreset = (p: PeriodPreset) => { setPreset(p); patch({ period: presetPeriod(p) }); };
  const setDates = (from: string | null, to: string | null) => { setPreset(null); patch({ period: datesPeriod(from, to) }); };
  const sameWindow = (a: Window, b: Window) => a.kind === b.kind && a.target === b.target;

  const view = answer ? METRIC_VIEW.find((m) => m.key === answer.metric)! : null;
  const groups: OverTimeGroup[] = answer && view ? [{
    key: 'runs', label: 'runs', color: 'var(--series-1)', shape: 'circle',
    points: answer.points.map((p) => ({ t: Date.parse(p.date), v: p.value, note: p.title ?? undefined })),
    fits: answer.fit ? [{ t0: answer.fit.t0, t1: answer.fit.t1, v0: answer.fit.start, v1: answer.fit.start + answer.fit.change, noise: answer.fit.noise }] : [],
  }] : [];
  const rows = answer ? (answer.query.kind === 'trend' ? [...answer.points].reverse() : answer.ranking) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Ask</h1>
          <div className="eyebrow">A question about your runs, built from the controls and answered on this computer.</div>
        </div>
      </div>

      <div className="card ask-form">
        <div className="ask-row">
          <span className="ask-label">Answer</span>
          <div className="segmented" role="radiogroup" aria-label="Answer">
            {([['trend', 'Change over time'], ['best', 'Fastest stretch'], ['top', 'Highest or lowest']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={query.kind === k} className={query.kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
        </div>
        {query.kind !== 'best' && (
          <div className="ask-row">
            <span className="ask-label">Metric</span>
            <div className="metric-picker" role="group" aria-label="Metric">
              {METRIC_VIEW.map((m) => <button key={m.key} type="button" className={`pill ${query.metric === m.key ? 'on' : ''}`} aria-pressed={query.metric === m.key} title={m.name} onClick={() => patch(query.kind === 'top' ? { metric: m.key, direction: LOWER_IS_BETTER[m.key] ? 'low' : 'high' } : { metric: m.key })}>{m.short}</button>)}
            </div>
            <div className="segmented" role="radiogroup" aria-label="Statistic" title="Of each run: the average over the moving samples; the median, minimum or maximum over its 10 s windows">
              {STATS.map((st) => <button key={st} type="button" role="radio" aria-checked={query.stat === st} className={query.stat === st ? 'on' : ''} onClick={() => patch({ stat: st })}>{STAT_LABEL[st]}</button>)}
            </div>
            {query.kind === 'top' && (
              <div className="segmented" role="radiogroup" aria-label="Direction">
                <button type="button" role="radio" aria-checked={query.direction === 'high'} className={query.direction === 'high' ? 'on' : ''} onClick={() => patch({ direction: 'high' })}>Highest</button>
                <button type="button" role="radio" aria-checked={query.direction === 'low'} className={query.direction === 'low' ? 'on' : ''} onClick={() => patch({ direction: 'low' })}>Lowest</button>
              </div>
            )}
          </div>
        )}
        {query.kind === 'best' && (
          <div className="ask-row">
            <span className="ask-label">Stretch</span>
            <div className="metric-picker" role="group" aria-label="Stretch">
              {WINDOW_PRESETS.map((w) => <button key={windowName(w)} type="button" className={`pill ${sameWindow(w, query.window) ? 'on' : ''}`} aria-pressed={sameWindow(w, query.window)} onClick={() => patch({ window: w })}>{windowName(w)}</button>)}
            </div>
            <span className="range">
              <input aria-label="Stretch length" type="number" min={1} step={1} value={query.window.kind === 'time' ? query.window.target / 60 : query.window.target / 1000} onChange={(e) => { const n = Number(e.target.value); if (n > 0) patch({ window: { kind: query.window.kind, target: query.window.kind === 'time' ? n * 60 : n * 1000 } }); }} style={{ width: 64 }} />
              <select className="select small" aria-label="Stretch unit" value={query.window.kind} onChange={(e) => patch({ window: { kind: e.target.value as Window['kind'], target: e.target.value === 'time' ? 600 : 5000 } })}>
                <option value="time">min</option>
                <option value="distance">km</option>
              </select>
            </span>
          </div>
        )}
        <div className="ask-row">
          <span className="ask-label">Period</span>
          <div className="metric-picker" role="group" aria-label="Period">
            {PERIOD_PRESETS.map((p) => <button key={p} type="button" className={`pill ${preset === p ? 'on' : ''}`} aria-pressed={preset === p} onClick={() => setPeriodPreset(p)}>{PRESET_LABEL[p]}</button>)}
          </div>
          <span className="range">
            <input type="date" aria-label="From" value={query.period.from ?? ''} onChange={(e) => setDates(e.target.value, latest.current.period.to)} />
            <span className="muted">–</span>
            <input type="date" aria-label="To" value={query.period.to ?? ''} onChange={(e) => setDates(latest.current.period.from, e.target.value)} />
          </span>
        </div>
        <div className="ask-row">
          <span className="ask-label">Filters</span>
          <select className="select small" aria-label="Workout type" value={query.filters.workoutType ?? ''} onChange={(e) => patch({ filters: { ...latest.current.filters, workoutType: e.target.value || null } })}>
            <option value="">any workout type</option>
            {options.workoutTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select small" aria-label="Shoes" value={query.filters.shoes ?? ''} onChange={(e) => patch({ filters: { ...latest.current.filters, shoes: e.target.value || null } })}>
            <option value="">any shoes</option>
            {options.shoes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input aria-label="Title contains" placeholder="title contains…" defaultValue={query.filters.title ?? ''} onChange={(e) => patch({ filters: { ...latest.current.filters, title: e.target.value.trim() || null } })} style={{ width: 160 }} />
          {query.kind !== 'trend' && (
            <select className="select small" aria-label="Top" value={query.limit} onChange={(e) => patch({ limit: Number(e.target.value) })}>
              {[5, 10, 20, 50].map((n) => <option key={n} value={n}>top {n}</option>)}
            </select>
          )}
        </div>
      </div>

      {progress && <div className="card" style={{ padding: '10px 14px', marginTop: 12 }}><span className="muted">Reading runs… {progress.done} / {progress.total || '…'}</span><div className="progress"><div style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '3%' }} /></div></div>}
      {error && <div className="banner err" style={{ marginTop: 12 }}>⚠ {error}</div>}

      {answer && view && (
        <>
          <div className="card result" aria-label="Result" style={{ marginTop: 12 }}>
            <div className="muted small">{describeQuery(answer.query)}</div>
            <div className={`verdict ${answer.fit?.verdict === 'change' ? 'is-change' : ''}`} style={{ fontSize: 17 }}>{answer.sentence}</div>
            <div className="muted small">{answer.runs} run{answer.runs === 1 ? '' : 's'} in the period{answer.points.length !== answer.runs ? `, ${answer.points.length} with a value` : ''}.</div>
          </div>
          {answer.points.length > 0 && (
            <div className="card chart" style={{ marginTop: 12 }}>
              <h3 className="chart-title">Over time <span className="muted">· {answer.query.kind === 'best' ? 'the fastest stretch of each run' : `each run's ${answer.query.stat === 'avg' ? '' : `${STAT_LABEL[answer.query.stat]} `}${view.name.toLowerCase()}`}</span></h3>
              <OverTimeChart title={view.name} groups={groups} format={view.fmt} tick={view.tick} minSpan={view.minSpan} invert={view.invert} markers={[]} fit={!!answer.fit} join={answer.query.kind === 'trend'} labels={false} height={280} />
            </div>
          )}
          {rows.length > 0 && (
            <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
              <table className="data" aria-label="Runs behind the answer">
                <thead><tr>{answer.query.kind !== 'trend' && <th>#</th>}<th>Date</th><th>Title</th><th className="num">{view.name}</th>{answer.query.kind === 'best' && <th>Stretch</th>}<th /></tr></thead>
                <tbody>
                  {rows.map((p, k) => (
                    <tr key={p.runId + (p.from ?? '')}>
                      {answer.query.kind !== 'trend' && <td className="muted">{k + 1}</td>}
                      <td className="strong">{date(p.date)}</td>
                      <td>{p.title ?? <span className="muted">–</span>}</td>
                      <td className="num">{view.fmt(p.value)}</td>
                      {answer.query.kind === 'best' && <td className="muted">{mmss(p.from!)}–{mmss(p.to!)} · {(p.distance! / 1000).toFixed(2)} km</td>}
                      <td className="num"><Link className="muted" href={`/run?id=${p.runId}${p.from !== null ? `&from=${Math.round(p.from)}&to=${Math.round(p.to!)}` : ''}`}>Open run →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMetrics } from '@/components';
import type { BlockInstance } from '@/lib/blocks';
import { LEAST_CHANGE, clearDifference, differenceNoise, effortsByRun, meanOf, trendPerWeek, valueOf, type RunEfforts } from '@/lib/compare';
import { date, duration, km } from '@/lib/format';
import { number, t } from '@/lib/i18n';

/** A signed number, with the minus sign of print: +340, −11, ±0 (a value that writes as 0 has no sign). */
const signed = (v: number, f: (x: number) => string) => { const a = f(Math.abs(v)); return `${/^[0.,]+$/.test(a) ? '±' : v > 0 ? '+' : '−'}${a}`; };

/** A figure of the efforts as the table shows it: its values in a run, its mean there, how it is written and which way is better. */
interface Figure {
  key: string;
  label: string;
  of: (x: RunEfforts) => (number | null)[];
  mean?: (x: RunEfforts) => number | null;
  fmt: (v: number) => string;
  diff: (d: number) => string;
  direction: 'higher' | 'lower' | 'neutral';
  /** the least difference coloured as better or worse, in the figure's unit (lib/compare, LEAST_CHANGE of the axis' least range) */
  least: number;
  /** its last effort against its first means something (not the time and the distance of efforts of other lengths) */
  drift?: boolean;
}

/**
 * The Efforts tab by run (requirement "Workouts compared rep by rep"; "Połącz w „Wysiłki”"): a row for each
 * run, the newest first, a column for each figure (as wide however many efforts: "a co jak bedzie 50 serii"):
 * each run's mean and its last effort against its first; a run opened shows each effort; on top the change from the previous run and from the first, and the trend per week.
 */
export function EffortsByRun({ efforts, columns, titleOf, isReference, totals = false }: {
  efforts: BlockInstance[];
  /** a run's time and distance the sum of its efforts (runs added whole, their laps the efforts), not their mean */
  totals?: boolean;
  /** the effort that is the part compared from (Compare similar), marked */
  isReference: (e: BlockInstance) => boolean;
  /** the figures shown as columns, chosen above ('pace', 'time', 'distance' or a metric's key) */
  columns: string[];
  titleOf: (runId: string) => string | null;
}) {
  const { view, blockKeys } = useMetrics();
  const metrics = useMemo(() => blockKeys.filter((k) => k !== 'speed'), [blockKeys]);
  const runs = useMemo(() => effortsByRun(efforts, metrics, valueOf), [efforts, metrics]);
  /** the runs opened, their efforts shown; null until one is opened or closed */
  const [opened, setOpened] = useState<Set<string> | null>(null);
  /** the runs' order: by a column clicked in the head, again for the other way ("sortowanie na headerze kolumn"); the newest first at first */
  const [sortBy, setSortBy] = useState<{ key: string; asc: boolean }>({ key: 'run', asc: false });
  if (!runs.length) return null;

  const pace = view('speed');
  const held = metrics.filter((m) => runs.some((x) => x.metrics[m]?.some((v) => v !== null)));
  const seconds = (d: number) => `${signed(d, (v) => number(Math.round(v)))} s`;
  const figures: Figure[] = [
    { key: 'pace', label: t('Pace (min/km)'), of: (x) => x.pace, mean: (x) => x.meanPace, fmt: pace.tick, diff: seconds, direction: 'lower', least: LEAST_CHANGE * pace.minSpan, drift: true },
    { key: 'time', label: t('Time'), of: (x) => x.durations, ...(totals ? { mean: (x: RunEfforts) => x.durations.reduce((a, b) => a + b, 0) } : {}), fmt: duration, diff: seconds, direction: 'neutral', least: 0 },
    { key: 'distance', label: t('Distance (km)'), of: (x) => x.distances, ...(totals ? { mean: (x: RunEfforts) => x.distances.reduce((a, b) => a + b, 0) } : {}), fmt: km, diff: (d) => `${signed(d, (v) => number(Math.round(v)))} m`, direction: 'neutral', least: 0 },
    ...held.map((m): Figure => {
      const v = view(m);
      // The unit in the head, not again in each change ("nachodzi na siebie").
      return { key: m, label: v.name, of: (x) => x.metrics[m], fmt: v.tick, diff: v.invert ? seconds : (d) => signed(d, v.tick), direction: v.direction, least: LEAST_CHANGE * v.minSpan, drift: true };
    }),
  ];
  const cell = (v: number | null | undefined, f: (x: number) => string) => (v === null || v === undefined ? '–' : f(v));
  // Better or worse only for a change told from the noise (lib/compare, clearDifference); else its size alone, uncoloured.
  // i18n-ignore: class names
  const verdict = (d: number, dir: Figure['direction'], clear: boolean) => (dir === 'neutral' || !clear ? '' : (d < 0) === (dir === 'lower') ? ' better' : ' worse');
  const meanOfRun = (f: Figure, x: RunEfforts) => (f.mean ? f.mean(x) : meanOf(f.of(x)));
  const dayOfRun = (x: RunEfforts) => new Date(x.runStart).getTime() / 86_400_000;
  /** How far two runs' means of a figure lie apart by chance, from all the runs' means about their trend. */
  const betweenRuns = (f: Figure) => {
    const points = runs.flatMap((x) => { const v = meanOfRun(f, x); return v === null ? [] : [{ day: dayOfRun(x), v }]; });
    return differenceNoise(points.map((p) => p.day), points.map((p) => p.v));
  };
  const change = (f: Figure, from: RunEfforts, to: RunEfforts) => {
    const a = meanOfRun(f, from);
    const b = meanOfRun(f, to);
    if (a === null || b === null) return <td key={f.key} className="num tnum">–</td>;
    const clear = f.direction !== 'neutral' && clearDifference(b - a, f.least, [betweenRuns(f)]);
    return <td key={f.key} className={`num tnum${verdict(b - a, f.direction, clear)}`}>{f.diff(b - a)}{a !== 0 && <div className="reps-sub">{signed((b / a - 1) * 100, (v) => number(v, 1))}%</div>}</td>;
  };
  const shown = figures.filter((f) => columns.includes(f.key));
  const first = runs[0];
  const last = runs[runs.length - 1];
  const previous = runs[runs.length - 2];
  const trends = runs.length >= 3 ? shown.map((f) => trendPerWeek(runs.map((x) => ({ at: x.runStart, value: meanOfRun(f, x) })))) : null;
  // Of 2 runs or fewer, every run open at first, else the one holding the part compared from; each opened by a click on its row.
  const refRun = runs.find((x) => x.efforts.some(isReference))?.runId;
  const shownOpen = opened ?? new Set(runs.length <= 2 ? runs.map((x) => x.runId) : refRun ? [refRun] : []);
  const valueFor = (key: string, x: RunEfforts): number | string | null => {
    if (key === 'run') return x.runStart;
    if (key === 'efforts') return x.efforts.length;
    const f = shown.find((y) => y.key === key);
    return f ? meanOfRun(f, x) : null;
  };
  const sorted = [...runs].sort((a, b) => {
    const [va, vb] = [valueFor(sortBy.key, a), valueFor(sortBy.key, b)];
    if (va === null || vb === null) return va === null ? (vb === null ? 0 : 1) : -1;
    const c = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
    return sortBy.asc ? c : -c;
  });
  const sortOn = (key: string) => setSortBy((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: key !== 'run' && key !== 'efforts' && shown.find((y) => y.key === key)?.direction === 'lower' }));
  // The widths of the columns ("popracuj nad szerokoscia kolumn", "kolumna bieg za szeroka"): the run a sixth, the efforts narrow, the figures sharing the rest alike.
  const widthOf = (key: string) => (key === 'run' ? '16%' : key === 'efforts' ? '7%' : `${77 / Math.max(1, shown.length)}%`);
  const head = (key: string, label: string, num = true) => {
    const on = sortBy.key === key;
    return (
      <th key={key} className={`${num ? 'num' : 'reps-label'} sortable`} style={{ width: widthOf(key) }} aria-sort={on ? (sortBy.asc ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="sort-head" onClick={() => sortOn(key)} title={t('Sort by {column}', { column: label })}>{label}<span className="sort-arrow" aria-hidden="true">{on ? (sortBy.asc ? '▲' : '▼') : ''}</span></button>
      </th>
    );
  };
  const toggle = (id: string) => { const next = new Set(shownOpen); if (next.has(id)) next.delete(id); else next.add(id); setOpened(next); };

  return (
    // Its own scroll, as tall as the window at most: on a long list the head stays on top, the first column on the left ("header zawsze bedzie widoczny?").
    <div className="reps-scroll">
      <table className="data reps-table" aria-label={t('Efforts by run')} style={{ minWidth: 170 + 70 + shown.length * 130 }}>
        <thead>
          <tr>
            {head('run', t('Run'), false)}
            {head('efforts', t('Efforts'))}
            {shown.map((f) => head(f.key, f.label))}
          </tr>
        </thead>
        <tbody>
          {previous && (
            <tr className="reps-summary">
              <td className="reps-label">{t('Change')}<div className="muted small reps-sub">{date(previous.runStart)} → {date(last.runStart)}</div></td>
              <td />
              {shown.map((f) => change(f, previous, last))}
            </tr>
          )}
          {runs.length >= 3 && (
            <tr className="reps-summary">
              <td className="reps-label">{t('Change')}<div className="muted small reps-sub">{date(first.runStart)} → {date(last.runStart)}</div></td>
              <td />
              {shown.map((f) => change(f, first, last))}
            </tr>
          )}
          {trends && (
            <tr className="reps-summary">
              <td className="reps-label">{t('Trend per week')}</td>
              <td />
              {shown.map((f, k) => { const w = trends[k]; return <td key={f.key} className={`num tnum${w ? verdict(w.perWeek, f.direction, w.clear) : ''}`}>{w ? f.diff(w.perWeek) : '–'}</td>; })}
            </tr>
          )}
          {sorted.flatMap((x) => {
            const open = shownOpen.has(x.runId);
            const n = x.efforts.length;
            const title = titleOf(x.runId);
            return [
              <tr key={x.runId} className="reps-run-row">
                <td className="reps-label">
                  <button type="button" className="reps-toggle" aria-expanded={open} onClick={() => toggle(x.runId)}>{open ? '▾' : '▸'} {date(x.runStart)}</button>
                  {title && <span className="muted small"> · {title}</span>}
                </td>
                <td className="num tnum">{n}</td>
                {shown.map((f) => {
                  const vs = f.of(x);
                  const a = vs[0] ?? null;
                  const b = vs[n - 1] ?? null;
                  // Not for runs added whole: their laps are of every length (a warm-up, reps, a cool-down).
                  const drift = !totals && f.drift && n > 1 && a !== null && b !== null ? b - a : null;
                  // The last against the first, past what the efforts lie apart by chance about their line (of 4 and more).
                  const ordered = vs.flatMap((v, r) => (v === null ? [] : [{ r, v }]));
                  const clearDrift = drift !== null && clearDifference(drift, f.least, [differenceNoise(ordered.map((p) => p.r), ordered.map((p) => p.v))]);
                  return (
                    <td key={f.key} className="num tnum">
                      <span className="strong">{cell(meanOfRun(f, x), f.fmt)}</span>
                      {drift !== null && <div className={`reps-drift${verdict(drift, f.direction, clearDrift)}`} title={t('The last effort against the first')}>{`1→${n}`} {f.diff(drift)}</div>}
                    </td>
                  );
                })}
              </tr>,
              ...(open ? x.efforts.map((e, r) => (
                <tr key={e.id} className={`reps-rep-row${isReference(e) ? ' reference' : ''}`}>
                  <td className="reps-label">
                    <Link className="muted" href={`/run?id=${e.runId}&from=${e.start}&to=${e.end}`} title={t('Open run →')}>#{r + 1}</Link>
                    {isReference(e) && <span className="chip ref-chip">{t('your selection')}</span>}
                  </td>
                  <td />
                  {shown.map((f) => <td key={f.key} className="num tnum">{cell(f.of(x)[r], f.fmt)}</td>)}
                </tr>
              )) : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

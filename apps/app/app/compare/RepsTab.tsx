'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMetrics } from '@/components';
import { SHOWN_WORDS, patternName } from '@/lib/blocks';
import { changeOf, compareReps, runsOfLayout, workoutOf, type Change } from '@/lib/compare';
import { date, duration, km } from '@/lib/format';
import { number, t, tn } from '@/lib/i18n';
import type { IndexedRun, RunFile } from '@/lib/kernel';

const DAY = 86_400_000;

/** A signed number, with the minus sign of print: +340, −11, ±0. */
const signed = (v: number, f: (x: number) => string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${f(Math.abs(v))}`;
/** A change of the means in percent, one decimal. */
const percent = (c: Change | null) => (c?.share == null ? '' : `${signed(c.share * 100, (x) => number(x, 1))}%`);
/** A time of work: whole minutes as "30 min", else as a clock. */
const workTime = (s: number) => (Math.abs(s - Math.round(s / 60) * 60) <= 2 ? `${number(Math.round(s / 60))} min` : duration(s));
/** The time between two runs: days up to two weeks, then weeks. */
function gapOf(from: string, to: string): string {
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY);
  return days < 14 ? tn(days, '{n} day', '{n} days') : tn(Math.round(days / 7), '{n} week', '{n} weeks');
}

interface Row {
  key: string;
  label: string;
  a: string;
  b: string;
  change: string;
  verdict: Change['verdict'];
}

/**
 * The Rep by rep tab of Analysis (requirements "Workouts compared rep by rep" and "Previous workout
 * of a layout"): the two newest runs of the items side by side, the older first, their effort laps
 * paired; with one run, the previous run of its layout is found and added. Loaded when the tab opens.
 */
export function RepsTab({ runIds, rows, files, read, onAdd }: {
  /** the runs among the items */
  runIds: string[];
  /** every run of the folder, from its index */
  rows: IndexedRun[];
  /** the run files read for the items */
  files: Map<string, RunFile>;
  read: (id: string) => Promise<RunFile | null>;
  /** adds a run to the items */
  onAdd: (id: string) => void;
}) {
  const { view, blockKeys } = useMetrics();
  // The two newest runs of the items, the older first.
  const chosen = useMemo(() => runIds.flatMap((id) => rows.filter((r) => r.id === id)).sort((p, q) => q.startTime.localeCompare(p.startTime)).slice(0, 2).reverse(), [runIds, rows]);
  const loaded = chosen.map((r) => files.get(r.id) ?? null);
  const [older, newer] = loaded.length === 2 ? loaded : [null, loaded[0] ?? null];
  const only = chosen.length === 1 ? newer : null;
  const reader = useRef(read);
  const adder = useRef(onAdd);
  useEffect(() => { reader.current = read; adder.current = onAdd; });

  // One run: its previous run of the layout, added to the items when found.
  const [none, setNone] = useState<string | null>(null);
  const onlyEfforts = only ? workoutOf(only).efforts.length : 0;
  useEffect(() => {
    if (!only || !onlyEfforts) return;
    let live = true;
    runsOfLayout(rows, only, (id) => reader.current(id), { first: true }).then((found) => {
      if (!live) return;
      if (found[0]) adder.current(found[0].id); else setNone(only.id);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [only, onlyEfforts, rows]);

  const metrics = useMemo(() => blockKeys.filter((k) => k !== 'speed'), [blockKeys]);
  const cmp = useMemo(() => (older && newer ? compareReps(older, newer, metrics) : null), [older, newer, metrics]);

  // The runs of the layout between the two: whether the older is the previous one.
  const [between, setBetween] = useState<{ pair: string; n: number } | null>(null);
  const pair = cmp ? `${cmp.a.run.id}|${cmp.b.run.id}` : '';
  useEffect(() => {
    if (!cmp?.sameLayout) return;
    let live = true;
    runsOfLayout(rows, cmp.b.run, (id) => reader.current(id), { since: cmp.a.run.startTime })
      .then((found) => live && setBetween({ pair, n: found.length }))
      .catch(() => undefined);
    return () => { live = false; };
    // Counted once for each pair.
  }, [pair, rows]);

  if (!chosen.length) return <div className="card empty">{t('Add a run whose laps make a workout (as 3 × 10 min): this tab compares it with the previous run of its layout, rep by rep, or with another run you add.')}</div>;
  if (chosen.length === 1) {
    if (!only) return <div className="card empty muted" role="status">{t('Reading the runs…')}</div>;
    const name = patternName(workoutOf(only).pattern, SHOWN_WORDS);
    if (!onlyEfforts) return <div className="card empty">{t('This run has no effort laps to compare: its laps make no workout.')}</div>;
    return <div className="card empty" role="status">{none === only.id ? t('No earlier run has the layout of this one ({layout}). Add another run to compare it with.', { layout: name }) : t('Looking for the previous {layout}…', { layout: name })}</div>;
  }
  if (!older || !newer) return <div className="card empty muted" role="status">{t('Reading the runs…')}</div>;
  if (!cmp) return <div className="card empty">{t('One of the two runs has no effort laps to compare.')}</div>;

  const { a, b, reps } = cmp;
  const pace = view('speed');
  const layout = patternName(b.workout.pattern, SHOWN_WORDS);
  const gap = gapOf(a.run.startTime, b.run.startTime);
  const count = between?.pair === pair ? between.n : null;
  const lead = !cmp.sameLayout
    ? t('Compared with the run of {date}, {gap} earlier. Their layouts of laps differ ({a} and {b}): their efforts are compared in order, {n} of each.', { date: date(a.run.startTime), gap, a: patternName(a.workout.pattern, SHOWN_WORDS), b: layout, n: reps })
    : count === 0 ? `${t('Compared with the previous {layout}, of {date}, {gap} earlier.', { layout, date: date(a.run.startTime), gap })} ${t('No other run of this layout between them.')}`
    : `${t('Compared with the {layout} of {date}, {gap} earlier.', { layout, date: date(a.run.startTime), gap })} ${count === null ? t('Looking for other runs of this layout between them…') : tn(count, '{n} other run of this layout between them.', '{n} other runs of this layout between them.')}`;

  const list = (vs: (number | null)[], f: (v: number) => string) => vs.map((v) => (v === null ? '–' : f(v))).join(' / ');
  const range = (c: Change, f: (v: number) => string) => (f(c.min) === f(c.max) ? f(c.min) : `${f(c.min)} … ${f(c.max)}`);
  const out: Row[] = [];
  const reps123 = Array.from({ length: reps }, (_, i) => i + 1).join(' / ');
  const paceChange = changeOf(a.pace, b.pace, 'lower');
  out.push({ key: 'pace', label: t('Pace, rep {reps} (min/km)', { reps: reps123 }), a: list(a.pace, pace.tick), b: list(b.pace, pace.tick), change: paceChange ? t('about {change} s/km', { change: signed(Math.round(paceChange.mean), (x) => number(x)) }) : '', verdict: paceChange?.verdict ?? null });
  const meanChange = changeOf([a.meanPace], [b.meanPace], 'lower');
  out.push({ key: 'mean', label: t('Mean pace of the reps (min/km)'), a: a.meanPace === null ? '–' : pace.tick(a.meanPace), b: b.meanPace === null ? '–' : pace.tick(b.meanPace), change: percent(meanChange), verdict: meanChange?.verdict ?? null });
  // The work: its distance when both took one time (reps set by time), its time when both ran one distance.
  const sameTime = Math.abs(a.work.duration - b.work.duration) <= 0.02 * a.work.duration;
  const sameDistance = Math.abs(a.work.distance - b.work.distance) <= 0.02 * a.work.distance;
  if (sameTime || !sameDistance) {
    const c = changeOf([a.work.distance], [b.work.distance], sameTime ? 'higher' : 'neutral');
    out.push({ key: 'distance', label: sameTime ? t('Distance in {time} of work (km)', { time: workTime(a.work.duration) }) : t('Distance of the reps (km)'), a: km(a.work.distance), b: km(b.work.distance), change: `${signed(Math.round(b.work.distance - a.work.distance), (x) => number(x))} m`, verdict: c?.verdict ?? null });
  }
  if (!sameTime) {
    const c = changeOf([a.work.duration], [b.work.duration], sameDistance ? 'lower' : 'neutral');
    out.push({ key: 'time', label: sameDistance ? t('Time of {km} km of work', { km: km(a.work.distance) }) : t('Time of the reps'), a: duration(a.work.duration), b: duration(b.work.duration), change: `${signed(Math.round(b.work.duration - a.work.duration), (x) => number(x))} s`, verdict: c?.verdict ?? null });
  }
  for (const m of cmp.metrics) {
    const v = view(m);
    const c = changeOf(a.metrics[m], b.metrics[m], v.direction);
    const diff = (d: number) => (v.invert ? `${signed(Math.round(d), (x) => number(x))} s/km` : signed(d, (x) => v.tick(x)));
    out.push({ key: m, label: v.name, a: list(a.metrics[m], v.tick), b: list(b.metrics[m], v.tick), change: c ? `${range(c, diff)}${c.share !== null && !v.invert ? ` (${percent(c)})` : ''}` : '', verdict: c?.verdict ?? null });
  }
  if (a.recoveries.pace.length && b.recoveries.pace.length) {
    const spread = (ps: number[]) => (ps.length > 1 ? `${pace.tick(Math.min(...ps))}–${pace.tick(Math.max(...ps))}` : pace.tick(ps[0]));
    const mean = (ps: number[]) => ps.reduce((s, x) => s + x, 0) / ps.length;
    const d = mean(b.recoveries.pace) - mean(a.recoveries.pace);
    const word = d < -1 ? t('more active') : d > 1 ? t('easier') : t('alike');
    out.push({ key: 'recoveries', label: a.recoveries.duration !== null ? t('Recoveries, {time} each (min/km)', { time: workTime(a.recoveries.duration) }) : t('Recoveries (min/km)'), a: spread(a.recoveries.pace), b: spread(b.recoveries.pace), change: `${word} (${signed(Math.round(d), (x) => number(x))} s/km)`, verdict: null });
  }

  return (
    <div className="card reps-card">
      <p className="reps-lead">{lead}</p>
      {chosen.length < runIds.length && <p className="muted small">{t('The two newest runs of the items are compared.')}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className="data reps-table" aria-label={t('Rep by rep')}>
          <thead><tr><th>{t('Metric')}</th><th className="num">{date(a.run.startTime)}</th><th className="num">{date(b.run.startTime)}</th><th className="num">{t('Change')}</th></tr></thead>
          <tbody>
            {out.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num tnum">{r.a}</td>
                <td className="num tnum strong">{r.b}</td>
                <td className={`num tnum${r.verdict ? ` ${r.verdict}` : ''}`} title={r.verdict === 'better' ? t('Better in every rep') : r.verdict === 'worse' ? t('Worse in every rep') : undefined}>{r.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="chart-note">{t('Effort laps: the set laps faster than the run’s average pace, paired in order. A change is green or amber when every rep moved the same way, better or worse by the metric’s direction.')}</p>
    </div>
  );
}

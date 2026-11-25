'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { METRIC_VIEW } from '@/components';
import { CS_RANGE, WHOLE_AXIS } from '@/lib/curve';
import { dateText, msg, number, t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import {
  MARKER_DAYS, PATTERN_WEEKS, WHATIF_MAX_PERCENT, WHATIF_WEEKS, curveWhatIf, effortsParam, loadWhatIf, parseClock, parseEfforts, parseWeeks, weeksParam,
  type CurveState, type LoadSummary, type PerformanceNow, type WhatIfEffort,
} from '@/lib/load';
import { duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import type { CurveModel, PerformanceSettings } from '@/lib/settings';
import { CurveChart } from '../compare/CurveChart';
import { CurveModelNote, drawnCurve, type DrawnCurve } from './curveModel';
import { FormTab } from './FormTab';

/**
 * What if (the runner's request of 25 Nov 2026: "co gdybym mial takie a nie inne obciazenia; jak by
 * krzywa mocy wygladala gdybym 20 min przebiegl 3 minuty szybciej"; "podoba mi sie what if na ekranie
 * performance"): the models of Capacity and Load fed with an effort or weeks of load that did not
 * happen, beside what they say now. The scenario lives in the link (effort=…, weeks=…); nothing of it
 * is written to the folder.
 */

/** Sets one parameter of the link, keeping the others; empty takes it out. */
function useParam(key: string): [string | null, (v: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  return [params.get(key), (v: string) => {
    const q = new URLSearchParams(params.toString());
    if (v) q.set(key, v); else q.delete(key);
    router.replace(`${path}?${q.toString()}`, { scroll: false });
  }];
}

const RACES: [number, string][] = [[5000, '5 km'], [10000, '10 km'], [21097.5, msg('half')], [42195, msg('marathon')]];
const paceOf = (secondsPerKm: number) => fmtPace(1000 / secondsPerKm);
/** A change in words with its arrow: ↑ better, ↓ worse. */
const change = (now: number | null, then: number | null, fmt: (v: number) => string, lowerBetter = false) => {
  if (now === null || then === null) return '';
  const d = then - now;
  if (Math.abs(d) < 1e-6) return t('no change');
  return `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${(lowerBetter ? d < 0 : d > 0) ? ' ↑' : ' ↓'}`;
};

/** A length of the curve in words: 30 s, 20 min. */
const lengthOf = (d: number) => (d < 60 ? `${number(d)} s` : `${number(d / 60)} min`);

/** One effort of the scenario: its time, and its pace or distance (the other follows). */
function EffortRow({ effort, best, index, onChange, onRemove }: { effort: WhatIfEffort; /** the best of the longest length of the curve within it */ best: { length: number; speed: number | null } | null; index: number; onChange: (e: WhatIfEffort) => void; onRemove: (() => void) | null }) {
  const [time, setTime] = useState(fmtDuration(effort.seconds));
  const [paceText, setPaceText] = useState(fmtPace(effort.metres / effort.seconds));
  const [dist, setDist] = useState(number(effort.metres / 1000, 2));
  /** which of pace and distance stays when the time changes: the one written last */
  const [keep, setKeep] = useState<'pace' | 'distance'>('pace');
  const name = t('Effort {n}', { n: index + 1 });
  const commit = (seconds: number | null, metres: number | null) => { if (seconds && metres && seconds > 0 && metres > 0) onChange({ seconds, metres }); };
  /** The metres of `seconds` at a pace written m:ss per km (parseClock reads it as seconds per km). */
  const fromPace = (seconds: number | null, p: string) => { const perKm = parseClock(p); return seconds && perKm ? (seconds / perKm) * 1000 : null; };
  const onTime = (v: string) => {
    setTime(v);
    const s = parseClock(v);
    if (!s) return;
    if (keep === 'pace') { const m = fromPace(s, paceText); if (m) { setDist(number(m / 1000, 2)); commit(s, m); } }
    else { const m = Number(dist.replace(',', '.')) * 1000; if (m > 0) { setPaceText(fmtPace(m / s)); commit(s, m); } }
  };
  const onPace = (v: string) => {
    setPaceText(v); setKeep('pace');
    const s = parseClock(time);
    const m = fromPace(s, v);
    if (s && m) { setDist(number(m / 1000, 2)); commit(s, m); }
  };
  const onDist = (v: string) => {
    setDist(v); setKeep('distance');
    const s = parseClock(time);
    const m = Number(v.replace(',', '.')) * 1000;
    if (s && m > 0) { setPaceText(fmtPace(m / s)); commit(s, m); }
  };
  return (
    <div className="whatif-effort" role="group" aria-label={name}>
      <label><span className="muted small">{t('Time')}</span><input aria-label={t('{name}: time', { name })} value={time} onChange={(e) => onTime(e.target.value)} inputMode="numeric" /></label>
      <label><span className="muted small">{t('Pace')}</span><span className="with-unit"><input aria-label={t('{name}: pace', { name })} value={paceText} onChange={(e) => onPace(e.target.value)} /><span className="unit">/km</span></span></label>
      <label><span className="muted small">{t('Distance')}</span><span className="with-unit"><input aria-label={t('{name}: distance', { name })} value={dist} onChange={(e) => onDist(e.target.value)} inputMode="decimal" /><span className="unit">km</span></span></label>
      <span className="muted small whatif-best">{best === null ? t('under 30 seconds: no model uses it') : best.speed === null ? t('no best of {length} in the last {days} days', { length: lengthOf(best.length), days: MARKER_DAYS }) : t('your best of {length}: {pace} /km', { length: lengthOf(best.length), pace: fmtPace(best.speed) })}</span>
      {onRemove && <button type="button" className="btn sm icon" aria-label={t('Remove {name}', { name })} onClick={onRemove}>×</button>}
    </div>
  );
}

/**
 * An effort that did not happen (the runner's example: "gdybym 20 min przebiegl … szybciej"): the
 * pace curve of the last 90 days with it, critical speed and D′, the predicted times and VDOT, each
 * now and with the scenario. The first effort offered is 20 minutes at the best pace of that length.
 */
export function CurveWhatIfView({ now, runs, summaries, model }: { now: PerformanceNow; runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; /** the curve model chosen in Settings */ model: CurveModel }) {
  const [param, setParam] = useParam('effort');
  // Every length of the curve, 30 s to 2 h: the whole curve is drawn from them.
  const bests = useMemo(() => now.curve.flatMap((e) => (e ? [{ duration: e.duration, speed: e.value }] : [])), [now]);
  const ever = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of runs) for (const b of summaries[r.id]?.bests ?? []) if (b.speed !== null && b.speed > (m.get(b.duration) ?? 0)) m.set(b.duration, b.speed);
    return m;
  }, [runs, summaries]);
  const fallback = useMemo((): WhatIfEffort[] => {
    const b20 = bests.find((b) => b.duration === 1200) ?? bests[bests.length - 1];
    return b20 ? [{ seconds: b20.duration, metres: b20.speed * b20.duration }] : [{ seconds: 1200, metres: 4000 }];
  }, [bests]);
  const fromLink = parseEfforts(param);
  const efforts = fromLink.length ? fromLink : fallback;
  // The rows keep their own text while it is typed; a key per row and per reset of the scenario.
  const [round, setRound] = useState(0);
  const set = (list: WhatIfEffort[]) => setParam(effortsParam(list));
  const r = useMemo(() => curveWhatIf(bests, efforts, ever, model), [bests, efforts, ever, model]);
  const bestAt = (seconds: number) => bests.find((b) => b.duration === seconds)?.speed ?? null;

  if (bests.filter((b) => b.duration >= CS_RANGE[0] && b.duration <= CS_RANGE[1]).length < 3) return <div className="card empty">{t('Nothing yet: it needs, within {days} days, bests of at least three lengths between 2 and 20 minutes.', { days: MARKER_DAYS })}</div>;

  const drawn = (s: CurveState) => drawnCurve(s.bests.map((b) => ({ duration: b.duration, value: 1000 / b.speed })), 'speed', model);
  const [drawnNow, drawnThen] = [drawn(r.now), drawn(r.then)];
  const line = (key: string, label: string, color: string, shape: 'circle' | 'diamond', s: CurveState, d: DrawnCurve) => ({
    key, label, color, shape,
    points: s.bests.map((b) => ({ duration: b.duration, value: 1000 / b.speed, note: label })),
    estimate: d.estimate, extrapolate: d.extrapolate, estimateAt: d.at,
  });
  const view = METRIC_VIEW.find((x) => x.key === 'speed')!;
  const predicted = (s: CurveState, d: number) => s.predictions.find((p) => p.distance === d)?.seconds ?? null;
  const cs = (s: CurveState) => s.estimate?.critical?.rate ?? null;
  const dp = (s: CurveState) => s.estimate?.critical?.reserve ?? null;
  const rows: [string, string, string, string][] = [
    [t('Critical speed'), cs(r.now) ? `${fmtPace(cs(r.now)!)} /km` : '–', cs(r.then) ? `${fmtPace(cs(r.then)!)} /km` : '–', change(cs(r.now) && 1000 / cs(r.now)!, cs(r.then) && 1000 / cs(r.then)!, (v) => `${number(Math.round(v))} s/km`, true)],
    ['D′', dp(r.now) !== null ? `${number(Math.round(dp(r.now)!))} m` : '–', dp(r.then) !== null ? `${number(Math.round(dp(r.then)!))} m` : '–', change(dp(r.now), dp(r.then), (v) => `${number(Math.round(v))} m`)],
    ...RACES.map(([d, name]): [string, string, string, string] => {
      const [a, b] = [predicted(r.now, d), predicted(r.then, d)];
      return [t(name), a === null ? '–' : fmtDuration(Math.round(a)), b === null ? '–' : fmtDuration(Math.round(b)), change(a, b, (v) => fmtDuration(Math.round(v)), true)];
    }),
    ['VDOT', r.now.vdot === null ? '–' : number(r.now.vdot, 1), r.then.vdot === null ? '–' : number(r.then.vdot, 1), change(r.now.vdot, r.then.vdot, (v) => number(v, 1))],
  ];
  const hints: string[] = [];
  const notes = r.efforts.flatMap((e, i) => {
    const name = t('Effort {n}', { n: i + 1 });
    const out: string[] = [];
    if (e.counts === null) { out.push(t('{name} is under 30 seconds: no model uses it.', { name })); return out; }
    const length = e.counts < 60 ? `${number(e.counts)} s` : `${number(e.counts / 60)} min`;
    // A length between those of the curve counts as the one under it, as the import would count it.
    if (e.counts !== e.effort.seconds) hints.push(t('{name} counts as your best of {length} and of every shorter length: the lengths the models are fitted to.', { name, length }));
    // The effort offered first is the best itself: a hint to change it, not a warning.
    const best = bestAt(e.counts);
    if (!e.raises && best !== null && e.counts === e.effort.seconds && Math.abs(e.speed / best - 1) < 1e-3) hints.push(t('{name} is your best of that length: make it faster to see what changes.', { name }));
    else if (!e.raises) out.push(t('{name} is no faster than your bests it counts as: the curve keeps them.', { name }));
    if (e.beyond) out.push(t('{name} is faster than any best of {length} in all your runs: the models are stretched past what you have shown.', { name, length }));
    if (e.short) out.push(t('{name} counts only for lengths under 3 minutes: the predicted times leave it out.', { name }));
    return out;
  });

  return (
    <>
      <div className="card chart">
        <h3 className="chart-title">{t('The effort')} <span className="muted">· {t('a time and a pace or distance; the curve takes it as a best of that length and of every shorter one')}</span></h3>
        <div className="whatif-efforts" key={round}>
          {efforts.map((e, i) => (
            <EffortRow key={i} effort={e} index={i} best={(() => { const c = r.efforts[i]?.counts ?? null; return c === null ? null : { length: c, speed: bestAt(c) }; })()}
              onChange={(x) => set(efforts.map((y, k) => (k === i ? x : y)))}
              onRemove={efforts.length > 1 ? () => { set(efforts.filter((_, k) => k !== i)); setRound((n) => n + 1); } : null} />
          ))}
        </div>
        <div className="whatif-actions">
          <button type="button" className="btn sm" onClick={() => { const last = efforts[efforts.length - 1]; set([...efforts, { seconds: 600, metres: Math.round((last.metres / last.seconds) * 1.05 * 600) }]); setRound((n) => n + 1); }}>{t('+ Add an effort')}</button>
          {fromLink.length > 0 && <button type="button" className="btn sm" onClick={() => { setParam(''); setRound((n) => n + 1); }}>{t('Start again')}</button>}
        </div>
      </div>
      <div className="card chart" style={{ marginTop: 12 }}>
        <h3 className="chart-title">{t('Your pace curve')} <span className="muted">· {t('now, from the bests of the last {days} days, and with the effort', { days: MARKER_DAYS })}</span></h3>
        <CurveChart label={t('Pace curve now and with the effort')} lines={[line('now', t('Now'), 'var(--series-1)', 'circle', r.now, drawnNow), line('then', t('What if'), 'var(--series-2)', 'diamond', r.then, drawnThen)]}
          durations={WHOLE_AXIS} format={(v) => `${paceOf(v)} /km`} tick={view.tick} minSpan={view.minSpan} height={260}
          gap={(m, e) => { const d = Math.round(m - e); return d === 0 ? t('on the curve') : d > 0 ? t('{v} s/km slower than the curve', { v: number(d) }) : t('{v} s/km faster than the curve', { v: number(-d) }); }} />
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table className="data whatif-table" aria-label={t('What the models say now and with the effort')}>
            <thead><tr><th>{t('Model')}</th><th className="num">{t('Now')}</th><th className="num">{t('What if')}</th><th className="num">{t('Change')}</th></tr></thead>
            <tbody>{rows.map(([name, a, b, c]) => <tr key={name}><td className="strong">{name}</td><td className="num tnum">{a}</td><td className="num tnum strong">{b}</td><td className="num tnum muted">{c}</td></tr>)}</tbody>
          </table>
        </div>
        {hints.map((n) => <p key={n} className="chart-note" role="note">{n}</p>)}
        {notes.map((n) => <p key={n} className="chart-note warn-text" role="note">{n}</p>)}
        <CurveModelNote curve={drawnThen} metric="speed" />
        <p className="chart-note">{t('The models are those of Capacity, fed with the effort: what they would say, not what you will run. Their trust is the one under “Why?”.')}</p>
      </div>
    </>
  );
}

/** Ready scenarios of weeks: the same, a build with a recovery week, a taper. */
const PRESETS: [string, number[]][] = [[msg('As now'), [100, 100, 100, 100]], [msg('Build 3 + 1'), [110, 120, 130, 60]], [msg('Taper'), [80, 60, 40]], [msg('A week off'), [0]]];

/**
 * Weeks of load that did not happen (the runner's example: "co gdybym mial takie a nie inne
 * obciazenia"): each week from tomorrow a share of the last four, spread over the days as they were,
 * and fitness, fatigue, form and the acute:chronic ratio over them, in the chart of Form.
 */
export function LoadWhatIfView({ runs, performance, unit, today }: { runs: RunsIndex['runs']; performance: PerformanceSettings; unit: string; today: string }) {
  const [param, setParam] = useParam('weeks');
  const weeks = param === null ? PRESETS[1][1] : parseWeeks(param);
  const withLoad = useMemo(() => runs.filter((r) => typeof r.load === 'number').map((r) => ({ startTime: r.startTime, load: r.load as number })), [runs]);
  const r = useMemo(() => loadWhatIf(withLoad, performance, today, weeks), [withLoad, performance, today, weeks.join(',')]);
  const whatIf = useMemo(() => ({ planned: r.planned, from: r.from, until: r.until }), [r]);
  const [drafts, setDrafts] = useState<string[]>(weeks.map(String));
  useEffect(() => { setDrafts(weeks.map(String)); }, [param]);
  const set = (list: number[]) => setParam(weeksParam(list));
  const day = (d: string) => dateText(`${d}T12:00:00`, { day: 'numeric', month: 'short' });
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${number(Math.abs(Math.round(v)))}`;

  if (!withLoad.length) return <div className="card empty">{t('No run has a load yet: import runs first.')}</div>;
  return (
    <>
      <div className="card chart">
        <h3 className="chart-title">{t('The weeks')} <span className="muted">· {t('each a share of your last {n} weeks ({load} {unit} a week), spread over the days as you ran them', { n: PATTERN_WEEKS, load: number(Math.round(r.recentWeek)), unit })}</span></h3>
        <div className="whatif-actions" role="group" aria-label={t('Ready scenarios')}>
          {PRESETS.map(([name, list]) => <button key={name} type="button" className={`btn sm${weeksParam(list) === weeksParam(weeks) ? ' on' : ''}`} aria-pressed={weeksParam(list) === weeksParam(weeks)} onClick={() => set(list)}>{t(name)}</button>)}
        </div>
        <div className="table-scroll">
          <table className="data whatif-table" aria-label={t('The weeks of the scenario')}>
            <thead><tr><th>{t('Week')}</th><th className="num">{t('Share')}</th><th className="num">{t('Load')}</th><th className="num">{t('Fitness')}</th><th className="num">{t('Form after it')}</th><th className="num">{t('Acute:chronic')}</th><th className="num">{t('Ramp')}</th><th /></tr></thead>
            <tbody>
              <tr className="muted"><td>{t('Today')}</td><td /><td /><td className="num tnum">{r.today ? number(Math.round(r.today.fitness)) : '–'}</td><td className="num tnum">{r.today ? signed(r.today.fitness - r.today.fatigue) : '–'}</td><td className="num tnum">{r.today?.acwr == null ? '–' : number(r.today.acwr, 2)}</td><td /><td /></tr>
              {r.weeks.map((w, i) => (
                <tr key={w.from} data-beyond={w.beyond || undefined}>
                  <td className="strong">{day(w.from)} – {day(w.to)}</td>
                  <td className="num"><span className="with-unit"><input className="whatif-percent" type="number" min={0} max={WHATIF_MAX_PERCENT} step={5} aria-label={t('Week of {day}: share of your recent weeks', { day: day(w.from) })} value={drafts[i] ?? ''}
                    onChange={(e) => { const v = e.target.value; setDrafts((d) => d.map((x, k) => (k === i ? v : x))); const n = Number(v); if (v !== '' && n >= 0 && n <= WHATIF_MAX_PERCENT) set(weeks.map((x, k) => (k === i ? n : x))); }} /><span className="unit">%</span></span></td>
                  <td className={`num tnum${w.beyond ? ' warn-text' : ''}`} title={w.beyond ? t('Heavier than any week you have run ({load} {unit})', { load: number(Math.round(r.heaviest)), unit }) : undefined}>{number(w.load)} <span className="unit">{unit}</span>{w.beyond ? ' !' : ''}</td>
                  <td className="num tnum">{number(Math.round(w.fitness))}</td>
                  <td className="num tnum strong">{signed(w.form)}</td>
                  <td className="num tnum">{w.acwr === null ? '–' : number(w.acwr, 2)}</td>
                  <td className="num tnum">{signed(w.ramp)}</td>
                  <td>{weeks.length > 1 && <button type="button" className="btn sm icon" aria-label={t('Remove the week of {day}', { day: day(w.from) })} onClick={() => set(weeks.filter((_, k) => k !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="whatif-actions">
          {weeks.length < WHATIF_WEEKS && <button type="button" className="btn sm" onClick={() => set([...weeks, weeks[weeks.length - 1] ?? 100])}>{t('+ Add a week')}</button>}
        </div>
        {r.weeks.some((w) => w.beyond) && <p className="chart-note warn-text" role="note">{t('A week marked ! is heavier than any week you have run ({load} {unit}): the model has never seen how you respond to it.', { load: number(Math.round(r.heaviest)), unit })}</p>}
        <p className="chart-note">{t('Form is fitness less fatigue, the morning after the week; the acute:chronic ratio is the highest of the week, and the ramp the change of fitness over it. What the model would say, not advice: its trust is the one under “Why?”.')}</p>
      </div>
      <div style={{ marginTop: 12 }}>
        <FormTab runs={runs} whatIf={whatIf} />
      </div>
    </>
  );
}

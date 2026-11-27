'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { dateText, msg, number, paceUnit, t, tn, toPace } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { MARKER_DAYS, pairEfforts, type BestEffort, type Effort, type PerformanceNow } from '@/lib/load';
import { WHOLE_AXIS, type CurveMetric } from '@/lib/curve';
import { date, pace as fmtPace } from '@/lib/format';
import { CellBar, knownMetricViews } from '@/components';
import { CurveChart } from '../compare/CurveChart';
import { runHref } from '../compare/links';
import { CurveModelNote, drawnCurve } from './curveModel';
import type { CurveModel } from '@/lib/settings';

const EFFORT_LABEL: Record<Effort, string> = { allout: msg('all-out'), hard: msg('hard, not all-out'), easy: msg('not all-out'), unknown: msg('no heart rate') };
/** A day short: without the year when it is this year's. */
const day = (iso: string) => {
  const d = new Date(iso);
  return dateText(d, { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
};

/**
 * The best efforts the curve models are fitted to (requirement "Model assumptions checked"): for
 * each length the best pace and the best power of the last 90 days in one row (the runner's "tak"
 * to one table: "czy to nie to samo"), how hard it was and the run it comes from (the link opens the
 * run with the stretch selected). Where pace and power are one stretch the row says it once; where
 * they come from two efforts (uphill the power is high and the pace slow) it says each. What
 * "all-out" rests on is behind the view's "Why?".
 */
export function EffortsTab({ now, runs, model }: { now: PerformanceNow; runs: RunsIndex['runs']; /** the curve model chosen in Settings */ model: CurveModel }) {
  const title = new Map(runs.map((r) => [r.id, r.title ?? null]));
  const withPower = now.powerEfforts.some((e) => e !== null);
  const rows = pairEfforts(now.efforts, withPower ? now.powerEfforts : []);
  const split = rows.filter((r) => r.pace && r.power && !r.same).length;
  const [metric, setMetric] = useState<CurveMetric>('speed');
  const [focus, setFocus] = useState<number | null>(null);

  const hard = (e: BestEffort) => <span className="trust"><i className={`trust-dot ${e.effort}`} aria-hidden="true" />{t(EFFORT_LABEL[e.effort])}</span>;
  const ofMax = (e: BestEffort) => (e.hr !== null && now.maxHr ? <><CellBar share={e.hr / now.maxHr} />{number(Math.round((e.hr / now.maxHr) * 100))} %</> : '–');
  // Narrow (a third of the Dashboard), the effort's column gives way to a dot by its run.
  const run = (e: BestEffort) => (
    <span className="effort-run">
      <i className={`trust-dot ${e.effort} narrow-only`} role="img" aria-label={t(EFFORT_LABEL[e.effort])} />
      <Link href={runHref(e.runId, e.at?.[0], e.at?.[1])} title={title.get(e.runId) ?? undefined}>{day(e.startTime)}<span className="run-title">{title.get(e.runId) ? ` · ${title.get(e.runId)}` : ''}</span><span className="unit"> →</span></Link>
    </span>
  );
  /** A detail of the row: once for one effort, else for the pace and for the power, each named. */
  const both = (a: BestEffort | null, b: BestEffort | null, same: boolean, show: (e: BestEffort) => ReactNode) => {
    if (same || !b) return a ? show(a) : '–';
    if (!a) return show(b);
    return (
      <span className="effort-split">
        <span><small className="muted">{t('pace')}</small> {show(a)}</span>
        <span><small className="muted">{t('power')}</small> {show(b)}</span>
      </span>
    );
  };

  return (
    <>
      <Curve now={now} runs={runs} metric={withPower ? metric : 'speed'} onMetric={withPower ? setMetric : null} focus={focus} model={model} />
    <div className="card chart efforts-card" style={{ marginTop: 12 }}>
      <h3 className="chart-title">{t('Best efforts of each length')}{withPower && <span className="muted"> · {t('pace and power')}</span>}</h3>
      <div className="table-scroll">
        <table className="data efforts-table" aria-label={t('Best efforts')}>
          <thead>
            <tr><th>{t('Length')}</th><th className="num"><span className="wide-text">{t('Best pace')}</span><span className="narrow-text">{t('Pace {unit}', { unit: paceUnit() })}</span></th>{withPower && <th className="num"><span className="wide-text">{t('Best power')}</span><span className="narrow-text">{t('Power W')}</span></th>}<th className="col-effort">{t('Effort')}</th><th className="num col-hr">{t('Of max heart rate')}</th><th>{t('Run')}</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.duration} data-effort={(r.pace ?? r.power)!.effort} data-same={withPower ? String(r.same) : undefined} onMouseEnter={() => setFocus(r.duration)} onMouseLeave={() => setFocus(null)}>
                <td className="strong">{number(r.duration / 60)} min</td>
                <td className="num tnum strong">{r.pace ? <>{fmtPace(r.pace.value)}<span className="unit"> {paceUnit()}</span></> : '–'}</td>
                {withPower && <td className="num tnum strong">{r.power ? <>{number(Math.round(r.power.value))}<span className="unit"> W</span></> : '–'}</td>}
                <td className="col-effort">{both(r.pace, r.power, r.same, hard)}</td>
                <td className="num tnum muted col-hr">{both(r.pace, r.power, r.same, ofMax)}</td>
                <td>{both(r.pace, r.power, r.same, run)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={withPower ? 6 : 5} className="muted small">{t('No best in the last {days} days.', { days: MARKER_DAYS })}</td></tr>}
          </tbody>
        </table>
      </div>
      {split > 0 && (
        <p className="chart-note">
          {tn(split, "One length has the best pace and the best power from different efforts: uphill, into the wind or on soft ground the power is high and the pace slow, so each is shown with its own run, the pace's first.", "{n} lengths have the best pace and the best power from different efforts: uphill, into the wind or on soft ground the power is high and the pace slow, so each is shown with its own run, the pace's first.")}
        </p>
      )}
    </div>
    </>
  );
}

/**
 * Your curve now (the runner's "tak" to it: "czy krzywa mocy i predkosci powinna byc w performance
 * czy w analysis"; Compare keeps the curves side by side): the bests of each length of the last 90
 * days as points, pace or power, each opening its run, and the curve fitted to them with the
 * critical speed and D′ (or the critical power and W′) it gives, by the function Compare fits with.
 * A row of the table under the pointer is ringed on it.
 */
function Curve({ now, runs, metric, onMetric, focus, model }: { now: PerformanceNow; runs: RunsIndex['runs']; metric: CurveMetric; onMetric: ((m: CurveMetric) => void) | null; focus: number | null; model: CurveModel }) {
  const title = new Map(runs.map((r) => [r.id, r.title ?? null]));
  const power = metric === 'power';
  // Every length of the curve, 30 s to 2 h (an older summary holds 2–20 minutes alone).
  const efforts = (power ? now.powerCurve : now.curve).filter((e): e is BestEffort => e !== null);
  // The chart's values: a pace in s/km, a power in W.
  const points = efforts.map((e) => ({ duration: e.duration, value: power ? e.value : 1000 / e.value, note: `${date(e.startTime)}${title.get(e.runId) ? ` · ${title.get(e.runId)}` : ''}`, href: runHref(e.runId, e.at?.[0], e.at?.[1]) }));
  const drawn = drawnCurve(points, metric, model);
  const fit = drawn.fit;
  const view = knownMetricViews().find((x) => x.key === metric)!;
  const gap = (m: number, e: number) => {
    const d = Math.round(m - e);
    if (d === 0) return t('on the curve');
    const v = number(Math.abs(power ? d : Math.round(toPace(d))));
    if (power) return d > 0 ? t('{v} W above the curve', { v }) : t('{v} W below the curve', { v });
    return d > 0 ? t('{v} s{unit} slower than the curve', { v, unit: paceUnit() }) : t('{v} s{unit} faster than the curve', { v, unit: paceUnit() });
  };
  const c = fit?.critical;
  return (
    <div className="card chart">
      <div className="curve-head">
        <h3 className="chart-title">{power ? t('Your power curve') : t('Your pace curve')} <span className="muted">· {t('the bests of each length in the last {days} days, and the curve fitted to them', { days: MARKER_DAYS })}</span></h3>
        {onMetric && (
          <div className="segmented" role="group" aria-label={t('Curve of')}>
            <button type="button" className={!power ? 'on' : ''} aria-pressed={!power} onClick={() => onMetric('speed')}>{t('Pace')}</button>
            <button type="button" className={power ? 'on' : ''} aria-pressed={power} onClick={() => onMetric('power')}>{t('Power')}</button>
          </div>
        )}
      </div>
      {points.length ? (
        <CurveChart label={power ? t('Your power curve') : t('Your pace curve')} higherIsBetter={power} lines={[{ key: 'you', label: t('Bests of the last {days} days', { days: MARKER_DAYS }), color: 'var(--series-1)', shape: 'circle', points, estimate: drawn.estimate, extrapolate: drawn.extrapolate, estimateAt: drawn.at }]}
          durations={WHOLE_AXIS} format={(v) => (power ? `${number(Math.round(v))} W` : `${fmtPace(1000 / v)} ${paceUnit()}`)} tick={view.tick} minSpan={view.minSpan} gap={gap} highlight={focus === null ? null : { key: 'you', duration: focus }} height={240} />
      ) : <p className="muted small">{t('No best in the last {days} days.', { days: MARKER_DAYS })}</p>}
      <p className="chart-note">
        {c ? (power
          ? <>{t('Critical power')} <b className="tnum">{number(Math.round(c.rate))} W</b>{t(', the power you could hold for about half an hour to an hour; W′')} <b className="tnum">{number(c.reserve / 1000, 1)} kJ</b>{t(', the work above it you can spend.')}</>
          : <>{t('Critical speed')} <b className="tnum">{fmtPace(c.rate)} {paceUnit()}</b>{t(', the pace you could hold for about half an hour to an hour; D′')} <b className="tnum">{number(Math.round(c.reserve))} m</b>{t(', the distance above it you can spend.')}</>)
          : t('The curve needs bests of at least three lengths of 2–20 minutes.')}{' '}{t('Compare draws the curves of runs, periods or shoes side by side.')}
      </p>
      <CurveModelNote curve={drawn} metric={metric} />
    </div>
  );
}

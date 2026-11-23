'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { RunsIndex } from '@/lib/kernel';
import { EFFORT_DURATIONS, MARKER_DAYS, pairEfforts, type BestEffort, type Effort, type PerformanceNow } from '@/lib/load';
import { estimateCurve, estimatedValue, type CurveMetric } from '@/lib/curve';
import { date, pace as fmtPace } from '@/lib/format';
import { CellBar, METRIC_VIEW } from '@/components';
import { CurveChart } from '../compare/CurveChart';
import { runHref } from '../compare/links';

const EFFORT_LABEL: Record<Effort, string> = { allout: 'all-out', hard: 'hard, not all-out', easy: 'not all-out', unknown: 'no heart rate' };
/** A day short: without the year when it is this year's. */
const day = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
};

/**
 * The best efforts the curve models are fitted to (requirement "Model assumptions checked"): for
 * each length the best pace and the best power of the last 90 days in one row (the runner's "tak"
 * to one table: "czy to nie to samo"), how hard it was and the run it comes from (the link opens the
 * run with the stretch selected). Where pace and power are one stretch the row says it once; where
 * they come from two efforts (uphill the power is high and the pace slow) it says each. What
 * "all-out" rests on is behind the view's "Why?".
 */
export function EffortsTab({ now, runs }: { now: PerformanceNow; runs: RunsIndex['runs'] }) {
  const title = new Map(runs.map((r) => [r.id, r.title ?? null]));
  const withPower = now.powerEfforts.some((e) => e !== null);
  const rows = pairEfforts(now.efforts, withPower ? now.powerEfforts : []);
  const split = rows.filter((r) => r.pace && r.power && !r.same).length;
  const [metric, setMetric] = useState<CurveMetric>('speed');
  const [focus, setFocus] = useState<number | null>(null);

  const hard = (e: BestEffort) => <span className="trust"><i className={`trust-dot ${e.effort}`} aria-hidden="true" />{EFFORT_LABEL[e.effort]}</span>;
  const ofMax = (e: BestEffort) => (e.hr !== null && now.maxHr ? <><CellBar share={e.hr / now.maxHr} />{Math.round((e.hr / now.maxHr) * 100)} %</> : '–');
  // Narrow (a third of the Dashboard), the effort's column gives way to a dot by its run.
  const run = (e: BestEffort) => (
    <span className="effort-run">
      <i className={`trust-dot ${e.effort} narrow-only`} role="img" aria-label={EFFORT_LABEL[e.effort]} />
      <Link href={runHref(e.runId, e.at?.[0], e.at?.[1])} title={title.get(e.runId) ?? undefined}>{day(e.startTime)}<span className="run-title">{title.get(e.runId) ? ` · ${title.get(e.runId)}` : ''}</span><span className="unit"> →</span></Link>
    </span>
  );
  /** A detail of the row: once for one effort, else for the pace and for the power, each named. */
  const both = (a: BestEffort | null, b: BestEffort | null, same: boolean, show: (e: BestEffort) => ReactNode) => {
    if (same || !b) return a ? show(a) : '–';
    if (!a) return show(b);
    return (
      <span className="effort-split">
        <span><small className="muted">pace</small> {show(a)}</span>
        <span><small className="muted">power</small> {show(b)}</span>
      </span>
    );
  };

  return (
    <>
      <Curve now={now} runs={runs} metric={withPower ? metric : 'speed'} onMetric={withPower ? setMetric : null} focus={focus} />
    <div className="card chart efforts-card" style={{ marginTop: 12 }}>
      <h3 className="chart-title">Best efforts of each length{withPower && <span className="muted"> · pace and power</span>}</h3>
      <div className="table-scroll">
        <table className="data efforts-table" aria-label="Best efforts">
          <thead>
            <tr><th>Length</th><th className="num"><span className="wide-text">Best pace</span><span className="narrow-text">Pace /km</span></th>{withPower && <th className="num"><span className="wide-text">Best power</span><span className="narrow-text">Power W</span></th>}<th className="col-effort">Effort</th><th className="num col-hr">Of max heart rate</th><th>Run</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.duration} data-effort={(r.pace ?? r.power)!.effort} data-same={withPower ? String(r.same) : undefined} onMouseEnter={() => setFocus(r.duration)} onMouseLeave={() => setFocus(null)}>
                <td className="strong">{r.duration / 60} min</td>
                <td className="num tnum strong">{r.pace ? <>{fmtPace(r.pace.value)}<span className="unit"> /km</span></> : '–'}</td>
                {withPower && <td className="num tnum strong">{r.power ? <>{Math.round(r.power.value)}<span className="unit"> W</span></> : '–'}</td>}
                <td className="col-effort">{both(r.pace, r.power, r.same, hard)}</td>
                <td className="num tnum muted col-hr">{both(r.pace, r.power, r.same, ofMax)}</td>
                <td>{both(r.pace, r.power, r.same, run)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={withPower ? 6 : 5} className="muted small">No best in the last {MARKER_DAYS} days.</td></tr>}
          </tbody>
        </table>
      </div>
      {split > 0 && (
        <p className="chart-note">
          {split === 1 ? 'One length has' : `${split} lengths have`} the best pace and the best power from different efforts: uphill, into the wind or on soft ground the power is high and the pace slow, so each is shown with its own run, the pace's first.
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
function Curve({ now, runs, metric, onMetric, focus }: { now: PerformanceNow; runs: RunsIndex['runs']; metric: CurveMetric; onMetric: ((m: CurveMetric) => void) | null; focus: number | null }) {
  const title = new Map(runs.map((r) => [r.id, r.title ?? null]));
  const power = metric === 'power';
  const efforts = (power ? now.powerEfforts : now.efforts).filter((e): e is BestEffort => e !== null);
  // The chart's values: a pace in s/km, a power in W.
  const points = efforts.map((e) => ({ duration: e.duration, value: power ? e.value : 1000 / e.value, note: `${date(e.startTime)}${title.get(e.runId) ? ` · ${title.get(e.runId)}` : ''}`, href: runHref(e.runId, e.at?.[0], e.at?.[1]) }));
  const fit = estimateCurve(points, metric);
  const estimate = fit ? Array.from({ length: 25 }, (_, k) => { const d = EFFORT_DURATIONS[0] * Math.pow(EFFORT_DURATIONS[EFFORT_DURATIONS.length - 1] / EFFORT_DURATIONS[0], k / 24); return { duration: d, value: estimatedValue(fit, d) }; }) : undefined;
  const view = METRIC_VIEW.find((x) => x.key === metric)!;
  const gap = (m: number, e: number) => {
    const d = Math.round(m - e);
    if (d === 0) return 'on the curve';
    return power ? `${Math.abs(d)} W ${d > 0 ? 'above' : 'below'} the curve` : `${Math.abs(d)} s/km ${d > 0 ? 'slower' : 'faster'} than the curve`;
  };
  const c = fit?.critical;
  return (
    <div className="card chart">
      <div className="curve-head">
        <h3 className="chart-title">Your {power ? 'power' : 'pace'} curve <span className="muted">· the bests of each length in the last {MARKER_DAYS} days, and the curve fitted to them</span></h3>
        {onMetric && (
          <div className="segmented" role="group" aria-label="Curve of">
            <button type="button" className={!power ? 'on' : ''} aria-pressed={!power} onClick={() => onMetric('speed')}>Pace</button>
            <button type="button" className={power ? 'on' : ''} aria-pressed={power} onClick={() => onMetric('power')}>Power</button>
          </div>
        )}
      </div>
      {points.length ? (
        <CurveChart label={power ? 'Your power curve' : 'Your pace curve'} higherIsBetter={power} lines={[{ key: 'you', label: `Bests of the last ${MARKER_DAYS} days`, color: 'var(--series-1)', shape: 'circle', points, estimate, estimateAt: fit ? (d) => estimatedValue(fit, d) : undefined }]}
          durations={EFFORT_DURATIONS} format={(v) => (power ? `${Math.round(v)} W` : `${fmtPace(1000 / v)} /km`)} tick={view.tick} minSpan={view.minSpan} gap={gap} highlight={focus === null ? null : { key: 'you', duration: focus }} height={240} />
      ) : <p className="muted small">No best in the last {MARKER_DAYS} days.</p>}
      <p className="chart-note">
        {c ? (power
          ? <>Critical power <b className="tnum">{Math.round(c.rate)} W</b>, the power you could hold for about half an hour to an hour; W′ <b className="tnum">{(c.reserve / 1000).toFixed(1)} kJ</b>, the work above it you can spend.</>
          : <>Critical speed <b className="tnum">{fmtPace(c.rate)} /km</b>, the pace you could hold for about half an hour to an hour; D′ <b className="tnum">{Math.round(c.reserve)} m</b>, the distance above it you can spend.</>)
          : 'The curve needs bests of at least three lengths of 2–20 minutes.'} Compare draws the curves of runs, periods or shoes side by side.
      </p>
    </div>
  );
}

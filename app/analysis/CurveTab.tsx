import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CellBar, ItemKey, METRIC_VIEW, type Shape } from '@/components';
import { CURVE_DURATIONS, MIN_FIT_POINTS, MIN_FIT_SECONDS, estimateCurve, estimatedValue, type CurveEstimate, type CurveMetric, type CurvePoint } from '@/lib/curve';
import { date, duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import { CurveChart, type CurveLine } from './CurveChart';
import { mmss, runHref } from './links';

const view = (mt: 'speed' | 'power') => METRIC_VIEW.find((x) => x.key === mt)!;

/**
 * The curve tab of Analysis (requirements "Speed or power curve" and "Curve estimate and its
 * bests"): the curve of each item with its estimate, the estimate's parameters, and the table of
 * bests, each opening the run it comes from with its stretch selected. Loaded when the tab opens.
 */
export function CurveTab({ metric, items, bests, missingPower }: {
  metric: CurveMetric;
  /** the items drawn, in order, with their key in `bests` */
  items: { key: string; label: string; color: string; shape: Shape }[];
  /** the bests of each item, by its key */
  bests: Map<string, CurvePoint[]>;
  /** some item holds no run with power */
  missingPower: boolean;
}) {
  // The best under the pointer in the table of bests, ringed on the chart.
  const [focusBest, setFocusBest] = useState<{ key: string; duration: number } | null>(null);
  // Each item's line: its bests, each naming its run and stretch, and its estimate.
  const lines: (CurveLine & { estimated: CurveEstimate | null })[] = useMemo(() => items.map((i) => {
    const points = (bests.get(i.key) ?? []).map((p) => ({ duration: p.duration, value: p.value, note: `${date(p.date)}${p.title ? ` · ${p.title}` : ''} · ${mmss(p.from)}–${mmss(p.to)}`, href: runHref(p.runId, p.from, p.to) }));
    const estimated = estimateCurve(points, metric);
    // The estimate drawn from 3 minutes to the end of the axis, 24 steps on the logarithmic scale.
    const d0 = Math.log(MIN_FIT_SECONDS);
    const d1 = Math.log(CURVE_DURATIONS[CURVE_DURATIONS.length - 1]);
    const estimate = estimated ? Array.from({ length: 25 }, (_, k) => { const d = Math.exp(d0 + ((d1 - d0) * k) / 24); return { duration: d, value: estimatedValue(estimated, d) }; }) : undefined;
    return { ...i, points, estimate, estimated, estimateAt: estimated ? (d: number) => estimatedValue(estimated, d) : undefined };
  }), [items, bests, metric]);
  const raceName = (m: number) => (m === 42195 ? 'marathon' : m === 21097.5 ? 'half' : `${m / 1000} km`);
  // The curve's values in words: a pace or a power, and a best's gap to the estimate.
  const curveFmt = (v: number) => (metric === 'power' ? `${Math.round(v)} W` : `${fmtPace(1000 / v)} /km`);
  const curveGap = (measured: number, est: number) => {
    const d = Math.round(measured - est);
    if (d === 0) return 'on the estimate';
    return metric === 'power' ? `${Math.abs(d)} W ${d > 0 ? 'above' : 'below'}` : `${Math.abs(d)} s/km ${d > 0 ? 'slower' : 'faster'}`;
  };
  // The curve's bests, a row per item and length, with the run and the stretch each comes from.
  const bestRows = lines.flatMap((l) => (bests.get(l.key) ?? []).map((p) => ({ line: l, p, estimate: l.estimateAt?.(p.duration) ?? null })));
  /** The widest gap to the estimate among the rows: the scale of the gap bars. */
  const widestGap = Math.max(1e-9, ...bestRows.map((r) => (r.estimate === null ? 0 : Math.abs(r.p.value - r.estimate))));
  return (
    <>
      <div className="card chart">
        {metric === 'speed' ? (
          <>
            <h3 className="chart-title">Pace curve <span className="muted">· for each length of time, the fastest stretch of that length inside the item&apos;s segments</span></h3>
            <CurveChart label="Pace curve" lines={lines} durations={CURVE_DURATIONS} format={curveFmt} tick={view('speed').tick} minSpan={view('speed').minSpan} highlight={focusBest}
              gap={(m, e) => { const g = curveGap(m, e); return g === 'on the estimate' ? g : `${g} than the estimate`; }} />
          </>
        ) : (
          <>
            <h3 className="chart-title">Power curve <span className="muted">· for each length of time, the highest average power of a stretch of that length inside the item&apos;s segments</span></h3>
            <CurveChart label="Power curve" higherIsBetter lines={lines} durations={CURVE_DURATIONS} format={curveFmt} tick={view('power').tick} minSpan={view('power').minSpan} highlight={focusBest}
              gap={(m, e) => { const g = curveGap(m, e); return g === 'on the estimate' ? g : `${g} the estimate`; }} />
          </>
        )}
        <div className="curve-params">
          {lines.map((l) => {
            const e = l.estimated;
            const tiles: [string, string, string?][] = !e ? [] : metric === 'speed'
              ? [
                ['Exponent', (1 + e.k).toFixed(3), `Riegel · ${e.n} bests ≥ ${MIN_FIT_SECONDS / 60} min`],
                ['Critical speed', e.critical ? `${fmtPace(e.critical.rate)} /km` : '–', e.critical ? `${e.critical.n} bests of 2–20 min` : 'needs 3 bests of 2–20 min'],
                ['D′', e.critical ? `${Math.round(e.critical.reserve)} m` : '–', 'distance above critical speed'],
                ...e.predictions.map((p): [string, string, string] => [raceName(p.distance), fmtDuration(Math.round(p.seconds)), 'predicted']),
              ]
              : [
                ['Exponent', (1 + e.k).toFixed(3), `power law · ${e.n} bests ≥ ${MIN_FIT_SECONDS / 60} min`],
                ['Critical power', e.critical ? `${Math.round(e.critical.rate)} W` : '–', e.critical ? `${e.critical.n} bests of 2–20 min` : 'needs 3 bests of 2–20 min'],
                ['W′', e.critical ? `${(e.critical.reserve / 1000).toFixed(1)} kJ` : '–', 'work above critical power'],
                ...[300, 1200, 3600].map((d): [string, string, string] => [`${d / 60} min`, `${Math.round(estimatedValue(e, d))} W`, 'estimated']),
              ];
            return (
              <section key={l.key} className="curve-note curve-param-row" aria-label={`Estimate · ${l.label}`}>
                <div className="curve-param-head"><ItemKey shape={l.shape} color={l.color} /> {l.label}</div>
                {e ? (
                  <dl className="curve-param-dl">
                    {tiles.map(([name, value, sub]) => <div key={name}><dt>{name}</dt><dd className="tnum">{value}</dd>{sub && <dd className="muted sub">{sub}</dd>}</div>)}
                  </dl>
                ) : <span className="muted small">No estimate: it needs {MIN_FIT_POINTS} bests of {MIN_FIT_SECONDS / 60} min and more, so segments at least that long.</span>}
              </section>
            );
          })}
        </div>
        {missingPower && <div className="chart-note">An item without a line holds no runs with power: its runs were recorded without a power meter.</div>}
        {metric === 'speed'
          ? <div className="chart-note">Solid: the fastest stretch of each length inside the item&apos;s segments (a block of whole runs covers every length its runs do). Dashed: the estimate, a power law of time (Riegel 1981) with its slope fitted to those bests and its level raised to the strongest of them, so no best lies above it; the dotted strokes are each best&apos;s gap to it; move the pointer along the chart to read the estimate at any length. Critical speed and D′ from the critical speed model (Monod &amp; Scherrer 1965; Jones &amp; Vanhatalo 2017), fitted to the bests of 2–20 min.</div>
          : <div className="chart-note">Solid: the highest average power of a stretch of each length inside the item&apos;s segments (a pause counts as no power). Dashed: the estimate, a power law of time with its slope fitted to those bests and its level raised to the strongest of them, so no best lies above it; the dotted strokes are each best&apos;s gap to it; move the pointer along the chart to read the estimate at any length. Critical power and W′ from the critical power model (Monod &amp; Scherrer 1965; Moritani et al. 1981), work against time fitted to the bests of 2–20 min.</div>}
      </div>
      {bestRows.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <div className="toolbar" style={{ padding: '12px 18px 0' }}>
            <span className="chart-title" style={{ margin: 0 }}>Bests</span>
            <span className="muted small">the stretches the curve comes from; open one to see it in its run</span>
          </div>
          <table className="data curve-bests" aria-label="Curve bests" onMouseLeave={() => setFocusBest(null)}>
            <thead><tr>{lines.length > 1 && <th>Item</th>}<th>Length</th><th className="num">{metric === 'power' ? 'Power' : 'Pace'}</th><th className="num">Estimate</th><th>Gap</th><th>Run</th><th>Stretch</th><th /></tr></thead>
            <tbody>
              {bestRows.map(({ line, p, estimate }) => (
                <tr key={`${line.key}${p.duration}`} className={focusBest?.key === line.key && focusBest.duration === p.duration ? 'focus' : ''} onMouseEnter={() => setFocusBest({ key: line.key, duration: p.duration })}>
                  {lines.length > 1 && <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={line.shape} color={line.color} />{line.label}</span></td>}
                  <td className="strong">{p.duration < 60 ? `${p.duration} s` : p.duration < 3600 ? `${p.duration / 60} min` : `${p.duration / 3600} h`}</td>
                  <td className="num tnum">{curveFmt(p.value)}</td>
                  <td className="num tnum muted">{estimate === null ? '–' : curveFmt(estimate)}</td>
                  <td className="muted">{estimate === null ? '' : <><CellBar tone="quiet" share={Math.abs(p.value - estimate) / widestGap} />{curveGap(p.value, estimate)}</>}</td>
                  <td>{date(p.date)}{p.title ? <span className="muted"> · {p.title}</span> : null}</td>
                  <td className="muted">{mmss(p.from)}–{mmss(p.to)}</td>
                  <td className="num"><Link className="row-open" href={runHref(p.runId, p.from, p.to)}>Open run →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

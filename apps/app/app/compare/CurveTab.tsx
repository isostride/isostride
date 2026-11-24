import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CellBar, ItemKey, METRIC_VIEW, type Shape } from '@/components';
import { CURVE_DURATIONS, MIN_FIT_POINTS, MIN_FIT_SECONDS, estimateCurve, estimatedValue, type CurveEstimate, type CurveMetric, type CurvePoint } from '@/lib/curve';
import { date, duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import { number, t, tn } from '@/lib/i18n';
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
  const raceName = (m: number) => (m === 42195 ? t('marathon') : m === 21097.5 ? t('half') : `${number(m / 1000)} km`);
  // The curve's values in words: a pace or a power, and a best's gap to the estimate.
  const curveFmt = (v: number) => (metric === 'power' ? `${Math.round(v)} W` : `${fmtPace(1000 / v)} /km`);
  // Whole texts, so each language orders them its own way; `chart` adds what the gap is to (the tooltip of the chart).
  const curveGap = (measured: number, est: number, chart = false) => {
    const d = Math.round(measured - est);
    if (d === 0) return t('on the estimate');
    if (metric === 'power') {
      const value = `${number(Math.abs(d))} W`;
      return d > 0 ? (chart ? t('{value} above the estimate', { value }) : t('{value} above', { value })) : chart ? t('{value} below the estimate', { value }) : t('{value} below', { value });
    }
    const value = `${number(Math.abs(d))} s/km`;
    return d > 0 ? (chart ? t('{value} slower than the estimate', { value }) : t('{value} slower', { value })) : chart ? t('{value} faster than the estimate', { value }) : t('{value} faster', { value });
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
            <h3 className="chart-title">{t('Pace curve')} <span className="muted">· {t("for each length of time, the best effort of that length inside the item's efforts")}</span></h3>
            <CurveChart label={t('Pace curve')} lines={lines} durations={CURVE_DURATIONS} format={curveFmt} tick={view('speed').tick} minSpan={view('speed').minSpan} highlight={focusBest}
              gap={(m, e) => curveGap(m, e, true)} />
          </>
        ) : (
          <>
            <h3 className="chart-title">{t('Power curve')} <span className="muted">· {t("for each length of time, the highest average power held for that length inside the item's efforts")}</span></h3>
            <CurveChart label={t('Power curve')} higherIsBetter lines={lines} durations={CURVE_DURATIONS} format={curveFmt} tick={view('power').tick} minSpan={view('power').minSpan} highlight={focusBest}
              gap={(m, e) => curveGap(m, e, true)} />
          </>
        )}
        <div className="curve-params">
          {lines.map((l) => {
            const e = l.estimated;
            const tiles: [string, string, string?][] = !e ? [] : metric === 'speed'
              ? [
                [t('Exponent'), number(1 + e.k, 3), tn(e.n, 'Riegel · {n} best ≥ {min} min', 'Riegel · {n} bests ≥ {min} min', { min: MIN_FIT_SECONDS / 60 })],
                [t('Critical speed'), e.critical ? `${fmtPace(e.critical.rate)} /km` : '–', e.critical ? tn(e.critical.n, '{n} best of 2–20 min', '{n} bests of 2–20 min') : t('needs 3 bests of 2–20 min')],
                ['D′', e.critical ? `${Math.round(e.critical.reserve)} m` : '–', t('distance above critical speed')],
                ...e.predictions.map((p): [string, string, string] => [raceName(p.distance), fmtDuration(Math.round(p.seconds)), t('predicted')]),
              ]
              : [
                [t('Exponent'), number(1 + e.k, 3), tn(e.n, 'power law · {n} best ≥ {min} min', 'power law · {n} bests ≥ {min} min', { min: MIN_FIT_SECONDS / 60 })],
                [t('Critical power'), e.critical ? `${Math.round(e.critical.rate)} W` : '–', e.critical ? tn(e.critical.n, '{n} best of 2–20 min', '{n} bests of 2–20 min') : t('needs 3 bests of 2–20 min')],
                ['W′', e.critical ? `${number(e.critical.reserve / 1000, 1)} kJ` : '–', t('work above critical power')],
                ...[300, 1200, 3600].map((d): [string, string, string] => [`${d / 60} min`, `${Math.round(estimatedValue(e, d))} W`, t('estimated')]),
              ];
            return (
              <section key={l.key} className="curve-note curve-param-row" aria-label={t('Estimate · {name}', { name: l.label })}>
                <div className="curve-param-head"><ItemKey shape={l.shape} color={l.color} /> {l.label}</div>
                {e ? (
                  <dl className="curve-param-dl">
                    {tiles.map(([name, value, sub]) => <div key={name}><dt>{name}</dt><dd className="tnum">{value}</dd>{sub && <dd className="muted sub">{sub}</dd>}</div>)}
                  </dl>
                ) : <span className="muted small">{t('No estimate: it needs {n} bests of {min} min and more, so efforts at least that long.', { n: MIN_FIT_POINTS, min: MIN_FIT_SECONDS / 60 })}</span>}
              </section>
            );
          })}
        </div>
        {missingPower && <div className="chart-note">{t('An item without a line holds no runs with power: its runs were recorded without a power meter.')}</div>}
        {metric === 'speed'
          ? <div className="chart-note">{t("Solid: the best effort of each length inside the item's efforts (a segment of whole runs covers every length its runs do). Dashed: the estimate, a power law of time (Riegel 1981) with its slope fitted to those bests and its level raised to the strongest of them, so no best lies above it; the dotted strokes are each best's gap to it; move the pointer along the chart to read the estimate at any length. Critical speed and D′ from the critical speed model (Monod & Scherrer 1965; Jones & Vanhatalo 2017), fitted to the bests of 2–20 min.")}</div>
          : <div className="chart-note">{t("Solid: the highest average power held for each length inside the item's efforts (a pause counts as no power). Dashed: the estimate, a power law of time with its slope fitted to those bests and its level raised to the strongest of them, so no best lies above it; the dotted strokes are each best's gap to it; move the pointer along the chart to read the estimate at any length. Critical power and W′ from the critical power model (Monod & Scherrer 1965; Moritani et al. 1981), work against time fitted to the bests of 2–20 min.")}</div>}
      </div>
      {bestRows.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <div className="toolbar" style={{ padding: '12px 18px 0' }}>
            <span className="chart-title" style={{ margin: 0 }}>{t('Bests')}</span>
            <span className="muted small">{t('the efforts the curve comes from; open one to see it in its run')}</span>
          </div>
          <table className="data curve-bests" aria-label={t('Curve bests')} onMouseLeave={() => setFocusBest(null)}>
            <thead><tr>{lines.length > 1 && <th>{t('Item')}</th>}<th>{t('Length')}</th><th className="num">{metric === 'power' ? t('Power') : t('Pace')}</th><th className="num wide-col">{t('Estimate')}</th><th>{t('Gap')}</th><th className="wide-col">{t('Run')}</th><th className="wide-col">{t('In the run')}</th><th /></tr></thead>
            <tbody>
              {bestRows.map(({ line, p, estimate }) => (
                <tr key={`${line.key}${p.duration}`} className={focusBest?.key === line.key && focusBest.duration === p.duration ? 'focus' : ''} onMouseEnter={() => setFocusBest({ key: line.key, duration: p.duration })}>
                  {lines.length > 1 && <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ItemKey shape={line.shape} color={line.color} />{line.label}</span></td>}
                  <td className="strong">{p.duration < 60 ? `${number(p.duration)} s` : p.duration < 3600 ? `${number(p.duration / 60)} min` : `${number(p.duration / 3600)} h`}</td>
                  <td className="num tnum">{curveFmt(p.value)}</td>
                  <td className="num tnum muted wide-col">{estimate === null ? '–' : curveFmt(estimate)}</td>
                  <td className="muted">{estimate === null ? '' : <><CellBar tone="quiet" share={Math.abs(p.value - estimate) / widestGap} />{curveGap(p.value, estimate)}</>}</td>
                  <td className="wide-col">{date(p.date)}{p.title ? <span className="muted"> · {p.title}</span> : null}</td>
                  <td className="muted wide-col">{mmss(p.from)}–{mmss(p.to)}</td>
                  <td className="num"><Link className="row-open" href={runHref(p.runId, p.from, p.to)}>{t('Open run →')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

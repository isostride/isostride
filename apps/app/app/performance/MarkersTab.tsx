'use client';

import { useMemo } from 'react';
import { msg, number, t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { MARKER_DAYS, markersOverTime, vdotOverTime, type LoadSummary, type MarkerWeek } from '@/lib/load';
import { duration as fmtDuration, pace as fmtPace } from '@/lib/format';
import { TimeChart } from './TimeChart';
import type { CurveModel } from '@/lib/settings';

const RACES: [number, string][] = [[5000, '5 km'], [10000, '10 km'], [21097.5, msg('half')], [42195, msg('marathon')]];
const time = (d: string) => new Date(`${d}T12:00:00`).getTime();
const predicted = (w: MarkerWeek | null, d: number) => w?.predictions.find((p) => p.distance === d)?.seconds ?? null;
/** A value against that of 90 days before, in words. */
const delta = (a: number | null, b: number | null, fmt: (v: number) => string, lowerBetter = false) => {
  if (a === null || b === null) return '';
  const d = a - b;
  if (Math.abs(d) < 1e-9) return t('same as 90 days ago');
  return `${t('{delta} vs 90 days ago', { delta: `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}` })}${(lowerBetter ? d < 0 : d > 0) ? ' ↑' : ' ↓'}`;
};
const empty = () => <div className="card empty">{t('Nothing yet: it needs, within {days} days, bests of at least three lengths between 2 and 20 minutes.', { days: MARKER_DAYS })}</div>;

interface Props { runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; today: string; /** the curve model chosen in Settings: the predicted times follow it */ model?: CurveModel }

/**
 * Critical speed and power (requirement "Fitness markers over time"): the Monod–Scherrer model
 * fitted to the best efforts, week by week from the bests of the 90 days up to it.
 */
export function CriticalTab({ runs, summaries, today }: Props) {
  const weeks = useMemo(() => markersOverTime(runs, summaries, today), [runs, summaries, today]);
  if (!weeks.some((w) => w.cs !== null)) return empty();
  const now = weeks[weeks.length - 1];
  const before = weeks[weeks.length - 1 - 13] ?? null;
  const times = weeks.map((w) => time(w.end));
  const hasPower = weeks.some((w) => w.cp !== null);
  return (
    <div className="card chart">
      <dl className="form-figures" aria-label={t('Critical speed and power now')}>
        <div><dt>{t('Critical speed')}</dt><dd className="tnum">{now.cs ? `${fmtPace(now.cs)} /km` : '–'}</dd><dd className="muted sub">{delta(now.cs && 1000 / now.cs, before?.cs ? 1000 / before.cs : null, (v) => `${number(Math.round(v))} s/km`, true)}</dd></div>
        <div><dt>D′</dt><dd className="tnum">{now.dPrime !== null ? `${number(Math.round(now.dPrime))} m` : '–'}</dd></div>
        {hasPower && <div><dt>{t('Critical power')}</dt><dd className="tnum">{now.cp !== null ? `${number(Math.round(now.cp))} W` : '–'}</dd><dd className="muted sub">{delta(now.cp, before?.cp ?? null, (v) => `${number(Math.round(v))} W`)}</dd></div>}
        {hasPower && <div><dt>W′</dt><dd className="tnum">{now.wPrime !== null ? `${number(now.wPrime / 1000, 1)} kJ` : '–'}</dd></div>}
      </dl>
      <h3 className="chart-title">{t('Critical speed')}</h3>
      <TimeChart label={t('Critical speed over time')} times={times} invert
        series={[{ key: 'cs', label: t('critical speed'), color: 'var(--series-1)', kind: 'line', values: weeks.map((w) => (w.cs ? 1000 / w.cs : null)) }]}
        format={(v) => `${fmtPace(1000 / v)} /km`} tick={(v) => fmtPace(1000 / v)} />
      {hasPower && (
        <>
          <h3 className="chart-title" style={{ marginTop: 16 }}>{t('Critical power')}</h3>
          <TimeChart label={t('Critical power over time')} times={times}
            series={[{ key: 'cp', label: t('critical power'), color: 'var(--series-2)', kind: 'line', values: weeks.map((w) => w.cp) }]}
            format={(v) => `${number(Math.round(v))} W`} tick={(v) => number(Math.round(v))} />
        </>
      )}
    </div>
  );
}

/**
 * Predicted race times and VDOT (requirements "Fitness markers over time" and "VO2max estimates"):
 * Riegel's law through the same bests, and the VO2max the predicted 5 km implies.
 */
export function PredictionsTab({ runs, summaries, today, model = 'riegel' }: Props) {
  const weeks = useMemo(() => markersOverTime(runs, summaries, today, model), [runs, summaries, today, model]);
  const vdots = useMemo(() => vdotOverTime(weeks), [weeks]);
  if (!weeks.some((w) => w.predictions.length > 0)) return empty();
  const now = weeks[weeks.length - 1];
  const before = weeks[weeks.length - 1 - 13] ?? null;
  const vdotNow = vdots[vdots.length - 1]?.vdot ?? null;
  const vdotBefore = vdots[vdots.length - 1 - 13]?.vdot ?? null;
  const times = weeks.map((w) => time(w.end));
  return (
    <div className="card chart">
      <dl className="form-figures" aria-label={t('Predictions now')}>
        {RACES.map(([d, name]) => (
          <div key={d}><dt>{t(name)}</dt><dd className="tnum">{predicted(now, d) !== null ? fmtDuration(Math.round(predicted(now, d)!)) : '–'}</dd><dd className="muted sub">{delta(predicted(now, d), predicted(before, d), (v) => fmtDuration(Math.round(v)), true)}</dd></div>
        ))}
        <div><dt>VDOT</dt><dd className="tnum">{vdotNow === null ? '–' : number(vdotNow)}</dd><dd className="muted sub">{delta(vdotNow, vdotBefore, (v) => number(v, 1))}</dd></div>
      </dl>
      <h3 className="chart-title">{t('Predicted times')}</h3>
      <TimeChart label={t('Predicted race times over time')} times={times} invert height={220}
        series={RACES.slice(0, 3).map(([d, name], k) => ({ key: `p${k}`, label: t(name), color: `var(--series-${k + 1})`, kind: 'line' as const, values: weeks.map((w) => { const s = predicted(w, d); return s === null ? null : s / 60; }) }))}
        format={(v) => fmtDuration(Math.round(v * 60))} tick={(v) => `${number(Math.round(v))}′`} />
      <h3 className="chart-title" style={{ marginTop: 16 }}>VDOT</h3>
      <TimeChart label={t('VDOT over time')} times={times} height={180}
        series={[{ key: 'vdot', label: 'VDOT', color: 'var(--series-1)', kind: 'line', values: vdots.map((w) => w.vdot) }]}
        format={(v) => `${number(v, 1)} ml/kg/min`} tick={(v) => number(Math.round(v))} />
    </div>
  );
}

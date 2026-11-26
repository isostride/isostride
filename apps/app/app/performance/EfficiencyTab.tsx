'use client';

import { useMemo } from 'react';
import { number, signOf, t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { DECOUPLING_MIN, EF_TREND_DAYS, efficiencyNow, efficiencyRuns, trailingMean, type LoadSummary } from '@/lib/load';
import { TimeChart } from './TimeChart';

/** Decoupling under this is a sign of aerobic endurance (Friel). */
const DECOUPLING_GOOD = 5;

/**
 * Aerobic efficiency (requirement "Aerobic efficiency over time"), one model a view: the efficiency
 * factor of each run with the easy runs' trend, or the Pa:HR decoupling of the long runs.
 */
export function EfficiencyTab({ part, runs, summaries, maxHr, today }: { part: 'ef' | 'decoupling'; runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; maxHr: number | null; today: string }) {
  const points = useMemo(() => efficiencyRuns(runs, summaries, maxHr), [runs, summaries, maxHr]);
  if (!points.length) return <div className="card empty">{t('No run with a heart rate yet.')}</div>;
  const now = efficiencyNow(points, today);
  if (part === 'ef') {
    const trend = trailingMean(points, (p) => (p.easy ? p.ef : null), EF_TREND_DAYS);
    return (
      <div className="card chart">
        <dl className="form-figures" aria-label={t('Efficiency now')}>
          <div><dt>{t('Efficiency, easy runs')}</dt><dd className="tnum">{now.ef !== null ? number(now.ef, 2) : '–'} <span className="unit">{t('m/beat')}</span></dd><dd className="muted sub">{now.ef !== null && now.before !== null ? t('{change} % vs the {days} days before', { change: `${signOf(((now.ef - now.before) / now.before) * 100, 1)}${number(Math.abs(((now.ef - now.before) / now.before) * 100), 1)}`, days: EF_TREND_DAYS }) : ''}</dd></div>
          <div><dt>{t('Easy runs')}</dt><dd className="tnum">{number(points.filter((p) => p.easy).length)} <span className="unit">{t('of {total}', { total: number(points.length) })}</span></dd></div>
        </dl>
        <h3 className="chart-title">{t('Efficiency factor')}</h3>
        <TimeChart label={t('Efficiency factor over time')} times={points.map((p) => Date.parse(p.startTime))} height={240}
          series={[
            { key: 'ef', label: t('run (filled: easy)'), color: 'var(--series-1)', kind: 'dots', values: points.map((p) => p.ef), hollow: points.map((p) => !p.easy) },
            { key: 'trend', label: t('easy runs, {days}-day mean', { days: EF_TREND_DAYS }), color: 'var(--series-2)', kind: 'line', values: trend },
          ]}
          format={(v) => `${number(v, 2)} ${t('m/beat')}`} tick={(v) => number(v, 2)} />
      </div>
    );
  }
  const long = points.filter((p) => p.decoupling !== null);
  if (!long.length) return <div className="card empty">{t('No run of {minutes} minutes or more yet.', { minutes: number(DECOUPLING_MIN / 60) })}</div>;
  return (
    <div className="card chart">
      <dl className="form-figures" aria-label={t('Decoupling now')}>
        <div><dt>{t('Decoupling, long runs')}</dt><dd className="tnum">{now.decoupling !== null ? `${number(now.decoupling, 1)} %` : '–'}</dd></div>
        <div><dt>{t('Long runs')}</dt><dd className="tnum">{number(long.length)}</dd></div>
      </dl>
      <h3 className="chart-title">{t('Aerobic decoupling')}</h3>
      <TimeChart label={t('Aerobic decoupling over time')} times={long.map((p) => Date.parse(p.startTime))} height={220} zero guide={{ value: DECOUPLING_GOOD, label: `${number(DECOUPLING_GOOD)} %` }}
        series={[{ key: 'dec', label: t('decoupling'), color: 'var(--series-4)', kind: 'dots', values: long.map((p) => p.decoupling) }]}
        format={(v) => `${number(v, 1)} %`} tick={(v) => `${number(v)} %`} />
    </div>
  );
}

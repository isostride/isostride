'use client';

import { useMemo } from 'react';
import { number, t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { BANISTER_MIN_POINTS, BANISTER_MIN_SPAN, autoMaxHr, fitBanister, performancesFor, type Criterion, type FormDay, type LoadSummary } from '@/lib/load';
import type { PerformanceSettings } from '@/lib/settings';
import { TimeChart } from './TimeChart';

const time = (d: string) => new Date(`${d}T12:00:00`).getTime();

/**
 * Banister's model fitted to the runner (requirement "Fitted performance model"): the gains and
 * time constants that best turn the daily loads into the performances of the criterion chosen (a
 * view each), how well they do, and the projection of a rest from today.
 */
export function FittedTab({ criterion, runs, summaries, performance, days, today }: { criterion: Criterion; runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; performance: PerformanceSettings; days: FormDay[]; today: string }) {
  const maxHr = performance.maxHr ?? autoMaxHr(Object.values(summaries));
  const perfs = useMemo(() => performancesFor(criterion, runs, summaries, performance.restHr, maxHr, today, performance.curve), [criterion, runs, summaries, today, maxHr, performance.restHr, performance.curve]);
  const fit = useMemo(() => fitBanister(days.map((d) => ({ date: d.date, load: d.load })), perfs), [days, perfs]);
  if (!fit) return <div className="card empty">{t('No fit yet: it needs {points} performances or more over {span} days or more ({n} now), and gains that come out positive.', { points: BANISTER_MIN_POINTS, span: BANISTER_MIN_SPAN, n: number(perfs.length) })}</div>;
  const measured = new Map(perfs.map((p) => [p.date, p.value]));
  const all = [...fit.fitted, ...fit.projection];
  const fittedDays = new Set(fit.fitted.map((f) => f.date));
  const peakIn = Math.round((time(fit.peak.date) - time(today)) / 86_400_000);
  return (
    <div className="card chart">
      <dl className="form-figures" aria-label={t('Fitted model figures')}>
        <div><dt>{t('Fit (R²)')}</dt><dd className="tnum">{number(fit.r2, 2)}</dd></div>
        <div><dt>{t('Prediction (cross-validated R²)')}</dt><dd className="tnum">{number(fit.r2cv, 2)}</dd></div>
        <div><dt>{t('Fitness τ1')}</dt><dd className="tnum">{number(fit.tau1)} d</dd></div>
        <div><dt>{t('Fatigue τ2')}</dt><dd className="tnum">{number(fit.tau2)} d</dd></div>
        <div><dt>{t('Peak if you rest')}</dt><dd className="tnum">{peakIn <= 1 ? t('now') : t('in {n} d', { n: number(peakIn) })}</dd></div>
      </dl>
      <h3 className="chart-title">{t('Performance, measured and modelled')}</h3>
      <TimeChart label={t('Fitted performance over time')} times={all.map((p) => time(p.date))} height={260}
        series={[
          { key: 'measured', label: t('measured'), color: 'var(--series-1)', kind: 'dots', values: all.map((p) => measured.get(p.date) ?? null) },
          { key: 'model', label: t('model'), color: 'var(--series-2)', kind: 'line', values: all.map((p) => (fittedDays.has(p.date) ? p.value : null)) },
          { key: 'rest', label: t('if you rest from today'), color: 'var(--series-3)', kind: 'line', values: all.map((p) => (fittedDays.has(p.date) ? null : p.value)) },
        ]}
        format={(v) => number(v, 1)} tick={(v) => number(Math.round(v))} />
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { number, t } from '@/lib/i18n';
import { weeklyLoad, type FormDay } from '@/lib/load';
import { TimeChart } from './TimeChart';

/** Monotony above this is a guide to too little variation between hard and easy days (Foster 1998). */
const MONOTONY_HIGH = 2;
const time = (d: string) => new Date(`${d}T12:00:00`).getTime();

/**
 * Weekly load (requirement "Weekly load, monotony and strain"): each week's load by the model of
 * the load model chosen at the top of Load, its monotony and strain, and the ramp rate of fitness.
 */
export function LoadTab({ days, unit }: { days: FormDay[]; unit: string }) {
  const weeks = useMemo(() => weeklyLoad(days), [days]);
  if (!weeks.length) return <div className="card empty">{t('No run has a load yet.')}</div>;
  const shown = weeks.slice(-52);
  const now = weeks[weeks.length - 1];
  const times = shown.map((w) => time(w.start));
  const signed = (v: number) => `${v > 0 ? '+' : ''}${number(v || 0)}`;
  return (
    <div className="card chart">
      <dl className="form-figures" aria-label={t('Load this week')}>
        <div><dt>{t('Load this week')}</dt><dd className="tnum">{number(now.load)} <span className="unit">{unit}</span></dd></div>
        <div><dt>{t('Monotony')}</dt><dd className="tnum">{now.monotony === null ? '–' : number(now.monotony)}</dd></div>
        <div><dt>{t('Strain')}</dt><dd className="tnum">{now.strain === null ? '–' : number(now.strain)}</dd></div>
        <div><dt>{t('Ramp rate')}</dt><dd className="tnum">{signed(now.ramp)}</dd></div>
      </dl>
      <h3 className="chart-title">{t('Weekly load')}</h3>
      <TimeChart label={t('Weekly load')} times={times} zero
        series={[{ key: 'load', label: t('load'), color: 'var(--series-1)', kind: 'bar', values: shown.map((w) => w.load) }]}
        format={(v) => `${number(Math.round(v))} ${unit}`} tick={(v) => number(Math.round(v))} />
      <h3 className="chart-title" style={{ marginTop: 16 }}>{t('Monotony')}</h3>
      <TimeChart label={t('Monotony')} times={times} height={150} guide={{ value: MONOTONY_HIGH, label: number(MONOTONY_HIGH) }}
        series={[{ key: 'monotony', label: t('monotony'), color: 'var(--series-4)', kind: 'line', values: shown.map((w) => w.monotony) }]}
        format={(v) => number(v, 2)} tick={(v) => number(v, 1)} />
      <h3 className="chart-title" style={{ marginTop: 16 }}>{t('Strain')}</h3>
      <TimeChart label={t('Strain')} times={times} height={150} zero
        series={[{ key: 'strain', label: t('strain'), color: 'var(--series-2)', kind: 'bar', values: shown.map((w) => w.strain) }]}
        format={(v) => number(Math.round(v))} tick={(v) => number(Math.round(v))} />
      <h3 className="chart-title" style={{ marginTop: 16 }}>{t('Ramp rate')}</h3>
      <TimeChart label={t('Ramp rate')} times={times} height={150} zero
        series={[{ key: 'ramp', label: t('ramp rate'), color: 'var(--series-3)', kind: 'bar', values: shown.map((w) => w.ramp) }]}
        format={(v) => t('{ramp} a week', { ramp: signed(Math.round(v * 10) / 10) })} tick={(v) => signed(v)} />
    </div>
  );
}

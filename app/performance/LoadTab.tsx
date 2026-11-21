'use client';

import { useMemo } from 'react';
import { weeklyLoad, type FormDay } from '@/lib/load';
import { TimeChart } from './TimeChart';

/** Monotony above this is a guide to too little variation between hard and easy days (Foster 1998). */
const MONOTONY_HIGH = 2;
const time = (d: string) => new Date(`${d}T12:00:00`).getTime();

/**
 * Weekly load (requirement "Weekly load, monotony and strain"): each week's load by the model of
 * the Model tab, its monotony and strain, and the ramp rate of fitness.
 */
export function LoadTab({ days, unit }: { days: FormDay[]; unit: string }) {
  const weeks = useMemo(() => weeklyLoad(days), [days]);
  if (!weeks.length) return <div className="card empty">No run has a load yet.</div>;
  const shown = weeks.slice(-52);
  const now = weeks[weeks.length - 1];
  const times = shown.map((w) => time(w.start));
  const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  return (
    <div className="card chart">
      <dl className="form-figures" aria-label="Load this week">
        <div><dt>Load this week</dt><dd className="tnum">{now.load} <span className="unit">{unit}</span></dd></div>
        <div><dt>Monotony</dt><dd className="tnum">{now.monotony ?? '–'}</dd></div>
        <div><dt>Strain</dt><dd className="tnum">{now.strain ?? '–'}</dd></div>
        <div><dt>Ramp rate</dt><dd className="tnum">{signed(now.ramp)}</dd></div>
      </dl>
      <h3 className="chart-title">Weekly load</h3>
      <TimeChart label="Weekly load" times={times} zero
        series={[{ key: 'load', label: 'load', color: 'var(--series-1)', kind: 'bar', values: shown.map((w) => w.load) }]}
        format={(v) => `${Math.round(v)} ${unit}`} tick={(v) => String(Math.round(v))} />
      <h3 className="chart-title" style={{ marginTop: 16 }}>Monotony</h3>
      <TimeChart label="Monotony" times={times} height={150} guide={{ value: MONOTONY_HIGH, label: String(MONOTONY_HIGH) }}
        series={[{ key: 'monotony', label: 'monotony', color: 'var(--series-4)', kind: 'line', values: shown.map((w) => w.monotony) }]}
        format={(v) => v.toFixed(2)} tick={(v) => v.toFixed(1)} />
      <h3 className="chart-title" style={{ marginTop: 16 }}>Strain</h3>
      <TimeChart label="Strain" times={times} height={150} zero
        series={[{ key: 'strain', label: 'strain', color: 'var(--series-2)', kind: 'bar', values: shown.map((w) => w.strain) }]}
        format={(v) => String(Math.round(v))} tick={(v) => String(Math.round(v))} />
      <h3 className="chart-title" style={{ marginTop: 16 }}>Ramp rate</h3>
      <TimeChart label="Ramp rate" times={times} height={150} zero
        series={[{ key: 'ramp', label: 'ramp rate', color: 'var(--series-3)', kind: 'bar', values: shown.map((w) => w.ramp) }]}
        format={(v) => `${signed(Math.round(v * 10) / 10)} a week`} tick={(v) => signed(Math.round(v))} />
    </div>
  );
}

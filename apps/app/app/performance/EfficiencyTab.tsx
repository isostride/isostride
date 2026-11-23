'use client';

import { useMemo } from 'react';
import type { RunsIndex } from '@/lib/kernel';
import { DECOUPLING_MIN, EF_TREND_DAYS, efficiencyNow, efficiencyRuns, trailingMean, type LoadSummary } from '@/lib/load';
import { TimeChart } from './TimeChart';

/** Decoupling under this is a sign of aerobic endurance (Friel). */
const DECOUPLING_GOOD = 5;

/**
 * Aerobic efficiency (requirement "Aerobic efficiency over time"), one model a view: the efficiency
 * factor of each run with the easy runs' trend, or the Pa:HR decoupling of the long runs.
 */
export function EfficiencyTab({ part, runs, summaries, hrZones }: { part: 'ef' | 'decoupling'; runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; hrZones: number[] }) {
  const points = useMemo(() => efficiencyRuns(runs, summaries, hrZones), [runs, summaries, hrZones]);
  if (!points.length) return <div className="card empty">No run with a heart rate yet.</div>;
  const now = efficiencyNow(points);
  if (part === 'ef') {
    const trend = trailingMean(points, (p) => (p.easy ? p.ef : null), EF_TREND_DAYS);
    return (
      <div className="card chart">
        <dl className="form-figures" aria-label="Efficiency now">
          <div><dt>Efficiency, easy runs</dt><dd className="tnum">{now.ef !== null ? now.ef.toFixed(2) : '–'} <span className="unit">m/beat</span></dd><dd className="muted sub">{now.ef !== null && now.before !== null ? `${now.ef >= now.before ? '+' : '−'}${Math.abs(((now.ef - now.before) / now.before) * 100).toFixed(1)} % vs the ${EF_TREND_DAYS} days before` : ''}</dd></div>
          <div><dt>Easy runs</dt><dd className="tnum">{points.filter((p) => p.easy).length} <span className="unit">of {points.length}</span></dd></div>
        </dl>
        <h3 className="chart-title">Efficiency factor</h3>
        <TimeChart label="Efficiency factor over time" times={points.map((p) => Date.parse(p.startTime))} height={240}
          series={[
            { key: 'ef', label: 'run (filled: easy)', color: 'var(--series-1)', kind: 'dots', values: points.map((p) => p.ef), hollow: points.map((p) => !p.easy) },
            { key: 'trend', label: `easy runs, ${EF_TREND_DAYS}-day mean`, color: 'var(--series-2)', kind: 'line', values: trend },
          ]}
          format={(v) => `${v.toFixed(2)} m/beat`} tick={(v) => v.toFixed(2)} />
      </div>
    );
  }
  const long = points.filter((p) => p.decoupling !== null);
  if (!long.length) return <div className="card empty">No run of {DECOUPLING_MIN / 60} minutes or more yet.</div>;
  return (
    <div className="card chart">
      <dl className="form-figures" aria-label="Decoupling now">
        <div><dt>Decoupling, long runs</dt><dd className="tnum">{now.decoupling !== null ? `${now.decoupling.toFixed(1)} %` : '–'}</dd></div>
        <div><dt>Long runs</dt><dd className="tnum">{long.length}</dd></div>
      </dl>
      <h3 className="chart-title">Aerobic decoupling</h3>
      <TimeChart label="Aerobic decoupling over time" times={long.map((p) => Date.parse(p.startTime))} height={220} zero guide={{ value: DECOUPLING_GOOD, label: `${DECOUPLING_GOOD} %` }}
        series={[{ key: 'dec', label: 'decoupling', color: 'var(--series-4)', kind: 'dots', values: long.map((p) => p.decoupling) }]}
        format={(v) => `${v.toFixed(1)} %`} tick={(v) => `${v} %`} />
    </div>
  );
}

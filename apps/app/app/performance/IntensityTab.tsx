'use client';

import { useMemo, useState } from 'react';
import { msg, number, t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { intensityShares, zonesByWeek, type LoadSummary } from '@/lib/load';
import { zoneColor, zoneRanges } from '@/lib/settings';
import { TimeChart } from './TimeChart';

const PERIODS: [string, number | null][] = [[msg('12 weeks'), 12], [msg('1 year'), 52], [msg('All'), null]];
const time = (d: string) => new Date(`${d}T12:00:00`).getTime();
const pct = (v: number) => `${number(Math.round(v * 100))} %`;
/** A share as a CSS width. */
const width = (v: number) => `${(v * 100).toFixed(2)}%`;

/**
 * The intensity distribution (requirement "Intensity distribution"): each week's time in the heart
 * rate zones of Settings, and the shares of low, moderate and high intensity over the period shown.
 */
export function IntensityTab({ runs, summaries, hrZones }: { runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; hrZones: number[] }) {
  const [period, setPeriod] = useState(PERIODS[0]);
  const all = useMemo(() => zonesByWeek(runs, summaries, hrZones), [runs, summaries, hrZones]);
  if (!hrZones.length) return <div className="card empty">{t('Set the heart rate zones in Settings to see the time in each.')}</div>;
  if (!all.length) return <div className="card empty">{t('No run with a heart rate yet.')}</div>;
  const weeks = period[1] === null ? all : all.slice(-period[1]);
  const shares = intensityShares(weeks);
  const ranges = zoneRanges('heartRate', hrZones);
  const n = ranges.length;
  const zoneName = (k: number) => { const r = ranges[k]; return `Z${k + 1} ${r.lo === null ? `< ${r.hi}` : r.hi === null ? `≥ ${r.lo}` : `${r.lo}–${r.hi}`}`; };
  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label={t('Weeks shown')}>
          {PERIODS.map((p) => <button key={p[0]} type="button" role="radio" aria-checked={period[0] === p[0]} className={period[0] === p[0] ? 'on' : ''} onClick={() => setPeriod(p)}>{t(p[0])}</button>)}
        </div>
      </div>
      <div className="card chart">
        <dl className="form-figures" aria-label={t('Intensity shares')}>
          <div><dt>{t('Low (Z1–Z2)')}</dt><dd className="tnum">{pct(shares.low)}</dd></div>
          <div><dt>{t('Moderate (Z3)')}</dt><dd className="tnum">{pct(shares.moderate)}</dd></div>
          <div><dt>{t('High (Z4+)')}</dt><dd className="tnum">{pct(shares.high)}</dd></div>
          <div><dt>{t('Time with heart rate')}</dt><dd className="tnum">{number(Math.round(shares.seconds / 3600))} <span className="unit">h</span></dd></div>
        </dl>
        <div className="intensity-bar" role="img" aria-label={t('Low {low}, moderate {moderate}, high {high}; reference 80 % low', { low: pct(shares.low), moderate: pct(shares.moderate), high: pct(shares.high) })}>
          <span style={{ width: width(shares.low), background: zoneColor(0, 3) }} />
          <span style={{ width: width(shares.moderate), background: zoneColor(1, 3) }} />
          <span style={{ width: width(shares.high), background: zoneColor(2, 3) }} />
          <i className="intensity-ref" style={{ left: '80%' }} title={t('80/20: about 80 % of the time at low intensity')} />
        </div>
        <h3 className="chart-title" style={{ marginTop: 16 }}>{t('Time in the heart rate zones')}</h3>
        <TimeChart label={t('Time in the heart rate zones')} times={weeks.map((w) => time(w.start))} height={240}
          series={Array.from({ length: n }, (_, k) => ({ key: `z${k + 1}`, label: zoneName(k), stack: 'zones', kind: 'bar' as const, color: zoneColor(k, n), values: weeks.map((w) => (w.seconds[k] ?? 0) / 3600) }))}
          format={(v) => `${number(v, 1)} h`} tick={(v) => `${number(v)} h`} />
      </div>
    </>
  );
}

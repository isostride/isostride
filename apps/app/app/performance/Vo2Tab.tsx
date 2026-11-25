'use client';

import { useMemo } from 'react';
import { number, t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { HR_VO2_MEDIAN_DAYS, autoMaxHr, hrVo2Now, hrVo2Runs, uthVo2max, type LoadSummary } from '@/lib/load';
import type { PerformanceSettings } from '@/lib/settings';
import { TimeChart } from './TimeChart';

const DAY = 86_400_000;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/**
 * VO2max from heart rate (requirement "VO2max estimates"): the estimate of each run that is long
 * and hard enough, its running median, and Uth's ratio for reference. The VDOT from the bests stands
 * with the efforts it rests on, in Capacity.
 */
export function Vo2Tab({ runs, summaries, performance }: { runs: RunsIndex['runs']; summaries: Record<string, LoadSummary>; performance: PerformanceSettings }) {
  const maxHr = performance.maxHr ?? autoMaxHr(Object.values(summaries));
  const restHr = performance.restHr;
  const perRun = useMemo(() => (maxHr ? hrVo2Runs(runs, summaries, restHr, maxHr) : []), [runs, summaries, restHr, maxHr]);
  if (!maxHr || !perRun.length) return <div className="card empty">{t('No run long and hard enough yet (20 minutes or more at half the heart rate reserve or more).')}</div>;
  const now = hrVo2Now(perRun);
  const uth = uthVo2max(restHr, maxHr);
  const times = perRun.map((p) => Date.parse(p.startTime));
  const trend = perRun.map((p, i) => median(perRun.filter((q, j) => j <= i && Date.parse(q.startTime) > times[i] - HR_VO2_MEDIAN_DAYS * DAY).map((q) => q.vo2max)));
  return (
    <div className="card chart">
      <dl className="form-figures" aria-label={t('VO2max now')}>
        <div><dt>{t('VO2max from heart rate')}</dt><dd className="tnum">{now.value == null ? '–' : number(now.value, 1)}</dd></div>
        <div><dt>{t('Uth ratio')}</dt><dd className="tnum">{number(uth, 1)}</dd></div>
      </dl>
      <h3 className="chart-title">{t('VO2max from heart rate')}</h3>
      <TimeChart label={t('VO2max from heart rate over time')} times={times} height={240} guide={{ value: uth, label: t('Uth {value}', { value: number(uth) }) }}
        series={[
          { key: 'hr', label: t('run'), color: 'var(--series-2)', kind: 'dots', values: perRun.map((p) => p.vo2max) },
          { key: 'median', label: t('{days}-day median', { days: HR_VO2_MEDIAN_DAYS }), color: 'var(--series-3)', kind: 'line', values: trend },
        ]}
        format={(v) => `${number(v, 1)} ml/kg/min`} tick={(v) => number(Math.round(v))} />
    </div>
  );
}

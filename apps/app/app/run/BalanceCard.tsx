'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Key, clock, niceTicks, timeTicks, useDialogKeys, useWidth } from '@/components';
import { pace as fmtPace } from '@/lib/format';
import { number, t } from '@/lib/i18n';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import { metricSeries, type RunFile, type RunsIndex } from '@/lib/kernel';
import { criticalSeries, reserveBalance, type CriticalAt, type LoadSummary } from '@/lib/load';

const M = { l: 44, r: 14, t: 12, b: 24 };
const HEIGHT = 180;
/** The chart is drawn from about this many points: a sample a second is more than its width shows. */
const POINTS = 600;

/**
 * The D′ balance of a run (requirement "D′ balance of a run") in a dialog opened from the run's head, so
 * the Run screen keeps its one-screen layout: how much of the reserve above the critical speed is left
 * through the run (Skiba et al. 2015), and of W′ above the critical power when the run has power; each
 * against the critical speed and power of the 90 days before the run, the run itself left out: a run
 * that goes past what the earlier bests implied then shows under 0 %.
 */
export function BalanceDialog({ run, folder, onClose }: { run: RunFile; folder: DataFolder; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useDialogKeys(dialog, close, onClose);
  return (
    <div className="route-expanded-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} className="balance-dialog" role="dialog" aria-modal="true" aria-label={t('D′ balance')}>
        <div className="route-expanded-head">
          <h2>{t('D′ balance')}</h2>
          <button ref={close} type="button" className="btn sm" onClick={onClose}>{t('Close')}</button>
        </div>
        <BalanceCard run={run} folder={folder} />
      </div>
    </div>
  );
}

function BalanceCard({ run, folder }: { run: RunFile; folder: DataFolder }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [{ speed, power, loaded }, setCritical] = useState<{ speed: CriticalAt | null; power: CriticalAt | null; loaded: boolean }>({ speed: null, power: null, loaded: false });
  // From the summaries and the index alone, as the load model takes its thresholds, but without this run: no other run file is read.
  useEffect(() => {
    let live = true;
    Promise.all([readJson<RunsIndex>(folder, PATHS.runsIndex), readJson<{ runs: Record<string, LoadSummary> }>(folder, PATHS.loadSummaries)]).then(([idx, sums]) => {
      if (!live) return;
      if (!idx || !sums) { setCritical({ speed: null, power: null, loaded: true }); return; }
      setCritical({ speed: criticalSeries(idx.runs, sums.runs, 'speed', true)[run.id] ?? null, power: criticalSeries(idx.runs, sums.runs, 'power', true)[run.id] ?? null, loaded: true });
    }).catch(() => live && setCritical({ speed: null, power: null, loaded: true }));
    return () => { live = false; };
  }, [folder, run.id]);
  const lines = useMemo(() => {
    const { t: ts } = run.samples;
    const effort = metricSeries(run.samples, 'effortPace');
    const pace = effort.some((v) => v !== null && v > 0) ? effort : metricSeries(run.samples, 'speed');
    const watts = metricSeries(run.samples, 'power');
    const out: { key: string; label: string; color: string; balance: ReturnType<typeof reserveBalance>; critical: string }[] = [];
    if (speed && pace.some((v) => v !== null && v > 0)) {
      out.push({ key: 'speed', label: t('D′ (pace)'), color: 'var(--series-1)', balance: reserveBalance(ts, pace, speed.rate, speed.reserve), critical: t('critical speed {pace} /km, D′ {reserve} m', { pace: fmtPace(speed.rate), reserve: number(Math.round(speed.reserve)) }) });
    }
    if (power && watts.some((v) => v !== null && v > 0)) {
      out.push({ key: 'power', label: t('W′ (power)'), color: 'var(--series-2)', balance: reserveBalance(ts, watts, power.rate, power.reserve), critical: t('critical power {power} W, W′ {reserve} kJ', { power: number(Math.round(power.rate)), reserve: number(power.reserve / 1000, 1) }) });
    }
    return out;
  }, [run, speed, power]);
  if (!loaded) return <p className="muted small" role="status">{t('Reading the critical speed of the 90 days before this run…')}</p>;
  if (!lines.length) return <p className="chart-note">{t('No critical speed for this run yet: it takes bests of 2–20 minutes within 90 days that show all-out short efforts (Performance, Capacity).')}</p>;

  // Where the thresholds come from: the 90 days before the run, held from older bests, or the first one after it.
  const froms = [speed, power].filter((c): c is CriticalAt => c !== null).map((c) => c.from);
  const origin = froms.includes('first') ? 'first' : froms.includes('held') ? 'held' : 'own';
  const end = run.samples.t[run.samples.t.length - 1] ?? 1;
  const lowest = Math.min(0, ...lines.map((l) => l.balance.low?.share ?? 1));
  const ticks = niceTicks(lowest * 100, 100, 4);
  const [lo, hi] = [Math.min(ticks[0], lowest * 100), Math.max(ticks[ticks.length - 1], 100)];
  const w = Math.max(200, width);
  const x = (s: number) => M.l + (s / end) * (w - M.l - M.r);
  const y = (pct: number) => M.t + ((hi - pct) / (hi - lo)) * (HEIGHT - M.t - M.b);
  const path = (b: ReturnType<typeof reserveBalance>) => {
    const step = Math.max(1, Math.floor(b.t.length / POINTS));
    let d = '';
    for (let i = 0; i < b.t.length; i += step) d += `${d ? 'L' : 'M'}${x(b.t[i]).toFixed(1)},${y(b.share[i] * 100).toFixed(1)}`;
    return d;
  };
  const words = lines.map((l) => t('{what}: lowest {share} at {time}', { what: l.label, share: `${number(Math.round((l.balance.low?.share ?? 1) * 100))} %`, time: clock(l.balance.low?.t ?? 0) })).join('; ');

  return (
    <div className="balance-card">
      <h3 className="chart-title">{t('Reserve above the critical speed')} <span className="muted">· {lines.map((l) => l.critical).join(' · ')}</span></h3>
      <dl className="form-figures" aria-label={t('Lowest reserve')}>
        {lines.map((l) => (
          <div key={l.key}><dt>{t('{what}, lowest', { what: l.label })}</dt><dd className="tnum">{number(Math.round((l.balance.low?.share ?? 1) * 100))} %</dd><dd className="muted sub">{t('at {time}', { time: clock(l.balance.low?.t ?? 0) })}</dd></div>
        ))}
      </dl>
      <div ref={ref}>
      <svg width={w} height={HEIGHT} role="img" aria-label={t('Reserve above the critical speed through the run: {words}', { words })}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{number(v)} %</text>
          </g>
        ))}
        {timeTicks(end).map((s) => <text key={s} x={x(s)} y={HEIGHT - 6} textAnchor="middle" fontSize="11" fill="var(--muted)" className="tnum">{clock(s)}</text>)}
        {lines.map((l) => (
          <g key={l.key} data-balance={l.key}>
            <path d={path(l.balance)} fill="none" stroke={l.color} strokeWidth={2} />
            {l.balance.low && <circle cx={x(l.balance.low.t)} cy={y(l.balance.low.share * 100)} r={4} fill={l.color} stroke="var(--surface)" strokeWidth={2} />}
          </g>
        ))}
      </svg>
      </div>
      {lines.length > 1 && <div className="chart-legend">{lines.map((l) => <Key key={l.key} color={l.color} label={l.label} />)}</div>}
      <p className="chart-note" data-threshold={origin}>
        {t('How much of the reserve above the critical speed (D′) is left through the run: spent above it, coming back below it (Skiba 2015). The critical speed and D′ are those of the bests of the 90 days before this run, without it: under 0 % the run went past what they implied.')}
        {origin === 'held' ? <>{' '}{t('Those 90 days show no all-out short efforts, so the last critical speed before them holds.')}</> : null}
        {origin === 'first' ? <>{' '}{t('No bests before this run settle a critical speed: it is read against the first one after it, which may rest on this run, and then it cannot go under 0 %.')}</> : null}
      </p>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Key, dayLabel, monthLabel, monthTicks, niceTicks, useWidth } from '@/components';
import { useOpenFolder } from '@/lib/client';
import type { RunsIndex } from '@/lib/kernel';
import { ACWR_DAYS, formSeries, type FormDay } from '@/lib/load';
import { DEFAULT_PERFORMANCE, LOAD_MODELS, readSettings, type PerformanceSettings } from '@/lib/settings';

/** The periods the chart shows, kept in the link (period=90, 365 or all). */
const PERIODS: [string, string, number | null][] = [['90', '90 days', 90], ['365', '1 year', 365], ['all', 'All', null]];
/** The acute:chronic ratio's band of steady build-up (Gabbett 2016), a guide. */
const ACWR_BAND: [number, number] = [0.8, 1.3];
const M = { l: 52, r: 16 };
const PANELS = { load: 200, form: 110, acwr: 90, gap: 40, axis: 22, title: 22 };

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const timeOf = (day: string) => new Date(`${day}T12:00:00`).getTime();
const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

/**
 * The Form tab of Analysis (requirement "Form over time"): the daily load of the model chosen in
 * Settings, fitness (CTL) and fatigue (ATL), form (TSB) and the acute:chronic ratio, over the
 * period chosen, with today's values. Loaded when the tab opens.
 */
export function FormTab({ runs }: { runs: RunsIndex['runs'] }) {
  const { folder } = useOpenFolder();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [p, setP] = useState<PerformanceSettings>(DEFAULT_PERFORMANCE);
  const [hover, setHover] = useState<number | null>(null);
  const [box, width] = useWidth();
  useEffect(() => { readSettings(folder).then((s) => setP(s.performance)).catch(() => undefined); }, [folder]);

  const period = PERIODS.find(([k]) => k === params.get('period')) ?? PERIODS[0];
  const setPeriod = (k: string) => {
    const q = new URLSearchParams(params.toString());
    if (k === PERIODS[0][0]) q.delete('period'); else q.set('period', k);
    router.replace(`${path}?${q.toString()}`);
  };
  const model = LOAD_MODELS.find((m) => m.key === p.load)!;
  const withLoad = runs.filter((r) => typeof r.load === 'number');
  const estimated = withLoad.filter((r) => r.loadEstimated).length;
  const today = localDay(new Date());
  const all = useMemo(() => formSeries(withLoad.map((r) => ({ startTime: r.startTime, load: r.load as number })), p, today),
    // withLoad follows runs.
    [runs, p, today]);
  const days: FormDay[] = period[2] === null ? all : all.slice(-period[2]);
  const now = all[all.length - 1];

  if (!withLoad.length) {
    return <div className="card empty">No run has a load yet. Import runs, or open <Link href="/settings">Settings</Link> and save the performance model to compute the loads.</div>;
  }

  const t0 = timeOf(days[0].date);
  const t1 = timeOf(days[days.length - 1].date);
  const x = (day: string) => M.l + ((timeOf(day) - t0) / Math.max(1, t1 - t0)) * (width - M.l - M.r);
  const step = (width - M.l - M.r) / Math.max(1, days.length - 1);
  const top = { load: PANELS.title, form: PANELS.title + PANELS.load + PANELS.gap, acwr: PANELS.title + PANELS.load + PANELS.gap + PANELS.form + PANELS.gap };
  const H = top.acwr + PANELS.acwr + PANELS.axis;

  // Load, fitness and fatigue share one scale: fitness and fatigue are averages of the daily load.
  // Each scale covers its data and its ticks, so no bar or line leaves its panel.
  const loadMax = Math.max(1, ...days.map((d) => Math.max(d.load, d.fitness, d.fatigue)));
  const loadTicks = niceTicks(0, loadMax, 4).filter((v) => v >= 0);
  const loadHi = Math.max(loadMax, loadTicks[loadTicks.length - 1] ?? loadMax);
  const yLoad = (v: number) => top.load + PANELS.load - (v / loadHi) * PANELS.load;
  const [formMin, formMax] = [Math.min(0, ...days.map((d) => d.form)), Math.max(0, ...days.map((d) => d.form))];
  const formTicks = niceTicks(formMin, formMax, 3).filter((v) => v >= formMin - 1e-9 && v <= formMax + 1e-9);
  const [fLo, fHi] = [formMin, formMax > formMin ? formMax : formMin + 1];
  const yForm = (v: number) => top.form + PANELS.form - ((v - fLo) / (fHi - fLo)) * PANELS.form;
  const acwrs = days.map((d) => d.acwr).filter((v): v is number => v !== null);
  const [aLo, aHi] = [Math.min(0.5, ...acwrs), Math.max(1.6, ...acwrs)];
  const yAcwr = (v: number) => top.acwr + PANELS.acwr - ((v - aLo) / (aHi - aLo)) * PANELS.acwr;
  const line = (f: (d: FormDay) => number | null, y: (v: number) => number) => days.flatMap((d) => { const v = f(d); return v === null ? [] : [`${x(d.date).toFixed(1)},${y(v).toFixed(1)}`]; }).join(' ');
  const months = monthTicks(t0, t1);
  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.round((e.clientX - r.left - M.l) / Math.max(step, 1e-9));
    setHover(Math.min(days.length - 1, Math.max(0, k)));
  };
  const h = hover === null ? null : days[hover];
  const band = (v: number | null) => (v === null ? '' : v < ACWR_BAND[0] ? 'below the band: load falling' : v > ACWR_BAND[1] ? 'above the band: load rising fast' : 'in the band of steady build-up');

  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Period">
          {PERIODS.map(([k, name]) => <button key={k} type="button" role="radio" aria-checked={period[0] === k} className={period[0] === k ? 'on' : ''} onClick={() => setPeriod(k)}>{name}</button>)}
        </div>
        <span className="muted small">Load by <b>{model.name}</b> ({model.unit}), fitness τ {p.fitnessDays} d, fatigue τ {p.fatigueDays} d · <Link href="/settings">change in Settings</Link></span>
      </div>
      <div className="card chart">
        <dl className="form-figures" aria-label="Form today">
          <div><dt>Fitness (CTL)</dt><dd className="tnum">{Math.round(now.fitness)}</dd><span className="muted">{model.unit} a day, {p.fitnessDays}-day average</span></div>
          <div><dt>Fatigue (ATL)</dt><dd className="tnum">{Math.round(now.fatigue)}</dd><span className="muted">{p.fatigueDays}-day average</span></div>
          <div><dt>Form (TSB)</dt><dd className="tnum">{signed(now.fitness - now.fatigue)}</dd><span className="muted">fitness − fatigue, tomorrow morning</span></div>
          <div><dt>Acute:chronic</dt><dd className="tnum">{now.acwr === null ? '–' : now.acwr.toFixed(2)}</dd><span className="muted">{now.acwr === null ? `needs ${ACWR_DAYS[1]} days` : band(now.acwr)}</span></div>
          <div><dt>Load, last 7 days</dt><dd className="tnum">{Math.round(all.slice(-7).reduce((s, d) => s + d.load, 0))}</dd><span className="muted">{model.unit}</span></div>
        </dl>
        <div className="form-keys">
          <Key color="var(--axis)" label="daily load" kind="dot" />
          <Key color="var(--series-1)" label="fitness (CTL)" />
          <Key color="var(--series-2)" label="fatigue (ATL)" />
          <Key color="var(--series-3)" label="form (TSB)" />
          <Key color="var(--series-4)" label="acute:chronic" />
        </div>
        <div ref={box} style={{ position: 'relative' }}>
          <svg width={width} height={H} role="img" aria-label="Form over time" onMouseMove={move} onMouseLeave={() => setHover(null)} style={{ display: 'block' }}>
            {/* Load, fitness and fatigue. */}
            {loadTicks.map((v) => (
              <g key={`l${v}`}>
                <line x1={M.l} x2={width - M.r} y1={yLoad(v)} y2={yLoad(v)} stroke="var(--grid)" />
                <text x={M.l - 8} y={yLoad(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{v}</text>
              </g>
            ))}
            <text x={M.l} y={top.load - 10} fontSize="11" fill="var(--muted)">daily load, fitness and fatigue · {model.unit}</text>
            {days.map((d) => d.load > 0 && <rect key={d.date} className="form-load" x={x(d.date) - Math.max(1, step * 0.35)} width={Math.max(2, step * 0.7)} y={yLoad(d.load)} height={top.load + PANELS.load - yLoad(d.load)} rx={1} fill="var(--axis)" />)}
            <polyline className="form-fitness" points={line((d) => d.fitness, yLoad)} fill="none" stroke="var(--series-1)" strokeWidth="2" />
            <polyline className="form-fatigue" points={line((d) => d.fatigue, yLoad)} fill="none" stroke="var(--series-2)" strokeWidth="2" />
            {/* Form, around zero. */}
            <text x={M.l} y={top.form - 12} fontSize="11" fill="var(--muted)">form (TSB)</text>
            {formTicks.map((v) => (
              <g key={`f${v}`}>
                <line x1={M.l} x2={width - M.r} y1={yForm(v)} y2={yForm(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} />
                <text x={M.l - 8} y={yForm(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{signed(v)}</text>
              </g>
            ))}
            <polyline className="form-form" points={line((d) => d.form, yForm)} fill="none" stroke="var(--series-3)" strokeWidth="2" />
            {/* The acute:chronic ratio, its band of steady build-up. */}
            <text x={M.l} y={top.acwr - 12} fontSize="11" fill="var(--muted)">acute:chronic</text>
            <rect x={M.l} width={width - M.l - M.r} y={yAcwr(ACWR_BAND[1])} height={yAcwr(ACWR_BAND[0]) - yAcwr(ACWR_BAND[1])} fill="var(--band)" />
            {ACWR_BAND.map((v) => <text key={`a${v}`} x={M.l - 8} y={yAcwr(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{v.toFixed(1)}</text>)}
            <polyline className="form-acwr" points={line((d) => d.acwr, yAcwr)} fill="none" stroke="var(--series-4)" strokeWidth="2" />
            {/* The time axis. */}
            <line x1={M.l} x2={width - M.r} y1={H - PANELS.axis} y2={H - PANELS.axis} stroke="var(--axis)" />
            {(months.length > 1 ? months : [t0, t1]).map((t) => {
              const px = M.l + ((t - t0) / Math.max(1, t1 - t0)) * (width - M.l - M.r);
              return <text key={t} x={px} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="middle">{months.length > 1 ? monthLabel(t) : dayLabel(t)}</text>;
            })}
            {h && <line x1={x(h.date)} x2={x(h.date)} y1={top.load} y2={H - PANELS.axis} stroke="var(--axis)" />}
            {h && <circle cx={x(h.date)} cy={yLoad(h.fitness)} r={4} fill="var(--surface)" stroke="var(--series-1)" strokeWidth="2" />}
            {h && <circle cx={x(h.date)} cy={yLoad(h.fatigue)} r={4} fill="var(--surface)" stroke="var(--series-2)" strokeWidth="2" />}
            {h && <circle cx={x(h.date)} cy={yForm(h.form)} r={4} fill="var(--surface)" stroke="var(--series-3)" strokeWidth="2" />}
          </svg>
          {h && (
            <div className="tooltip" style={{ left: x(h.date) > width - 260 ? x(h.date) - 248 : x(h.date) + 14, top: 8 }}>
              <div className="tip-value">{dayLabel(timeOf(h.date))}</div>
              <div>load {Math.round(h.load)} {model.unit}</div>
              <div>fitness {Math.round(h.fitness)} · fatigue {Math.round(h.fatigue)}</div>
              <div>form that morning {signed(h.form)}</div>
              <div>acute:chronic {h.acwr === null ? '–' : h.acwr.toFixed(2)}</div>
            </div>
          )}
        </div>
        <div className="chart-note">
          Bars: the load of each day by {model.name}{estimated ? `; ${estimated} run${estimated === 1 ? '' : 's'} without what the model needs counted from ${estimated === 1 ? 'its' : 'their'} duration` : ''}. Fitness and fatigue: averages of the daily load weighted exponentially over {p.fitnessDays} and {p.fatigueDays} days (Banister’s fitness–fatigue model); form: fitness − fatigue of the day before, below zero while training outweighs recovery. Acute:chronic: the {ACWR_DAYS[0]}- over the {ACWR_DAYS[1]}-day average, the band {ACWR_BAND[0]}–{ACWR_BAND[1]} a guide to a steady build-up (Gabbett 2016), not a verdict.
        </div>
      </div>
    </>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Key, TipRow, WashGradient, columnPath, dayLabel, monthLabel, monthTicks, niceTicks, useSvgId, useWidth } from '@/components';
import { useOpenFolder } from '@/lib/client';
import { msg, number, t } from '@/lib/i18n';
import type { RunsIndex } from '@/lib/kernel';
import { formSeed, formSeries, type FormDay } from '@/lib/load';
import { DEFAULT_PERFORMANCE, LOAD_MODELS, readSettings, type PerformanceSettings } from '@/lib/settings';

/** The periods the chart shows, kept in the link (period=90, 365 or all). */
const PERIODS: [string, string, number | null][] = [['90', msg('90 days'), 90], ['365', msg('1 year'), 365], ['all', msg('All'), null]];
/** The acute:chronic ratio's band of steady build-up (Gabbett 2016), a guide. */
const ACWR_BAND: [number, number] = [0.8, 1.3];
const M = { l: 52, r: 16 };
const PANELS = { load: 200, form: 110, acwr: 90, gap: 40, axis: 22, title: 22 };

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const timeOf = (day: string) => new Date(`${day}T12:00:00`).getTime();
/** A whole number with its sign: +5, -3, 0 (a rounded -0.3 is 0). */
const signed = (v: number) => `${v > 0 ? '+' : ''}${number(Math.round(v) || 0)}`;

/**
 * The Form tab of Performance (requirement "Form over time"): the daily load of the model chosen in
 * Settings, fitness (CTL) and fatigue (ATL), form (TSB) and the acute:chronic ratio, over the
 * period chosen, with today's values. Loaded when the tab opens.
 */
export function FormTab({ runs, whatIf }: { runs: RunsIndex['runs']; /** a scenario of What if: its runs, drawn after today */ whatIf?: { planned: { startTime: string; load: number }[]; from: string; until: string } }) {
  const { folder } = useOpenFolder();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [p, setP] = useState<PerformanceSettings>(DEFAULT_PERFORMANCE);
  const [hover, setHover] = useState<number | null>(null);
  const [box, width] = useWidth();
  const washId = useSvgId('form-wash');
  useEffect(() => { readSettings(folder).then((s) => setP(s.performance)).catch(() => undefined); }, [folder]);

  const period = PERIODS.find(([k]) => k === params.get('period')) ?? PERIODS[0];
  const setPeriod = (k: string) => {
    const q = new URLSearchParams(params.toString());
    if (k === PERIODS[0][0]) q.delete('period'); else q.set('period', k);
    router.replace(`${path}?${q.toString()}`);
  };
  const model = LOAD_MODELS.find((m) => m.key === p.load)!;
  const withLoad = runs.filter((r) => typeof r.load === 'number');
  const today = localDay(new Date());
  const all = useMemo(() => {
    const past = withLoad.map((r) => ({ startTime: r.startTime, load: r.load as number }));
    // A scenario's days do not move where the averages start: those of the runs alone (lib/load whatif.ts).
    return formSeries([...past, ...(whatIf?.planned ?? [])], p, whatIf?.until ?? today, whatIf ? formSeed(past, today) : undefined);
  },
    // withLoad follows runs.
    [runs, p, today, whatIf]);
  // With a scenario of What if the period is the past before it, the scenario's days after.
  const ahead = whatIf ? all.filter((d) => d.date >= whatIf.from).length : 0;
  const days: FormDay[] = period[2] === null ? all : all.slice(-(period[2] + ahead));
  const now = all[all.length - 1];

  if (!withLoad.length) {
    return <div className="card empty">{t('No run has a load yet. Import runs, or open the')} <Link href="/performance?tab=model">{t('Model')}</Link> {t('tab and save it to compute the loads.')}</div>;
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
  const last = days[days.length - 1];
  const xs = (d: FormDay) => x(d.date).toFixed(1);
  // The wash under fitness, down to the panel's base; the area of form between its line and zero.
  const fitnessArea = `M${xs(days[0])},${yLoad(0)}${days.map((d) => `L${xs(d)},${yLoad(d.fitness).toFixed(1)}`).join('')}L${xs(last)},${yLoad(0)}Z`;
  const formArea = `M${xs(days[0])},${yForm(0)}${days.map((d) => `L${xs(d)},${yForm(d.form).toFixed(1)}`).join('')}L${xs(last)},${yForm(0)}Z`;
  const barW = Math.max(2, Math.min(10, step * 0.6));
  const plannedFrom = whatIf && whatIf.from >= days[0].date ? x(whatIf.from) - step / 2 : null;
  const planned = (d: FormDay) => !!whatIf && d.date >= whatIf.from;
  const ends: [string, number | null, (v: number) => number][] = [['var(--series-1)', last.fitness, yLoad], ['var(--series-2)', last.fatigue, yLoad], ['var(--series-3)', last.form, yForm], ['var(--series-4)', last.acwr, yAcwr]];

  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label={t('Period')}>
          {PERIODS.map(([k, name]) => <button key={k} type="button" role="radio" aria-checked={period[0] === k} className={period[0] === k ? 'on' : ''} onClick={() => setPeriod(k)}>{t(name)}</button>)}
        </div>
      </div>
      <div className="card chart">
        {!whatIf && <dl className="form-figures" aria-label={t('Form today')}>
          <div><dt>{t('Fitness (CTL)')}</dt><dd className="tnum">{number(Math.round(now.fitness))}</dd></div>
          <div><dt>{t('Fatigue (ATL)')}</dt><dd className="tnum">{number(Math.round(now.fatigue))}</dd></div>
          <div><dt>{t('Form (TSB)')}</dt><dd className="tnum">{signed(now.fitness - now.fatigue)}</dd></div>
          <div><dt>{t('Acute:chronic')}</dt><dd className="tnum">{now.acwr === null ? '–' : number(now.acwr, 2)}</dd></div>
          <div><dt>{t('Load, last 7 days')}</dt><dd className="tnum">{number(Math.round(all.slice(-7).reduce((s, d) => s + d.load, 0)))} <span className="unit">{model.unit}</span></dd></div>
        </dl>}
        <div className="form-keys">
          <Key color="var(--axis)" label={t('daily load')} kind="dot" />
          <Key color="var(--series-1)" label={t('fitness (CTL)')} />
          <Key color="var(--series-2)" label={t('fatigue (ATL)')} />
          <Key color="var(--series-3)" label={t('form (TSB)')} />
          <Key color="var(--series-4)" label={t('acute:chronic')} />
        </div>
        <div ref={box} style={{ position: 'relative' }}>
          <svg width={width} height={H} role="img" aria-label={t('Form over time')} onMouseMove={move} onMouseLeave={() => setHover(null)} style={{ display: 'block' }}>
            {/* The days of the scenario: a band from tomorrow, its name at its top. */}
            {plannedFrom !== null && (
              <g className="form-whatif">
                <rect x={plannedFrom} width={Math.max(0, width - M.r - plannedFrom)} y={top.load - 4} height={H - PANELS.axis - top.load + 4} fill="var(--band)" opacity={0.6} />
                <text x={width - M.r - 6} y={top.load + 10} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--muted)">{t('What if')}</text>
              </g>
            )}
            {/* Load, fitness and fatigue. */}
            {loadTicks.map((v) => (
              <g key={`l${v}`}>
                <line x1={M.l} x2={width - M.r} y1={yLoad(v)} y2={yLoad(v)} stroke="var(--grid)" />
                <text x={M.l - 8} y={yLoad(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{number(v)}</text>
              </g>
            ))}
            <defs><WashGradient id={washId} color="var(--series-1)" top={top.load} base={yLoad(0)} strength={0.2} /></defs>
            <text x={M.l} y={top.load - 10} className="panel-title">{t('Daily load, fitness and fatigue')} <tspan fill="var(--muted)" fontWeight="400">· {model.unit}</tspan></text>
            {days.map((d, i) => d.load > 0 && <path key={d.date} className="form-load" d={columnPath(x(d.date) - barW / 2, barW, yLoad(d.load), yLoad(0), 2)} fill={planned(d) ? 'var(--series-2)' : 'var(--axis)'} opacity={(hover === null || hover === i ? 1 : 0.5) * (planned(d) ? 0.55 : 1)} />)}
            <path className="form-fitness-wash" d={fitnessArea} fill={`url(#${washId})`} />
            <polyline className="form-fitness" points={line((d) => d.fitness, yLoad)} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <polyline className="form-fatigue" points={line((d) => d.fatigue, yLoad)} fill="none" stroke="var(--series-2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {/* Form, around zero. */}
            <text x={M.l} y={top.form - 12} className="panel-title">{t('Form')} <tspan fill="var(--muted)" fontWeight="400">· {t('TSB, fitness less fatigue')}</tspan></text>
            <path className="form-form-area" d={formArea} fill="var(--series-3)" opacity={0.12} />
            {formTicks.map((v) => (
              <g key={`f${v}`}>
                <line x1={M.l} x2={width - M.r} y1={yForm(v)} y2={yForm(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} />
                <text x={M.l - 8} y={yForm(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{signed(v)}</text>
              </g>
            ))}
            <polyline className="form-form" points={line((d) => d.form, yForm)} fill="none" stroke="var(--series-3)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {/* The acute:chronic ratio, its band of steady build-up. */}
            <text x={M.l} y={top.acwr - 12} className="panel-title">{t('Acute:chronic')} <tspan fill="var(--muted)" fontWeight="400">· {t('the band of steady build-up, {lo}–{hi}', { lo: number(ACWR_BAND[0]), hi: number(ACWR_BAND[1]) })}</tspan></text>
            <rect x={M.l} width={width - M.l - M.r} y={yAcwr(ACWR_BAND[1])} height={yAcwr(ACWR_BAND[0]) - yAcwr(ACWR_BAND[1])} rx={4} fill="var(--band)" />
            {ACWR_BAND.map((v) => <text key={`a${v}`} x={M.l - 8} y={yAcwr(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{number(v, 1)}</text>)}
            <polyline className="form-acwr" points={line((d) => d.acwr, yAcwr)} fill="none" stroke="var(--series-4)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {/* The time axis. */}
            <line x1={M.l} x2={width - M.r} y1={H - PANELS.axis} y2={H - PANELS.axis} stroke="var(--axis)" />
            {(months.length > 1 ? months : [t0, t1]).map((t) => {
              const px = M.l + ((t - t0) / Math.max(1, t1 - t0)) * (width - M.l - M.r);
              return <text key={t} x={px} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="middle">{months.length > 1 ? monthLabel(t) : dayLabel(t)}</text>;
            })}
            {/* The end of each line, today: a dot with a surface ring. */}
            {!h && ends.map(([c, v, yy]) => v === null ? null : <circle key={c} className="form-end" cx={x(last.date)} cy={yy(v)} r={4.5} fill={c} stroke="var(--surface)" strokeWidth="2" />)}
            {h && <line x1={x(h.date)} x2={x(h.date)} y1={top.load} y2={H - PANELS.axis} stroke="var(--axis-strong)" />}
            {h && <circle cx={x(h.date)} cy={yLoad(h.fitness)} r={5} fill="var(--surface)" stroke="var(--series-1)" strokeWidth="2.5" />}
            {h && <circle cx={x(h.date)} cy={yLoad(h.fatigue)} r={5} fill="var(--surface)" stroke="var(--series-2)" strokeWidth="2.5" />}
            {h && <circle cx={x(h.date)} cy={yForm(h.form)} r={5} fill="var(--surface)" stroke="var(--series-3)" strokeWidth="2.5" />}
            {h && h.acwr !== null && <circle cx={x(h.date)} cy={yAcwr(h.acwr)} r={5} fill="var(--surface)" stroke="var(--series-4)" strokeWidth="2.5" />}
          </svg>
          {h && (
            <div className="tooltip" style={{ left: x(h.date) > width - 260 ? x(h.date) - 248 : x(h.date) + 14, top: 8 }}>
              <div className="tip-value">{dayLabel(timeOf(h.date))}{planned(h) && <span className="muted"> · {t('what if')}</span>}</div>
              <TipRow kind="dot" color="var(--axis)" label={t('load')} value={`${number(Math.round(h.load))} ${model.unit}`} />
              <TipRow color="var(--series-1)" label={t('fitness')} value={number(Math.round(h.fitness))} />
              <TipRow color="var(--series-2)" label={t('fatigue')} value={number(Math.round(h.fatigue))} />
              <TipRow color="var(--series-3)" label={t('form that morning')} value={signed(h.form)} />
              <TipRow color="var(--series-4)" label={t('acute:chronic')} value={h.acwr === null ? '–' : number(h.acwr, 2)} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

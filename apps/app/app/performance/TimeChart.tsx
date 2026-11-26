'use client';

import { useState, type MouseEvent } from 'react';
import { t } from '@/lib/i18n';
import { Key, TipRow, WashGradient, columnPath, coverTicks, dayLabel, monthLabel, monthTicks, tickDecimals, useSvgId, useWidth } from '@/components';

/** One series of a time chart: bars (stacked by `stack`), a line, or dots, its values by point. */
export interface TimeSeries {
  key: string;
  label: string;
  color: string;
  kind: 'bar' | 'line' | 'dots';
  values: (number | null)[];
  /** bars with the same stack are drawn on top of each other */
  stack?: string;
  /** a dot drawn hollow: a value of lesser weight (e.g. a run that was not easy) */
  hollow?: (number | null)[] | boolean[];
}

const M = { l: 56, r: 16, t: 14, b: 24 };
/** Bars no thicker than this (the chart look: thin marks, the slot's rest is air). */
const BAR_MAX = 24;
/** The surface gap between stacked segments, px. */
const GAP = 2;

/**
 * A chart of values over time on one scale (the Performance tabs): bars, lines or dots, a guide
 * line or band, a crosshair and a tooltip with every series at the point under the pointer.
 * The look of every chart: the scale ends on gridlines, bars stand square on their baseline with a
 * rounded data end and a surface gap between stacked parts, a lone line carries a wash beneath it
 * and its last value at its end, dots wear a surface ring; under the pointer the column in view
 * stays full and the rest recede.
 */
export function TimeChart({ label, times, series, format, tick = format, height = 200, invert = false, zero = false, guide, band, note }: {
  label: string;
  /** the time of each point, ms */
  times: number[];
  series: TimeSeries[];
  /** a value in words, for the tooltip */
  format: (v: number, s: TimeSeries) => string;
  /** a value on the axis, with the decimals its ticks need (ticks of 44, 44.5, 45 written as whole numbers read "44, 45, 45") */
  tick?: (v: number, s: TimeSeries, decimals: number) => string;
  height?: number;
  /** the lower, the higher (a pace, a time) */
  invert?: boolean;
  /** the scale includes zero */
  zero?: boolean;
  /** a dashed reference line */
  guide?: { value: number; label: string };
  /** a shaded reference band */
  band?: [number, number];
  note?: string;
}) {
  const [box, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const washId = useSvgId('tc-wash');
  if (!times.length) return <div ref={box} className="muted small" style={{ padding: 12 }}>{t('No data yet.')}</div>;
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const bars = series.filter((s) => s.kind === 'bar');
  const lines = series.filter((s) => s.kind === 'line');
  const gap = times.length > 1 ? Math.min(...times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0)) : 7 * 86_400_000;
  const pad = bars.length ? gap / 2 : 0;
  const x = (t: number) => M.l + ((t - (t0 - pad)) / Math.max(1, t1 + pad - (t0 - pad))) * (width - M.l - M.r);
  // Stacked bars add up per stack; everything shares one scale.
  const stackTop = (i: number, stack: string) => bars.filter((b) => (b.stack ?? b.key) === stack).reduce((s, b) => s + (b.values[i] ?? 0), 0);
  const stackLow = (i: number, stack: string) => bars.filter((b) => (b.stack ?? b.key) === stack).reduce((s, b) => s + Math.min(0, b.values[i] ?? 0), 0);
  const stacks = [...new Set(bars.map((b) => b.stack ?? b.key))];
  const withZero = zero || bars.length > 0;
  const all = [
    ...series.filter((s) => s.kind !== 'bar').flatMap((s) => s.values),
    ...times.flatMap((_, i) => stacks.flatMap((st) => [stackTop(i, st), stackLow(i, st)])),
    ...(guide ? [guide.value] : []), ...(band ?? []), ...(withZero ? [0] : []),
  ].filter((v): v is number => v !== null && Number.isFinite(v));
  const lo0 = Math.min(...all);
  const hi0 = Math.max(...all);
  // The scale ends on gridlines that enclose the data, with a little room over a line's peaks.
  const span = hi0 - lo0 || Math.abs(hi0) * 0.1 || 1;
  const ticks = coverTicks(withZero && lo0 >= 0 ? 0 : lo0 - span * 0.04, hi0 + span * 0.04, 4);
  const lo = ticks[0] ?? lo0;
  const hi = ticks[ticks.length - 1] ?? hi0;
  const H = height;
  const y = (v: number) => { const f = (v - lo) / (hi - lo || 1); return M.t + (invert ? f : 1 - f) * (H - M.t - M.b); };
  const plotTop = M.t;
  const plotBottom = H - M.b;
  const base = withZero ? y(0) : plotBottom;
  const slot = ((width - M.l - M.r) * gap) / Math.max(1, t1 + pad - (t0 - pad));
  const bw = Math.max(2, Math.min(BAR_MAX * stacks.length, slot * 0.62));
  const first = series[0];
  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    let best = 0;
    times.forEach((t, i) => { if (Math.abs(x(t) - mx) < Math.abs(x(times[best]) - mx)) best = i; });
    setHover(best);
  };
  const months = monthTicks(t0 - pad, t1 + pad, width - M.l - M.r);
  // A lone line (no bars, no other line) carries a wash beneath it and its last value at its end.
  const lone = lines.length === 1 && !bars.length ? lines[0] : null;
  const pointsOf = (s: TimeSeries) => s.values.flatMap((v, i) => (v === null ? [] : [[x(times[i]), y(v)] as const]));
  const lastOf = (s: TimeSeries) => { for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return i; return -1; };
  const recede = (i: number) => (hover === null || hover === i ? 1 : 0.45);
  return (
    <div ref={box} className="time-chart" style={{ position: 'relative' }}>
      {series.length > 1 && <div className="chart-legend">{series.map((s) => <Key key={s.key} kind={s.kind === 'line' ? 'line' : 'dot'} color={s.color} label={s.label} />)}</div>}
      <svg width={width} height={H} role="img" aria-label={label} onMouseMove={move} onMouseLeave={() => setHover(null)} style={{ display: 'block' }}>
        {lone && <defs><WashGradient id={washId} color={lone.color} top={plotTop} base={plotBottom} /></defs>}
        {band && <rect x={M.l} width={width - M.l - M.r} y={Math.min(y(band[0]), y(band[1]))} height={Math.abs(y(band[0]) - y(band[1]))} rx={4} fill="var(--band)" />}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke={v === 0 && withZero ? 'var(--axis)' : 'var(--grid)'} />
            <text x={M.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{tick(Number(v.toFixed(tickDecimals(ticks))), first, tickDecimals(ticks))}</text>
          </g>
        ))}
        {guide && (
          <g>
            <line x1={M.l} x2={width - M.r} y1={y(guide.value)} y2={y(guide.value)} stroke="var(--muted)" strokeDasharray="4 4" />
            {/* Above the line, or below it when the line runs along the top. */}
            <text x={width - M.r} y={y(guide.value) < M.t + 14 ? y(guide.value) + 14 : y(guide.value) - 5} textAnchor="end" fontSize="11" fill="var(--muted)">{guide.label}</text>
          </g>
        )}
        {times.map((t, i) => {
          // Stacked bars of each stack, side by side when there are several stacks; a surface gap
          // between the parts of a stack, the data end of its outermost part rounded.
          const w = bw / stacks.length;
          return stacks.map((st, si) => {
            const parts = bars.filter((b) => (b.stack ?? b.key) === st).map((b) => ({ b, v: b.values[i] })).filter((p): p is { b: TimeSeries; v: number } => p.v !== null && p.v !== 0);
            let up = 0;
            let down = 0;
            const lastUp = parts.map((p) => p.v > 0).lastIndexOf(true);
            const lastDown = parts.map((p) => p.v < 0).lastIndexOf(true);
            return parts.map(({ b, v }, k) => {
              const from = v > 0 ? up : down;
              const to = from + v;
              if (v > 0) up = to; else down = to;
              const outer = k === (v > 0 ? lastUp : lastDown);
              const yFrom = y(from);
              const yTo = y(to);
              const toward = Math.sign(yTo - yFrom);
              // The gap is taken from the part's own start, except where it stands on the baseline.
              const start = from === 0 ? yFrom : yFrom + toward * GAP;
              if (Math.abs(yTo - start) < 0.5) return null;
              const bx = x(t) - bw / 2 + si * w;
              const bwid = Math.max(1, w - (stacks.length > 1 ? GAP : 0));
              return outer
                ? <path key={`${b.key}${i}`} className={`tc-bar tc-${b.key}`} d={columnPath(bx, bwid, yTo, start)} fill={b.color} opacity={recede(i)} />
                : <rect key={`${b.key}${i}`} className={`tc-bar tc-${b.key}`} x={bx} width={bwid} y={Math.min(start, yTo)} height={Math.abs(yTo - start)} fill={b.color} opacity={recede(i)} />;
            });
          });
        })}
        {lone && (() => {
          const pts = pointsOf(lone);
          if (pts.length < 2) return null;
          // Down to the zero line, or to the bottom of the plot (an inverted scale too: the wash stays beneath the line).
          const yb = withZero ? base : plotBottom;
          return <path className="tc-wash" d={`M${pts[0][0].toFixed(1)},${yb}${pts.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join('')}L${pts[pts.length - 1][0].toFixed(1)},${yb}Z`} fill={`url(#${washId})`} />;
        })()}
        {lines.map((s) => {
          const pts = pointsOf(s);
          return pts.length > 1 ? <polyline key={s.key} className={`tc-line tc-${s.key}`} points={pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null;
        })}
        {series.filter((s) => s.kind === 'dots').map((s) => s.values.map((v, i) => {
          if (v === null) return null;
          const hollow = Array.isArray(s.hollow) && s.hollow[i];
          return hollow
            ? <circle key={`${s.key}${i}`} className={`tc-dot tc-${s.key}`} cx={x(times[i])} cy={y(v)} r={4} fill="var(--surface)" stroke={s.color} strokeWidth="1.5" />
            : <circle key={`${s.key}${i}`} className={`tc-dot tc-${s.key}`} cx={x(times[i])} cy={y(v)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth="2" />;
        }))}
        {/* The end of each line: a dot with a surface ring; the lone line's last value beside it. */}
        {hover === null && lines.map((s) => {
          const i = lastOf(s);
          if (i < 0) return null;
          const v = s.values[i] as number;
          const cx = x(times[i]);
          const cy = y(v);
          return (
            <g key={`end-${s.key}`} className="tc-end">
              <circle cx={cx} cy={cy} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              {lone === s && <text x={cx - 8} y={cy < M.t + 18 ? cy + 18 : cy - 10} textAnchor="end" fontSize="12" fontWeight="650" fill="var(--text)" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke" className="tc-end-label">{format(v, s)}</text>}
            </g>
          );
        })}
        <line x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" />
        {(months.length > 1 ? months : [t0, t1]).map((t) => <text key={t} x={x(t)} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="middle">{months.length > 1 ? monthLabel(t) : dayLabel(t)}</text>)}
        {hover !== null && <line x1={x(times[hover])} x2={x(times[hover])} y1={M.t} y2={H - M.b} stroke="var(--axis-strong)" />}
        {hover !== null && series.filter((s) => s.kind !== 'bar').map((s) => {
          const v = s.values[hover];
          return v === null ? null : <circle key={`h-${s.key}`} cx={x(times[hover])} cy={y(v)} r={5} fill="var(--surface)" stroke={s.color} strokeWidth="2.5" />;
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: x(times[hover]) > width - 260 ? x(times[hover]) - 248 : x(times[hover]) + 14, top: 8 }}>
          <div className="tip-value">{dayLabel(times[hover])}</div>
          {series.map((s) => { const v = s.values[hover]; return v === null ? null : <TipRow key={s.key} kind={s.kind === 'line' ? 'line' : 'dot'} color={s.color} label={s.label} value={format(v, s)} />; })}
        </div>
      )}
      {note && <div className="chart-note">{note}</div>}
    </div>
  );
}

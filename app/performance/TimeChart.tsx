'use client';

import { useState, type MouseEvent } from 'react';
import { Key, monthLabel, monthTicks, niceTicks, tickDecimals, useWidth, dayLabel } from '@/components';

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

const M = { l: 56, r: 16, t: 10, b: 24 };

/**
 * A chart of values over time on one scale (the Performance tabs): bars, lines or dots, a guide
 * line or band, a crosshair and a tooltip with every series at the point under the pointer.
 */
export function TimeChart({ label, times, series, format, tick = format, height = 200, invert = false, zero = false, guide, band, note }: {
  label: string;
  /** the time of each point, ms */
  times: number[];
  series: TimeSeries[];
  /** a value in words, for the tooltip */
  format: (v: number, s: TimeSeries) => string;
  /** a value on the axis */
  tick?: (v: number, s: TimeSeries) => string;
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
  if (!times.length) return <div ref={box} className="muted small" style={{ padding: 12 }}>No data yet.</div>;
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const bars = series.filter((s) => s.kind === 'bar');
  const gap = times.length > 1 ? Math.min(...times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0)) : 7 * 86_400_000;
  const pad = bars.length ? gap / 2 : 0;
  const x = (t: number) => M.l + ((t - (t0 - pad)) / Math.max(1, t1 + pad - (t0 - pad))) * (width - M.l - M.r);
  // Stacked bars add up per stack; everything shares one scale.
  const stackTop = (i: number, stack: string) => bars.filter((b) => (b.stack ?? b.key) === stack).reduce((s, b) => s + (b.values[i] ?? 0), 0);
  const stacks = [...new Set(bars.map((b) => b.stack ?? b.key))];
  const all = [
    ...series.filter((s) => s.kind !== 'bar').flatMap((s) => s.values),
    ...times.flatMap((_, i) => stacks.map((st) => stackTop(i, st))),
    ...(guide ? [guide.value] : []), ...(band ?? []), ...(zero || bars.length ? [0] : []),
  ].filter((v): v is number => v !== null && Number.isFinite(v));
  const lo0 = Math.min(...all);
  const hi0 = Math.max(...all);
  const span = hi0 - lo0 || Math.abs(hi0) * 0.1 || 1;
  const ticks = niceTicks(lo0 - (zero || bars.length ? 0 : span * 0.08), hi0 + span * 0.08, 4);
  const lo = Math.min(ticks[0], lo0);
  const hi = Math.max(ticks[ticks.length - 1], hi0);
  const H = height;
  const y = (v: number) => { const f = (v - lo) / (hi - lo || 1); return M.t + (invert ? f : 1 - f) * (H - M.t - M.b); };
  const bw = Math.max(2, Math.min(28, ((width - M.l - M.r) * gap) / Math.max(1, t1 + pad - (t0 - pad)) * 0.7));
  const first = series[0];
  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    let best = 0;
    times.forEach((t, i) => { if (Math.abs(x(t) - mx) < Math.abs(x(times[best]) - mx)) best = i; });
    setHover(best);
  };
  const months = monthTicks(t0 - pad, t1 + pad);
  return (
    <div ref={box} style={{ position: 'relative' }}>
      {series.length > 1 && <div className="chart-legend">{series.map((s) => <Key key={s.key} kind={s.kind === 'line' ? 'line' : 'dot'} color={s.color} label={s.label} />)}</div>}
      <svg width={width} height={H} role="img" aria-label={label} onMouseMove={move} onMouseLeave={() => setHover(null)} style={{ display: 'block' }}>
        {band && <rect x={M.l} width={width - M.l - M.r} y={Math.min(y(band[0]), y(band[1]))} height={Math.abs(y(band[0]) - y(band[1]))} fill="var(--band)" />}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{tick(Number(v.toFixed(tickDecimals(ticks))), first)}</text>
          </g>
        ))}
        {guide && (
          <g>
            <line x1={M.l} x2={width - M.r} y1={y(guide.value)} y2={y(guide.value)} stroke="var(--muted)" strokeDasharray="4 4" />
            {/* Above the line, or below it when the line runs along the top. */}
            <text x={width - M.r} y={y(guide.value) < M.t + 14 ? y(guide.value) + 14 : y(guide.value) - 4} textAnchor="end" fontSize="11" fill="var(--muted)">{guide.label}</text>
          </g>
        )}
        {times.map((t, i) => {
          // Stacked bars of each stack, side by side when there are several stacks.
          let k = 0;
          return stacks.map((st, si) => {
            let base = 0;
            return bars.filter((b) => (b.stack ?? b.key) === st).map((b) => {
              const v = b.values[i];
              if (v === null || v === 0) return null;
              const from = base;
              base += v;
              const top = y(Math.max(from, base));
              const bottom = y(Math.min(from, base));
              const w = bw / stacks.length;
              return <rect key={`${b.key}${i}${k++}`} className={`tc-bar tc-${b.key}`} x={x(t) - bw / 2 + si * w} width={Math.max(1, w - 1)} y={Math.min(top, bottom)} height={Math.max(1, Math.abs(bottom - top))} rx={1.5} fill={b.color} />;
            });
          });
        })}
        {series.filter((s) => s.kind === 'line').map((s) => {
          const pts = s.values.flatMap((v, i) => (v === null ? [] : [`${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`]));
          return pts.length > 1 ? <polyline key={s.key} className={`tc-line tc-${s.key}`} points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" /> : null;
        })}
        {series.filter((s) => s.kind === 'dots').map((s) => s.values.map((v, i) => (v === null ? null : (
          <circle key={`${s.key}${i}`} className={`tc-dot tc-${s.key}`} cx={x(times[i])} cy={y(v)} r={4} fill={Array.isArray(s.hollow) && s.hollow[i] ? 'var(--surface)' : s.color} stroke={s.color} strokeWidth="1.5" />
        ))))}
        <line x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" />
        {(months.length > 1 ? months : [t0, t1]).map((t) => <text key={t} x={x(t)} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="middle">{months.length > 1 ? monthLabel(t) : dayLabel(t)}</text>)}
        {hover !== null && <line x1={x(times[hover])} x2={x(times[hover])} y1={M.t} y2={H - M.b} stroke="var(--axis)" />}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: x(times[hover]) > width - 260 ? x(times[hover]) - 248 : x(times[hover]) + 14, top: 8 }}>
          <div className="tip-value">{dayLabel(times[hover])}</div>
          {series.map((s) => { const v = s.values[hover]; return v === null ? null : <div key={s.key}>{s.label} {format(v, s)}</div>; })}
        </div>
      )}
      {note && <div className="chart-note">{note}</div>}
    </div>
  );
}

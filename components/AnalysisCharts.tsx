'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type MouseEvent } from 'react';
import type { BlockInstance } from '@/lib/blocks';
import { ensureSpan, monthLabel, monthTicks, niceTicks, tickDecimals, useWidth } from './chartKit';
import type { Marker } from './TrendChart';

/** Colour slots and marker shapes of the Analysis items: shape is the second encoding beside colour. */
export const SLOT_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
export const SLOT_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
export type Shape = (typeof SLOT_SHAPES)[number];

const DAY = 86_400_000;
const M = { l: 52, r: 16, b: 26 };

/** A marker of a shape, filled with the item's colour, with a surface ring. */
export function Mark({ shape, x, y, r = 4.5, color, ring = 'var(--surface)' }: { shape: Shape; x: number; y: number; r?: number; color: string; ring?: string }) {
  const p = { fill: color, stroke: ring, strokeWidth: 2 };
  if (shape === 'square') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={1} {...p} />;
  if (shape === 'triangle') return <polygon points={`${x},${y - r * 1.2} ${x + r * 1.1},${y + r * 0.8} ${x - r * 1.1},${y + r * 0.8}`} {...p} />;
  if (shape === 'diamond') return <polygon points={`${x},${y - r * 1.25} ${x + r * 1.25},${y} ${x},${y + r * 1.25} ${x - r * 1.25},${y}`} {...p} />;
  return <circle cx={x} cy={y} r={r} {...p} />;
}

/** The key of an item in a legend: its marker shape in its colour. */
export function ItemKey({ shape, color }: { shape: Shape; color: string }) {
  return (
    <svg width="14" height="14" aria-hidden="true" style={{ flex: 'none' }}>
      <Mark shape={shape} x={7} y={7} r={4.5} color={color} ring="transparent" />
    </svg>
  );
}

export interface OverTimeGroup {
  key: string;
  label: string;
  color: string;
  shape: Shape;
  /** href: the run a point comes from, opened by a click */
  points: { t: number; v: number; instance?: BlockInstance; note?: string; href?: string }[];
  /** fitted lines (one per device series), with the noise band */
  fits: { t0: number; t1: number; v0: number; v1: number; noise: number }[];
}

/**
 * Over time: every block instance and every added run's average by date, one colour and
 * marker per item, each block's fitted lines with their noise bands, gear changes as lines.
 */
export function OverTimeChart({ groups, format, tick, invert, markers, minSpan = 0, selected = new Set(), onPick, title = 'Over time', domain, join = true, fit = true, labels = true, height = 300 }: {
  groups: OverTimeGroup[]; format: (v: number) => string; tick: (v: number, decimals?: number) => string; invert?: boolean; markers: Marker[];
  /** the least range of the y axis (a smaller difference stays small on the chart) */
  minSpan?: number;
  /** instances drawn larger (chosen elsewhere) */
  selected?: Set<string>;
  /** a click on a block instance's point */
  onPick?: (i: BlockInstance) => void;
  /** the chart's name (its metric, in a stack of charts) */
  title?: string;
  /** the time range shared by a stack of charts, ms */
  domain?: [number, number];
  /** a thin line joining each item's points in date order */
  join?: boolean;
  /** each block's fitted line and noise band */
  fit?: boolean;
  /** gear names above the plot (the first chart of a stack) */
  labels?: boolean;
  height?: number;
}) {
  const [box, width] = useWidth();
  const router = useRouter();
  const [hover, setHover] = useState<{ x: number; y: number; g: OverTimeGroup; p: OverTimeGroup['points'][number] } | null>(null);
  const H = height;
  // Only drawable points: a value that is not a number has no place on the axis.
  groups = useMemo(() => groups.map((g) => ({ ...g, points: g.points.filter((p) => Number.isFinite(p.v) && Number.isFinite(p.t)), fits: g.fits.filter((f) => [f.v0, f.v1, f.noise].every(Number.isFinite)) })), [groups]);
  const scale = useMemo(() => {
    const ts = groups.flatMap((g) => g.points.map((p) => p.t));
    if (!ts.length) return null;
    const vs = groups.flatMap((g) => [...g.points.map((p) => p.v), ...g.fits.flatMap((f) => [f.v0 + f.noise, f.v0 - f.noise, f.v1 + f.noise, f.v1 - f.noise])]);
    const span = Math.max(...vs) - Math.min(...vs) || Math.abs(vs[0]) * 0.05 || 1;
    // A margin past the extreme values, so no point sits on the axis; at least minSpan in all.
    const [lo0, hi0] = ensureSpan(Math.min(...vs) - span * 0.06, Math.max(...vs) + span * 0.06, minSpan);
    const ticks = niceTicks(lo0, hi0, 4).filter((t) => t >= lo0 && t <= hi0);
    const lo = Math.min(lo0, ticks[0] ?? lo0);
    const hi = Math.max(hi0, ticks[ticks.length - 1] ?? hi0);
    return { t0: domain?.[0] ?? Math.min(...ts) - 4 * DAY, t1: domain?.[1] ?? Math.max(...ts) + 4 * DAY, lo, hi, ticks };
  }, [groups, domain, minSpan]);
  if (!scale) return <div ref={box} className="muted small" style={{ padding: 12 }}>No instances or runs with this metric.</div>;
  const { t0, t1, lo, hi, ticks } = scale;
  const shown = markers.filter((m) => Date.parse(m.date) > t0 && Date.parse(m.date) < t1).sort((a, b) => a.date.localeCompare(b.date));
  const lane = shown.length && labels ? 36 : 10;
  const x = (t: number) => M.l + ((t - t0) / (t1 - t0)) * (width - M.l - M.r);
  const y = (v: number) => { const f = (v - lo) / (hi - lo); return lane + (invert ? f : 1 - f) * (H - lane - M.b); };
  let row = 0;
  let lastX = -Infinity;
  const placed = shown.map((m) => { const mx = x(Date.parse(m.date)); row = mx - lastX < 160 ? 1 - row : 0; lastX = mx; return { ...m, mx, row }; });
  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: typeof hover = null;
    let bd = 24 ** 2;
    for (const g of groups) for (const p of g.points) { const d = (x(p.t) - mx) ** 2 + (y(p.v) - my) ** 2; if (d < bd) { bd = d; best = { x: x(p.t), y: y(p.v), g, p }; } }
    setHover(best);
  };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg width={width} height={H} role="img" aria-label={title === 'Over time' ? title : `Over time · ${title}`} onMouseMove={move} onMouseLeave={() => setHover(null)} onClick={() => { if (!hover) return; if (hover.p.instance && onPick) onPick(hover.p.instance); else if (hover.p.href) router.push(hover.p.href); }} style={{ display: 'block', cursor: hover && ((hover.p.instance && onPick) || hover.p.href) ? 'pointer' : 'default' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{tick(v, tickDecimals(ticks))}</text>
          </g>
        ))}
        <line x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" />
        {monthTicks(t0, t1).map((m) => <text key={m} x={x(m)} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="middle">{monthLabel(m)}</text>)}
        {placed.map((m) => (
          <g key={m.date + m.label} className="gear-change">
            <line x1={m.mx} x2={m.mx} y1={6 + m.row * 14} y2={H - M.b} stroke="var(--axis)" />
            {labels && <text x={m.mx + 4} y={15 + m.row * 14} fontSize="11" fill="var(--text)">{m.label}</text>}
          </g>
        ))}
        {join && groups.map((g) => {
          const pts = [...g.points].sort((a, b) => a.t - b.t);
          return pts.length > 1 && <polyline key={`j${g.key}`} className="join-line" points={pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} fill="none" stroke={g.color} strokeWidth="1.25" opacity="0.55" strokeLinejoin="round" />;
        })}
        {fit && groups.map((g) => g.fits.map((f, k) => (
          <g key={`${g.key}${k}`}>
            <polygon className="noise-band" points={`${x(f.t0)},${y(f.v0 + f.noise)} ${x(f.t1)},${y(f.v1 + f.noise)} ${x(f.t1)},${y(f.v1 - f.noise)} ${x(f.t0)},${y(f.v0 - f.noise)}`} fill={g.color} opacity="0.1" />
            <line className="trend-line" x1={x(f.t0)} y1={y(f.v0)} x2={x(f.t1)} y2={y(f.v1)} stroke={g.color} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )))}
        {groups.map((g) => g.points.map((p, k) => {
          const sel = p.instance && selected.has(p.instance.id);
          return <Mark key={`${g.key}${k}`} shape={g.shape} x={x(p.t)} y={y(p.v)} r={sel ? 6.5 : p.instance ? 4.5 : 6} color={g.color} ring={sel ? 'var(--text)' : 'var(--surface)'} />;
        }))}
        {hover && <line x1={hover.x} x2={hover.x} y1={lane} y2={H - M.b} stroke="var(--axis)" />}
        {hover && <circle cx={hover.x} cy={hover.y} r={9} fill="none" stroke="var(--text)" strokeWidth="1.5" />}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x > width - 260 ? hover.x - 248 : hover.x + 16, top: Math.max(4, hover.y - 20) }}>
          <div className="tip-value"><ItemKey shape={hover.g.shape} color={hover.g.color} /> {format(hover.p.v)}</div>
          <div>{hover.g.label}</div>
          <div className="muted">{new Date(hover.p.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{hover.p.note ? ` · ${hover.p.note}` : ''}</div>
          {hover.p.href && !onPick && <div className="muted tip-hint">Click to open the run</div>}
        </div>
      )}
    </div>
  );
}

export interface CurveLine {
  key: string;
  label: string;
  color: string;
  shape: Shape;
  /** by duration, s; pace in s/km; the note names the run, the href opens it with the stretch selected */
  points: { duration: number; pace: number; note: string; href?: string }[];
  /** the estimated curve, drawn dashed */
  estimate?: { duration: number; pace: number }[];
  /** the estimate at any length of time, read under the pointer */
  estimateAt?: (duration: number) => number;
}

const durationLabel = (d: number) => (d < 60 ? `${d} s` : d < 3600 ? `${+(d / 60).toFixed(1)} min` : `${+(d / 3600).toFixed(1)} h`);

/**
 * Pace curve: for each length of time the fastest stretch of that length across an item's runs,
 * one line per item, time on a logarithmic x axis, pace (faster up) on the y axis.
 */
export function PaceCurveChart({ lines, durations, format, tick, minSpan = 0, height = 300 }: {
  lines: CurveLine[]; durations: number[]; format: (v: number) => string; tick: (v: number, decimals?: number) => string; minSpan?: number; height?: number;
}) {
  const [box, width] = useWidth();
  const router = useRouter();
  const [hover, setHover] = useState<{ mx: number; duration: number; near: { l: CurveLine; p: CurveLine['points'][number] } | null } | null>(null);
  const H = height;
  const T = 10;
  const pts = lines.flatMap((l) => l.points);
  const scale = useMemo(() => {
    if (!pts.length) return null;
    const all = [...pts, ...lines.flatMap((l) => l.estimate ?? [])];
    const ds = all.map((p) => Math.log(p.duration));
    const vs = all.map((p) => p.pace);
    const span = Math.max(...vs) - Math.min(...vs) || Math.abs(vs[0]) * 0.05 || 1;
    const [lo0, hi0] = ensureSpan(Math.min(...vs) - span * 0.06, Math.max(...vs) + span * 0.06, minSpan);
    const ticks = niceTicks(lo0, hi0, 4).filter((t) => t >= lo0 && t <= hi0);
    return { d0: Math.min(...ds), d1: Math.max(...ds) || 1, lo: Math.min(lo0, ticks[0] ?? lo0), hi: Math.max(hi0, ticks[ticks.length - 1] ?? hi0), ticks };
    // pts follows lines.
  }, [lines, minSpan]);
  if (!scale) return <div ref={box} className="muted small" style={{ padding: 12 }}>No run with a stretch yet: add a run or the runs matching a period.</div>;
  const { d0, d1, lo, hi, ticks } = scale;
  const x = (d: number) => M.l + ((Math.log(d) - d0) / (d1 - d0 || 1)) * (width - M.l - M.r);
  const durationAt = (px: number) => Math.exp(d0 + ((px - M.l) / (width - M.l - M.r)) * (d1 - d0 || 1));
  // Pace: the faster, the higher.
  const y = (v: number) => T + ((v - lo) / (hi - lo)) * (H - T - M.b);
  const xTicks = durations.filter((d) => Math.log(d) >= d0 - 1e-9 && Math.log(d) <= d1 + 1e-9);
  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = Math.min(width - M.r, Math.max(M.l, e.clientX - r.left));
    const my = e.clientY - r.top;
    let near: { l: CurveLine; p: CurveLine['points'][number] } | null = null;
    let bd = 28 ** 2;
    for (const l of lines) for (const p of l.points) { const dd = (x(p.duration) - mx) ** 2 + (y(p.pace) - my) ** 2; if (dd < bd) { bd = dd; near = { l, p }; } }
    setHover({ mx, duration: durationAt(mx), near });
  };
  const gap = (measured: number, estimate: number) => { const d = Math.round(measured - estimate); return d === 0 ? 'on the estimate' : `${Math.abs(d)} s/km ${d > 0 ? 'slower' : 'faster'} than the estimate`; };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg width={width} height={H} role="img" aria-label="Pace curve" onMouseMove={move} onMouseLeave={() => setHover(null)} onClick={() => hover?.near?.p.href && router.push(hover.near.p.href)} style={{ display: 'block', cursor: hover?.near?.p.href ? 'pointer' : 'default' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{tick(v, tickDecimals(ticks))}</text>
          </g>
        ))}
        <line x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" />
        {xTicks.map((d) => <text key={d} x={x(d)} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="middle">{durationLabel(d)}</text>)}
        {lines.map((l) => l.estimateAt && l.points.map((p) => (
          <line key={`g${l.key}${p.duration}`} className="curve-gap" x1={x(p.duration)} x2={x(p.duration)} y1={y(p.pace)} y2={y(l.estimateAt!(p.duration))} stroke={l.color} strokeWidth="1" opacity="0.45" strokeDasharray="2 2" />
        )))}
        {lines.map((l) => l.estimate && l.estimate.length > 1 && (
          <polyline key={`e${l.key}`} className="curve-estimate" points={[...l.estimate].sort((a, b) => a.duration - b.duration).map((p) => `${x(p.duration).toFixed(1)},${y(p.pace).toFixed(1)}`).join(' ')} fill="none" stroke={l.color} strokeWidth="1.75" strokeDasharray="6 4" opacity="0.8" />
        ))}
        {lines.map((l) => {
          const sorted = [...l.points].sort((a, b) => a.duration - b.duration);
          return sorted.length > 1 && <polyline key={l.key} className="curve-line" points={sorted.map((p) => `${x(p.duration).toFixed(1)},${y(p.pace).toFixed(1)}`).join(' ')} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" />;
        })}
        {lines.map((l) => l.points.map((p) => <Mark key={`${l.key}${p.duration}`} shape={l.shape} x={x(p.duration)} y={y(p.pace)} r={4.5} color={l.color} />))}
        {hover && <line x1={hover.mx} x2={hover.mx} y1={T} y2={H - M.b} stroke="var(--axis)" />}
        {hover && lines.map((l) => l.estimateAt && (() => { const v = l.estimateAt!(hover.duration); return v >= lo && v <= hi ? <circle key={`h${l.key}`} cx={hover.mx} cy={y(v)} r={4} fill="var(--surface)" stroke={l.color} strokeWidth="2" /> : null; })())}
        {hover?.near && <circle cx={x(hover.near.p.duration)} cy={y(hover.near.p.pace)} r={9} fill="none" stroke="var(--text)" strokeWidth="1.5" />}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.mx > width - 300 ? hover.mx - 288 : hover.mx + 16, top: 8 }}>
          <div className="tip-value">{durationLabel(hover.duration)}</div>
          {lines.map((l) => l.estimateAt && <div key={l.key}><ItemKey shape={l.shape} color={l.color} /> estimate {format(l.estimateAt(hover.duration))}</div>)}
          {hover.near && (
            <div style={{ marginTop: 4 }}>
              <div><ItemKey shape={hover.near.l.shape} color={hover.near.l.color} /> {durationLabel(hover.near.p.duration)} · measured {format(hover.near.p.pace)}{hover.near.l.estimateAt ? ` · ${gap(hover.near.p.pace, hover.near.l.estimateAt(hover.near.p.duration))}` : ''}</div>
              <div className="muted">{hover.near.p.note}</div>
              {hover.near.p.href && <div className="muted tip-hint">Click to open the run</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useMemo, useRef, useState, type MouseEvent } from 'react';
import type { BlockInstance } from '@/lib/blocks/types';
import type { TrendResult } from '@/lib/compare/trend';

const W = 900;
const H = 300;
const PAD = { l: 48, r: 12, t: 12, b: 26 };
const COLORS = ['var(--series-1)', 'var(--series-3)', 'var(--series-2)', 'var(--series-4)'];
const DAY = 86_400_000;

export interface Marker {
  date: string;
  label: string;
}

interface Props {
  trend: TrendResult;
  format: (v: number) => string;
  /** smaller is better, drawn upwards (pace) */
  invert?: boolean;
  markers: Marker[];
  selected: Set<string>;
  onSelect: (i: BlockInstance) => void;
}

/** Instances over time: one colour per series (device), its fitted line and noise band, gear changes as vertical lines. */
export function TrendChart({ trend, format, invert, markers, selected, onSelect }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; i: BlockInstance; v: number; color: string } | null>(null);
  const corrected = trend.corrected;

  const scale = useMemo(() => {
    const pts = trend.series.flatMap((s) => s.points);
    if (!pts.length) return null;
    const ts = pts.map((p) => Date.parse(p.date));
    const vs = pts.map((p) => (corrected ? p.corrected : p.raw));
    const t0 = Math.min(...ts) - 5 * DAY;
    const t1 = Math.max(...ts) + 5 * DAY;
    const pad = (Math.max(...vs) - Math.min(...vs)) * 0.15 || 1;
    const lo = Math.min(...vs) - pad;
    const hi = Math.max(...vs) + pad;
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => {
      const f = (v - lo) / (hi - lo);
      return PAD.t + (invert ? f : 1 - f) * (H - PAD.t - PAD.b);
    };
    return { x, y, t0, t1, lo, hi };
  }, [trend, corrected, invert]);

  if (!scale) return <div className="card empty">No accepted instances for this metric and filter.</div>;
  const { x, y, t0, t1, lo, hi } = scale;
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  const months: number[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d.setMonth(d.getMonth() + 1, 1)) months.push(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime());

  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    const my = ((e.clientY - r.top) / r.height) * H;
    let best: typeof hover = null;
    let bestD = 18 ** 2;
    trend.series.forEach((s, si) =>
      s.points.forEach((p) => {
        const v = corrected ? p.corrected : p.raw;
        const px = x(Date.parse(p.date));
        const py = y(v);
        const d = (px - mx) ** 2 + (py - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py, i: p.instance, v, color: COLORS[si % COLORS.length] };
        }
      }),
    );
    setHover(best);
  };

  return (
    <div className="card" style={{ padding: 12, position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" onMouseMove={move} onMouseLeave={() => setHover(null)} onClick={() => hover && onSelect(hover.i)} style={{ cursor: hover ? 'pointer' : 'default' }} role="img" aria-label="Trend">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{format(v)}</text>
          </g>
        ))}
        {months.filter((m) => m > t0 && m < t1).map((m) => (
          <text key={m} x={x(m)} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="middle">{new Date(m).toLocaleDateString(undefined, { month: 'short' })}</text>
        ))}
        {markers.filter((m) => Date.parse(m.date) > t0 && Date.parse(m.date) < t1).map((m) => (
          <g key={m.date + m.label}>
            <line x1={x(Date.parse(m.date))} x2={x(Date.parse(m.date))} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeDasharray="4 4" />
            <text x={x(Date.parse(m.date)) + 4} y={PAD.t + 10} fontSize="11" fill="var(--muted)">{m.label}</text>
          </g>
        ))}
        {trend.series.map((s, si) => {
          const color = COLORS[si % COLORS.length];
          const first = Date.parse(s.points[0].date);
          const last = Date.parse(s.points[s.points.length - 1].date);
          const at = (t: number) => (s.fit ? s.fit.intercept + s.fit.slope * ((t - first) / DAY) : 0);
          return (
            <g key={s.source}>
              {s.fit && (
                <>
                  <polygon
                    points={`${x(first)},${y(at(first) + s.noise)} ${x(last)},${y(at(last) + s.noise)} ${x(last)},${y(at(last) - s.noise)} ${x(first)},${y(at(first) - s.noise)}`}
                    fill={color} opacity="0.12"
                  />
                  <line x1={x(first)} y1={y(at(first))} x2={x(last)} y2={y(at(last))} stroke={color} strokeWidth="2" />
                </>
              )}
              {s.points.map((p) => {
                const v = corrected ? p.corrected : p.raw;
                const sel = selected.has(p.instance.id);
                return <circle key={p.instance.id} cx={x(Date.parse(p.date))} cy={y(v)} r={sel ? 6 : 4} fill={color} stroke={sel ? 'var(--text)' : 'var(--surface)'} strokeWidth={sel ? 2 : 1} />;
              })}
            </g>
          );
        })}
      </svg>
      {hover && <Tooltip h={hover} format={format} />}
    </div>
  );
}

function Tooltip({ h, format }: { h: { x: number; y: number; i: BlockInstance; v: number; color: string }; format: (v: number) => string }) {
  const c = h.i.context;
  const pace = `${Math.floor(c.block.pace / 60)}:${String(c.block.pace % 60).padStart(2, '0')}`;
  return (
    <div className="tooltip" style={{ left: `${(h.x / W) * 100}%`, top: `${(h.y / H) * 100}%` }}>
      <div style={{ fontWeight: 600 }}><span className="dot" style={{ background: h.color, marginRight: 6 }} />{format(h.v)}</div>
      <div>{new Date(h.i.runStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · run {h.i.runId}</div>
      <div>pace {pace} /km{c.block.heading !== null ? ` · heading ${c.block.heading}°` : ''} · minute {c.before.minuteOfRun}</div>
      <div>{c.run.shoes ?? 'no shoes set'} · {c.run.heartRateSource}</div>
    </div>
  );
}

interface ProfileProps {
  lines: { id: string; label: string; values: (number | null)[] }[];
  format: (v: number) => string;
  invert?: boolean;
}

/** Per-minute profiles inside the block, overlaid (spec F13). */
export function ProfileChart({ lines, format, invert }: ProfileProps) {
  const vals = lines.flatMap((l) => l.values).filter((v): v is number => v !== null);
  if (!vals.length) return <div className="muted small" style={{ padding: 12 }}>Select points on the chart to overlay their per-minute profiles.</div>;
  const n = Math.max(...lines.map((l) => l.values.length));
  const pad = (Math.max(...vals) - Math.min(...vals)) * 0.15 || 1;
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad;
  const h = 180;
  const x = (k: number) => PAD.l + (n > 1 ? k / (n - 1) : 0.5) * (W - PAD.l - PAD.r);
  const y = (v: number) => {
    const f = (v - lo) / (hi - lo);
    return PAD.t + (invert ? f : 1 - f) * (h - PAD.t - PAD.b);
  };
  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label="Per-minute profiles">
      {[lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.75].map((v) => (
        <text key={v} x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{format(v)}</text>
      ))}
      {Array.from({ length: n }, (_, k) => k).filter((k) => k % Math.max(1, Math.round(n / 10)) === 0).map((k) => (
        <text key={k} x={x(k)} y={h - 6} fontSize="11" fill="var(--muted)" textAnchor="middle">min {k + 1}</text>
      ))}
      {lines.map((l, li) => {
        let d = '';
        l.values.forEach((v, k) => { if (v !== null) d += `${d ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`; });
        return (
          <g key={l.id}>
            <path d={d} fill="none" stroke={COLORS[li % COLORS.length]} strokeWidth="2" />
            <text x={W - PAD.r} y={PAD.t + 12 + li * 13} fontSize="11" textAnchor="end" fill={COLORS[li % COLORS.length]}>{l.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

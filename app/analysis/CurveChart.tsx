'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type MouseEvent } from 'react';
import { ItemKey, Mark, ensureSpan, niceTicks, tickDecimals, useWidth, type Shape } from '@/components';

const M = { l: 52, r: 16, b: 26 };

export interface CurveLine {
  key: string;
  label: string;
  color: string;
  shape: Shape;
  /** by duration, s; the value a pace in s/km or a power in W; the note names the run, the href opens it with the stretch selected */
  points: { duration: number; value: number; note: string; href?: string }[];
  /** the estimated curve, drawn dashed */
  estimate?: { duration: number; value: number }[];
  /** the estimate at any length of time, read under the pointer */
  estimateAt?: (duration: number) => number;
}

const durationLabel = (d: number) => (d < 60 ? `${d} s` : d < 3600 ? `${+(d / 60).toFixed(1)} min` : `${+(d / 3600).toFixed(1)} h`);

/**
 * A curve of bests by length of time on a logarithmic axis, one line per item (Analysis: the
 * fastest stretch of each length as a pace, or the highest average power).
 * `higherIsBetter` draws the higher values higher (power); otherwise the lower ones (a pace). `gap`
 * words a best's distance to the estimate.
 */
export function CurveChart({ label, lines, durations, format, tick, gap, higherIsBetter = false, highlight = null, minSpan = 0, height = 300 }: {
  label: string; lines: CurveLine[]; durations: number[]; format: (v: number) => string; tick: (v: number, decimals?: number) => string;
  gap: (measured: number, estimate: number) => string; higherIsBetter?: boolean;
  /** a best ringed on the chart, by its line's key and its length (the row under the pointer in the table of bests) */
  highlight?: { key: string; duration: number } | null; minSpan?: number; height?: number;
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
    const vs = all.map((p) => p.value);
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
  // The better, the higher: a lower pace, a higher power.
  const y = (v: number) => (higherIsBetter ? H - M.b - ((v - lo) / (hi - lo)) * (H - T - M.b) : T + ((v - lo) / (hi - lo)) * (H - T - M.b));
  const xTicks = durations.filter((d) => Math.log(d) >= d0 - 1e-9 && Math.log(d) <= d1 + 1e-9);
  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = Math.min(width - M.r, Math.max(M.l, e.clientX - r.left));
    const my = e.clientY - r.top;
    let near: { l: CurveLine; p: CurveLine['points'][number] } | null = null;
    let bd = 28 ** 2;
    for (const l of lines) for (const p of l.points) { const dd = (x(p.duration) - mx) ** 2 + (y(p.value) - my) ** 2; if (dd < bd) { bd = dd; near = { l, p }; } }
    setHover({ mx, duration: durationAt(mx), near });
  };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg width={width} height={H} role="img" aria-label={label} onMouseMove={move} onMouseLeave={() => setHover(null)} onClick={() => hover?.near?.p.href && router.push(hover.near.p.href)} style={{ display: 'block', cursor: hover?.near?.p.href ? 'pointer' : 'default' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{tick(v, tickDecimals(ticks))}</text>
          </g>
        ))}
        <line x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" />
        {xTicks.map((d) => <text key={d} x={x(d)} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="middle">{durationLabel(d)}</text>)}
        {lines.map((l) => l.estimateAt && l.points.map((p) => (
          <line key={`g${l.key}${p.duration}`} className="curve-gap" x1={x(p.duration)} x2={x(p.duration)} y1={y(p.value)} y2={y(l.estimateAt!(p.duration))} stroke={l.color} strokeWidth="1" opacity="0.45" strokeDasharray="2 2" />
        )))}
        {lines.map((l) => l.estimate && l.estimate.length > 1 && (
          <polyline key={`e${l.key}`} className="curve-estimate" points={[...l.estimate].sort((a, b) => a.duration - b.duration).map((p) => `${x(p.duration).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')} fill="none" stroke={l.color} strokeWidth="1.75" strokeDasharray="6 4" opacity="0.8" />
        ))}
        {lines.map((l) => {
          const sorted = [...l.points].sort((a, b) => a.duration - b.duration);
          return sorted.length > 1 && <polyline key={l.key} className="curve-line" points={sorted.map((p) => `${x(p.duration).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" />;
        })}
        {lines.map((l) => l.points.map((p) => <Mark key={`${l.key}${p.duration}`} shape={l.shape} x={x(p.duration)} y={y(p.value)} r={4.5} color={l.color} />))}
        {hover && <line x1={hover.mx} x2={hover.mx} y1={T} y2={H - M.b} stroke="var(--axis)" />}
        {hover && lines.map((l) => l.estimateAt && (() => { const v = l.estimateAt!(hover.duration); return v >= lo && v <= hi ? <circle key={`h${l.key}`} cx={hover.mx} cy={y(v)} r={4} fill="var(--surface)" stroke={l.color} strokeWidth="2" /> : null; })())}
        {highlight && lines.filter((l) => l.key === highlight.key).flatMap((l) => l.points.filter((p) => p.duration === highlight.duration)).map((p) => (
          <circle key="highlight" className="curve-highlight" cx={x(p.duration)} cy={y(p.value)} r={10} fill="none" stroke="var(--text)" strokeWidth="2" />
        ))}
        {hover?.near && <circle cx={x(hover.near.p.duration)} cy={y(hover.near.p.value)} r={9} fill="none" stroke="var(--text)" strokeWidth="1.5" />}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.mx > width - 300 ? hover.mx - 288 : hover.mx + 16, top: 8 }}>
          <div className="tip-value">{durationLabel(hover.duration)}</div>
          {lines.map((l) => l.estimateAt && <div key={l.key}><ItemKey shape={l.shape} color={l.color} /> estimate {format(l.estimateAt(hover.duration))}</div>)}
          {hover.near && (
            <div style={{ marginTop: 4 }}>
              <div><ItemKey shape={hover.near.l.shape} color={hover.near.l.color} /> {durationLabel(hover.near.p.duration)} · measured {format(hover.near.p.value)}{hover.near.l.estimateAt ? ` · ${gap(hover.near.p.value, hover.near.l.estimateAt(hover.near.p.duration))}` : ''}</div>
              <div className="muted">{hover.near.p.note}</div>
              {hover.near.p.href && <div className="muted tip-hint">Click to open the run</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

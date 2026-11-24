'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import type { BlockInstance } from '@/lib/blocks';
import { contextValue, type TrendResult } from '@/lib/compare';
import { dateText, t } from '@/lib/i18n';
import { Key, ensureSpan, monthLabel, monthTicks, niceTicks, tickDecimals, useWidth } from './chartKit';

/** Categorical series colours, in their validated order: colour follows the series (the device), never its rank. */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
const DAY = 86_400_000;
const M = { l: 52, r: 16, b: 26 };

export interface Marker {
  date: string;
  label: string;
}

interface Props {
  trend: TrendResult;
  format: (v: number) => string;
  /** an axis tick, without the unit; default: format */
  tick?: (v: number) => string;
  /** smaller is better, drawn upwards (pace) */
  invert?: boolean;
  markers: Marker[];
  selected: Set<string>;
  onSelect: (i: BlockInstance) => void;
  /** when nothing is included: the most common reasons, shown in the empty state */
  emptyReasons?: string[];
}

type Hover = { x: number; y: number; i: BlockInstance; v: number; color: string };

/**
 * Instances over time: one colour per series (device), its fitted line with the noise band
 * around it, gear changes as thin vertical lines named in a lane above the plot.
 */
export function TrendChart({ trend, format, tick = format, invert, markers, selected, onSelect, emptyReasons }: Props) {
  const [box, width] = useWidth();
  const [hover, setHover] = useState<Hover | null>(null);
  const corrected = trend.corrected;
  const H = 320;

  const scale = useMemo(() => {
    const pts = trend.series.flatMap((s) => s.points);
    if (!pts.length) return null;
    const ts = pts.map((p) => Date.parse(p.date));
    const vs = pts.map((p) => (corrected ? p.corrected : p.raw));
    for (const s of trend.series) {
      if (!s.fit) continue;
      const first = Date.parse(s.points[0].date);
      const last = Date.parse(s.points[s.points.length - 1].date);
      for (const t of [first, last]) for (const sign of [1, -1]) vs.push(s.fit.intercept + s.fit.slope * ((t - first) / DAY) + sign * s.noise);
    }
    const t0 = Math.min(...ts) - 4 * DAY;
    const t1 = Math.max(...ts) + 4 * DAY;
    const span = Math.max(...vs) - Math.min(...vs) || Math.abs(vs[0]) * 0.05 || 1;
    const ticks = niceTicks(Math.min(...vs) - span * 0.08, Math.max(...vs) + span * 0.08, 4);
    const lo = Math.min(ticks[0], ...vs);
    const hi = Math.max(ticks[ticks.length - 1], ...vs);
    return { t0, t1, lo, hi, ticks };
  }, [trend, corrected]);

  if (!scale)
    return (
      <div ref={box} className="card empty">
        {t('No accepted instances for this metric and filter.')}
        {emptyReasons && emptyReasons.length > 0 && <div className="small" style={{ marginTop: 6 }}>{t("Left out most often for: {reasons}. Open Efforts for each one's reason, or try another metric.", { reasons: emptyReasons.join(' · ') })}</div>}
      </div>
    );
  const { t0, t1, lo, hi, ticks } = scale;
  // Gear markers inside the range, in a lane of two rows so neighbouring names do not overlap.
  const visibleMarkers = markers.filter((m) => Date.parse(m.date) > t0 && Date.parse(m.date) < t1).sort((a, b) => a.date.localeCompare(b.date));
  const lane = visibleMarkers.length ? 36 : 10;
  const x = (t: number) => M.l + ((t - t0) / (t1 - t0)) * (width - M.l - M.r);
  const y = (v: number) => {
    const f = (v - lo) / (hi - lo);
    return lane + (invert ? f : 1 - f) * (H - lane - M.b);
  };
  let row = 0;
  let lastX = -Infinity;
  const placed = visibleMarkers.map((m) => {
    const mx = x(Date.parse(m.date));
    row = mx - lastX < 160 ? 1 - row : 0;
    lastX = mx;
    return { ...m, mx, row };
  });

  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: Hover | null = null;
    let bestD = 24 ** 2;
    trend.series.forEach((s, si) =>
      s.points.forEach((p) => {
        const v = corrected ? p.corrected : p.raw;
        const px = x(Date.parse(p.date));
        const py = y(v);
        const d = (px - mx) ** 2 + (py - my) ** 2;
        if (d < bestD) { bestD = d; best = { x: px, y: py, i: p.instance, v, color: SERIES[si % SERIES.length] }; }
      }),
    );
    setHover(best);
  };

  return (
    <div ref={box} className="card chart" style={{ position: 'relative' }}>
      {trend.series.length > 1 && (
        <div className="chart-legend">{trend.series.map((s, si) => <Key key={s.source} kind="dot" color={SERIES[si % SERIES.length]} label={contextValue(s.source)} />)}</div>
      )}
      <svg width={width} height={H} onMouseMove={move} onMouseLeave={() => setHover(null)} onClick={() => hover && onSelect(hover.i)} style={{ cursor: hover ? 'pointer' : 'default', display: 'block' }} role="img" aria-label={t('Trend')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{tick(v)}</text>
          </g>
        ))}
        <line x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" />
        {monthTicks(t0, t1).map((m) => (
          <text key={m} x={x(m)} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="middle">{monthLabel(m)}</text>
        ))}
        {placed.map((m) => (
          <g key={m.date + m.label} className="gear-change">
            <line x1={m.mx} x2={m.mx} y1={6 + m.row * 14} y2={H - M.b} stroke="var(--axis)" />
            <text x={m.mx + 4} y={15 + m.row * 14} fontSize="11" fill="var(--text)">{m.label}</text>
          </g>
        ))}
        {trend.series.map((s, si) => {
          const color = SERIES[si % SERIES.length];
          const first = Date.parse(s.points[0].date);
          const last = Date.parse(s.points[s.points.length - 1].date);
          const at = (t: number) => (s.fit ? s.fit.intercept + s.fit.slope * ((t - first) / DAY) : 0);
          return (
            <g key={s.source}>
              {s.fit && (
                <>
                  <polygon
                    className="noise-band"
                    points={`${x(first)},${y(at(first) + s.noise)} ${x(last)},${y(at(last) + s.noise)} ${x(last)},${y(at(last) - s.noise)} ${x(first)},${y(at(first) - s.noise)}`}
                    fill={color} opacity="0.1"
                  />
                  <line x1={x(first)} y1={y(at(first))} x2={x(last)} y2={y(at(last))} stroke={color} strokeWidth="2" strokeLinecap="round" />
                </>
              )}
              {s.points.map((p) => {
                const v = corrected ? p.corrected : p.raw;
                const sel = selected.has(p.instance.id);
                return <circle key={p.instance.id} cx={x(Date.parse(p.date))} cy={y(v)} r={sel ? 6 : 4.5} fill={color} stroke={sel ? 'var(--text)' : 'var(--surface)'} strokeWidth="2" />;
              })}
            </g>
          );
        })}
        {hover && <circle cx={hover.x} cy={hover.y} r={8} fill="none" stroke="var(--text)" strokeWidth="1.5" />}
      </svg>
      {hover && <Tooltip h={hover} format={format} width={width} />}
      <div className="chart-note">{t('Band: the noise between efforts (±1 standard deviation) around the fitted line. Click points to compare their profiles below.')}</div>
    </div>
  );
}

function Tooltip({ h, format, width }: { h: Hover; format: (v: number) => string; width: number }) {
  const c = h.i.context;
  const pace = `${Math.floor(c.block.pace / 60)}:${String(c.block.pace % 60).padStart(2, '0')}`;
  const left = h.x > width - 260 ? h.x - 248 : h.x + 16;
  return (
    <div className="tooltip" style={{ left, top: Math.max(4, h.y - 20) }}>
      <div className="tip-value"><i className="key-dot" style={{ background: h.color }} /> {format(h.v)}</div>
      <div>{t('{date}, minute {minute} of the run', { date: dateText(h.i.runStart, { day: 'numeric', month: 'short', year: 'numeric' }), minute: c.before.minuteOfRun })}</div>
      <div className="muted">{t('pace {pace} /km', { pace })} · {c.run.shoes ?? t('no shoes set')} · {contextValue(c.run.heartRateSource)}</div>
    </div>
  );
}

interface ProfileProps {
  lines: { id: string; label: string; values: (number | null)[] }[];
  format: (v: number) => string;
  tick?: (v: number, decimals?: number) => string;
  /** the least range of the y axis */
  minSpan?: number;
  invert?: boolean;
  /** colours per line (default: the series order) */
  colors?: string[];
  ariaLabel?: string;
}

/** Per-minute profiles inside the block, overlaid (spec F13): minute of the block on x. */
export function ProfileChart({ lines, format, tick = format, minSpan = 0, invert, colors = SERIES, ariaLabel }: ProfileProps) {
  const [box, width] = useWidth();
  const vals = lines.flatMap((l) => l.values).filter((v): v is number => v !== null);
  if (!vals.length) return <div ref={box} className="muted small" style={{ padding: 12 }}>{t('Click points on the chart above to overlay their per-minute profiles.')}</div>;
  const n = Math.max(...lines.map((l) => l.values.length));
  const span = Math.max(...vals) - Math.min(...vals) || Math.abs(vals[0]) * 0.05 || 1;
  const [lo0, hi0] = ensureSpan(Math.min(...vals) - span * 0.1, Math.max(...vals) + span * 0.1, minSpan);
  const ticks = niceTicks(lo0, hi0, 3).filter((t) => t >= lo0 && t <= hi0);
  const lo = Math.min(lo0, ...vals);
  const hi = Math.max(hi0, ...vals);
  const h = 200;
  const top = 8;
  const x = (k: number) => M.l + (n > 1 ? k / (n - 1) : 0.5) * (width - M.l - M.r);
  const y = (v: number) => {
    const f = (v - lo) / (hi - lo);
    return top + (invert ? f : 1 - f) * (h - top - M.b);
  };
  const every = Math.max(1, Math.ceil(n / 12));
  return (
    <div ref={box}>
      <div className="chart-legend">{lines.map((l, li) => <Key key={l.id} color={colors[li % colors.length]} label={l.label} />)}</div>
      <svg width={width} height={h} role="img" aria-label={ariaLabel ?? t('Per-minute profiles')} style={{ display: 'block' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{tick(v, tickDecimals(ticks))}</text>
          </g>
        ))}
        <line x1={M.l} x2={width - M.r} y1={h - M.b} y2={h - M.b} stroke="var(--axis)" />
        {Array.from({ length: n }, (_, k) => k).filter((k) => k % every === 0 && x(k) < width - M.r - 110).map((k) => (
          <text key={k} x={x(k)} y={h - 8} fontSize="11" fill="var(--muted)" textAnchor="middle" className="tnum">{k + 1}</text>
        ))}
        <text x={width - M.r} y={h - 8} fontSize="11" fill="var(--muted)" textAnchor="end">{t('min of the effort')}</text>
        {lines.map((l, li) => {
          let d = '';
          l.values.forEach((v, k) => { if (v !== null) d += `${d ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`; });
          return <path key={l.id} d={d} fill="none" stroke={colors[li % colors.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
        })}
      </svg>
    </div>
  );
}

'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { clock, ensureSpan, niceTicks, robustExtent, tickDecimals, useWidth } from './chartKit';
import { zoneOf, zoneRanges, zoneShade } from '@/lib/settings';
import { LANE, smoothPaths } from './charts';
import { MIN_SPAN, clampDomain, kmLabel, kmTicks, panDomain, spanTicks, stepTicks, wheelFactor, zoomDomain, type DistanceMap, type Domain } from './chartZoom';

export * from './chartZoom';

type Band = { from: number; to: number };
/** The statistics of a metric marked on the chart: its average as a line (its min and max are those of the line drawn). */
export interface RunMark {
  /** the mean of the windows, as the statistics table gives it */
  avg: number;
}

/** A metric drawn on the run chart. */
export interface RunLine {
  key: string;
  title: string;
  /** a name short enough for the gutter */
  short: string;
  unit: string;
  /** null where nothing is drawn: no signal, or stopped (the line breaks there) */
  y: (number | null)[];
  color: string;
  format: (v: number) => string;
  /** an axis tick, without the unit, with the decimals its step needs */
  tick: (v: number, decimals?: number) => string;
  /** the least range of its scale */
  minSpan: number;
  /** smaller is better drawn on top, e.g. pace */
  invert?: boolean;
  /** the boundaries between the metric's zones, from Z1 up (settings); its stripes are coloured */
  zones?: number[];
  /** the tick steps the scale may use (pace: round seconds of a clock); default 1, 2, 2.5, 5 × 10ⁿ */
  steps?: number[];
}

interface RunChartProps {
  /** the time of each value, s */
  x: number[];
  /** the length of the run, s */
  total: number;
  lines: RunLine[];
  /** the line whose scale the ticks show, drawn on top */
  focus: string | null;
  onFocus: (key: string) => void;
  domain: Domain;
  onDomain: (d: Domain) => void;
  /** the laps, with their names for the strip of laps over the chart */
  laps?: (Band & { label?: string; short?: string })[];
  blocks?: (Band & { ok: boolean; name?: string })[];
  cursor: number | null;
  onCursor: (t: number | null) => void;
  selection: Band | null;
  /** drag across the chart to select a stretch */
  onSelect: (b: Band) => void;
  /** by metric: the statistics of the selection (or the range shown), marked for the metric whose scale shows */
  marks?: Record<string, RunMark>;
  /** a statistic pointed at in the table: its mark is lit, for any metric shown */
  hot?: { key: string; stat: 'min' | 'avg' | 'max' } | null;
  /** the selection moved with the range shown (the overview's window dragged), without zooming to it */
  onMoveSelection?: (b: Band) => void;
  /** the first line of the tooltip at a time: the clock, the distance, the lap */
  head: (t: number) => string;
  height?: number;
  /** bands: each line in its own band of the chart, the bands overlapping a little; overlay: every line over the whole height */
  layout?: 'bands' | 'overlay';
  /** the x axis spaces the chart by time (the default) or by distance */
  axis?: 'time' | 'distance';
  /** the run's time and distance mapped both ways: the distance axis, and the second axis under the time */
  dmap?: DistanceMap;
}

const same = (v: number) => v;

/** The gutter left of the plot for the names and values of the scales, px; the plot starts after it. */
const GUTTER = 58;
const PLOT_L = LANE.l + GUTTER;
/** The least distance between two labels of the gutter, px. */
const LABEL_GAP = 11;

/** How much neighbouring bands overlap, as a share of a band. */
const OVERLAP = 0.25;
/** Room kept at the top and bottom of a band, px. */
const BAND_PAD = 5;

/** The value of a series at a time: that of the last value begun by then. */
function valueAt(x: number[], y: (number | null)[], at: number): number | null {
  let lo = 0;
  let hi = x.length - 1;
  if (hi < 0 || x[0] > at) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (x[mid] <= at) lo = mid; else hi = mid - 1;
  }
  return y[lo];
}

/**
 * The metrics of a run laid over one chart (ADR "Run metrics on one chart"): one time axis, each
 * line scaled to its own range within the time shown, the focused line's ticks at the left and its
 * wash under it, laps as alternating bands, kept blocks as washed bands, the selection as an
 * accent wash, a crosshair with every line's value; zoom by pinch or Ctrl/⌘ + scroll around the
 * pointer, move by a sideways scroll, the keyboard or the overview strip of the whole run under it.
 */
export function RunChart({ x, total, lines, focus, onFocus, domain, onDomain, laps = [], blocks = [], cursor, onCursor, selection, onSelect, head, height = 260, layout = 'bands', axis = 'time', dmap, onMoveSelection, marks = {}, hot = null }: RunChartProps) {
  const [box, width] = useWidth();
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const clip = useId();
  const wash = useId();
  const [drag, setDrag] = useState<number | null>(null);
  // Room over the plot for the names of the blocks drawn.
  const top = blocks.some((b) => b.name) ? 20 : 6;
  // Two x axes under the plot: the chosen one, and the other at the same places.
  const H = top + height + 36;
  const [d0, d1] = domain;
  const span = d1 - d0 || 1;
  const plotW = width - PLOT_L - LANE.r;
  // Spaced by distance, a time is placed at the distance run by then; the domain stays in time.
  const byDist = axis === 'distance' && !!dmap;
  const fwd = byDist ? dmap!.toDist : same;
  const inv = byDist ? dmap!.toTime : same;
  const f0 = fwd(d0);
  const fspan = fwd(d1) - f0 || 1;
  const px = (t: number) => PLOT_L + ((fwd(t) - f0) / fspan) * plotW;
  const focused = lines.find((l) => l.key === focus) ?? lines[0];

  // The windows drawn: those in the range and one either side, so the line runs to the edges.
  const [i0, i1] = useMemo(() => {
    let a = x.findIndex((t) => t >= d0);
    if (a < 0) a = x.length;
    let b = a;
    while (b < x.length && x[b] <= d1) b++;
    return [Math.max(0, a - 1), Math.min(x.length, b + 1)];
  }, [x, d0, d1]);

  const drawn = useMemo(() => lines.map((l, k) => {
    const vals: number[] = [];
    for (let i = i0; i < i1; i++) { const v = l.y[i]; if (v !== null && x[i] >= d0 && x[i] <= d1) vals.push(v); }
    // The scale spans the 5th to the 95th percentile, padded: walking breaks and stops run to the edge.
    const [lo, hi] = ensureSpan(...robustExtent(vals, 0.05, 0.12), l.minSpan);
    // The band of the line: its own part of the height (overlapping its neighbours a little), or the whole.
    const n = lines.length;
    const bandH = layout === 'bands' && n > 1 ? height / (n - (n - 1) * OVERLAP) : height;
    const b0 = layout === 'bands' && n > 1 ? top + k * bandH * (1 - OVERLAP) : top;
    const inner = bandH - 2 * BAND_PAD;
    const py = (v: number) => {
      const f = (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo);
      return b0 + BAND_PAD + (l.invert ? f : 1 - f) * inner;
    };
    const pts: ([number, number] | null)[] = [];
    for (let i = i0; i < i1; i++) pts.push(l.y[i] === null ? null : [px(x[i]), py(l.y[i]!)]);
    const range = vals.length ? [Math.min(...vals), Math.max(...vals)] as const : null;
    const p = smoothPaths(pts, b0 + bandH);
    // With zones, the values labelled are the boundaries of the zones in the range.
    const inRange = (t: number) => t >= lo && t <= hi;
    const bounds = (l.zones ?? []).filter(inRange);
    const raw = l.steps ? stepTicks(lo, hi, l.steps, layout === 'bands' && n > 1 ? 2 : 4) : niceTicks(lo, hi, layout === 'bands' && n > 1 ? 2 : 4);
    const ticks = bounds.length ? bounds : raw.filter(inRange);
    // The stripes of the zones, clipped to the scale: Z1 the easiest.
    // A band's own part of the height: up to the middle of its overlaps, so stripes of neighbours do not overlap.
    const banded = layout === 'bands' && n > 1;
    const ownTop = banded && k > 0 ? b0 + (bandH * OVERLAP) / 2 : b0;
    const ownBottom = banded && k < n - 1 ? b0 + bandH - (bandH * OVERLAP) / 2 : b0 + bandH;
    const ranges = l.zones?.length ? zoneRanges(l.key, l.zones) : [];
    const stripes = ranges.flatMap((r, z) => {
      const a = Math.max(r.lo ?? -Infinity, lo);
      const b = Math.min(r.hi ?? Infinity, hi);
      if (b <= a) return [];
      // The edge zones reach the edge of the band's own part.
      let y1 = Math.min(py(a), py(b));
      let y2 = Math.max(py(a), py(b));
      if (y1 <= b0 + BAND_PAD + 0.5) y1 = ownTop;
      if (y2 >= b0 + bandH - BAND_PAD - 0.5) y2 = ownBottom;
      y1 = Math.max(y1, ownTop);
      y2 = Math.min(y2, ownBottom);
      return y2 > y1 ? [{ z, n: ranges.length, y: y1, h: y2 - y1 }] : [];
    });
    return { line: l, lo, hi, py, b0, bandH, range, ticks, stripes, path: p.line, area: p.area };
    // px follows the width and the range, which are among the dependencies.
  }), [lines, i0, i1, x, d0, d1, plotW, height, layout, axis, dmap]);

  const scale = drawn.find((d) => d.line.key === focused?.key);
  const banded = layout === 'bands' && drawn.length > 1;
  // Ticks labelled: of every band, or of the focused line when overlaid.
  const labelled = banded ? drawn : scale ? [scale] : [];
  // The gutter: each band's name at its top (banded), then the values of the scales; a label too
  // near one already placed is left out, the names and the focused line's values placed first.
  const gutter = useMemo(() => {
    const want: { id: string; y: number; text: string; name?: boolean; color?: string; rank: number }[] = [];
    if (banded) drawn.forEach((d) => want.push({ id: `n${d.line.key}`, y: d.b0 + BAND_PAD + 8, text: d.line.short, name: true, color: d.line.color, rank: 0 }));
    for (const d of labelled) for (const t of d.ticks) want.push({ id: `${d.line.key}${t}`, y: d.py(t) + 3.5, text: d.line.tick(t, tickDecimals(d.ticks)), rank: d === scale ? 1 : 2 });
    const kept: typeof want = [];
    for (const w of [...want].sort((a, b) => a.rank - b.rank)) if (kept.every((k) => Math.abs(k.y - w.y) >= LABEL_GAP)) kept.push(w);
    return kept;
  }, [drawn, labelled, banded, scale]);
  // The zone names at the right edge, in the middle of their stripes; one too near another is left out.
  const zoneLabels = useMemo(() => {
    const want = (banded ? drawn : scale ? [scale] : []).flatMap((d) => d.stripes.filter((st) => st.h >= 12).map((st) => ({ id: `zn${d.line.key}${st.z}`, y: st.y + st.h / 2 + 3.5, text: `Z${st.z + 1}`, rank: d === scale ? 0 : 1 })));
    const kept: typeof want = [];
    for (const w of [...want].sort((a, b) => a.rank - b.rank)) if (kept.every((k) => Math.abs(k.y - w.y) >= LABEL_GAP)) kept.push(w);
    return kept;
  }, [drawn, banded, scale]);

  // The live values the wheel handler reads.
  const live = useRef({ domain, total, onDomain, fwd, inv });
  live.current = { domain, total, onDomain, fwd, inv };
  useEffect(() => {
    const el = wrap.current;
    const plot = svg.current;
    if (!el || !plot) return;
    // The wheel over the whole chart: the strip of laps, the plot, the legend and the overview.
    const wheel = (e: WheelEvent) => {
      const { domain: d, total: T, onDomain: set, fwd: to, inv: back } = live.current;
      const overview = (e.target as Element).closest?.('.overview');
      const r = (overview ?? plot).getBoundingClientRect();
      const w = r.width - PLOT_L - LANE.r;
      const frac = Math.min(1, Math.max(0, (e.clientX - r.left - PLOT_L) / w));
      const a = to(d[0]);
      const z = to(d[1]) - a;
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) || (e.shiftKey && !e.ctrlKey && !e.metaKey);
      if (!sideways && e.deltaY) {
        // The wheel (or a pinch, a wheel with Ctrl held) zooms around the point under the pointer:
        // one notch of a mouse wheel (100) twice or half the range.
        e.preventDefault();
        // Over the overview the point is on the whole run; over the plot, on the range shown.
        const around = overview ? back(frac * to(T)) : back(a + frac * z);
        set(zoomDomain(d, wheelFactor(e.deltaY, e.deltaMode), around, T));
      } else if (sideways) {
        if (d[1] - d[0] >= T) return;
        e.preventDefault();
        const by = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        set(panDomain(d, back(a + (by / w) * z) - d[0], T));
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const at = (e: MouseEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    return Math.min(d1, Math.max(d0, inv(f0 + ((e.clientX - r.left - PLOT_L) / (r.width - PLOT_L - LANE.r)) * fspan)));
  };
  const up = (e: MouseEvent<SVGSVGElement>) => {
    if (drag === null) return;
    const t = at(e);
    setDrag(null);
    if (Math.abs(t - drag) >= Math.min(20, span / 10)) onSelect({ from: Math.min(t, drag), to: Math.max(t, drag) });
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const centre = cursor ?? (d0 + d1) / 2;
    const step: Record<string, () => Domain> = {
      '+': () => zoomDomain(domain, 0.5, centre, total), '=': () => zoomDomain(domain, 0.5, centre, total),
      '-': () => zoomDomain(domain, 2, centre, total), '0': () => [0, total],
      ArrowLeft: () => panDomain(domain, -span / 5, total), ArrowRight: () => panDomain(domain, span / 5, total),
    };
    if (!step[e.key]) return;
    e.preventDefault();
    onDomain(step[e.key]());
  };

  const sel = drag !== null && cursor !== null ? { from: Math.min(drag, cursor), to: Math.max(drag, cursor) } : selection;
  const band = (b: Band) => { const a = Math.max(px(b.from), PLOT_L); const z = Math.min(px(b.to), width - LANE.r); return { x: a, width: Math.max(1, z - a) }; };
  const inView = (b: Band) => b.to > d0 && b.from < d1;
  const cx = cursor !== null && cursor >= d0 && cursor <= d1 ? px(cursor) : null;
  const order = [...drawn.filter((d) => d !== scale), ...(scale ? [scale] : [])];

  return (
    <div ref={wrap} className="run-chart" role="group" aria-label="Run chart: the wheel or + and − zoom, arrows move, 0 shows the whole run" tabIndex={0} onKeyDown={key}>
      <div ref={box} className="run-plot">
        {laps.length > 1 && (
          <div className="lap-strip" role="group" aria-label="Laps">
            {laps.map((l, i) => {
              if (!inView(l)) return null;
              const b = band(l);
              // The lap shown, which is the selection.
              const on = (d1 - d0 < total) && Math.abs(d0 - l.from) < 0.5 && Math.abs(d1 - l.to) < 0.5;
              return (
                <button key={i} type="button" className={`lap-bar ${on ? 'on' : ''} ${i % 2 ? 'odd' : ''}`} aria-pressed={on} aria-label={l.label ?? `Lap ${i + 1}`} title={l.label}
                  style={{ left: b.x + 1, width: Math.max(2, b.width - 2) }} onClick={() => onSelect({ from: l.from, to: l.to })}>
                  {b.width > 104 ? l.short ?? `Lap ${i + 1}` : b.width > 20 ? `${i + 1}` : ''}
                </button>
              );
            })}
          </div>
        )}
        <svg ref={svg} width={width} height={H} role="img" aria-label={`Run metrics · ${lines.map((l) => l.title).join(', ') || 'none shown'}`}
          onMouseMove={(e) => onCursor(at(e))} onMouseLeave={() => { onCursor(null); setDrag(null); }}
          onMouseDown={(e) => setDrag(at(e))} onMouseUp={up} onDoubleClick={(e) => { const t = at(e); const lap = laps.find((l) => t >= l.from && t < l.to); if (lap) onSelect({ from: lap.from, to: lap.to }); }} style={{ cursor: 'crosshair', userSelect: 'none', display: 'block' }}>
          <defs>
            <clipPath id={clip}><rect x={PLOT_L} y={0} width={Math.max(0, plotW)} height={top + height} /></clipPath>
            {scale && (
              <linearGradient id={wash} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={scale.line.color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={scale.line.color} stopOpacity="0" />
              </linearGradient>
            )}
          </defs>
          {laps.map((l, i) => i % 2 === 1 && inView(l) && <rect key={i} {...band(l)} y={top} height={height} fill="var(--surface-2)" />)}
          {blocks.filter(inView).map((b, i) => (
            <g key={`b${i}`} className="block-band">
              <rect {...band(b)} y={top} height={height} fill="var(--band)" />
              {b.ok && <rect {...band(b)} y={top} height={2} fill="var(--series-1)" />}
            </g>
          ))}
          {(banded ? drawn : scale ? [scale] : []).map((d) => d.stripes.map((st) => (
            <g key={`z${d.line.key}${st.z}`} className="zone-stripe" data-metric={d.line.key}>
              <rect x={PLOT_L} y={st.y} width={Math.max(0, plotW)} height={st.h} fill={d.line.color} fillOpacity={zoneShade(st.z, st.n)} />
            </g>
          )))}
          {zoneLabels.map((z) => <text key={z.id} x={width - LANE.r - 4} y={z.y} fontSize="9.5" textAnchor="end" fill="var(--text-2)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke" className="zone-name">{z.text}</text>)}
          {scale?.ticks.map((t) => <line key={`g${t}`} x1={PLOT_L} x2={width - LANE.r} y1={scale.py(t)} y2={scale.py(t)} stroke="var(--grid)" strokeWidth="1" />)}
          {gutter.map((g) => g.name ? (
            <g key={g.id} className="band-name">
              <rect x={LANE.l} y={g.y - 4} width={8} height={2.5} rx={1.25} fill={g.color} />
              <text x={PLOT_L - 6} y={g.y} fontSize="10" fontWeight="600" textAnchor="end" fill="var(--text-2)">{g.text}</text>
            </g>
          ) : (
            <text key={g.id} x={PLOT_L - 6} y={g.y} fontSize="10" textAnchor="end" fill="var(--muted)" className="tnum run-scale">{g.text}</text>
          ))}
          {blocks.filter((b) => b.name && inView(b)).map((b, i) => <text key={`n${i}`} x={Math.min(px(b.to), width - LANE.r) - 4} y={13} fontSize="10" textAnchor="end" fill="var(--text)">{b.name}</text>)}
          {sel && inView(sel) && <rect {...band(sel)} y={top} height={height} fill="var(--accent)" opacity="0.16" className="run-selection" />}
          <g clipPath={`url(#${clip})`}>
            {scale && <path d={scale.area} fill={`url(#${wash})`} />}
            {order.map((d) => (
              <path key={d.line.key} d={d.path} className="run-line" data-metric={d.line.key} fill="none" stroke={d.line.color}
                strokeWidth={d === scale ? 2.25 : 1.75} opacity={d === scale || !scale ? 1 : 0.8} strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </g>
          {(() => {
            // The min, max and average of the metric whose scale shows, or of the one pointed at in the table.
            const d = drawn.find((x) => x.line.key === (hot?.key ?? scale?.line.key));
            const mk = d && marks[d.line.key];
            if (!d || !mk) return null;
            const ya = d.py(mk.avg);
            // The min and max of the line as drawn ("punktu nie pokrywaja sie z wykresem"): over the
            // selection, or else the range shown, so that the points sit on the line.
            const [from, to] = selection ? [selection.from, selection.to] : [d0, d1];
            let lo = -1;
            let hi = -1;
            for (let i = 0; i < x.length; i++) {
              const v = d.line.y[i];
              if (v === null || x[i] < from || x[i] > to) continue;
              if (lo < 0 || v < d.line.y[lo]!) lo = i;
              if (hi < 0 || v > d.line.y[hi]!) hi = i;
            }
            const ext = lo < 0 ? null : { min: d.line.y[lo]!, minAt: x[lo], max: d.line.y[hi]!, maxAt: x[hi] };
            const label = (x: number, y: number, text: string, cls: string, lit: boolean) => (
              <g className={`run-mark ${cls} ${lit ? 'mark-hot' : ''}`}>
                <circle cx={x} cy={y} r={lit ? 6 : 4} fill="var(--surface)" stroke={d.line.color} strokeWidth={lit ? 3 : 2} />
                <text x={x > width - 120 ? x - 8 : x + 8} y={y - 6} fontSize="10" textAnchor={x > width - 120 ? 'end' : 'start'} fill="var(--text)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke" fontWeight={lit ? 700 : 500}>{text}</text>
              </g>
            );
            const inX = (t: number) => t >= d0 && t <= d1;
            const avgLit = hot?.key === d.line.key && hot.stat === 'avg';
            return (
              <g data-metric={d.line.key}>
                <line className={`run-mark mark-avg ${avgLit ? 'mark-hot' : ''}`} x1={PLOT_L} x2={width - LANE.r} y1={ya} y2={ya} stroke={d.line.color} strokeWidth={avgLit ? 2.5 : 1.25} strokeDasharray="6 4" />
                <text x={PLOT_L + 6} y={ya - 4} fontSize="10" textAnchor="start" fill="var(--text)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke" fontWeight={avgLit ? 700 : 500}>avg {d.line.format(mk.avg)}</text>
                {ext && inX(ext.minAt) && label(px(ext.minAt), d.py(ext.min), `min ${d.line.format(ext.min)}`, 'mark-min', hot?.key === d.line.key && hot.stat === 'min')}
                {ext && inX(ext.maxAt) && label(px(ext.maxAt), d.py(ext.max), `max ${d.line.format(ext.max)}`, 'mark-max', hot?.key === d.line.key && hot.stat === 'max')}
              </g>
            );
          })()}
          {cx !== null && <line x1={cx} x2={cx} y1={top} y2={top + height} stroke="var(--axis)" strokeWidth="1" />}
          {cx !== null && order.map((d) => {
            const v = valueAt(x, d.line.y, cursor!);
            return v === null ? null : <circle key={d.line.key} cx={cx} cy={d.py(v)} r="4" fill={d.line.color} stroke="var(--surface)" strokeWidth="2" />;
          })}
          <line x1={PLOT_L} x2={width - LANE.r} y1={top + height} y2={top + height} stroke="var(--axis)" strokeWidth="1" />
          {(byDist
            ? kmTicks(f0, f0 + fspan).map((m) => ({ x: PLOT_L + ((m - f0) / fspan) * plotW, main: kmLabel(m), sub: clock(inv(m)) }))
            : spanTicks(d0, d1).map((t) => ({ x: px(t), main: clock(t), sub: dmap ? kmLabel(dmap.toDist(t)) : '' }))
          ).map((k) => {
            const anchor = k.x < PLOT_L + 16 ? 'start' : k.x > width - LANE.r - 16 ? 'end' : 'middle';
            return (
              <g key={k.main}>
                <text x={k.x} y={top + height + 15} fontSize="10" textAnchor={anchor} fill="var(--muted)" className="tnum run-tick">{k.main}</text>
                {k.sub && <text x={k.x} y={top + height + 28} fontSize="9.5" textAnchor={anchor} fill="var(--muted)" opacity="0.7" className="tnum run-tick-sub">{k.sub}</text>}
              </g>
            );
          })}
        </svg>
        {cx !== null && (
          <div className="cursor-card" style={{ left: cx > width - 220 ? cx - 12 : cx + 12, transform: cx > width - 220 ? 'translateX(-100%)' : undefined }}>
            <div className="cursor-time">{head(cursor!)}</div>
            {lines.map((l) => { const v = valueAt(x, l.y, cursor!); return <div key={l.key} className="cursor-row"><span><i className="key-line" style={{ background: l.color }} /> {l.title}</span><b>{v === null ? '–' : l.format(v)}{v !== null && l.zones?.length ? <span className="cursor-zone"> Z{zoneOf(l.key, l.zones, v) + 1}</span> : null}</b></div>; })}
          </div>
        )}
      </div>
      <div className="chart-legend" role="group" aria-label="Scale shown">
        {drawn.map((d) => (
          <button key={d.line.key} type="button" className={`legend-item ${d === scale ? 'on' : ''}`} aria-pressed={d === scale} title={`Show the scale of ${d.line.title}`} onClick={() => onFocus(d.line.key)}>
            <i className="key-line" style={{ background: d.line.color }} />
            <span>{d.line.title}</span>
            <span className="muted tnum">{d.range ? `${d.line.tick(d.range[0])}–${d.line.format(d.range[1])}` : 'no data here'}</span>
          </button>
        ))}
      </div>
      <Overview x={x} total={total} line={focused} laps={laps} domain={domain} onDomain={onDomain} selection={selection} onSelect={onSelect} onMoveSelection={onMoveSelection} width={width} fwd={fwd} inv={inv} />
    </div>
  );
}

/**
 * The whole run in a thin strip under the chart, the range shown as a window: drag the window to
 * move along the run, drag elsewhere to zoom to that range, click to centre the window there.
 */
function Overview({ x, total, line, laps, domain, onDomain, selection, onSelect, onMoveSelection, width, fwd, inv }: { x: number[]; total: number; line?: RunLine; laps: Band[]; domain: Domain; onDomain: (d: Domain) => void; selection: Band | null; onSelect: (b: Band) => void; onMoveSelection?: (b: Band) => void; width: number; fwd: (t: number) => number; inv: (v: number) => number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [brush, setBrush] = useState<Band | null>(null);
  const h = 34;
  const plotW = width - PLOT_L - LANE.r;
  const end = fwd(total) || 1;
  const px = (t: number) => PLOT_L + (fwd(t) / end) * plotW;
  const path = useMemo(() => {
    if (!line) return '';
    const vals = line.y.filter((v): v is number => v !== null);
    const [lo, hi] = ensureSpan(...robustExtent(vals), line.minSpan);
    const py = (v: number) => { const f = (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo); return 4 + (line.invert ? f : 1 - f) * (h - 8); };
    return smoothPaths(x.map((t, i): [number, number] | null => (line.y[i] === null ? null : [px(t), py(line.y[i]!)])), h).line;
    // px follows fwd and the width, which are among the dependencies.
  }, [line, x, total, plotW, fwd]);
  const zoomed = domain[1] - domain[0] < total;

  // The window is the range the chart shows: it grows and shrinks with the zoom
  // ("zoom powinien automatycznie zwiekszac i zmniejszac okno na dole podgladu"); the selection is marked on its own.
  const current = zoomed ? { from: domain[0], to: domain[1] } : null;

  const down = (e: MouseEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const tAt = (cx: number) => Math.min(total, Math.max(0, inv(((cx - r.left - PLOT_L) / (r.width - PLOT_L - LANE.r)) * end)));
    const start = tAt(e.clientX);
    const [a, b] = domain;
    const sel = selection;
    const inside = !!current && start >= a && start <= b;
    let moved = false;
    // The range shown moved by `by`, and the selection with it ("zmiana okna ... zmienia selekcje").
    const shift = (by: number) => {
      const d = clampDomain([a + by, b + by], total);
      onDomain(d);
      const real = d[0] - a;
      if (sel && onMoveSelection) { const len = sel.to - sel.from; const f = Math.min(Math.max(0, sel.from + real), total - len); onMoveSelection({ from: f, to: f + len }); }
    };
    const move = (m: globalThis.MouseEvent) => {
      const t = tAt(m.clientX);
      if (Math.abs(t - start) > total / 200) moved = true;
      if (inside) { if (moved) shift(t - start); }
      else setBrush({ from: Math.min(start, t), to: Math.max(start, t) });
    };
    const up = (m: globalThis.MouseEvent) => {
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
      setBrush(null);
      if (inside) return;
      const t = tAt(m.clientX);
      // Dragged elsewhere: a new selection, zoomed to; a click: the window centred there.
      if (moved && Math.abs(t - start) >= 20) onSelect({ from: Math.min(start, t), to: Math.max(start, t) });
      else if (current) shift(start - (a + b) / 2);
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  };

  const win = brush ?? current;
  return (
    <svg ref={ref} className="overview" width={width} height={h} role="img" aria-label="Overview of the whole run: the window is the range shown; drag it to move, drag elsewhere to select" onMouseDown={down} style={{ display: 'block', userSelect: 'none', cursor: current ? 'grab' : 'crosshair' }}>
      <rect x={PLOT_L} y={0} width={Math.max(0, plotW)} height={h} rx="6" fill="var(--surface-2)" />
      {laps.map((l, i) => i % 2 === 1 && <rect key={i} x={px(l.from)} width={Math.max(1, px(l.to) - px(l.from))} y={0} height={h} fill="var(--surface-3)" opacity="0.6" />)}
      <path d={path} fill="none" stroke="var(--muted)" strokeWidth="1.25" />
      {selection && <rect className="overview-selection" x={px(selection.from)} y={h - 5} width={Math.max(2, px(selection.to) - px(selection.from))} height={4} rx="2" fill="var(--accent)" />}
      {win && (
        <g>
          {!brush && <rect x={PLOT_L} y={0} width={Math.max(0, px(win.from) - PLOT_L)} height={h} fill="var(--surface)" opacity="0.55" />}
          {!brush && <rect x={px(win.to)} y={0} width={Math.max(0, width - LANE.r - px(win.to))} height={h} fill="var(--surface)" opacity="0.55" />}
          <rect className="overview-window" x={px(win.from)} y={0.75} width={Math.max(2, px(win.to) - px(win.from))} height={h - 1.5} rx="5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

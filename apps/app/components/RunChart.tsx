'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { clock, ensureSpan, niceTicks, robustExtent, tickDecimals, useWidth } from './chartKit';
import { t } from '@/lib/i18n';
import { zoneColor, zoneOf, zoneRanges } from '@/lib/settings';
import { LANE, smoothPaths, thinPoints } from './charts';
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
  /** the least height of a band, px (MIN_LANE): less on the whole screen of a phone on its side, where the chart must fit what there is */
  minLane?: number;
}

const same = (v: number) => v;

/** The width under which the chart is narrow (a phone): a slim gutter, the bands' names inside the plot. */
const NARROW = 560;
/**
 * The room left and right of the plot, px: a lane, then the gutter for the names and values of the
 * scales (58 px). On a narrow chart the gutter holds only the values (34 px) and the lanes shrink,
 * so the plot takes nearly the whole width.
 */
function geometry(width: number) {
  const narrow = width < NARROW;
  const laneL = narrow ? 2 : LANE.l;
  return { narrow, laneL, laneR: narrow ? 4 : LANE.r, plotL: laneL + (narrow ? 34 : 58) };
}
/** The least distance between two labels of the gutter, px. */
const LABEL_GAP = 11;

/**
 * The room between two bands, px: each metric in a lane of its own (the runner's "tez troche odsstaje pod
 * wzgledem iwzualnym", 26 Nov 2026: the bands overlapped by a quarter, so the lines ran through each other
 * and the zones of four metrics made one patchwork of tints).
 */
const BAND_GAP = 8;
/** The width of the rail of zone colours at the right edge of a band, px, and the corners of a lane. */
const ZONE_RAIL = 4;
/** The least height of a band, px. */
const MIN_LANE = 62;
/**
 * The least height of a zone's stripe that takes the zone's name, px: the name is 7 px high. In a lane a quarter of
 * a laptop's chart high the stripes of five zones are some 10 px each, and every other one is then named (LABEL_GAP).
 */
const ZONE_NAME_ROOM = 9;
const LANE_RADIUS = 8;
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
 * pointer, move by a sideways scroll, the keyboard or the overview strip of the whole run under it;
 * by finger, a drag sideways selects, two fingers zoom and move, a tap shows the values.
 */
export function RunChart({ x, total, lines, focus, onFocus, domain, onDomain, laps = [], blocks = [], cursor, onCursor, selection, onSelect, head, height: asked = 260, layout = 'bands', axis = 'time', dmap, onMoveSelection, marks = {}, hot = null, minLane = MIN_LANE }: RunChartProps) {
  const [box, width] = useWidth();
  const { narrow, laneL, laneR, plotL: PLOT_L } = geometry(width);
  // In bands on a phone every metric keeps a lane tall enough to read its line: the chart grows past the height asked (the
  // page scrolls there anyway). On a wide screen the height asked stands: the Run screen fits its window without scrolling.
  const height = layout === 'bands' && lines.length > 1 && narrow ? Math.max(asked, lines.length * minLane + (lines.length - 1) * BAND_GAP) : asked;
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const clip = useId();
  const lanes = useId();
  const wash = useId();
  const [drag, setDrag] = useState<number | null>(null);
  // Room over the plot for the names of the blocks drawn.
  const top = blocks.some((b) => b.name) ? 20 : 6;
  // Two x axes under the plot: the chosen one, and the other at the same places.
  const H = top + height + 36;
  const [d0, d1] = domain;
  const span = d1 - d0 || 1;
  const plotW = width - PLOT_L - laneR;
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
    // The band of the line: a lane of its own, a gap from its neighbours, or the whole height.
    const n = lines.length;
    const bandH = layout === 'bands' && n > 1 ? (height - (n - 1) * BAND_GAP) / n : height;
    const b0 = layout === 'bands' && n > 1 ? top + k * (bandH + BAND_GAP) : top;
    const inner = bandH - 2 * BAND_PAD;
    const py = (v: number) => {
      const f = (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo);
      return b0 + BAND_PAD + (l.invert ? f : 1 - f) * inner;
    };
    const pts: ([number, number] | null)[] = [];
    for (let i = i0; i < i1; i++) pts.push(l.y[i] === null ? null : [px(x[i]), py(l.y[i]!)]);
    const range = vals.length ? [Math.min(...vals), Math.max(...vals)] as const : null;
    const p = smoothPaths(thinPoints(pts), b0 + bandH);
    // With zones, the values labelled are the boundaries of the zones in the range.
    const inRange = (t: number) => t >= lo && t <= hi;
    const bounds = (l.zones ?? []).filter(inRange);
    const raw = l.steps ? stepTicks(lo, hi, l.steps, layout === 'bands' && n > 1 ? 2 : 4) : niceTicks(lo, hi, layout === 'bands' && n > 1 ? 2 : 4);
    const ticks = bounds.length ? bounds : raw.filter(inRange);
    // The stripes of the zones, clipped to the scale and kept inside the band's lane: Z1 the easiest.
    const ownTop = b0;
    const ownBottom = b0 + bandH;
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
  }), [lines, i0, i1, x, d0, d1, plotW, height, top, layout, axis, dmap]);

  const scale = drawn.find((d) => d.line.key === focused?.key);
  const banded = layout === 'bands' && drawn.length > 1;
  // Ticks labelled: of every band, or of the focused line when overlaid.
  const labelled = banded ? drawn : scale ? [scale] : [];
  // The gutter: each band's name at its top (banded), then the values of the scales; a label too
  // near one already placed is left out, the names and the focused line's values placed first.
  const gutter = useMemo(() => {
    const want: { id: string; y: number; text: string; name?: boolean; color?: string; rank: number }[] = [];
    // On a narrow chart the names stand inside the plot (below), the gutter keeps only the values.
    if (banded && !narrow) drawn.forEach((d) => want.push({ id: `n${d.line.key}`, y: d.b0 + BAND_PAD + 8, text: d.line.short, name: true, color: d.line.color, rank: 0 }));
    for (const d of labelled) for (const t of d.ticks) want.push({ id: `${d.line.key}${t}`, y: d.py(t) + 3.5, text: d.line.tick(t, tickDecimals(d.ticks)), rank: d === scale ? 1 : 2 });
    const kept: typeof want = [];
    for (const w of [...want].sort((a, b) => a.rank - b.rank)) if (kept.every((k) => Math.abs(k.y - w.y) >= LABEL_GAP)) kept.push(w);
    return kept;
  }, [drawn, labelled, banded, scale, narrow]);
  // The zone names at the right edge, in the middle of their stripes; one too near another is left out.
  const zoneLabels = useMemo(() => {
    const want = (banded ? drawn : scale ? [scale] : []).flatMap((d) => d.stripes.filter((st) => st.h >= ZONE_NAME_ROOM).map((st) => ({ id: `zn${d.line.key}${st.z}`, y: st.y + st.h / 2 + 3.5, text: `Z${st.z + 1}`, rank: d === scale ? 0 : 1 })));
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
      // The margins of the chart's width now (they change with it).
      const g = geometry(r.width);
      const w = r.width - g.plotL - g.laneR;
      const frac = Math.min(1, Math.max(0, (e.clientX - r.left - g.plotL) / w));
      const a = to(d[0]);
      const z = to(d[1]) - a;
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) || (e.shiftKey && !e.ctrlKey && !e.metaKey);
      if (!sideways && e.deltaY) {
        // The wheel (or a pinch, a wheel with Ctrl held) zooms around the point under the pointer:
        // one notch of a mouse wheel (100) twice or half the range.
        // Over the overview the point is on the whole run; over the plot, on the range shown.
        const around = overview ? back(frac * to(T)) : back(a + frac * z);
        const next = zoomDomain(d, wheelFactor(e.deltaY, e.deltaMode), around, T);
        // Nothing left to zoom (the whole run shown, the wheel turned out): the page under the chart scrolls
        // on, where the chart held the wheel and neither moved (a pinned run on the Dashboard).
        if (next[0] === d[0] && next[1] === d[1]) return;
        e.preventDefault();
        set(next);
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
    return Math.min(d1, Math.max(d0, inv(f0 + ((e.clientX - r.left - PLOT_L) / (r.width - PLOT_L - laneR)) * fspan)));
  };
  const up = (e: MouseEvent<SVGSVGElement>) => {
    if (drag === null) return;
    const t = at(e);
    setDrag(null);
    if (Math.abs(t - drag) >= Math.min(20, span / 10)) onSelect({ from: Math.min(t, drag), to: Math.max(t, drag) });
  };
  /**
   * By finger (a phone, a tablet; the runner's "to zrob: Zaznaczanie i zoom fragmentu biegu dotykiem na
   * telefonie"): a drag sideways selects a part, as the mouse does; two fingers zoom around the point between
   * them and move the range with it; a tap shows the values there, two taps on a lap select it. A drag up or
   * down stays the page's scroll (touch-action: pan-y), and ends what was begun here.
   */
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: number; domain: Domain; around: number } | null>(null);
  /** a finger still down after two were: no selection from it */
  const pinched = useRef(false);
  const tapped = useRef<{ at: number; x: number } | null>(null);
  /**
   * When a finger was last on the chart: the browser follows a touch with mouse events of its own making
   * (over, out, leave), and a "mouse" left elsewhere on the page then "leaves" the chart and took away the
   * values a tap had just shown (seen where a pointer stood beside the chart, 26 Nov 2026).
   */
  const fingered = useRef(-Infinity);
  const byFinger = (e: { timeStamp: number }) => e.timeStamp - fingered.current < 1000;
  const timeAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    return Math.min(d1, Math.max(d0, inv(f0 + ((clientX - r.left - PLOT_L) / (r.width - PLOT_L - laneR)) * fspan)));
  };
  const fingerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse') return;
    fingered.current = e.timeStamp;
    // No mouse events made up after the touch: they would start a selection of their own.
    e.preventDefault();
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size === 1) {
      pinched.current = false;
      const t = timeAt(e.clientX);
      setDrag(t);
      onCursor(t);
      return;
    }
    if (fingers.current.size === 2) {
      const [p, q] = [...fingers.current.values()];
      setDrag(null);
      onCursor(null);
      pinched.current = true;
      pinch.current = { dist: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), mid: (p.x + q.x) / 2, domain, around: timeAt((p.x + q.x) / 2) };
    }
  };
  const fingerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' || !fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const start = pinch.current;
    if (fingers.current.size >= 2 && start) {
      const [p, q] = [...fingers.current.values()];
      // The fingers apart: a shorter range around the point they began at; that point follows their middle.
      const zoomed = zoomDomain(start.domain, start.dist / Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), start.around, total);
      const [a, z] = [fwd(zoomed[0]), fwd(zoomed[1]) - fwd(zoomed[0])];
      const by = -(((p.x + q.x) / 2 - start.mid) / Math.max(1, plotW)) * z;
      onDomain(panDomain(zoomed, inv(a + by) - zoomed[0], total));
    } else if (drag !== null && !pinched.current) onCursor(timeAt(e.clientX));
  };
  const fingerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' || !fingers.current.delete(e.pointerId)) return;
    fingered.current = e.timeStamp;
    if (fingers.current.size < 2) pinch.current = null;
    const began = drag;
    if (fingers.current.size === 0) setDrag(null);
    // Taken over by the page (a scroll), or the end of two fingers: nothing selected.
    if (e.type !== 'pointerup' || pinched.current || began === null) { if (e.type !== 'pointerup') onCursor(null); return; }
    const t = timeAt(e.clientX);
    if (Math.abs(t - began) >= Math.min(20, span / 10)) { tapped.current = null; onSelect({ from: Math.min(t, began), to: Math.max(t, began) }); return; }
    // A tap: the values there stay shown; a second one close by, within 350 ms, selects the lap under it.
    const now = e.timeStamp;
    const twice = tapped.current && now - tapped.current.at < 350 && Math.abs(e.clientX - tapped.current.x) < 30;
    tapped.current = twice ? null : { at: now, x: e.clientX };
    onCursor(t);
    if (twice) { const lap = laps.find((l) => t >= l.from && t < l.to); if (lap) onSelect({ from: lap.from, to: lap.to }); }
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    // The browser's own (Ctrl or ⌘ with + − 0 for its zoom, with an arrow for Back) stay the browser's.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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
  const band = (b: Band) => { const a = Math.max(px(b.from), PLOT_L); const z = Math.min(px(b.to), width - laneR); return { x: a, width: Math.max(1, z - a) }; };
  const inView = (b: Band) => b.to > d0 && b.from < d1;
  const cx = cursor !== null && cursor >= d0 && cursor <= d1 ? px(cursor) : null;
  const order = [...drawn.filter((d) => d !== scale), ...(scale ? [scale] : [])];

  return (
    <div ref={wrap} className="run-chart" role="group" aria-label={t('Run chart: the wheel or + and − zoom, arrows move, 0 shows the whole run')} tabIndex={0} onKeyDown={key}>
      <div ref={box} className="run-plot">
        {laps.length > 1 && (
          <div className="lap-strip" role="group" aria-label={t('Laps')}>
            {laps.map((l, i) => {
              if (!inView(l)) return null;
              const b = band(l);
              // The lap shown, which is the selection.
              const on = (d1 - d0 < total) && Math.abs(d0 - l.from) < 0.5 && Math.abs(d1 - l.to) < 0.5;
              return (
                <button key={i} type="button" className={`lap-bar ${on ? 'on' : ''} ${i % 2 ? 'odd' : ''}`} aria-pressed={on} aria-label={l.label ?? t('Lap {n}', { n: i + 1 })} title={l.label}
                  style={{ left: b.x + 1, width: Math.max(2, b.width - 2) }} onClick={() => onSelect({ from: l.from, to: l.to })}>
                  {b.width > 104 ? l.short ?? t('Lap {n}', { n: i + 1 }) : b.width > 20 ? `${i + 1}` : ''}
                </button>
              );
            })}
          </div>
        )}
        <svg ref={svg} width={width} height={H} role="img" aria-label={t('Run metrics · {metrics}', { metrics: lines.map((l) => l.title).join(', ') || t('none shown') })}
          onMouseMove={(e) => { if (!byFinger(e)) onCursor(at(e)); }} onMouseLeave={(e) => { if (byFinger(e)) return; onCursor(null); setDrag(null); }}
          onMouseDown={(e) => setDrag(at(e))} onMouseUp={up} onDoubleClick={(e) => { const t = at(e); const lap = laps.find((l) => t >= l.from && t < l.to); if (lap) onSelect({ from: lap.from, to: lap.to }); }}
          onPointerDown={fingerDown} onPointerMove={fingerMove} onPointerUp={fingerUp} onPointerCancel={fingerUp}
          style={{ cursor: 'crosshair', userSelect: 'none', display: 'block', touchAction: 'pan-y' }}>
          <defs>
            <clipPath id={clip}><rect x={PLOT_L} y={0} width={Math.max(0, plotW)} height={top + height} /></clipPath>
            {/* The lanes of the bands: what lies behind the lines (laps, segments, zones, the selection) is drawn inside them. */}
            <clipPath id={lanes}>
              {banded ? drawn.map((d) => <rect key={d.line.key} x={PLOT_L} y={d.b0} width={Math.max(0, plotW)} height={d.bandH} rx={LANE_RADIUS} />) : <rect x={PLOT_L} y={top} width={Math.max(0, plotW)} height={height} />}
            </clipPath>
            {scale && (
              <linearGradient id={wash} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={scale.line.color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={scale.line.color} stopOpacity="0" />
              </linearGradient>
            )}
          </defs>
          <g clipPath={`url(#${lanes})`}>
            {/* Each lane a quiet panel; its zones a faint tint across it and a rail of their colours at its right edge. */}
            {banded && drawn.map((d) => <rect key={`l${d.line.key}`} className="run-lane" x={PLOT_L} y={d.b0} width={Math.max(0, plotW)} height={d.bandH} fill="var(--surface-2)" fillOpacity={0.6} />)}
            {laps.map((l, i) => i % 2 === 1 && inView(l) && <rect key={i} {...band(l)} y={top} height={height} fill="var(--text)" fillOpacity={0.035} />)}
            {blocks.filter(inView).map((b, i) => (
              <g key={`b${i}`} className="block-band">
                <rect {...band(b)} y={top} height={height} fill="var(--band)" />
                {b.ok && <rect {...band(b)} y={top} height={2} fill="var(--series-1)" />}
              </g>
            ))}
            {(banded ? drawn : scale ? [scale] : []).map((d) => d.stripes.map((st) => (
              <g key={`z${d.line.key}${st.z}`} className="zone-stripe" data-metric={d.line.key} data-zone={st.z + 1}>
                <rect x={PLOT_L} y={st.y} width={Math.max(0, plotW)} height={st.h} fill={zoneColor(st.z, st.n)} fillOpacity={0.07} />
                <rect x={width - laneR - ZONE_RAIL} y={st.y + 1} width={ZONE_RAIL} height={Math.max(0, st.h - 2)} fill={zoneColor(st.z, st.n)} fillOpacity={0.9} />
              </g>
            )))}
          </g>
          {zoneLabels.map((z) => <text key={z.id} x={width - laneR - ZONE_RAIL - 5} y={z.y} fontSize="9.5" textAnchor="end" fill="var(--text-2)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke" className="zone-name">{z.text}</text>)}
          {scale?.ticks.map((t) => <line key={`g${t}`} x1={PLOT_L} x2={width - laneR} y1={scale.py(t)} y2={scale.py(t)} stroke="var(--grid)" strokeWidth="1" />)}
          {gutter.map((g) => g.name ? (
            <g key={g.id} className="band-name">
              <rect x={laneL} y={g.y - 4} width={8} height={2.5} rx={1.25} fill={g.color} />
              <text x={PLOT_L - 6} y={g.y} fontSize="10" fontWeight="600" textAnchor="end" fill="var(--text-2)">{g.text}</text>
            </g>
          ) : (
            <text key={g.id} x={PLOT_L - 6} y={g.y} fontSize="10" textAnchor="end" fill="var(--muted)" className="tnum run-scale">{g.text}</text>
          ))}
          {blocks.filter((b) => b.name && inView(b)).map((b, i) => <text key={`n${i}`} x={Math.min(px(b.to), width - laneR) - 4} y={13} fontSize="10" textAnchor="end" fill="var(--text)">{b.name}</text>)}
          {sel && inView(sel) && <rect {...band(sel)} y={top} height={height} fill="var(--accent)" opacity="0.16" className="run-selection" clipPath={`url(#${lanes})`} />}
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
                {/* Above the point, or under it when the band's top leaves no room (a highest value at the top of its band). */}
                <text x={x > width - 120 ? x - 8 : x + 8} y={y - 16 < d.b0 + 2 ? y + 15 : y - 6} fontSize="10" textAnchor={x > width - 120 ? 'end' : 'start'} fill="var(--text)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke" fontWeight={lit ? 700 : 500}>{text}</text>
              </g>
            );
            const inX = (t: number) => t >= d0 && t <= d1;
            const avgLit = hot?.key === d.line.key && hot.stat === 'avg';
            return (
              <g data-metric={d.line.key}>
                <line className={`run-mark mark-avg ${avgLit ? 'mark-hot' : ''}`} x1={PLOT_L} x2={width - laneR} y1={ya} y2={ya} stroke={d.line.color} strokeWidth={avgLit ? 2.5 : 1.25} strokeDasharray="6 4" />
                <text x={PLOT_L + 6 + (narrow && banded ? 22 + d.line.short.length * 6.5 : 0)} y={ya - 4} fontSize="10" textAnchor="start" fill="var(--text)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke" fontWeight={avgLit ? 700 : 500}>{t('avg {value}', { value: d.line.format(mk.avg) })}</text>
                {ext && inX(ext.minAt) && label(px(ext.minAt), d.py(ext.min), t('min {value}', { value: d.line.format(ext.min) }), 'mark-min', hot?.key === d.line.key && hot.stat === 'min')}
                {ext && inX(ext.maxAt) && label(px(ext.maxAt), d.py(ext.max), t('max {value}', { value: d.line.format(ext.max) }), 'mark-max', hot?.key === d.line.key && hot.stat === 'max')}
              </g>
            );
          })()}
          {cx !== null && <line x1={cx} x2={cx} y1={top} y2={top + height} stroke="var(--axis)" strokeWidth="1" />}
          {cx !== null && order.map((d) => {
            const v = valueAt(x, d.line.y, cursor!);
            return v === null ? null : <circle key={d.line.key} cx={cx} cy={d.py(v)} r="4" fill={d.line.color} stroke="var(--surface)" strokeWidth="2" />;
          })}
          {/* A narrow chart names its bands inside the plot, at the top left of each, over the lines. */}
          {narrow && banded && drawn.map((d) => (
            <g key={`in${d.line.key}`} className="band-name inside">
              <rect x={PLOT_L + 5} y={d.b0 + BAND_PAD + 4} width={8} height={2.5} rx={1.25} fill={d.line.color} />
              <text x={PLOT_L + 17} y={d.b0 + BAND_PAD + 8} fontSize="10" fontWeight="650" textAnchor="start" fill="var(--text)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke">{d.line.short}</text>
            </g>
          ))}
          <line x1={PLOT_L} x2={width - laneR} y1={top + height} y2={top + height} stroke="var(--axis)" strokeWidth="1" />
          {(byDist
            ? kmTicks(f0, f0 + fspan).map((m) => ({ x: PLOT_L + ((m - f0) / fspan) * plotW, main: kmLabel(m), sub: clock(inv(m)) }))
            : spanTicks(d0, d1).map((t) => ({ x: px(t), main: clock(t), sub: dmap ? kmLabel(dmap.toDist(t)) : '' }))
          ).map((k) => {
            const anchor = k.x < PLOT_L + 16 ? 'start' : k.x > width - laneR - 16 ? 'end' : 'middle';
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
      <div className="chart-legend" role="group" aria-label={t('Scale shown')}>
        {drawn.map((d) => (
          <button key={d.line.key} type="button" className={`legend-item ${d === scale ? 'on' : ''}`} aria-pressed={d === scale} title={t('Show the scale of {metric}', { metric: d.line.title })} onClick={() => onFocus(d.line.key)}>
            <i className="key-line" style={{ background: d.line.color }} />
            <span>{d.line.title}</span>
            <span className="muted tnum">{d.range ? `${d.line.tick(d.range[0])}–${d.line.format(d.range[1])}` : t('no data here')}</span>
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
  const { laneR, plotL: PLOT_L } = geometry(width);
  const plotW = width - PLOT_L - laneR;
  const end = fwd(total) || 1;
  const px = (t: number) => PLOT_L + (fwd(t) / end) * plotW;
  const path = useMemo(() => {
    if (!line) return '';
    const vals = line.y.filter((v): v is number => v !== null);
    const [lo, hi] = ensureSpan(...robustExtent(vals), line.minSpan);
    const py = (v: number) => { const f = (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo); return 4 + (line.invert ? f : 1 - f) * (h - 8); };
    return smoothPaths(thinPoints(x.map((t, i): [number, number] | null => (line.y[i] === null ? null : [px(t), py(line.y[i]!)]))), h).line;
    // px follows fwd and the width, which are among the dependencies.
  }, [line, x, total, plotW, fwd]);
  const zoomed = domain[1] - domain[0] < total;

  // The window is the range the chart shows: it grows and shrinks with the zoom
  // ("zoom powinien automatycznie zwiekszac i zmniejszac okno na dole podgladu"); the selection is marked on its own.
  const current = zoomed ? { from: domain[0], to: domain[1] } : null;

  // By mouse or by finger (pointer events): a finger's drag up or down stays the page's scroll, and ends it.
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') e.preventDefault();
    const id = e.pointerId;
    const r = ref.current!.getBoundingClientRect();
    const tAt = (cx: number) => Math.min(total, Math.max(0, inv(((cx - r.left - PLOT_L) / (r.width - PLOT_L - laneR)) * end)));
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
    const move = (m: globalThis.PointerEvent) => {
      if (m.pointerId !== id) return;
      const t = tAt(m.clientX);
      if (Math.abs(t - start) > total / 200) moved = true;
      if (inside) { if (moved) shift(t - start); }
      else setBrush({ from: Math.min(start, t), to: Math.max(start, t) });
    };
    const up = (m: globalThis.PointerEvent) => {
      if (m.pointerId !== id) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      setBrush(null);
      if (inside || m.type !== 'pointerup') return;
      const t = tAt(m.clientX);
      // Dragged elsewhere: a new selection, zoomed to; a click: the window centred there.
      if (moved && Math.abs(t - start) >= 20) onSelect({ from: Math.min(start, t), to: Math.max(start, t) });
      else if (current) shift(start - (a + b) / 2);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

  const win = brush ?? current;
  return (
    <svg ref={ref} className="overview" width={width} height={h} role="img" aria-label={t('Overview of the whole run: the window is the range shown; drag it to move, drag elsewhere to select')} onPointerDown={down} style={{ display: 'block', userSelect: 'none', cursor: current ? 'grab' : 'crosshair', touchAction: 'pan-y' }}>
      <rect x={PLOT_L} y={0} width={Math.max(0, plotW)} height={h} rx="6" fill="var(--surface-2)" />
      {laps.map((l, i) => i % 2 === 1 && <rect key={i} x={px(l.from)} width={Math.max(1, px(l.to) - px(l.from))} y={0} height={h} fill="var(--surface-3)" opacity="0.6" />)}
      <path d={path} fill="none" stroke="var(--muted)" strokeWidth="1.25" />
      {selection && <rect className="overview-selection" x={px(selection.from)} y={h - 5} width={Math.max(2, px(selection.to) - px(selection.from))} height={4} rx="2" fill="var(--accent)" />}
      {win && (
        <g>
          {!brush && <rect x={PLOT_L} y={0} width={Math.max(0, px(win.from) - PLOT_L)} height={h} fill="var(--surface)" opacity="0.55" />}
          {!brush && <rect x={px(win.to)} y={0} width={Math.max(0, width - laneR - px(win.to))} height={h} fill="var(--surface)" opacity="0.55" />}
          <rect className="overview-window" x={px(win.from)} y={0.75} width={Math.max(2, px(win.to) - px(win.from))} height={h - 1.5} rx="5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

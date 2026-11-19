'use client';

import { useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useMapTiles } from '@/lib/client';
import { clock, ensureSpan, niceTicks, robustExtent, tickDecimals, timeTicks, useWidth } from './chartKit';

type Band = { from: number; to: number };

/** The margins of a lane: the plot starts near the left edge, the tick labels sit inside it. */
export const LANE = { l: 10, r: 12 };

interface LineChartProps {
  title: string;
  /** the unit, shown muted after the title */
  unit?: string;
  x: number[];
  /** null where nothing is drawn: no signal, or stopped (the line breaks there) */
  y: (number | null)[];
  format: (v: number) => string;
  /** an axis tick, without the unit (the title carries it), with the decimals its step needs; default: format */
  tick?: (v: number, decimals?: number) => string;
  /** the least range of the y axis */
  minSpan?: number;
  color?: string;
  /** smaller is better drawn on top, e.g. pace */
  invert?: boolean;
  laps?: Band[];
  blocks?: (Band & { ok: boolean; name?: string })[];
  cursor: number | null;
  onCursor: (x: number | null) => void;
  /** the selected fragment, s */
  selection?: Band | null;
  /** drag across the chart to select a fragment */
  onSelect?: (b: Band) => void;
  /** the time axis under the chart (the last of a stack) */
  axis?: boolean;
  /** lap numbers and block names over the chart (the first of a stack) */
  labels?: boolean;
  height?: number;
}

/**
 * A smooth path through points (monotone cubic: no overshoot past the data), one 'M' per
 * unbroken stretch, and the wash under each stretch down to `base`.
 */
function smoothPaths(pts: ([number, number] | null)[], base: number): { line: string; area: string } {
  let line = '';
  let area = '';
  const runs: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (const p of pts) {
    if (p) cur.push(p);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  for (const r of runs) {
    const n = r.length;
    const d = [`M${r[0][0].toFixed(1)},${r[0][1].toFixed(1)}`];
    if (n > 1) {
      // Fritsch–Carlson slopes.
      const dx = r.slice(1).map((p, i) => p[0] - r[i][0]);
      const dy = r.slice(1).map((p, i) => p[1] - r[i][1]);
      const sl = dx.map((h, i) => (h ? dy[i] / h : 0));
      const m = r.map((_, i) => {
        if (i === 0) return sl[0];
        if (i === n - 1) return sl[n - 2];
        if (sl[i - 1] * sl[i] <= 0) return 0;
        return (sl[i - 1] + sl[i]) / 2;
      });
      for (let i = 0; i < n - 1; i++) {
        const h = dx[i];
        d.push(`C${(r[i][0] + h / 3).toFixed(1)},${(r[i][1] + (m[i] * h) / 3).toFixed(1)} ${(r[i + 1][0] - h / 3).toFixed(1)},${(r[i + 1][1] - (m[i + 1] * h) / 3).toFixed(1)} ${r[i + 1][0].toFixed(1)},${r[i + 1][1].toFixed(1)}`);
      }
    }
    const seg = d.join('');
    line += seg;
    area += `${seg} L${r[n - 1][0].toFixed(1)},${base.toFixed(1)} L${r[0][0].toFixed(1)},${base.toFixed(1)} Z`;
  }
  return { line, area };
}

/**
 * One metric of a run over time, in a stack of charts that share the time axis and the cursor:
 * laps as alternating bands, block instances as washed bands, a smooth 2px line that breaks
 * where the runner stopped with a wash fading away under it, round ticks labelled inside the
 * plot on a scale that ignores spikes, and the value under the cursor as a dot on the line.
 */
export function LineChart({ title, unit, x, y, format, tick = format, minSpan = 0, color = 'var(--series-1)', invert, laps = [], blocks = [], cursor, onCursor, selection = null, onSelect, axis, labels, height = 96 }: LineChartProps) {
  const [box, width] = useWidth();
  const svg = useRef<SVGSVGElement>(null);
  const gradient = useId();
  const [drag, setDrag] = useState<number | null>(null);
  const top = labels ? 18 : 6;
  const H = top + height + (axis ? 22 : 6);
  const xMax = x[x.length - 1] || 1;
  const px = (t: number) => LANE.l + (t / xMax) * (width - LANE.l - LANE.r);
  const { line, area, ticks, py } = useMemo(() => {
    const [lo, hi] = ensureSpan(...robustExtent(y.filter((v): v is number => v !== null)), minSpan);
    const py = (v: number) => {
      const f = (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo);
      return top + (invert ? f : 1 - f) * height;
    };
    const pts = x.map((t, i): [number, number] | null => (y[i] === null ? null : [px(t), py(y[i]!)]));
    return { ...smoothPaths(pts, top + height), ticks: niceTicks(lo, hi, 3).filter((t) => t >= lo && t <= hi), py };
    // px follows width, which is among the dependencies.
  }, [x, y, invert, height, width, top, minSpan]);

  const value = useMemo(() => {
    if (cursor === null) return null;
    let best = -1;
    for (let i = 0; i < x.length; i++) if (x[i] <= cursor) best = i;
    return best >= 0 ? y[best] : null;
  }, [cursor, x, y]);
  // With no cursor, the head shows the mean of the lane.
  const mean = useMemo(() => { const v = y.filter((a): a is number => a !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }, [y]);

  const at = (e: MouseEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    return Math.min(xMax, Math.max(0, ((e.clientX - r.left - LANE.l) / (r.width - LANE.l - LANE.r)) * xMax));
  };
  const up = (e: MouseEvent<SVGSVGElement>) => {
    if (drag === null) return;
    const t = at(e);
    setDrag(null);
    if (Math.abs(t - drag) >= 20) onSelect?.({ from: Math.min(t, drag), to: Math.max(t, drag) });
  };
  const live = drag !== null && cursor !== null ? { from: Math.min(drag, cursor), to: Math.max(drag, cursor) } : selection;
  const band = (b: Band) => ({ x: px(b.from), width: Math.max(1, px(b.to) - px(b.from)) });

  return (
    <div ref={box} className="metric-chart">
      <div className="metric-head">
        <span className="metric-title">{title}{unit && <span className="muted"> · {unit}</span>}</span>
        <span className="metric-value">{value !== null && value !== undefined ? format(value) : mean !== null ? <span className="muted">avg {format(mean)}</span> : ''}</span>
      </div>
      <svg ref={svg} width={width} height={H} onMouseMove={(e) => onCursor(at(e))} onMouseLeave={() => { onCursor(null); setDrag(null); }}
        onMouseDown={(e) => onSelect && setDrag(at(e))} onMouseUp={up} style={{ cursor: onSelect ? 'crosshair' : undefined, userSelect: 'none', display: 'block' }} role="img" aria-label={unit ? `${title} · ${unit}` : title}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {laps.map((l, i) => i % 2 === 1 && <rect key={i} {...band(l)} y={top} height={height} fill="var(--surface-2)" />)}
        {blocks.map((b, i) => (
          <g key={`b${i}`}>
            <rect {...band(b)} y={top} height={height} fill="var(--band)" />
            {b.ok && <rect {...band(b)} y={top} height={2} fill="var(--series-1)" />}
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LANE.l} x2={width - LANE.r} y1={py(t)} y2={py(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={LANE.l + 4} y={py(t) - 3} fontSize="10" fill="var(--muted)" className="tnum">{tick(t, tickDecimals(ticks))}</text>
          </g>
        ))}
        {labels && laps.length > 1 && laps.map((l, i) => <text key={`l${i}`} x={px(l.from) + 4} y={11} fontSize="10" fill="var(--muted)">L{i + 1}</text>)}
        {labels && blocks.filter((b) => b.name).map((b, i) => <text key={`n${i}`} x={px(b.to) - 4} y={11} fontSize="10" textAnchor="end" fill="var(--text)">{b.name}</text>)}
        {live && <rect {...band(live)} y={top} height={height} fill="var(--accent)" opacity="0.16" />}
        <path d={area} fill={`url(#${gradient})`} className="area" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {cursor !== null && <line x1={px(cursor)} x2={px(cursor)} y1={top} y2={top + height} stroke="var(--axis)" strokeWidth="1" />}
        {cursor !== null && value !== null && value !== undefined && <circle cx={px(cursor)} cy={py(value)} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />}
        {axis && (
          <g>
            <line x1={LANE.l} x2={width - LANE.r} y1={top + height} y2={top + height} stroke="var(--axis)" strokeWidth="1" />
            {timeTicks(xMax).map((t) => <text key={t} x={px(t)} y={top + height + 15} fontSize="10" textAnchor={t === 0 ? 'start' : 'middle'} fill="var(--muted)" className="tnum">{clock(t)}</text>)}
          </g>
        )}
      </svg>
    </div>
  );
}

interface RouteMapProps {
  lat: (number | null)[];
  lon: (number | null)[];
  t: number[];
  cursor: number | null;
  selection?: Band | null;
  /** click two points on the route to select the stretch between them */
  onSelect?: (b: Band) => void;
}

/** Web Mercator: world pixels at a zoom level, as the OpenStreetMap tiles are cut. */
function mercator(lat: number, lon: number, z: number): [number, number] {
  const n = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

/**
 * The route from the GPS points, on a dotted grid or (switched on) OpenStreetMap tiles: a soft
 * halo under the line, the start as a ring, the end as a dot, the cursor as a marker.
 */
export function RouteMap({ lat, lon, t, cursor, selection = null, onSelect }: RouteMapProps) {
  const size = 320;
  const pad = 20;
  const svgRef = useRef<SVGSVGElement>(null);
  const grid = useId();
  const [first, setFirst] = useState<number | null>(null);
  const [tiles] = useMapTiles();
  const geo = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < lat.length; i++) if (lat[i] !== null && lon[i] !== null) pts.push([lat[i]!, lon[i]!, t[i]]);
    if (!pts.length) return null;
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    // The highest zoom (up to 17) at which the route fits the map, one map unit per tile pixel.
    let z = 17;
    for (; z > 1; z--) {
      const [x0, y0] = mercator(Math.max(...lats), Math.min(...lons), z);
      const [x1, y1] = mercator(Math.min(...lats), Math.max(...lons), z);
      if (x1 - x0 <= size - 2 * pad && y1 - y0 <= size - 2 * pad) break;
    }
    const [x0, y0] = mercator(Math.max(...lats), Math.min(...lons), z);
    const [x1, y1] = mercator(Math.min(...lats), Math.max(...lons), z);
    const ox = (x0 + x1) / 2 - size / 2;
    const oy = (y0 + y1) / 2 - size / 2;
    const proj = (la: number, lo: number): [number, number] => { const [x, y] = mercator(la, lo, z); return [x - ox, y - oy]; };
    const d = pts.map((p, i) => { const [x, y] = proj(p[0], p[1]); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('');
    // The tiles covering the map.
    const cover: { href: string; x: number; y: number }[] = [];
    const max = 2 ** z;
    for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + size) / 256); tx++)
      for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + size) / 256); ty++)
        if (ty >= 0 && ty < max) cover.push({ href: `https://tile.openstreetmap.org/${z}/${((tx % max) + max) % max}/${ty}.png`, x: tx * 256 - ox, y: ty * 256 - oy });
    return { d, pts, proj, cover };
  }, [lat, lon, t]);

  if (!geo) return <div className="card empty">No GPS in this run.</div>;
  let marker: [number, number] | null = null;
  if (cursor !== null) {
    const p = geo.pts.reduce((best, q) => (q[2] <= cursor ? q : best), geo.pts[0]);
    marker = geo.proj(p[0], p[1]);
  }
  const start = geo.proj(geo.pts[0][0], geo.pts[0][1]);
  const endPt = geo.pts[geo.pts.length - 1];
  const end = geo.proj(endPt[0], endPt[1]);
  const sel = selection ? geo.pts.filter((p) => p[2] >= selection.from && p[2] < selection.to) : [];
  const selD = sel.map((p, i) => { const [x, y] = geo.proj(p[0], p[1]); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('');
  /** The time of the route point nearest a click. */
  const pick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onSelect) return;
    const r = svgRef.current!.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * size;
    const my = ((e.clientY - r.top) / r.height) * size;
    let best = geo.pts[0];
    let bd = Infinity;
    for (const p of geo.pts) { const [x, y] = geo.proj(p[0], p[1]); const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = p; } }
    if (bd > 15 ** 2) return;
    if (first === null) setFirst(best[2]);
    else { onSelect({ from: Math.min(first, best[2]), to: Math.max(first, best[2]) }); setFirst(null); }
  };
  const firstPt = first !== null ? geo.pts.find((p) => p[2] >= first) : null;
  const route = tiles ? 'var(--accent)' : 'var(--series-1)';
  return (
    <div className="card map">
      <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label="Route" onClick={pick} style={{ cursor: onSelect ? 'crosshair' : undefined, display: 'block' }}>
        <defs>
          <pattern id={grid} width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--axis)" />
          </pattern>
        </defs>
        {tiles ? (
          <g className="map-tiles" aria-hidden="true">
            {geo.cover.map((c) => <image key={c.href} href={c.href} x={c.x} y={c.y} width={256} height={256} />)}
          </g>
        ) : (
          <rect width={size} height={size} fill={`url(#${grid})`} />
        )}
        <path d={geo.d} fill="none" stroke={route} strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" opacity="0.12" />
        <path d={geo.d} fill="none" stroke={route} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity={selection ? 0.35 : 1} />
        {selD && <path d={selD} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />}
        {firstPt && <circle cx={geo.proj(firstPt[0], firstPt[1])[0]} cy={geo.proj(firstPt[0], firstPt[1])[1]} r="6" fill="var(--accent)" />}
        <circle cx={end[0]} cy={end[1]} r="4" fill="var(--text)" stroke="var(--surface)" strokeWidth="2" />
        <circle cx={start[0]} cy={start[1]} r="5" fill="var(--surface)" stroke="var(--ok)" strokeWidth="2.5" />
        {marker && <circle cx={marker[0]} cy={marker[1]} r="6" fill="var(--surface)" stroke="var(--text)" strokeWidth="2" />}
      </svg>
      <div className="muted small map-foot">
        <span style={{ flex: 1 }}>{onSelect ? (first === null ? 'Click two points on the route to select the stretch between them.' : 'Now click the end of the stretch.') : ''}</span>
        {tiles && <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}
      </div>
    </div>
  );
}

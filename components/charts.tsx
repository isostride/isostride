'use client';

import { useMemo, useRef, type MouseEvent } from 'react';

type Band = { from: number; to: number };

interface LineChartProps {
  title: string;
  x: number[];
  y: (number | null)[];
  format: (v: number) => string;
  color?: string;
  /** smaller is better drawn on top, e.g. pace */
  invert?: boolean;
  laps?: Band[];
  flagged?: Band[];
  blocks?: (Band & { ok: boolean })[];
  cursor: number | null;
  onCursor: (x: number | null) => void;
  height?: number;
}

const W = 900;

/** A small synchronized line chart: shared time axis, lap bands, hatched quality-flagged windows, hover cursor. */
export function LineChart({ title, x, y, format, color = 'var(--series-1)', invert, laps = [], flagged = [], blocks = [], cursor, onCursor, height = 110 }: LineChartProps) {
  const ref = useRef<SVGSVGElement>(null);
  const { path, min, max, xMax } = useMemo(() => {
    const vals = y.filter((v): v is number => v !== null);
    // Trim outliers so a single spike does not flatten the line.
    const sorted = [...vals].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.01)] ?? 0;
    const hi = sorted[Math.ceil(sorted.length * 0.99) - 1] ?? 1;
    const pad = (hi - lo) * 0.08 || 1;
    const min = lo - pad;
    const max = hi + pad;
    const xMax = x[x.length - 1] || 1;
    let d = '';
    let pen = false;
    for (let i = 0; i < x.length; i++) {
      const v = y[i];
      if (v === null) { pen = false; continue; }
      const px = (x[i] / xMax) * W;
      let t = (Math.min(Math.max(v, min), max) - min) / (max - min);
      if (invert) t = 1 - t;
      const py = height - t * height;
      d += `${pen ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
      pen = true;
    }
    return { path: d, min, max, xMax };
  }, [x, y, invert, height]);

  const value = useMemo(() => {
    if (cursor === null) return null;
    let best = -1;
    for (let i = 0; i < x.length; i++) if (x[i] <= cursor) best = i;
    return best >= 0 ? y[best] : null;
  }, [cursor, x, y]);

  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    onCursor(((e.clientX - r.left) / r.width) * xMax);
  };

  return (
    <div className="card chart-card">
      <h3>
        <span>{title}</span>
        <span style={{ color: 'var(--text)' }}>{value !== null && value !== undefined ? format(value) : ''}</span>
      </h3>
      <svg ref={ref} viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" onMouseMove={move} onMouseLeave={() => onCursor(null)} role="img" aria-label={title}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted)" strokeWidth="1.5" opacity="0.35" />
          </pattern>
        </defs>
        {laps.map((l, i) => i % 2 === 1 && <rect key={i} x={(l.from / xMax) * W} width={((l.to - l.from) / xMax) * W} y={0} height={height} fill="var(--surface-2)" />)}
        {blocks.map((b, i) => <rect key={`b${i}`} x={(b.from / xMax) * W} width={((b.to - b.from) / xMax) * W} y={0} height={height} fill="var(--accent-soft)" stroke={b.ok ? 'var(--accent)' : 'none'} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {flagged.map((f, i) => <rect key={`f${i}`} x={(f.from / xMax) * W} width={Math.max(1, ((f.to - f.from) / xMax) * W)} y={0} height={height} fill="url(#hatch)" />)}
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {cursor !== null && <line x1={(cursor / xMax) * W} x2={(cursor / xMax) * W} y1={0} y2={height} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="muted" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
        <span>{format(invert ? max : min)}</span>
        <span>{format(invert ? min : max)}</span>
      </div>
    </div>
  );
}

interface RouteMapProps {
  lat: (number | null)[];
  lon: (number | null)[];
  t: number[];
  cursor: number | null;
}

/** The route drawn from GPS points alone (no map tiles: nothing is fetched, the data never leaves the computer). */
export function RouteMap({ lat, lon, t, cursor }: RouteMapProps) {
  const size = 320;
  const geo = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < lat.length; i++) if (lat[i] !== null && lon[i] !== null) pts.push([lat[i]!, lon[i]!, t[i]]);
    if (!pts.length) return null;
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180);
    const kx = Math.cos(midLat);
    const minX = Math.min(...lons) * kx, maxX = Math.max(...lons) * kx;
    const minY = Math.min(...lats), maxY = Math.max(...lats);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const pad = 16;
    const s = (size - 2 * pad) / span;
    const ox = pad + ((size - 2 * pad) - (maxX - minX) * s) / 2;
    const oy = pad + ((size - 2 * pad) - (maxY - minY) * s) / 2;
    const proj = (la: number, lo: number): [number, number] => [ox + (lo * kx - minX) * s, size - (oy + (la - minY) * s)];
    const d = pts.map((p, i) => { const [x, y] = proj(p[0], p[1]); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('');
    return { d, pts, proj };
  }, [lat, lon, t]);

  if (!geo) return <div className="card empty">No GPS in this run.</div>;
  let marker: [number, number] | null = null;
  if (cursor !== null) {
    const p = geo.pts.reduce((best, q) => (q[2] <= cursor ? q : best), geo.pts[0]);
    marker = geo.proj(p[0], p[1]);
  }
  const start = geo.proj(geo.pts[0][0], geo.pts[0][1]);
  return (
    <div className="card" style={{ padding: 8 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label="Route">
        <path d={geo.d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={start[0]} cy={start[1]} r="5" fill="var(--ok)" />
        {marker && <circle cx={marker[0]} cy={marker[1]} r="6" fill="var(--surface)" stroke="var(--text)" strokeWidth="2" />}
      </svg>
    </div>
  );
}

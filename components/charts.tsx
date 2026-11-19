'use client';

import { useMemo, useRef, useState, type MouseEvent } from 'react';

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
  /** the selected fragment, s */
  selection?: Band | null;
  /** drag across the chart to select a fragment */
  onSelect?: (b: Band) => void;
  height?: number;
}

const W = 900;

/** A small synchronized line chart: shared time axis, lap bands, hatched quality-flagged windows, hover cursor. */
export function LineChart({ title, x, y, format, color = 'var(--series-1)', invert, laps = [], flagged = [], blocks = [], cursor, onCursor, selection = null, onSelect, height = 110 }: LineChartProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
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

  const at = (e: MouseEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(xMax, Math.max(0, ((e.clientX - r.left) / r.width) * xMax));
  };
  const move = (e: MouseEvent<SVGSVGElement>) => onCursor(at(e));
  const up = (e: MouseEvent<SVGSVGElement>) => {
    if (drag === null) return;
    const t = at(e);
    setDrag(null);
    if (Math.abs(t - drag) >= 20) onSelect?.({ from: Math.min(t, drag), to: Math.max(t, drag) });
  };
  const live = drag !== null && cursor !== null ? { from: Math.min(drag, cursor), to: Math.max(drag, cursor) } : selection;

  return (
    <div className="card chart-card">
      <h3>
        <span>{title}</span>
        <span style={{ color: 'var(--text)' }}>{value !== null && value !== undefined ? format(value) : ''}</span>
      </h3>
      <svg ref={ref} viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" onMouseMove={move} onMouseLeave={() => { onCursor(null); setDrag(null); }}
        onMouseDown={(e) => onSelect && setDrag(at(e))} onMouseUp={up} style={{ cursor: onSelect ? 'crosshair' : undefined, userSelect: 'none' }} role="img" aria-label={title}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted)" strokeWidth="1.5" opacity="0.35" />
          </pattern>
        </defs>
        {laps.map((l, i) => i % 2 === 1 && <rect key={i} x={(l.from / xMax) * W} width={((l.to - l.from) / xMax) * W} y={0} height={height} fill="var(--surface-2)" />)}
        {blocks.map((b, i) => <rect key={`b${i}`} x={(b.from / xMax) * W} width={((b.to - b.from) / xMax) * W} y={0} height={height} fill="var(--accent-soft)" stroke={b.ok ? 'var(--accent)' : 'none'} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {flagged.map((f, i) => <rect key={`f${i}`} x={(f.from / xMax) * W} width={Math.max(1, ((f.to - f.from) / xMax) * W)} y={0} height={height} fill="url(#hatch)" />)}
        {live && <rect x={(live.from / xMax) * W} width={((live.to - live.from) / xMax) * W} y={0} height={height} fill="var(--accent)" opacity="0.18" />}
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
  selection?: Band | null;
  /** click two points on the route to select the stretch between them */
  onSelect?: (b: Band) => void;
}

/** The route drawn from GPS points alone (no map tiles: nothing is fetched, the data never leaves the computer). */
export function RouteMap({ lat, lon, t, cursor, selection = null, onSelect }: RouteMapProps) {
  const size = 320;
  const svgRef = useRef<SVGSVGElement>(null);
  const [first, setFirst] = useState<number | null>(null);
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
  return (
    <div className="card" style={{ padding: 8 }}>
      <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label="Route" onClick={pick} style={{ cursor: onSelect ? 'crosshair' : undefined }}>
        <path d={geo.d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity={selection ? 0.35 : 1} />
        {selD && <path d={selD} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />}
        {firstPt && <circle cx={geo.proj(firstPt[0], firstPt[1])[0]} cy={geo.proj(firstPt[0], firstPt[1])[1]} r="6" fill="var(--accent)" />}
        <circle cx={start[0]} cy={start[1]} r="5" fill="var(--ok)" />
        {marker && <circle cx={marker[0]} cy={marker[1]} r="6" fill="var(--surface)" stroke="var(--text)" strokeWidth="2" />}
      </svg>
      {onSelect && <div className="muted small" style={{ padding: '2px 6px' }}>{first === null ? 'Click two points on the route to select the stretch between them.' : 'Now click the end of the stretch.'}</div>}
    </div>
  );
}

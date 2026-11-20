'use client';

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { MIN_SPAN, wheelFactor } from './chartZoom';
import { fitCamera, panCamera, project, visibleRange, zoomCamera, type Camera, type RoutePoint } from './mapCamera';
import { useMapTiles } from '@/lib/client';

type Band = { from: number; to: number };

/** The margins of a lane: the plot starts near the left edge, the tick labels sit inside it. */
export const LANE = { l: 10, r: 12 };

/**
 * A smooth path through points (monotone cubic: no overshoot past the data), one 'M' per
 * unbroken stretch, and the wash under each stretch down to `base`.
 */
export function smoothPaths(pts: ([number, number] | null)[], base: number): { line: string; area: string } {
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

interface RouteMapProps {
  lat: (number | null)[];
  lon: (number | null)[];
  t: number[];
  cursor: number | null;
  selection?: Band | null;
  /** click two points on the route to select the stretch between them */
  onSelect?: (b: Band) => void;
  /** the range of time the chart shows, s: the stretch of the route run in it is drawn strong, and the map fits it when following */
  view?: Band | null;
  /** fit the map to `view` when it changes (false while the runner moves the map by hand) */
  follow?: boolean;
  /** the map zoomed or panned by hand: the range of time of the route in view, or null for the whole run */
  onView?: (b: Band | null) => void;
  /** the "Fit route" button over a map moved by hand: the map follows the chart again */
  onFit?: () => void;
  /** the camera of a map moved by hand, as the link gave it */
  camera?: Camera | null;
  /** the camera moved by hand, or null when the map follows the chart again (for the link) */
  onCamera?: (c: Camera | null) => void;
}

const MAP = 320;
const MAP_PAD = 20;
const pathOf = (cam: Camera, pts: RoutePoint[]) => pts.map((p, i) => { const [x, y] = project(cam, MAP, p[0], p[1]); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('');

/**
 * The route from the GPS points, on a dotted grid or (switched on) OpenStreetMap tiles: a soft
 * halo under the line, the start as a ring, the end as a dot, the cursor as a marker. The wheel
 * zooms around the pointer and a drag pans; the range of time in view goes to the chart.
 */
export function RouteMap({ lat, lon, t, cursor, selection = null, onSelect, view = null, follow = true, onView, onFit, camera = null, onCamera }: RouteMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const grid = useId();
  const [first, setFirst] = useState<number | null>(null);
  const [tiles] = useMapTiles();
  const pts = useMemo(() => {
    const out: RoutePoint[] = [];
    for (let i = 0; i < lat.length; i++) if (lat[i] !== null && lon[i] !== null) out.push([lat[i]!, lon[i]!, t[i]]);
    return out;
  }, [lat, lon, t]);
  // The points the map fits: those run in the range shown, or the whole route.
  const inView = useMemo(() => (view ? pts.filter((p) => p[2] >= view.from && p[2] <= view.to) : []), [pts, view?.from, view?.to]);
  // Following the chart, the camera fits the range shown, at once; moved by hand, it is the runner's.
  const fitted = useMemo(() => (pts.length ? fitCamera(inView.length >= 2 ? inView : pts, MAP, MAP_PAD) : null), [pts, inView]);
  const [manual, setManual] = useState<Camera | null>(camera);
  const cam = follow || !manual ? fitted : manual;

  // The live values the wheel and drag handlers read.
  const live = useRef({ cam, pts, onView, onCamera });
  live.current = { cam, pts, onView, onCamera };
  const move = (next: Camera, anchor?: [number, number]) => {
    // The next event (a burst of wheel events comes faster than the map draws) goes on from this camera.
    live.current.cam = next;
    setManual(next);
    live.current.onCamera?.(next);
    live.current.onView?.(visibleRange(live.current.pts, next, MAP, anchor));
  };
  const toMap = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * MAP, ((e.clientY - r.top) / r.height) * MAP, MAP / r.width] as const;
  };
  useEffect(() => {
    // The wheel over the whole frame of the map, its overlays (the hint, Fit route) included.
    const el = wrapRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const c = live.current.cam;
      if (!c || !e.deltaY) return;
      e.preventDefault();
      const [mx, my] = toMap(e);
      const factor = wheelFactor(e.deltaY, e.deltaMode);
      const next = zoomCamera(c, factor, mx, my, MAP);
      // The map zooms in no further than the chart can follow: the stretch in view stays a minute or longer.
      const r = visibleRange(live.current.pts, next, MAP, [mx, my]);
      if (factor < 1 && r && r.to - r.from < MIN_SPAN) return;
      // The stretch under the pointer fills the chart.
      move(next, [mx, my]);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [pts.length]);

  if (!pts.length || !cam) return <div className="card empty">No GPS in this run.</div>;
  const proj = (la: number, lo: number) => project(cam, MAP, la, lo);
  const d = pathOf(cam, pts);
  const dView = inView.length >= 2 && inView.length < pts.length ? pathOf(cam, inView) : '';
  // The tiles covering the map, at the nearest level, scaled to the camera's zoom.
  const tz = Math.min(19, Math.max(0, Math.round(cam.z)));
  const ts = 256 * 2 ** (cam.z - tz);
  const ox = cam.cx - MAP / 2;
  const oy = cam.cy - MAP / 2;
  const cover: { href: string; x: number; y: number }[] = [];
  const max = 2 ** tz;
  for (let tx = Math.floor(ox / ts); tx <= Math.floor((ox + MAP) / ts); tx++)
    for (let ty = Math.floor(oy / ts); ty <= Math.floor((oy + MAP) / ts); ty++)
      if (ty >= 0 && ty < max) cover.push({ href: `https://tile.openstreetmap.org/${tz}/${((tx % max) + max) % max}/${ty}.png`, x: tx * ts - ox, y: ty * ts - oy });

  let marker: [number, number] | null = null;
  if (cursor !== null) {
    const p = pts.reduce((best, q) => (q[2] <= cursor ? q : best), pts[0]);
    marker = proj(p[0], p[1]);
  }
  const start = proj(pts[0][0], pts[0][1]);
  const endPt = pts[pts.length - 1];
  const end = proj(endPt[0], endPt[1]);
  const sel = selection ? pts.filter((p) => p[2] >= selection.from && p[2] < selection.to) : [];
  const selD = pathOf(cam, sel);
  /** The time of the route point nearest a click, as the start or the end of a stretch. */
  const pick = (mx: number, my: number) => {
    if (!onSelect) return;
    let best = pts[0];
    let bd = Infinity;
    for (const p of pts) { const [x, y] = proj(p[0], p[1]); const dd = (x - mx) ** 2 + (y - my) ** 2; if (dd < bd) { bd = dd; best = p; } }
    if (bd > 15 ** 2) return;
    if (first === null) setFirst(best[2]);
    else { onSelect({ from: Math.min(first, best[2]), to: Math.max(first, best[2]) }); setFirst(null); }
  };
  // A drag pans the map; a press and release in place is a click on the route.
  const down = (e: MouseEvent<SVGSVGElement>) => {
    const [mx0, my0, k] = toMap(e);
    const c0 = cam;
    let moved = false;
    const mv = (m: globalThis.MouseEvent) => {
      const [mx, my] = toMap(m);
      if (!moved && Math.hypot(mx - mx0, my - my0) < 4 * k) return;
      moved = true;
      move(panCamera(c0, mx - mx0, my - my0));
    };
    const up = () => {
      removeEventListener('mousemove', mv);
      removeEventListener('mouseup', up);
      if (!moved) pick(mx0, my0);
    };
    addEventListener('mousemove', mv);
    addEventListener('mouseup', up);
  };
  const firstPt = first !== null ? pts.find((p) => p[2] >= first) : null;
  const route = tiles ? 'var(--accent)' : 'var(--series-1)';
  return (
    <div ref={wrapRef} className="card map">
      <svg ref={svgRef} viewBox={`0 0 ${MAP} ${MAP}`} width="100%" role="img" aria-label="Route" data-zoom={cam.z.toFixed(2)} onMouseDown={down} style={{ cursor: onSelect ? 'crosshair' : 'grab', display: 'block', userSelect: 'none' }}>
        <defs>
          <pattern id={grid} width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--axis)" />
          </pattern>
        </defs>
        {tiles ? (
          <g className="map-tiles" aria-hidden="true">
            {cover.map((c) => <image key={c.href} href={c.href} x={c.x} y={c.y} width={ts} height={ts} />)}
          </g>
        ) : (
          <rect width={MAP} height={MAP} fill={`url(#${grid})`} />
        )}
        <path d={d} fill="none" stroke={route} strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" opacity="0.12" />
        <path d={d} fill="none" stroke={route} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity={selection || dView ? 0.35 : 1} />
        {dView && <path d={dView} className="route-range" fill="none" stroke={route} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" opacity={selection ? 0.6 : 1} />}
        {selD && <path d={selD} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />}
        {firstPt && <circle cx={proj(firstPt[0], firstPt[1])[0]} cy={proj(firstPt[0], firstPt[1])[1]} r="6" fill="var(--accent)" />}
        <circle className="route-end" cx={end[0]} cy={end[1]} r="4" fill="var(--text)" stroke="var(--surface)" strokeWidth="2" />
        <circle className="route-start" cx={start[0]} cy={start[1]} r="5" fill="var(--surface)" stroke="var(--ok)" strokeWidth="2.5" />
        {marker && <circle cx={marker[0]} cy={marker[1]} r="6" fill="var(--surface)" stroke="var(--text)" strokeWidth="2" />}
      </svg>
      <span className="map-hint" aria-live="polite">{onSelect && first !== null ? 'Now click the end of the stretch' : 'Scroll to zoom · drag to move · click two points to select'}</span>
      {!follow && manual && onFit && <button type="button" className="map-fit btn sm" onClick={() => { setManual(null); onCamera?.(null); onFit(); }} title="Fit the map to the range the chart shows">Fit route</button>}
      {tiles && <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}
    </div>
  );
}

import { angleBetween, distance, meanHeading, projector, type TrackPoint } from '@/lib/geo';
import { findPasses } from './routeMatch';
import type { RefPoint } from '@/lib/blocks';

/** A stretch of route that several runs share (derived/segments.json). */
export interface RouteSegment {
  id: string;
  /** reference track, a point every 10 m */
  track: RefPoint[];
  /** m */
  length: number;
  /** mean bearing, degrees */
  heading: number;
  /** runs with at least one pass */
  runs: number;
  /** passes over all runs */
  passes: number;
}

export interface RunTrack {
  runId: string;
  pts: TrackPoint[];
}

const CELL = 20;
/** The cells of the comparison of candidates, m: a little more than 30 m, the distance two points of one route keep. */
const GRID = 32;
/** Fewer runs than this near a point: no shared route there. */
const MIN_RUNS = 5;
/** A change of more than this share in the runs passing ends a segment (a junction). */
const JUNCTION_CHANGE = 0.2;
const MIN_LENGTH = 800;
const MAX_LENGTH = 3000;
/** Two candidates sharing this share of their points (both ways) are the same segment. */
const SAME_SHARE = 0.7;

const sector = (h: number) => Math.round(h / 45) % 8;

/**
 * Finds the route segments the runs share. Along each run, it counts the runs that
 * pass near each point in the same direction; a segment is a stretch where that
 * count stays steady (no junction where runs join or leave) and long enough for a
 * heart rate block. Candidates found from different runs are merged; the runs of
 * each segment are counted with the route matcher itself.
 */
export function detectRouteSegments(tracks: RunTrack[]): RouteSegment[] {
  if (!tracks.length) return [];
  const first = tracks.find((t) => t.pts.length)?.pts[0];
  if (!first) return [];
  const proj = projector(first.lat);
  const cells = new Map<string, Set<number>>();
  const cellOf = (p: TrackPoint) => {
    const { x, y } = proj(p);
    return [Math.floor(x / CELL), Math.floor(y / CELL), sector(p.heading)] as const;
  };
  tracks.forEach((t, ri) => {
    for (const p of t.pts) {
      const [cx, cy, s] = cellOf(p);
      const k = `${cx},${cy},${s}`;
      let set = cells.get(k);
      if (!set) cells.set(k, (set = new Set()));
      set.add(ri);
    }
  });
  // The count depends on the cell only: counted once for each cell (points of many runs share one).
  const counted = new Map<string, number>();
  const near = (p: TrackPoint): number => {
    const [cx, cy, s] = cellOf(p);
    const key = `${cx},${cy},${s}`;
    const known = counted.get(key);
    if (known !== undefined) return known;
    const out = new Set<number>();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const ds of [-1, 0, 1]) {
          const set = cells.get(`${cx + dx},${cy + dy},${(s + ds + 8) % 8}`);
          if (set) for (const r of set) out.add(r);
        }
    counted.set(key, out.size);
    return out.size;
  };

  type Cand = { pts: TrackPoint[]; count: number };
  const cands: Cand[] = [];
  for (const t of tracks) {
    const raw = t.pts.map(near);
    const c = raw.map((_, i) => median(raw.slice(Math.max(0, i - 3), i + 4)));
    let i0 = 0;
    let ref = c[0];
    let off = 0;
    const close = (end: number) => {
      const len = (end - i0) * 10;
      if (ref >= MIN_RUNS && len >= MIN_LENGTH && len <= MAX_LENGTH) cands.push({ pts: t.pts.slice(i0, end), count: ref });
    };
    for (let i = 1; i < c.length; i++) {
      if (i - i0 === 5) ref = median(c.slice(i0, i));
      const changed = c[i] < MIN_RUNS || (i - i0 >= 5 && Math.abs(c[i] - ref) > JUNCTION_CHANGE * ref);
      off = changed ? off + 1 : 0;
      if (off >= 3) {
        close(i - 2);
        i0 = i - 2;
        ref = c[i0];
        off = 0;
      }
    }
    close(c.length);
  }

  // Strongest first: most runs, then longest; keep a candidate unless it is the same as one kept.
  // Each candidate's points in a grid of 32 m cells: a point's neighbours within 30 m are in its cell
  // and the eight around it, so comparing two candidates looks at those only, not at every point of
  // the other (the review of 24 Nov 2026: this comparison was most of the cost at 500 runs).
  const gridOf = (pts: TrackPoint[]) => {
    const grid = new Map<string, TrackPoint[]>();
    for (const q of pts) {
      const { x, y } = proj(q);
      const k = `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
      let cell = grid.get(k);
      if (!cell) grid.set(k, (cell = []));
      cell.push(q);
    }
    return grid;
  };
  /** Share of a's points with a point of b within 30 m, same direction. */
  const overlap = (a: TrackPoint[], b: Map<string, TrackPoint[]>): number => {
    let hit = 0;
    for (let i = 0; i < a.length; i += 3) {
      const p = a[i];
      const { x, y } = proj(p);
      const cx = Math.floor(x / GRID);
      const cy = Math.floor(y / GRID);
      let found = false;
      for (let dx = -1; dx <= 1 && !found; dx++)
        for (let dy = -1; dy <= 1 && !found; dy++)
          for (const q of b.get(`${cx + dx},${cy + dy}`) ?? []) if (distance(p, q) <= 30 && angleBetween(p.heading, q.heading) <= 60) { found = true; break; }
      if (found) hit++;
    }
    return hit / Math.ceil(a.length / 3);
  };
  cands.sort((a, b) => b.count - a.count || b.pts.length - a.pts.length);
  const kept: (Cand & { grid: Map<string, TrackPoint[]> })[] = [];
  for (const cand of cands) {
    const grid = gridOf(cand.pts);
    if (!kept.some((k) => overlap(cand.pts, k.grid) >= SAME_SHARE && overlap(k.pts, grid) >= SAME_SHARE)) kept.push({ ...cand, grid });
  }

  // A pass starts within 30 m of the segment's first point: only the runs with a point in the cells
  // around it (two cells of 20 m each way, any direction) can pass; the others are not looked at.
  const runsNear = (p: TrackPoint): Set<number> => {
    const [cx, cy] = cellOf(p);
    const out = new Set<number>();
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let s = 0; s < 8; s++) for (const r of cells.get(`${cx + dx},${cy + dy},${s}`) ?? []) out.add(r);
    return out;
  };
  const segments: RouteSegment[] = [];
  for (const k of kept) {
    const track: RefPoint[] = k.pts.map((p) => ({ lat: round6(p.lat), lon: round6(p.lon), heading: Math.round(p.heading) }));
    const candidates = runsNear(k.pts[0]);
    let runs = 0;
    let passes = 0;
    for (const [ri, t] of tracks.entries()) {
      if (!candidates.has(ri)) continue;
      const n = findPasses(track, t.pts).length;
      if (n) runs++;
      passes += n;
    }
    if (runs < MIN_RUNS) continue;
    segments.push({
      id: `seg-${track[0].lat.toFixed(4)},${track[0].lon.toFixed(4)}-${Math.round(meanHeading(track))}`,
      track,
      length: (track.length - 1) * 10,
      heading: Math.round(meanHeading(track)),
      runs,
      passes,
    });
  }
  return segments.sort((a, b) => b.runs - a.runs || b.length - a.length);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function round6(x: number) {
  return Math.round(x * 1e6) / 1e6;
}

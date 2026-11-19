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
  const near = (p: TrackPoint): number => {
    const [cx, cy, s] = cellOf(p);
    const out = new Set<number>();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const ds of [-1, 0, 1]) {
          const set = cells.get(`${cx + dx},${cy + dy},${(s + ds + 8) % 8}`);
          if (set) for (const r of set) out.add(r);
        }
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
  cands.sort((a, b) => b.count - a.count || b.pts.length - a.pts.length);
  const kept: Cand[] = [];
  for (const cand of cands) {
    if (!kept.some((k) => overlap(cand.pts, k.pts) >= SAME_SHARE && overlap(k.pts, cand.pts) >= SAME_SHARE)) kept.push(cand);
  }

  const segments: RouteSegment[] = [];
  for (const k of kept) {
    const track: RefPoint[] = k.pts.map((p) => ({ lat: round6(p.lat), lon: round6(p.lon), heading: Math.round(p.heading) }));
    let runs = 0;
    let passes = 0;
    for (const t of tracks) {
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

/** Share of a's points with a point of b within 30 m, same direction. */
function overlap(a: TrackPoint[], b: TrackPoint[]): number {
  let hit = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (b.some((q) => distance(a[i], q) <= 30 && angleBetween(a[i].heading, q.heading) <= 60)) hit++;
  }
  return hit / Math.ceil(a.length / 3);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function round6(x: number) {
  return Math.round(x * 1e6) / 1e6;
}

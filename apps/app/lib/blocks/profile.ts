import type { RunFile } from '@/lib/kernel';

/**
 * The profile of a stretch of a run, by distance (the runner's request of 22 Nov 2026: "czasami to
 * dokladnie ta sama trasa, czasami trasa jest inna ale profil biegu", the profile being
 * "Dystans + teren + tempo"; requirement "Similar stretches of a selection"): its distance, the
 * elevation over it and the shape and level of its pace, and how alike two such profiles are.
 */

/** The parts a stretch is cut into, by distance. */
export const BINS = 20;
/** The least stretch with a profile, m. */
export const PROFILE_MIN_DISTANCE = 400;
/** Starts of the candidate stretches in a run, every this many m. */
const STEP = 25;
/** Elevation off by this many m (root mean square) leaves nothing of the terrain's likeness; pace shape off by 20 %, pace level off by 20 %. */
const TERRAIN_SCALE = 15;
const SHAPE_SCALE = 0.2;
const LEVEL_SCALE = 0.2;
/** The parts' weights (model's choice): terrain and the pace's shape alike, its level less. */
const WEIGHTS = { terrain: 0.4, shape: 0.4, level: 0.2 } as const;
/**
 * A like effort runs at a like pace (the runner's report of 22 Nov 2026: a part run at 4:12 /km brought
 * "mnostwo biegow np po 5:23"): within this share of the reference's pace, on the same route and of
 * the same profile alike (model's choice).
 */
export const SIMILAR_PACE_WITHIN = 0.1;
/** A stretch counts as of the same profile from this score. */
export const PROFILE_MIN_SCORE = 0.6;
/** A sample counts as moving below this gap, s, and above this speed, m/s. */
const MOVING_GAP = 5;
const MOVING_SPEED = 0.8;

/** What a profile is compared by: kept in a profile block, so it needs no run to be read. */
export interface ProfileKey {
  /** m */
  distance: number;
  /** the elevation at the BINS + 1 edges, m from the first; null without elevation */
  altitude: number[] | null;
  /** each bin's pace against the stretch's mean pace (1 = even) */
  shape: number[];
  /** the mean pace over the moving time, s/km */
  pace: number;
}

/** How alike a stretch is to a profile, 0–1 each; terrain null when either has no elevation. */
export interface ProfileParts {
  terrain: number | null;
  shape: number;
  level: number;
}

/** A run's samples by distance: their distance, time, moving time so far, elevation (gaps filled) and heart rate. */
export interface Track {
  d: number[];
  t: number[];
  moving: number[];
  altitude: (number | null)[];
  heartRate: (number | null)[];
}

/** The samples of a run with a distance, in order, with the moving time to each. */
export function trackOf(run: RunFile): Track {
  const s = run.samples;
  const out: Track = { d: [], t: [], moving: [], altitude: [], heartRate: [] };
  let moving = 0;
  let lastAlt: number | null = null;
  for (let i = 0; i < s.t.length; i++) {
    const d = s.distance[i];
    if (d === null) continue;
    const n = out.t.length;
    if (n) {
      const dt = s.t[i] - out.t[n - 1];
      const sp = (s.values.speed?.[i] ?? null);
      if (dt > 0 && dt <= MOVING_GAP && (sp === null || sp >= MOVING_SPEED)) moving += dt;
      // The distance never goes back.
      if (d < out.d[n - 1]) continue;
    }
    const alt: number | null = s.values.altitude?.[i] ?? lastAlt;
    lastAlt = alt;
    out.d.push(d); out.t.push(s.t[i]); out.moving.push(moving); out.altitude.push(alt); out.heartRate.push((s.values.heartRate?.[i] ?? null));
  }
  // The elevation before the first value takes the first value.
  const first = out.altitude.find((a) => a !== null) ?? null;
  for (let i = 0; i < out.altitude.length && out.altitude[i] === null; i++) out.altitude[i] = first;
  return out;
}

/** The index of the last sample at or before distance d (0 before the first). */
function at(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0 || x <= xs[0]) return 0;
  if (x >= xs[hi]) return hi;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid - 1; }
  return lo;
}

/** A series at distance d, linear between the samples around it. */
function interp(tr: Track, ys: (number | null)[], d: number): number | null {
  const i = at(tr.d, d);
  const j = Math.min(tr.d.length - 1, i + 1);
  const [a, b] = [ys[i], ys[j]];
  if (a === null || b === null) return a ?? b;
  const span = tr.d[j] - tr.d[i];
  return span > 0 ? a + ((b - a) * (d - tr.d[i])) / span : a;
}

/** The distance at time t, s (that of the last sample by then). */
export function distanceAtTime(tr: Track, t: number): number | null {
  if (!tr.t.length) return null;
  return tr.d[at(tr.t, t)];
}

/** The time at distance d, s: the first sample at or past it. */
export function timeAtDistance(tr: Track, d: number): number {
  const i = at(tr.d, d);
  return tr.d[i] >= d || i === tr.d.length - 1 ? tr.t[i] : tr.t[i + 1];
}

/** The profile of the stretch of distance [a, a + D) of a run; null when the run does not reach its end or it took no moving time. */
export function profileAt(tr: Track, a: number, D: number): ProfileKey | null {
  if (!tr.d.length || a + D > tr.d[tr.d.length - 1] + 1) return null;
  const edges = Array.from({ length: BINS + 1 }, (_, k) => a + (D * k) / BINS);
  const mt = edges.map((d) => interp(tr, tr.moving, d)!);
  const total = mt[BINS] - mt[0];
  if (!(total > 0)) return null;
  const per = total / BINS;
  const shape = Array.from({ length: BINS }, (_, k) => Math.min(2, Math.max(0.5, (mt[k + 1] - mt[k]) / per)));
  const alts = edges.map((d) => interp(tr, tr.altitude, d));
  const altitude = alts.every((x) => x !== null) ? alts.map((x) => x! - alts[0]!) : null;
  return { distance: D, altitude, shape, pace: total / (D / 1000) };
}

const rms = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length);

/** How alike a candidate's profile is to the key's, part by part. */
export function profileParts(key: ProfileKey, c: ProfileKey): ProfileParts {
  return {
    terrain: key.altitude && c.altitude ? Math.max(0, 1 - rms(key.altitude, c.altitude) / TERRAIN_SCALE) : null,
    shape: Math.max(0, 1 - rms(key.shape, c.shape) / SHAPE_SCALE),
    level: Math.max(0, 1 - Math.abs(c.pace / key.pace - 1) / LEVEL_SCALE),
  };
}

/** The score of the parts: their weighted mean, over the parts there are. */
export function profileScore(p: ProfileParts): number {
  const parts = (Object.keys(WEIGHTS) as (keyof ProfileParts)[]).filter((k) => p[k] !== null);
  const w = parts.reduce((s, k) => s + WEIGHTS[k], 0);
  return parts.reduce((s, k) => s + WEIGHTS[k] * p[k]!, 0) / w;
}

/** A stretch of a run of the key's profile: its times, s, its start's distance, m, and how alike it is. */
export interface ProfileMatch {
  from: number;
  to: number;
  start: number;
  parts: ProfileParts;
  score: number;
}

/**
 * The stretch of a run, of the key's distance, whose profile is closest to the key's: every start
 * every 25 m, outside the stretches `skip` names (s); null when none reaches `minScore`.
 */
export function bestProfileMatch(key: ProfileKey, tr: Track, minScore = PROFILE_MIN_SCORE, skip: [number, number][] = [], band: { min: number | null; max: number | null } = { min: null, max: null }): ProfileMatch | null {
  let best: ProfileMatch | null = null;
  const end = tr.d.length ? tr.d[tr.d.length - 1] : 0;
  for (let a = tr.d[0] ?? 0; a + key.distance <= end; a += STEP) {
    const from = timeAtDistance(tr, a);
    const to = timeAtDistance(tr, a + key.distance);
    if (skip.some(([x, y]) => Math.min(to, y) - Math.max(from, x) > 0.5 * (to - from))) continue;
    const c = profileAt(tr, a, key.distance);
    if (!c) continue;
    // Only in the pace band, when one is set (s/km, by the moving time).
    if ((band.min !== null && c.pace < band.min) || (band.max !== null && c.pace > band.max)) continue;
    const parts = profileParts(key, c);
    const score = profileScore(parts);
    if (score >= minScore && (!best || score > best.score)) best = { from, to, start: a, parts, score };
  }
  return best;
}

/** The profile of [from, to) s of a run, by the distance it covers; null under 400 m or without distance. */
export function profileOfStretch(tr: Track, from: number, to: number): ProfileKey | null {
  const a = distanceAtTime(tr, from);
  const b = distanceAtTime(tr, to);
  if (a === null || b === null || b - a < PROFILE_MIN_DISTANCE) return null;
  return profileAt(tr, a, b - a);
}

/** What a stretch of distance [a, a + D) shows: its moving time, pace, heart rate, climb and, per bin, its pace, heart rate and elevation. */
export interface StretchFigures {
  /** m, s, s/km */
  distance: number;
  moving: number;
  pace: number;
  heartRate: number | null;
  /** m climbed, each rise of over 1 m counted (null without elevation) */
  ascent: number | null;
  /** per bin: the pace, s/km, and the mean heart rate; the elevation at the BINS + 1 edges, m from the first */
  curves: { pace: number[]; heartRate: (number | null)[]; altitude: number[] | null };
}

/** The figures of the stretch of distance [a, a + D); null when its profile is. */
export function stretchFigures(tr: Track, a: number, D: number): StretchFigures | null {
  const p = profileAt(tr, a, D);
  if (!p) return null;
  const i0 = at(tr.d, a);
  const i1 = at(tr.d, a + D);
  const hrSum = new Array(BINS).fill(0);
  const hrN = new Array(BINS).fill(0);
  let ascent: number | null = null;
  let anchor: number | null = null;
  for (let i = i0; i <= i1; i++) {
    const hr = tr.heartRate[i];
    const k = Math.min(BINS - 1, Math.max(0, Math.floor(((tr.d[i] - a) / D) * BINS)));
    if (hr !== null && hr > 0) { hrSum[k] += hr; hrN[k]++; }
    const alt = tr.altitude[i];
    if (alt === null) continue;
    if (anchor === null) { anchor = alt; ascent = 0; continue; }
    // A rise counts once it is over 1 m above the last low; a fall moves the low down.
    if (alt > anchor + 1) { ascent! += alt - anchor; anchor = alt; } else if (alt < anchor) anchor = alt;
  }
  const n = hrN.reduce((s, x) => s + x, 0);
  return {
    distance: D,
    moving: (p.pace * D) / 1000,
    pace: p.pace,
    heartRate: n ? hrSum.reduce((s, x) => s + x, 0) / n : null,
    ascent: ascent === null ? null : Math.round(ascent),
    curves: { pace: p.shape.map((r) => r * p.pace), heartRate: hrSum.map((s, k) => (hrN[k] ? s / hrN[k] : null)), altitude: p.altitude },
  };
}

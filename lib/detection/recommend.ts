import { angleBetween, distance, type TrackPoint } from '@/lib/geo';
import type { RunFile } from '@/lib/kernel';
import type { RouteSegment } from './segments';
import { movingPart } from './instance';
import { findPasses } from './routeMatch';
import { lapKey, structureName, DEFAULT_TOLERANCES, type BlockDefinition, type RefPoint, type Recommendation } from '@/lib/blocks';

/** Route segments need this many passes, workout structures this many workouts (spec F9). */
export const MIN_ROUTE_INSTANCES = 5;
export const MIN_STRUCTURE_WORKOUTS = 3;
/** The pace band of a recommendation: 30 s/km wide around the median pace (spec section 5). */
const BAND = 30;

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const compass = (h: number) => COMPASS[Math.round(h / 45) % 8];

function band(paces: number[]): { paceMin: number; paceMax: number } {
  const s = [...paces].sort((a, b) => a - b);
  const med = s[Math.floor(s.length / 2)];
  // Snap the band's centre to 15 s so bands read as 4:45–5:15.
  const centre = Math.round(med / 15) * 15;
  return { paceMin: centre - BAND / 2, paceMax: centre + BAND / 2 };
}

/** Mean speed of the moving part of [from, to): the measure an instance's pace condition uses. */
function meanSpeed(run: RunFile, from: number, to: number): number {
  const { t, speed } = run.samples;
  const idx: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] >= from && t[i] < to) idx.push(i);
  const v = movingPart(t, speed, idx).moving.map((i) => speed[i]).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/** True when two reference tracks are the same route (each covers the other). */
export function sameRoute(a: RefPoint[], b: RefPoint[]): boolean {
  const cover = (x: RefPoint[], y: RefPoint[]) => {
    let hit = 0;
    for (let i = 0; i < x.length; i += 3) if (y.some((q) => distance(x[i], q) <= 30 && angleBetween(x[i].heading, q.heading) <= 60)) hit++;
    return hit / Math.ceil(x.length / 3);
  };
  return cover(a, b) >= 0.7 && cover(b, a) >= 0.7;
}

/**
 * Proposes block definitions (spec F9): a route segment passed at least 5 times,
 * a workout structure element found in at least 3 workouts. Nothing is proposed
 * that matches a definition the runner has, or one they rejected.
 */
export function recommend(segments: RouteSegment[], runs: RunFile[], tracks: Map<string, TrackPoint[]>, defs: BlockDefinition[]): Recommendation[] {
  const out: Recommendation[] = [];

  for (const seg of segments) {
    if (seg.passes < MIN_ROUTE_INSTANCES) continue;
    if (defs.some((d) => d.params.type === 'route' && sameRoute(d.params.track, seg.track))) continue;
    const paces: number[] = [];
    for (const run of runs) {
      const t = tracks.get(run.id) ?? [];
      for (const p of findPasses(seg.track, t)) {
        // The same measure the instance's pace condition uses: the mean of the speed
        // samples in the pass, not elapsed time (a wait at a crossing would shift the band).
        const v = meanSpeed(run, t[p.from].t, t[p.to].t);
        if (v > 0) paces.push(1000 / v);
      }
    }
    if (!paces.length) continue;
    out.push({
      id: `rec-${seg.id}`,
      name: `${(seg.length / 1000).toFixed(1)} km ${compass(seg.heading)}-bound`,
      params: { type: 'route', track: seg.track, length: seg.length, heading: seg.heading },
      tolerances: { ...DEFAULT_TOLERANCES, ...band(paces) },
      runs: seg.runs,
      instances: seg.passes,
      basis: `route passed ${seg.passes} times in ${seg.runs} runs`,
    });
  }

  const byKey = new Map<string, { kind: 'time' | 'distance'; target: number; runs: Set<string>; paces: number[] }>();
  for (const run of runs) {
    run.laps.forEach((lap, i) => {
      const k = lapKey(lap, i, run.laps);
      if (!k) return;
      const key = `${k.kind}:${k.target}`;
      let e = byKey.get(key);
      if (!e) byKey.set(key, (e = { ...k, runs: new Set(), paces: [] }));
      e.runs.add(run.id);
      if (lap.distance > 0) e.paces.push((1000 * lap.duration) / lap.distance);
    });
  }
  for (const [key, e] of [...byKey.entries()].sort((a, b) => b[1].runs.size - a[1].runs.size)) {
    if (e.runs.size < MIN_STRUCTURE_WORKOUTS) continue;
    if (defs.some((d) => d.params.type === 'structure' && d.params.kind === e.kind && d.params.target === e.target)) continue;
    out.push({
      id: `rec-structure-${key}`,
      name: structureName(e.kind, e.target),
      params: { type: 'structure', kind: e.kind, target: e.target, tolerance: 0.03 },
      // No pace band: how the pace of a repeated workout changes is what its trend shows.
      // No effort-before check: a workout element always follows its warm-up, so every
      // instance would fail it the same way (model's choice; editable per definition).
      tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null },
      runs: e.runs.size,
      instances: e.paces.length,
      basis: `lap found in ${e.runs.size} workouts`,
    });
  }
  return out.sort((a, b) => b.runs - a.runs);
}

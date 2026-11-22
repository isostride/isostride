import { angleBetween, distance, type TrackPoint } from '@/lib/geo';
import type { IndexedRun, RunFile } from '@/lib/kernel';
import type { RouteSegment } from './segments';
import { movingPart } from './instance';
import { EFFORT_TARGETS, effortIn, effortName, patternKey, patternName, patternOf, tagName, workoutTypes } from './logical';
import { findPasses } from './routeMatch';
import { asRule, defaultTolerances, lapKey, structureName, DEFAULT_TOLERANCES, type BlockDefinition, type RefPoint, type Recommendation } from '@/lib/blocks';


/** The blocks there are, in the one model: a suggestion the runner has (kept or dismissed) is not made again. */
const shapesOf = (defs: BlockDefinition[]) => defs.map((d) => asRule(d.params, d.tolerances));
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
export function recommend(segments: RouteSegment[], runs: RunFile[], tracks: Map<string, TrackPoint[]>, defs: BlockDefinition[], rows: IndexedRun[] = []): Recommendation[] {
  const out: Recommendation[] = [];

  for (const seg of segments) {
    if (seg.passes < MIN_ROUTE_INSTANCES) continue;
    if (shapesOf(defs).some((r) => r.shape.type === 'route' && sameRoute(r.shape.track, seg.track))) continue;
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
    if (shapesOf(defs).some((r) => r.shape.type === 'lap' && r.shape.planned?.kind === e.kind && r.shape.planned.target === e.target)) continue;
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
  out.push(...logicalRecommendations(runs, defs, rows));
  return out.sort((a, b) => b.runs - a.runs);
}

/** Logical blocks (any route): efforts of a standard length, workout types, lap patterns. */
function logicalRecommendations(runs: RunFile[], defs: BlockDefinition[], rows: IndexedRun[]): Recommendation[] {
  const out: Recommendation[] = [];
  // No pace band and no effort-before check: an effort follows its warm-up by nature.
  const tolerances = { ...defaultTolerances('effort'), effortBeforeMax: null };
  for (const { kind, target } of EFFORT_TARGETS) {
    if (shapesOf(defs).some((r) => r.shape.type === 'fastest' && r.shape.effort && r.shape.kind === kind && r.shape.target === target)) continue;
    const found = runs.filter((r) => effortIn(r, kind, target));
    if (found.length < MIN_STRUCTURE_WORKOUTS) continue;
    out.push({ id: `rec-effort-${kind}:${target}`, name: effortName(kind, target), params: { type: 'effort', kind, target }, tolerances, runs: found.length, instances: found.length, basis: `effort found in ${found.length} runs, on any route` });
  }
  for (const [type, n] of workoutTypes(rows)) {
    if (n < MIN_STRUCTURE_WORKOUTS || shapesOf(defs).some((r) => r.shape.type === 'main' && r.runs.workoutTypes.length === 1 && r.runs.workoutTypes[0] === type)) continue;
    out.push({ id: `rec-tag-${type}`, name: tagName(type), params: { type: 'tag', workoutType: type }, tolerances, runs: n, instances: n, basis: `${n} runs tagged ${type}` });
  }
  const byLayout = new Map<string, RunFile[]>();
  for (const r of runs) {
    const p = patternOf(r.laps, r.distance > 0 ? r.duration / r.distance : 0);
    if (p.filter((x) => x.kind !== 'free').length < 2) continue;
    const k = patternKey(p);
    byLayout.set(k, [...(byLayout.get(k) ?? []), r]);
  }
  for (const [key, group] of byLayout) {
    if (group.length < MIN_STRUCTURE_WORKOUTS) continue;
    if (shapesOf(defs).some((r) => r.shape.type === 'pattern' && patternKey(r.shape.laps) === key)) continue;
    // An effort lap is one faster than its run's average in most of the runs.
    const patterns = group.map((r) => patternOf(r.laps, r.distance > 0 ? r.duration / r.distance : 0));
    const laps = patterns[0].map((p, i) => ({ ...p, effort: patterns.filter((q) => q[i].effort).length * 2 > patterns.length }));
    if (!laps.some((l) => l.effort)) continue;
    out.push({ id: `rec-pattern-${key}`, name: patternName(laps), params: { type: 'pattern', laps, tolerance: 0.03 }, tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null }, runs: group.length, instances: group.length * laps.filter((l) => l.effort).length, basis: `lap pattern found in ${group.length} runs, on any route` });
  }
  return out;
}

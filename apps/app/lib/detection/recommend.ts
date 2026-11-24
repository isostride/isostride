import { angleBetween, distance, type TrackPoint } from '@/lib/geo';
import { metricSeries, type IndexedRun, type Lap, type RunFile } from '@/lib/kernel';
import type { RouteSegment } from './segments';
import { movingPart } from './instance';
import { EFFORT_TARGETS, effortIn, effortName, patternKey, patternName, patternOf, tagName, workoutTypes } from './logical';
import { findPasses } from './routeMatch';
import { SAVED_WORDS, asRule, basisOf, defaultTolerances, lapKey, routeName, structureName, DEFAULT_TOLERANCES, type BlockDefinition, type RefPoint, type Recommendation } from '@/lib/blocks';


/** The blocks there are, in the one model: a suggestion the runner has (kept or dismissed) is not made again. */
const shapesOf = (defs: BlockDefinition[]) => defs.map((d) => asRule(d.params, d.tolerances));
/** Route segments need this many passes, workout structures this many workouts (spec F9). */
export const MIN_ROUTE_INSTANCES = 5;
export const MIN_STRUCTURE_WORKOUTS = 3;
/** The pace band of a recommendation: 30 s/km wide around the median pace (spec section 5). */
const BAND = 30;

/** Why a suggestion is made, in English as the suggestions file keeps it (a screen shows it with basisOf). */
const basis = (r: Omit<Recommendation, 'id' | 'name' | 'basis'>) => basisOf(r, SAVED_WORDS);

function band(paces: number[]): { paceMin: number; paceMax: number } {
  const s = [...paces].sort((a, b) => a - b);
  const med = s[Math.floor(s.length / 2)];
  // Snap the band's centre to 15 s so bands read as 4:45–5:15.
  const centre = Math.round(med / 15) * 15;
  return { paceMin: centre - BAND / 2, paceMax: centre + BAND / 2 };
}

/** Mean speed of the moving part of [from, to): the measure an instance's pace condition uses. */
function meanSpeed(run: RunFile, from: number, to: number): number {
  const { t } = run.samples;
  const speed = metricSeries(run.samples, 'speed');
  const idx: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] >= from && t[i] < to) idx.push(i);
  const v = movingPart(t, speed, idx).moving.map((i) => speed[i]).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/**
 * What the suggestions need of a run beyond its track, kept for each run (derived/blocks-cache.json):
 * its laps and length, and the standard efforts found in it. A run file read once gives them; the
 * suggestions after the next import do not read it again.
 */
export interface RunFacts {
  id: string;
  distance: number;
  duration: number;
  laps: Lap[];
  /** the standard efforts the run holds, as `${kind}:${target}` */
  efforts: string[];
}

const effortKey = (kind: 'time' | 'distance', target: number) => `${kind}:${target}`;

/** A run's facts, from its file. */
export function factsOf(run: RunFile): RunFacts {
  return {
    id: run.id,
    distance: run.distance,
    duration: run.duration,
    laps: run.laps,
    efforts: EFFORT_TARGETS.filter(({ kind, target }) => effortIn(run, kind, target)).map(({ kind, target }) => effortKey(kind, target)),
  };
}

const isFacts = (r: RunFile | RunFacts): r is RunFacts => 'efforts' in r;
const hasEffort = (r: RunFile | RunFacts, kind: 'time' | 'distance', target: number) => (isFacts(r) ? r.efforts.includes(effortKey(kind, target)) : !!effortIn(r, kind, target));

/** The paces of a run's passes over a route segment, s/km: the measure of a pass's pace condition. */
export function passPaces(seg: { track: RefPoint[] }, run: RunFile, track: TrackPoint[]): number[] {
  const paces: number[] = [];
  for (const p of findPasses(seg.track, track)) {
    // The same measure the instance's pace condition uses: the mean of the speed
    // samples in the pass, not elapsed time (a wait at a crossing would shift the band).
    const v = meanSpeed(run, track[p.from].t, track[p.to].t);
    if (v > 0) paces.push(1000 / v);
  }
  return paces;
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
export function recommend(segments: RouteSegment[], runs: (RunFile | RunFacts)[], tracks: Map<string, TrackPoint[]>, defs: BlockDefinition[], rows: IndexedRun[] = [], routePaces?: (seg: RouteSegment) => number[]): Recommendation[] {
  const out: Recommendation[] = [];

  for (const seg of segments) {
    if (seg.passes < MIN_ROUTE_INSTANCES) continue;
    if (shapesOf(defs).some((r) => r.shape.type === 'route' && sameRoute(r.shape.track, seg.track))) continue;
    // The paces of the passes: kept ones when the caller has them (only new runs read), else from the run files.
    const paces = routePaces ? routePaces(seg) : runs.flatMap((run) => (isFacts(run) ? [] : passPaces(seg, run, tracks.get(run.id) ?? [])));
    if (!paces.length) continue;
    const rec = {
      params: { type: 'route', track: seg.track, length: seg.length, heading: seg.heading } as const,
      tolerances: { ...DEFAULT_TOLERANCES, ...band(paces) },
      runs: seg.runs,
      instances: seg.passes,
    };
    out.push({ id: `rec-${seg.id}`, name: routeName(seg.length, seg.heading), ...rec, basis: basis(rec) });
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
    const rec = {
      params: { type: 'structure', kind: e.kind, target: e.target, tolerance: 0.03 } as const,
      // No pace band: how the pace of a repeated workout changes is what its trend shows.
      // No effort-before check: a workout element always follows its warm-up, so every
      // instance would fail it the same way (model's choice; editable per definition).
      tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null },
      runs: e.runs.size,
      instances: e.paces.length,
    };
    out.push({ id: `rec-structure-${key}`, name: structureName(e.kind, e.target), ...rec, basis: basis(rec) });
  }
  out.push(...logicalRecommendations(runs, defs, rows));
  return out.sort((a, b) => b.runs - a.runs);
}

/** Logical blocks (any route): efforts of a standard length, workout types, lap patterns. */
function logicalRecommendations(runs: (RunFile | RunFacts)[], defs: BlockDefinition[], rows: IndexedRun[]): Recommendation[] {
  const out: Recommendation[] = [];
  // No pace band and no effort-before check: an effort follows its warm-up by nature.
  const tolerances = { ...defaultTolerances('effort'), effortBeforeMax: null };
  for (const { kind, target } of EFFORT_TARGETS) {
    if (shapesOf(defs).some((r) => r.shape.type === 'fastest' && r.shape.effort && r.shape.kind === kind && r.shape.target === target)) continue;
    const found = runs.filter((r) => hasEffort(r, kind, target));
    if (found.length < MIN_STRUCTURE_WORKOUTS) continue;
    const rec = { params: { type: 'effort', kind, target } as const, tolerances, runs: found.length, instances: found.length };
    out.push({ id: `rec-effort-${kind}:${target}`, name: effortName(kind, target), ...rec, basis: basis(rec) });
  }
  for (const [type, n] of workoutTypes(rows)) {
    if (n < MIN_STRUCTURE_WORKOUTS || shapesOf(defs).some((r) => r.shape.type === 'main' && r.runs.workoutTypes.length === 1 && r.runs.workoutTypes[0] === type)) continue;
    const rec = { params: { type: 'tag', workoutType: type } as const, tolerances, runs: n, instances: n };
    out.push({ id: `rec-tag-${type}`, name: tagName(type), ...rec, basis: basis(rec) });
  }
  const byLayout = new Map<string, (RunFile | RunFacts)[]>();
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
    const rec = { params: { type: 'pattern', laps, tolerance: 0.03 } as const, tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null }, runs: group.length, instances: group.length * laps.filter((l) => l.effort).length };
    out.push({ id: `rec-pattern-${key}`, name: patternName(laps), ...rec, basis: basis(rec) });
  }
  return out;
}

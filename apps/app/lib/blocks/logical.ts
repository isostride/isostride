import type { Lap } from '@/lib/kernel';
import { lapKey } from './structure';
import type { LayoutMatch, PatternLap } from './types';
import { SAVED_WORDS, type Words } from './words';

/** Names and lap patterns of the logical blocks (pure; the pages and the detection share them). */

/** "10-minute effort", "5 km effort": a suggestion's name, kept in English unless given the words of the language in use. */
export function effortName(kind: 'time' | 'distance', target: number, w: Words = SAVED_WORDS): string {
  return kind === 'time' ? w.t('{min}-minute effort', { min: w.num(target / 60) }) : w.t('{km} km effort', { km: w.num(target / 1000) });
}

/** "Workout: tempo": the name of a workout type's segment (the type is the runner's, as it is). */
export function tagName(workoutType: string, w: Words = SAVED_WORDS): string {
  return w.t('Workout: {type}', { type: workoutType });
}

/** A run's laps read as a pattern; effort laps are the set laps faster than the run's average pace. */
export function patternOf(laps: Lap[], runPace: number): PatternLap[] {
  return laps.map((lap, i) => {
    const k = lapKey(lap, i, laps);
    const pace = lap.distance > 0 ? lap.duration / lap.distance : Infinity;
    return k ? { kind: k.kind, target: k.target, effort: pace < runPace } : { kind: 'free', target: 0, effort: false };
  });
}

/** The key of a pattern's layout: equal for runs that follow it (efforts aside). */
export function patternKey(pattern: PatternLap[]): string {
  // i18n-ignore: a key, not a text
  return pattern.map((p) => (p.kind === 'free' ? 'free' : `${p.kind}:${p.target}`)).join('|');
}

/** True when the run's laps follow the pattern: the same number, each set lap within `tolerance` of its target. */
export function followsPattern(laps: Lap[], pattern: PatternLap[], tolerance: number): boolean {
  return laps.length === pattern.length && pattern.every((p, i) => {
    if (p.kind === 'free') return true;
    const v = p.kind === 'time' ? laps[i].duration : laps[i].distance;
    return Math.abs(v - p.target) <= p.target * tolerance;
  });
}

/** "2 km + 4 × 8 min": the set laps before the first effort, then the efforts by length. */
export function patternName(pattern: PatternLap[], w: Words = SAVED_WORDS): string {
  const label = (p: PatternLap) => (p.kind === 'time' ? `${w.num(+(p.target / 60).toFixed(1))} min` : `${w.num(+(p.target / 1000).toFixed(1))} km`);
  const firstEffort = pattern.findIndex((p) => p.effort);
  const lead = pattern.slice(0, Math.max(0, firstEffort)).filter((p) => p.kind !== 'free').map(label);
  const efforts = new Map<string, number>();
  for (const p of pattern.filter((x) => x.effort)) efforts.set(label(p), (efforts.get(label(p)) ?? 0) + 1);
  const body = [...efforts.entries()].map(([l, n]) => (n > 1 ? `${n} × ${l}` : l));
  return [...lead, ...body].join(' + ') || w.t('Lap pattern');
}

/** The key of a layout's reps: its effort laps by length, in order ("time:600|time:600|time:600"). */
export function repsKey(pattern: PatternLap[]): string {
  // i18n-ignore: a key, not a text
  return pattern.filter((p) => p.effort && p.kind !== 'free').map((p) => `${p.kind}:${p.target}`).join('|');
}

/** "3 × 10 min": a layout's reps alone. */
export function repsName(pattern: PatternLap[], w: Words = SAVED_WORDS): string {
  return patternName(pattern.filter((p) => p.effort), w);
}

/** A run's laps read as a layout: the pattern of its laps by its average pace. */
export function layoutOf(run: { laps: Lap[]; duration: number; distance: number }): PatternLap[] {
  return patternOf(run.laps, run.distance > 0 ? run.duration / run.distance : 0);
}

/**
 * True when a run follows a layout (requirement "Segments by lap layout"): identical, its laps as the
 * layout's within the tolerance; similar, the same reps in its own layout.
 */
export function followsLayout(run: { laps: Lap[]; duration: number; distance: number }, layout: PatternLap[], match: LayoutMatch | undefined, tolerance = 0.03): boolean {
  if (match !== 'similar') return followsPattern(run.laps, layout, tolerance);
  const reps = repsKey(layout);
  return reps !== '' && repsKey(layoutOf(run)) === reps;
}

/** The effort laps a run gives for a layout, by index: the layout's for an identical one, the run's own for a similar one. */
export function repLaps(run: { laps: Lap[]; duration: number; distance: number }, layout: PatternLap[], match: LayoutMatch | undefined): number[] {
  const pattern = match === 'similar' ? layoutOf(run) : layout;
  return pattern.flatMap((p, i) => (p.effort ? [i] : []));
}

import type { Lap } from '@/lib/kernel';
import { lapKey } from './structure';
import type { PatternLap } from './types';

/** Names and lap patterns of the logical blocks (pure; the pages and the detection share them). */

export function effortName(kind: 'time' | 'distance', target: number): string {
  return kind === 'time' ? `${target / 60}-minute effort` : `${target / 1000} km effort`;
}

export function tagName(workoutType: string): string {
  return `Workout: ${workoutType}`;
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
export function patternName(pattern: PatternLap[]): string {
  const label = (p: PatternLap) => (p.kind === 'time' ? `${+(p.target / 60).toFixed(1)} min` : `${+(p.target / 1000).toFixed(1)} km`);
  const firstEffort = pattern.findIndex((p) => p.effort);
  const lead = pattern.slice(0, Math.max(0, firstEffort)).filter((p) => p.kind !== 'free').map(label);
  const efforts = new Map<string, number>();
  for (const p of pattern.filter((x) => x.effort)) efforts.set(label(p), (efforts.get(label(p)) ?? 0) + 1);
  const body = [...efforts.entries()].map(([l, n]) => (n > 1 ? `${n} × ${l}` : l));
  return [...lead, ...body].join(' + ') || 'Lap pattern';
}

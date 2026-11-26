import type { BlockStart } from '@/lib/blocks';
import { metricSeries, sampleHold, type IndexedRun, type Lap, type RunFile } from '@/lib/kernel';
import { fastestFragment } from '@/lib/blocks';
import { startKind, stopTimes } from './instance';
export { effortName, fastestFragment, followsPattern, patternKey, patternName, patternOf, tagName } from '@/lib/blocks';

/**
 * Logical blocks, independent of the route (the author's choice of 19 Nov 2026): an effort
 * (time trial) of a set distance or duration, the main effort of a run tagged with a workout
 * type, and the effort laps of runs that follow one lap pattern (a COROS test, a planned workout).
 */

/**
 * An effort is at least this much faster than the rest of its run (model's choice: on the
 * author's runs 8 % caught every faster finish and interval set; 15 % keeps the clear efforts).
 */
export const EFFORT_GAIN = 0.15;
/** Below this much running outside the fragment there is no "rest of the run" to compare with. */
const MIN_REST_SECONDS = 120;
const STOPPED_SPEED = 0.5;

/** How much faster a fragment is than the moving rest of its run (0.1 = 10 %); null when the run has no rest to speak of. */
export function effortGain(run: RunFile, from: number, to: number, fragmentDistance: number): number | null {
  const { t } = run.samples;
  const speed = metricSeries(run.samples, 'speed');
  let restSeconds = 0;
  for (let i = 0; i < t.length; i++) {
    const v = speed[i];
    if ((t[i] < from || t[i] >= to) && v !== null && v >= STOPPED_SPEED) restSeconds += sampleHold(t, i);
  }
  const restDistance = run.distance - fragmentDistance;
  if (restSeconds < MIN_REST_SECONDS || restDistance <= 0 || to <= from) return null;
  return fragmentDistance / (to - from) / (restDistance / restSeconds) - 1;
}

/**
 * The run's effort of this length, if it has one: its fastest fragment that starts the way the
 * block starts (standing: right after a stop; flying: on the move), at least EFFORT_GAIN faster
 * than the rest of the run.
 */
export function effortIn(run: RunFile, kind: 'time' | 'distance', target: number, start: BlockStart = 'any'): { from: number; to: number; gain: number } | null {
  const { t } = run.samples;
  const speed = metricSeries(run.samples, 'speed');
  const stops = stopTimes(t, speed);
  const allow = start === 'any' ? undefined : (time: number) => startKind(t, speed, time, stops) === start;
  const f = fastestFragment(run, kind, target, allow);
  if (!f) return null;
  const gain = effortGain(run, f.from, f.to, f.distance);
  return gain !== null && gain >= EFFORT_GAIN ? { from: f.from, to: f.to, gain } : null;
}

/** Standard lengths an effort is proposed for (model's choice). */
export const EFFORT_TARGETS: { kind: 'time' | 'distance'; target: number }[] = [
  { kind: 'distance', target: 3000 }, { kind: 'distance', target: 5000 }, { kind: 'distance', target: 10000 },
  { kind: 'time', target: 600 }, { kind: 'time', target: 1200 }, { kind: 'time', target: 1800 },
];


/**
 * The main effort of a tagged run: its longest lap of at least 2 minutes faster than the run's
 * average pace; in a run without one, the run after its first 150 s and before its last 60 s.
 */
export function mainEffort(run: RunFile): { from: number; to: number; lap: number | null } {
  const avg = run.distance > 0 ? run.duration / run.distance : 0;
  const hard = run.laps
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.duration >= 120 && l.distance > 0 && l.duration / l.distance < avg)
    .sort((a, b) => b.l.duration - a.l.duration)[0];
  if (hard && run.laps.length > 1) return { from: hard.l.start, to: hard.l.end, lap: hard.i + 1 };
  const end = run.samples.t[run.samples.t.length - 1] ?? 0;
  return { from: 150, to: Math.max(151, end - 60), lap: null };
}






/** The runs tagged with each workout type. */
export function workoutTypes(rows: IndexedRun[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const r of rows) if (r.workoutType) n.set(r.workoutType, (n.get(r.workoutType) ?? 0) + 1);
  return n;
}

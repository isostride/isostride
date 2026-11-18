import type { Lap } from '@/lib/ingest/parseFit';

/** A lap read as a workout structure element: a set duration or a set distance. */
export interface LapKey {
  kind: 'time' | 'distance';
  /** s or m */
  target: number;
}

/** Laps shorter than this are strides or recoveries, not blocks worth comparing. */
const MIN_LAP_SECONDS = 2 * 60;

/** True when the run's laps are the watch's auto-laps: all but the last of the same round distance. */
export function isAutoLapRun(laps: Lap[]): boolean {
  if (laps.length < 3) return false;
  const body = laps.slice(0, -1);
  const d = body[0].distance;
  return d > 0 && Math.abs(d / 500 - Math.round(d / 500)) < 0.01 && body.every((l) => Math.abs(l.distance - d) < 5);
}

/**
 * What a lap was set to: a duration when its timer time is within 2 s of a whole
 * half-minute, else a distance when within 1 % of a whole half-kilometre. Laps of
 * auto-lap runs, the last lap of a run and short laps are no structure.
 */
export function lapKey(lap: Lap, index: number, laps: Lap[]): LapKey | null {
  if (index === laps.length - 1 || lap.duration < MIN_LAP_SECONDS || isAutoLapRun(laps)) return null;
  const halfMinutes = Math.round(lap.duration / 30);
  if (halfMinutes > 0 && Math.abs(lap.duration - halfMinutes * 30) <= 2) return { kind: 'time', target: halfMinutes * 30 };
  const halfKm = Math.round(lap.distance / 500);
  if (halfKm > 0 && Math.abs(lap.distance - halfKm * 500) <= halfKm * 500 * 0.01) return { kind: 'distance', target: halfKm * 500 };
  return null;
}

export function structureName(kind: 'time' | 'distance', target: number): string {
  if (kind === 'time') {
    const min = target / 60;
    return `${Number.isInteger(min) ? min : min.toFixed(1)}-minute lap`;
  }
  return `${(target / 1000).toFixed(target % 1000 ? 1 : 0)} km lap`;
}

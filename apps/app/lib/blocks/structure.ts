import type { Lap } from '@/lib/kernel';
import { SAVED_WORDS, type Words } from './words';

/** A lap read as a workout structure element: a set duration or a set distance. */
export interface LapKey {
  kind: 'time' | 'distance';
  /** s or m */
  target: number;
}

/** Laps shorter than this are strides or recoveries, not blocks worth comparing. */
const MIN_LAP_SECONDS = 2 * 60;

/** In a run of auto-laps, at most this share of the laps but the last are cut short by a press of the lap button (model's choice: one in five). */
const PRESSED_SHARE = 0.2;

/**
 * True when the run's laps are the watch's auto-laps: all but the last of the same round distance, but
 * for a few cut short by a press of the lap button (the watch then counts the next from there). A lap
 * longer than the round distance is no auto-lap's (a warm-up before reps). One press made an easy 10 km
 * a workout of 1 km reps (the review of 26 Nov 2026).
 */
export function isAutoLapRun(laps: Lap[]): boolean {
  if (laps.length < 3) return false;
  const body = laps.slice(0, -1);
  const d = Math.max(...body.map((l) => l.distance));
  if (!(d > 0 && Math.abs(d / 500 - Math.round(d / 500)) < 0.01)) return false;
  const pressed = body.filter((l) => Math.abs(l.distance - d) >= 5).length;
  return body.length - pressed >= 2 && pressed <= PRESSED_SHARE * body.length;
}

/** Two laps are reps of one set when their times and their distances differ by this share at most (model's choice). */
const SAME_SET = 0.2;

/** A lap read as a duration (its timer time within 2 s of a whole half-minute) and as a distance (within 1 % of a whole half-kilometre): the target of each, or null. */
function lapFits(lap: Lap): { time: number | null; distance: number | null } {
  const halfMinutes = Math.round(lap.duration / 30);
  const halfKm = Math.round(lap.distance / 500);
  return {
    time: halfMinutes > 0 && Math.abs(lap.duration - halfMinutes * 30) <= 2 ? halfMinutes * 30 : null,
    distance: halfKm > 0 && Math.abs(lap.distance - halfKm * 500) <= halfKm * 500 * 0.01 ? halfKm * 500 : null,
  };
}

/**
 * What a lap was set to: a duration when its timer time is within 2 s of a whole
 * half-minute, or a distance when within 1 % of a whole half-kilometre. A lap that
 * reads both ways (1 km run in 4:01) is read as the other reps of its set are (the
 * run's laps within a fifth of its time and of its distance), those that read one
 * way only; with as many of each, or none, by the closer of the two (the review of
 * 26 Nov 2026: time came first, so about one rep of a kilometre in six was taken out
 * of its session for a lap of minutes, by its own time). Laps of auto-lap runs, the
 * last lap of a run and short laps are no structure.
 */
export function lapKey(lap: Lap, index: number, laps: Lap[]): LapKey | null {
  if (index === laps.length - 1 || lap.duration < MIN_LAP_SECONDS || isAutoLapRun(laps)) return null;
  const fits = lapFits(lap);
  if (fits.time === null || fits.distance === null) {
    return fits.time !== null ? { kind: 'time', target: fits.time } : fits.distance !== null ? { kind: 'distance', target: fits.distance } : null;
  }
  let time = 0;
  let distance = 0;
  laps.forEach((other, k) => {
    if (k === index || k === laps.length - 1 || other.duration < MIN_LAP_SECONDS) return;
    // A rep of the same set: about as long and as far.
    if (Math.abs(other.duration / lap.duration - 1) > SAME_SET || Math.abs(other.distance / lap.distance - 1) > SAME_SET) return;
    const f = lapFits(other);
    if (f.time !== null && f.distance === null) time++;
    if (f.distance !== null && f.time === null) distance++;
  });
  const closer = Math.abs(lap.duration - fits.time) / fits.time <= Math.abs(lap.distance - fits.distance) / fits.distance;
  return time > distance || (time === distance && closer) ? { kind: 'time', target: fits.time } : { kind: 'distance', target: fits.distance };
}

/** "5-minute lap", "1 km lap": a suggestion's name, kept in English unless given the words of the language in use. */
export function structureName(kind: 'time' | 'distance', target: number, w: Words = SAVED_WORDS): string {
  if (kind === 'time') {
    const min = target / 60;
    return w.t('{min}-minute lap', { min: Number.isInteger(min) ? w.num(min) : w.num(min, 1) });
  }
  const d = w.dist(target);
  return w.t('{km} {unit} lap', { km: w.num(d, Math.abs(d - Math.round(d)) > 1e-9 ? 1 : 0), unit: w.distUnit() });
}

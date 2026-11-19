import type { IndexedRun, RunFile } from '@/lib/kernel';
import type { Criteria, CriteriaScope } from './types';

/**
 * Blocks from the runner's own criteria (the author's request of 19 Nov 2026: "tworzenia
 * wlasnych blokow .... poprzez kryteria i real time filtrowanie"): the pure matching the Blocks
 * screen filters with as the runner types, and the detection applies to every run.
 */

export const EMPTY_CRITERIA: Criteria = {
  title: '', distanceMin: null, distanceMax: null, paceMin: null, paceMax: null, durationMin: null, durationMax: null,
  workoutTypes: [], techniqueCues: [], shoes: [], heartRateSources: [], dateFrom: null, dateTo: null, devices: [],
  heartRateMin: null, heartRateMax: null, lapsMin: null, lapsMax: null,
};

/** What the criteria are checked against: a whole run, or one lap with its run's context. */
export interface CriteriaSubject {
  title: string | null;
  /** m */
  distance: number;
  /** s */
  duration: number;
  /** s/km; null when nothing moved */
  pace: number | null;
  workoutType: string | null;
  techniqueCue: string | null;
  shoes: string | null;
  heartRateSource: string | null;
  /** YYYY-MM-DD, local */
  date: string;
  device: string;
  avgHeartRate: number | null;
  laps: number;
}

/** The local calendar day of an ISO time. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A whole run as the subject: its figures from the runs index. */
export function runSubject(row: IndexedRun): CriteriaSubject {
  return {
    title: row.title ?? null, distance: row.distance, duration: row.duration, pace: row.avgSpeed > 0 ? 1000 / row.avgSpeed : null,
    workoutType: row.workoutType ?? null, techniqueCue: row.techniqueCue ?? null, shoes: row.shoes ?? null, heartRateSource: row.heartRateSource ?? null,
    date: localDay(row.startTime), device: row.device, avgHeartRate: row.avgHeartRate, laps: row.laps,
  };
}

/** Lap i of a run as the subject: its own distance, duration, pace and heart rate; the run's context otherwise. */
export function lapSubject(run: RunFile, row: IndexedRun, i: number): CriteriaSubject {
  const lap = run.laps[i];
  const s = run.samples;
  let sum = 0;
  let n = 0;
  for (let k = 0; k < s.t.length; k++) {
    if (s.t[k] < lap.start || s.t[k] >= lap.end) continue;
    const hr = s.heartRate[k];
    if (hr !== null) { sum += hr; n++; }
  }
  return {
    ...runSubject(row),
    distance: lap.distance, duration: lap.duration, pace: lap.distance > 0 ? lap.duration / (lap.distance / 1000) : null,
    avgHeartRate: n ? Math.round(sum / n) : null,
  };
}

const inRange = (v: number | null, min: number | null, max: number | null) => (min === null && max === null) || (v !== null && (min === null || v >= min) && (max === null || v <= max));
const inList = (v: string | null, list: string[]) => !list.length || (v !== null && list.includes(v));

/** True when the subject meets every criterion set; an empty criterion is not checked. */
export function matchesCriteria(c: Criteria, s: CriteriaSubject): boolean {
  const title = c.title.trim().toLowerCase();
  return (
    (!title || (s.title ?? '').toLowerCase().includes(title)) &&
    inRange(s.distance, c.distanceMin, c.distanceMax) &&
    inRange(s.pace, c.paceMin, c.paceMax) &&
    inRange(s.duration, c.durationMin, c.durationMax) &&
    inList(s.workoutType, c.workoutTypes) &&
    inList(s.techniqueCue, c.techniqueCues) &&
    inList(s.shoes, c.shoes) &&
    inList(s.heartRateSource, c.heartRateSources) &&
    (c.dateFrom === null || s.date >= c.dateFrom) &&
    (c.dateTo === null || s.date <= c.dateTo) &&
    inList(s.device, c.devices) &&
    inRange(s.avgHeartRate, c.heartRateMin, c.heartRateMax) &&
    inRange(s.laps, c.lapsMin, c.lapsMax)
  );
}

/** True when no criterion is set: such a block would take every run. */
export function isEmptyCriteria(c: Criteria): boolean {
  return Object.entries(c).every(([k, v]) => (k === 'title' ? !(v as string).trim() : Array.isArray(v) ? !v.length : v === null));
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const range = (min: number | null, max: number | null, f: (v: number) => string, unit: string) =>
  min !== null && max !== null ? `${f(min)}–${f(max)}${unit}` : min !== null ? `from ${f(min)}${unit}` : max !== null ? `to ${f(max)}${unit}` : null;

/** "3–5 km · 3:55–4:05 /km · tempo": the criteria set, in order, as a name. */
export function criteriaName(c: Criteria, scope: CriteriaScope): string {
  const parts = [
    c.title.trim() ? `“${c.title.trim()}”` : null,
    range(c.distanceMin, c.distanceMax, (v) => String(+(v / 1000).toFixed(2)), ' km'),
    range(c.paceMin, c.paceMax, mmss, ' /km'),
    range(c.durationMin, c.durationMax, (v) => String(Math.round(v / 60)), ' min'),
    ...c.workoutTypes, ...c.techniqueCues, ...c.shoes, ...c.heartRateSources, ...c.devices,
    c.dateFrom || c.dateTo ? `${c.dateFrom ?? '…'} – ${c.dateTo ?? '…'}` : null,
    range(c.heartRateMin, c.heartRateMax, String, ' bpm'),
    range(c.lapsMin, c.lapsMax, String, ' laps'),
  ].filter((p): p is string => p !== null);
  const name = parts.join(' · ') || 'Every run';
  return scope === 'lap' ? `Laps ${name}` : name;
}

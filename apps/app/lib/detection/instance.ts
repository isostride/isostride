import type { IndexedRun, RunFile, Series } from '@/lib/kernel';

import { MIN_SECONDS, SAMPLE_METRICS, efficiencyOf, STANDING_WINDOW, type BlockDefinition, type BlockInstance, type BlockMetric, type Tolerances } from '@/lib/blocks';

const STOPPED_SPEED = 0.5;
/** seconds between two samples above which the watch was paused */
const MAX_SAMPLE_GAP = 2;
/** seconds around a stop left out of the metrics: slowing down and speeding up again */
const STOP_MARGIN = 10;

/**
 * The moving part of a fragment (the author's decision of 19 Nov 2026: a stop at the lights
 * does not reject a block, its metrics come from the moving samples). Returns the sample
 * indices that are moving, away from any stop by STOP_MARGIN, the seconds stopped (slow samples
 * plus the gaps of auto-pause), and the time of the last stop.
 */
/** The times a run is stopped: samples below walking speed, and the first sample after an auto-pause gap. */
export function stopTimes(t: number[], speed: Series): number[] {
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const v = speed[i];
    if ((v !== null && v < STOPPED_SPEED) || (i > 0 && t[i] - t[i - 1] > MAX_SAMPLE_GAP)) out.push(t[i]);
  }
  return out;
}

/**
 * How a fragment starting at `start` s begins: standing when the run starts there or a stop
 * falls within STANDING_WINDOW s before it (up to 2 s after, for the sample that resumes).
 */
export function startKind(t: number[], speed: Series, start: number, stops = stopTimes(t, speed)): 'standing' | 'flying' {
  if (start <= (t[0] ?? 0) + STANDING_WINDOW) return 'standing';
  let lo = 0;
  let hi = stops.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (stops[mid] < start - STANDING_WINDOW) lo = mid + 1; else hi = mid; }
  return lo < stops.length && stops[lo] <= start + 2 ? 'standing' : 'flying';
}

export function movingPart(t: number[], speed: Series, idx: number[]): { moving: number[]; stopped: number; lastStop: number | null } {
  const stops: [number, number][] = [];
  let stopped = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const v = speed[i];
    if (v !== null && v < STOPPED_SPEED) { stopped++; stops.push([t[i], t[i] + 1]); }
    if (k > 0) {
      const gap = t[i] - t[idx[k - 1]];
      if (gap > MAX_SAMPLE_GAP) { stopped += gap - 1; stops.push([t[idx[k - 1]] + 1, t[i]]); }
    }
  }
  const near = (time: number) => stops.some(([a, b]) => time >= a - STOP_MARGIN && time < b + STOP_MARGIN);
  const moving = idx.filter((i) => { const v = speed[i]; return (v === null || v >= STOPPED_SPEED) && !near(t[i]); });
  return { moving, stopped, lastStop: stops.length ? stops[stops.length - 1][1] : null };
}

/**
 * Builds a block instance for the fragment [start, end) s of a run: metric means,
 * per-minute profile, the four context layers, and the strict matching conditions
 * of the definition (spec section 5) with the reason for each one that fails.
 */
export function buildInstance(def: BlockDefinition, run: RunFile, row: IndexedRun, start: number, end: number, extra: { heading?: number | null; lap?: number | null } = {}): BlockInstance {
  const s = run.samples;
  const idx: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (s.t[i] >= start && s.t[i] < end) idx.push(i);

  // Metrics and conditions from the moving part; time stopped is recorded, not rejected.
  const { moving, stopped } = movingPart(s.t, s.speed, idx);
  const metrics = {} as Record<BlockMetric, number | null>;
  const profile = {} as Record<BlockMetric, (number | null)[]>;
  const minutes = Math.max(1, Math.ceil((end - start) / 60));
  for (const m of SAMPLE_METRICS) {
    const series = s[m] as Series;
    metrics[m] = mean(moving.map((i) => series[i]));
    profile[m] = Array.from({ length: minutes }, (_, k) => {
      const v = mean(moving.filter((i) => s.t[i] >= start + k * 60 && s.t[i] < start + (k + 1) * 60).map((i) => series[i]));
      return v === null ? null : round(v, 2);
    });
    if (metrics[m] !== null) metrics[m] = round(metrics[m]!, 3);
  }

  const dist0 = valueAt(s.distance, idx[0]) ?? 0;
  const dist1 = valueAt(s.distance, idx[idx.length - 1]) ?? dist0;
  const distance = dist1 - dist0;
  const duration = end - start;
  const speed = metrics.speed ?? (duration > 0 ? distance / duration : 0);
  const speeds = moving.map((i) => s.speed[i]).filter((v): v is number => v !== null);
  const cv = speeds.length > 1 ? std(speeds) / meanOf(speeds) : 0;
  const grade = metrics.effortPace !== null && speed > 0 ? Math.abs(metrics.effortPace / speed - 1) : 0;
  // Effort before the block: the moving part of the 2 minutes before it.
  const beforeIdx: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (s.t[i] >= start - 120 && s.t[i] < start) beforeIdx.push(i);
  const beforeSpeeds = movingPart(s.t, s.speed, beforeIdx).moving.map((i) => s.speed[i]).filter((v): v is number => v !== null);
  const effortBefore = beforeSpeeds.length >= 60 && speed > 0 ? meanOf(beforeSpeeds) / speed - 1 : null;
  const pace = speed > 0 ? 1000 / speed : 0;

  const tol: Tolerances = def.tolerances;
  const reasons: string[] = [];
  const begins = startKind(s.t, s.speed, start);
  if (tol.start !== 'any' && begins !== tol.start) reasons.push(`start: ${begins}, the segment needs a ${tol.start} start`);
  // Heart rate from the block's own heart rate start, when it has one: the same in every instance.
  // Efficiency (metres per heartbeat) from the same samples as the heart rate.
  const hrIdx = tol.hrSkip !== null ? moving.filter((i) => s.t[i] >= start + tol.hrSkip!) : moving;
  if (tol.hrSkip !== null) {
    const hr = mean(hrIdx.map((i) => s.heartRate[i]));
    metrics.heartRate = hr === null ? null : round(hr, 3);
  }
  const effSpeed = mean(hrIdx.map((i) => s.speed[i]));
  const eff = efficiencyOf(effSpeed, metrics.heartRate);
  metrics.efficiency = eff === null ? null : round(eff, 4);
  profile.efficiency = profile.speed.map((sp, k) => { const e = efficiencyOf(sp, profile.heartRate[k]); return e === null ? null : round(e, 4); });
  if (tol.paceMin !== null && tol.paceMax !== null && (pace < tol.paceMin || pace > tol.paceMax))
    reasons.push(`pace: ${fmtPace(pace)} outside ${fmtPace(tol.paceMin)}–${fmtPace(tol.paceMax)}`);
  if (grade > tol.gradeMax) reasons.push(`grade: effort pace differs by ${pct(grade)}, limit ${pct(tol.gradeMax)}`);
  if (cv >= tol.cvMax) reasons.push(`pace steadiness: CV ${cv.toFixed(2)}, limit ${tol.cvMax}`);
  // One decision per run (the author's decision of 19 Nov 2026): no metric is left out of an
  // instance on its own; a fragment too short for any meaningful mean is rejected as a whole.
  if (duration < MIN_SECONDS.block) reasons.push(`effort ${Math.round(duration)} s, minimum ${MIN_SECONDS.block} s`);
  if (tol.effortBeforeMax !== null) {
    if (effortBefore === null) reasons.push('effort before it: less than 1 min of data');
    else if (Math.abs(effortBefore) > tol.effortBeforeMax) reasons.push(`effort before it: ${pct(Math.abs(effortBefore))}, limit ${pct(tol.effortBeforeMax)}`);
  }

  // Lap number (1-based): given for structure blocks, else the lap the block starts in.
  const lapNumber = extra.lap ?? run.laps.findIndex((l) => start >= l.start && start < l.end) + 1;
  return {
    id: `${def.id}:${run.id}:${Math.round(start)}`,
    definitionId: def.id,
    runId: run.id,
    runStart: run.startTime,
    start: Math.round(start),
    end: Math.round(end),
    duration: Math.round(duration),
    distance: Math.round(distance),
    metrics,
    profile,
    context: {
      block: { pace: Math.round(pace), grade: round(grade, 3), duration: Math.round(duration), heading: extra.heading ?? null, cv: round(cv, 3), stopped, start: begins },
      before: { minuteOfRun: Math.floor(start / 60), kmOfRun: round(dist0 / 1000, 2), effortBefore: effortBefore === null ? null : round(effortBefore, 3), lap: lapNumber > 0 ? lapNumber : null },
      run: { device: run.device, shoes: row.shoes ?? null, heartRateSource: row.heartRateSource ?? `wrist (${run.device})`, workoutType: row.workoutType ?? null, techniqueCue: row.techniqueCue ?? null },
      day: { load3: row.load3 ?? 0, load7: row.load7 ?? 0, form: row.form ?? 0, temperature: run.temperature },
    },
    status: reasons.length ? 'rejected' : 'accepted',
    reasons,
  };
}

function valueAt(series: Series, i: number | undefined): number | null {
  return i === undefined ? null : series[i];
}
function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null && x !== undefined);
  return v.length ? meanOf(v) : null;
}
function meanOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[]): number {
  const m = meanOf(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function round(x: number, d = 0): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
export function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

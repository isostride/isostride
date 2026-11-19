import type { IndexedRun, RunFile, Series } from '@/lib/kernel';

const STOPPED_SPEED = 0.5;
/** seconds between two samples above which the watch was paused */
const MAX_SAMPLE_GAP = 2;
import { BLOCK_METRICS, MIN_SECONDS, type BlockDefinition, type BlockInstance, type BlockMetric, type Tolerances } from '@/lib/blocks';

/**
 * Builds a block instance for the fragment [start, end) s of a run: metric means,
 * per-minute profile, the four context layers, and the strict matching conditions
 * of the definition (spec section 5) with the reason for each one that fails.
 */
export function buildInstance(def: BlockDefinition, run: RunFile, row: IndexedRun, start: number, end: number, extra: { heading?: number | null; lap?: number | null } = {}): BlockInstance {
  const s = run.samples;
  const idx: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (s.t[i] >= start && s.t[i] < end) idx.push(i);

  const metrics = {} as Record<BlockMetric, number | null>;
  const profile = {} as Record<BlockMetric, (number | null)[]>;
  const minutes = Math.max(1, Math.ceil((end - start) / 60));
  for (const m of BLOCK_METRICS) {
    const series = s[m] as Series;
    metrics[m] = mean(idx.map((i) => series[i]));
    profile[m] = Array.from({ length: minutes }, (_, k) => {
      const v = mean(idx.filter((i) => s.t[i] >= start + k * 60 && s.t[i] < start + (k + 1) * 60).map((i) => series[i]));
      return v === null ? null : round(v, 2);
    });
    if (metrics[m] !== null) metrics[m] = round(metrics[m]!, 3);
  }

  const dist0 = valueAt(s.distance, idx[0]) ?? 0;
  const dist1 = valueAt(s.distance, idx[idx.length - 1]) ?? dist0;
  const distance = dist1 - dist0;
  const duration = end - start;
  const speed = metrics.speed ?? (duration > 0 ? distance / duration : 0);
  // Steadiness is judged on the moving samples; time stopped is its own condition.
  const allSpeeds = idx.map((i) => s.speed[i]).filter((v): v is number => v !== null);
  const speeds = allSpeeds.filter((v) => v >= STOPPED_SPEED);
  // Stopped time: samples below walking speed, plus the gaps where the watch recorded
  // nothing (auto-pause at a crossing) — a 1 s recording leaves no gap longer than 2 s.
  let paused = 0;
  for (let k = 1; k < idx.length; k++) {
    const gap = s.t[idx[k]] - s.t[idx[k - 1]];
    if (gap > MAX_SAMPLE_GAP) paused += gap - 1;
  }
  const stopped = allSpeeds.length - speeds.length + paused;
  const cv = speeds.length > 1 ? std(speeds) / meanOf(speeds) : 0;
  const grade = metrics.effortPace !== null && speed > 0 ? Math.abs(metrics.effortPace / speed - 1) : 0;
  const before = idx.length ? s.t.map((t, i) => (t >= start - 120 && t < start ? s.speed[i] : null)) : [];
  const beforeSpeeds = before.filter((v): v is number => v !== null);
  const effortBefore = beforeSpeeds.length >= 60 && speed > 0 ? meanOf(beforeSpeeds) / speed - 1 : null;
  const pace = speed > 0 ? 1000 / speed : 0;

  const tol: Tolerances = def.tolerances;
  const reasons: string[] = [];
  if (tol.paceMin !== null && tol.paceMax !== null && (pace < tol.paceMin || pace > tol.paceMax))
    reasons.push(`pace: ${fmtPace(pace)} outside ${fmtPace(tol.paceMin)}–${fmtPace(tol.paceMax)}`);
  if (grade > tol.gradeMax) reasons.push(`grade: effort pace differs by ${pct(grade)}, limit ${pct(tol.gradeMax)}`);
  if (cv >= tol.cvMax) reasons.push(`pace steadiness: CV ${cv.toFixed(2)}, limit ${tol.cvMax}`);
  if (stopped > tol.stoppedMax) reasons.push(`stopped: ${stopped} s in the block, limit ${tol.stoppedMax} s`);
  if (tol.effortBeforeMax !== null) {
    if (effortBefore === null) reasons.push('effort before the block: less than 1 min of data');
    else if (Math.abs(effortBefore) > tol.effortBeforeMax) reasons.push(`effort before the block: ${pct(Math.abs(effortBefore))}, limit ${pct(tol.effortBeforeMax)}`);
  }

  const heartRate =
    duration < MIN_SECONDS.heartRate
      ? { valid: false, reason: `block ${Math.round(duration / 60 * 10) / 10} min, minimum 4 min` }
      : start < tol.hrStartMin
        ? { valid: false, reason: `block start ${Math.floor(start / 60)} min, minimum ${tol.hrStartMin / 60} min` }
        : { valid: true };

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
      block: { pace: Math.round(pace), grade: round(grade, 3), duration: Math.round(duration), heading: extra.heading ?? null, cv: round(cv, 3) },
      before: { minuteOfRun: Math.floor(start / 60), kmOfRun: round(dist0 / 1000, 2), effortBefore: effortBefore === null ? null : round(effortBefore, 3), lap: lapNumber > 0 ? lapNumber : null },
      run: { device: run.device, shoes: row.shoes ?? null, heartRateSource: row.heartRateSource ?? `wrist (${run.device})`, workoutType: row.workoutType ?? null, techniqueCue: row.techniqueCue ?? null },
      day: { load3: row.load3 ?? 0, load7: row.load7 ?? 0, temperature: run.temperature },
    },
    status: reasons.length ? 'rejected' : 'accepted',
    reasons,
    heartRate,
    gaitValid: duration >= MIN_SECONDS.gait,
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

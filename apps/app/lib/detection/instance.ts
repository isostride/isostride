import { MAX_SAMPLE_COVER, metricSeries, pauseGap, recordedSmart, sampleHold, type IndexedRun, type RunFile, type Series } from '@/lib/kernel';

import { MIN_SECONDS, REASONS, SAVED_WORDS, blockMetricsOf, efficiencyOf, STANDING_WINDOW, type BlockDefinition, type BlockInstance, type BlockMetric, type Tolerances } from '@/lib/blocks';

const STOPPED_SPEED = 0.5;
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
  const pause = pauseGap(t);
  for (let i = 0; i < t.length; i++) {
    const v = speed[i];
    if ((v !== null && v < STOPPED_SPEED) || (i > 0 && t[i] - t[i - 1] > pause)) out.push(t[i]);
  }
  return out;
}

/**
 * How a fragment starting at `start` s begins: standing when the run starts there or a stop
 * falls within STANDING_WINDOW s before it (up to 2 s after, for the sample that resumes).
 */
export function startKind(t: number[], speed: Series, start: number, stops = stopTimes(t, speed)): 'standing' | 'flying' {
  // i18n-ignore: a kind of start, not a text
  if (start <= (t[0] ?? 0) + STANDING_WINDOW) return 'standing';
  let lo = 0;
  let hi = stops.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (stops[mid] < start - STANDING_WINDOW) lo = mid + 1; else hi = mid; }
  // i18n-ignore: a kind of start, not a text
  return lo < stops.length && stops[lo] <= start + 2 ? 'standing' : 'flying';
}

export function movingPart(t: number[], speed: Series, idx: number[]): { moving: number[]; stopped: number; lastStop: number | null } {
  const stops: [number, number][] = [];
  let stopped = 0;
  const pause = pauseGap(t);
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const v = speed[i];
    if (v !== null && v < STOPPED_SPEED) { stopped += sampleHold(t, i); stops.push([t[i], t[i] + sampleHold(t, i)]); }
    if (k > 0) {
      const gap = t[i] - t[idx[k - 1]];
      // A pause: longer than the watch leaves between two samples while it records (pauseGap).
      if (gap > pause) { stopped += gap - 1; stops.push([t[idx[k - 1]] + 1, t[i]]); }
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
  const speedSeries = metricSeries(s, 'speed');
  const { moving, stopped } = movingPart(s.t, speedSeries, idx);
  const metrics = {} as Record<BlockMetric, number | null>;
  const profile = {} as Record<BlockMetric, (number | null)[]>;
  const minutes = Math.max(1, Math.ceil((end - start) / 60));
  // The moving samples of each minute, sorted out once: every metric's profile reads them (each metric
  // looked through every sample for every minute, an hour's run 2 million looks a time).
  const byMinute: number[][] = Array.from({ length: minutes }, () => []);
  for (const i of moving) { const k = Math.floor((s.t[i] - start) / 60); if (k >= 0 && k < minutes) byMinute[k].push(i); }
  for (const m of blockMetricsOf(run.metrics.map((x) => x.key))) {
    if (m === 'efficiency') continue;
    const series = metricSeries(s, m);
    metrics[m] = held(s.t, moving, series);
    profile[m] = byMinute.map((inMinute) => {
      const v = held(s.t, inMinute, series);
      return v === null ? null : round(v, 2);
    });
    if (metrics[m] !== null) metrics[m] = round(metrics[m]!, 3);
  }

  const dist0 = valueAt(s.distance, idx[0]) ?? 0;
  // The distance up to the end of the fragment, as its duration runs: to the last sample inside it the
  // fragment was a sample short (1 km in 240 s read 996 m, a pace of 4:01 for 4:00), the shorter the
  // rep the more. Between the last sample inside and the first after it, by the time; not across a pause.
  const last = idx[idx.length - 1];
  const inside = valueAt(s.distance, last) ?? dist0;
  const after = last !== undefined && last + 1 < s.t.length && s.t[last + 1] - s.t[last] <= MAX_SAMPLE_COVER ? valueAt(s.distance, last + 1) : null;
  const dist1 = after === null || last === undefined ? inside : inside + (after - inside) * Math.min(1, Math.max(0, (end - s.t[last]) / (s.t[last + 1] - s.t[last])));
  const distance = dist1 - dist0;
  const duration = end - start;
  const speed = metrics.speed ?? (duration > 0 ? distance / duration : 0);
  const speeds = moving.map((i) => (s.values.speed?.[i] ?? null)).filter((v): v is number => v !== null);
  const cv = speeds.length > 1 ? std(speeds) / meanOf(speeds) : 0;
  const effortPace = metrics.effortPace ?? null;
  const grade = effortPace !== null && speed > 0 ? Math.abs(effortPace / speed - 1) : 0;
  // Effort before the block: the moving part of the 2 minutes before it.
  const beforeIdx: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (s.t[i] >= start - 120 && s.t[i] < start) beforeIdx.push(i);
  const beforeMoving = movingPart(s.t, speedSeries, beforeIdx).moving.filter((i) => (s.values.speed?.[i] ?? null) !== null);
  // A minute of running before it at least, by the time its samples stand for.
  const beforeSeconds = beforeMoving.reduce((sum, i) => sum + sampleHold(s.t, i), 0);
  const beforeSpeed = held(s.t, beforeMoving, s.values.speed ?? []);
  const effortBefore = beforeSeconds >= 60 && speed > 0 && beforeSpeed !== null ? beforeSpeed / speed - 1 : null;
  const pace = speed > 0 ? 1000 / speed : 0;

  const tol: Tolerances = def.tolerances;
  const reasons: string[] = [];
  const begins = startKind(s.t, speedSeries, start);
  if (tol.start !== 'any' && begins !== tol.start) reasons.push(begins === 'standing' ? REASONS.standingNeedsFlying : REASONS.flyingNeedsStanding);
  // Heart rate from the block's own heart rate start, when it has one: the same in every instance.
  // Efficiency (metres per heartbeat) from the same samples as the heart rate.
  const hrIdx = tol.hrSkip !== null ? moving.filter((i) => s.t[i] >= start + tol.hrSkip!) : moving;
  if (tol.hrSkip !== null) {
    const hr = held(s.t, hrIdx, s.values.heartRate ?? []);
    metrics.heartRate = hr === null ? null : round(hr, 3);
  }
  const effSpeed = held(s.t, hrIdx, s.values.speed ?? []);
  const eff = efficiencyOf(effSpeed, metrics.heartRate ?? null);
  metrics.efficiency = eff === null ? null : round(eff, 4);
  profile.efficiency = (profile.speed ?? []).map((sp, k) => { const e = efficiencyOf(sp, profile.heartRate?.[k] ?? null); return e === null ? null : round(e, 4); });
  if (tol.paceMin !== null && tol.paceMax !== null && (pace < tol.paceMin || pace > tol.paceMax))
    reasons.push(say(REASONS.pace, { pace: fmtPace(pace), from: fmtPace(tol.paceMin), to: fmtPace(tol.paceMax) }));
  if (grade > tol.gradeMax) reasons.push(say(REASONS.grade, { grade: pct(grade), limit: pct(tol.gradeMax) }));
  if (cv >= tol.cvMax) reasons.push(say(REASONS.steadiness, { cv: cv.toFixed(2), limit: tol.cvMax }));
  // One decision per run (the author's decision of 19 Nov 2026): no metric is left out of an
  // instance on its own; a fragment too short for any meaningful mean is rejected as a whole.
  if (duration < MIN_SECONDS.block) reasons.push(say(REASONS.short, { seconds: Math.round(duration), minimum: MIN_SECONDS.block }));
  if (tol.effortBeforeMax !== null) {
    if (effortBefore === null) reasons.push(REASONS.noEffortBefore);
    else if (Math.abs(effortBefore) > tol.effortBeforeMax) reasons.push(say(REASONS.effortBefore, { effort: pct(Math.abs(effortBefore)), limit: pct(tol.effortBeforeMax) }));
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
/** The mean of a series over the samples given, each by the time it stands for (a second each in a run recorded every second); null with no value. */
function held(t: number[], indices: number[], series: Series): number | null {
  let sum = 0;
  let weight = 0;
  // A run recorded every second: every sample a second, the plain mean (and no more work than it was).
  const smart = recordedSmart(t);
  for (const i of indices) {
    const v = series[i];
    if (v === null || v === undefined) continue;
    const w = smart ? sampleHold(t, i) : 1;
    sum += v * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : null;
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
/** A reason in English, as the instances file keeps it; a screen shows it with reasonText (lib/blocks). */
const say = (key: string, vars: Record<string, string | number>) => SAVED_WORDS.t(key, vars);

/** A share in whole percent, its sign left to the reason's text. */
function pct(x: number): number {
  return Math.round(x * 100);
}
export function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

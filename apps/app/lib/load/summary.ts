import { decouplingOf } from '@/lib/blocks';
import { CURVE_DURATIONS, bestsWithin } from '@/lib/curve';
import { metricSeries, runningGap, type RunFile, type Series } from '@/lib/kernel';

/**
 * What the load models need of a run, whatever the settings (ADR "Load and form models"): kept in
 * derived/load-summaries.json so that a change of model or parameters reads no run file.
 */
export interface LoadSummary {
  /** timer time, s */
  duration: number;
  /** seconds at each heart rate: hr[k] at hrFrom + k bpm; empty without heart rate */
  hrFrom: number;
  hr: number[];
  /** the highest mean heart rate of a 10 s window, bpm */
  hrPeak: number | null;
  /** normalised effort speed, m/s: the 4th-power mean of the 30 s rolling mean (grade-adjusted effort pace where the watch gives it) */
  normSpeed: number | null;
  /** normalised power, W, the same way */
  normPower: number | null;
  /** the bests of every length of the curve, 30 s to 2 h (before version 4, 2–20 minutes): the critical speed and power and Riegel's law take those of 2–20 minutes, the whole-curve models all */
  bests: BestOfLength[];
  /** time moving, s: the 10 s windows with movement */
  moving: number;
  /** mean heart rate while moving, bpm */
  avgHr: number | null;
  /** efficiency factor while moving: mean speed (the effort pace where the watch gives it) per mean heart rate, metres per heartbeat */
  ef: number | null;
  /** Pa:HR decoupling of the run past its first WARMUP s, %: the efficiency of the first half against the second (the heart rate still rising in the warm-up would read as drift) */
  decoupling: number | null;
  /**
   * The run past its first WARMUP s, while moving (VO2max from heart rate, whose heart rate must have
   * settled): the time, s, the mean speed (the effort pace where the watch gives it), m/s, and the mean
   * heart rate, bpm. Left out of summaries made before them.
   */
  steadyMoving?: number;
  steadySpeed?: number | null;
  steadyHr?: number | null;
}

/** The warm-up left out of the steady part of a run and of its decoupling, s (model's choice: 10 minutes, the heart rate still rising). */
export const WARMUP = 600;

/**
 * The best stretch of a length in a run: its speed (m/s) and its power (W), each with where it lies
 * and the highest heart rate in it — the evidence of how hard it was (ADR "Models grouped by
 * evidence, assumptions checked").
 */
export interface BestOfLength {
  /** s */
  duration: number;
  speed: number | null;
  power: number | null;
  /**
   * the fastest stretch, [from, to] s of the run; its mean heart rate after the first HR_LAG s (the
   * heart rate lags the effort), and the highest of a 10 s window in it, bpm
   */
  speedAt?: [number, number];
  speedHr?: number | null;
  speedHrPeak?: number | null;
  /** the stretch of the highest average power, with its heart rates */
  powerAt?: [number, number];
  powerHr?: number | null;
  powerHrPeak?: number | null;
}

/** The heart rate takes about this long to follow an effort, s: left out of a stretch's mean heart rate. */
export const HR_LAG = 90;


/** The rolling mean of the normalisation, s (Coggan's normalised power). */
const ROLL = 30;

/** A sample counts until the next one, but no longer than the gap the watch leaves while it records (runningGap): a pause counts as nothing. */
const holdOf = (t: number[], i: number) => (i + 1 < t.length ? Math.min(t[i + 1] - t[i], runningGap(t)) : 1);

/** The 4th-power mean of the 30 s rolling mean of a series, each sample weighted by the time it holds; null without values. */
export function normalised(t: number[], values: Series): number | null {
  if (!values.some((v) => v !== null && v > 0)) return null;
  // area[i]: the integral of the series from the first sample to sample i (a missing value counts as 0).
  const area = [0];
  for (let i = 1; i < t.length; i++) area.push(area[i - 1] + (values[i - 1] ?? 0) * holdOf(t, i - 1));
  let j = 0;
  let sum4 = 0;
  let weight = 0;
  for (let i = 0; i < t.length; i++) {
    while (t[i] - t[j] > ROLL) j++;
    if (t[i] - t[0] < ROLL) continue;
    const span = t[i] - t[j];
    if (span <= 0) continue;
    const mean = (area[i] - area[j]) / span;
    const w = holdOf(t, i);
    sum4 += mean ** 4 * w;
    weight += w;
  }
  return weight > 0 ? (sum4 / weight) ** 0.25 : null;
}

/** The load summary of a run. */
export function summarizeLoad(run: RunFile): LoadSummary {
  const { t } = run.samples;
  const [heartRate, speed, effortPace, power] = ['heartRate', 'speed', 'effortPace', 'power'].map((k) => metricSeries(run.samples, k));
  const secs = new Map<number, number>();
  for (let i = 0; i < t.length; i++) {
    const h = heartRate[i];
    if (h === null || h < 30 || h > 250) continue;
    const b = Math.round(h);
    secs.set(b, (secs.get(b) ?? 0) + holdOf(t, i));
  }
  const bpms = [...secs.keys()].sort((a, b) => a - b);
  const hrFrom = bpms[0] ?? 0;
  const hr = bpms.length ? Array.from({ length: bpms[bpms.length - 1] - hrFrom + 1 }, (_, k) => Math.round((secs.get(hrFrom + k) ?? 0) * 10) / 10) : [];
  // The peak: the highest mean of a 10 s window, a heart rate held, not 10 s summed over the run.
  let hrPeak: number | null = null;
  for (const h of run.windows.values.heartRate ?? []) if (h !== null && h >= 30 && h <= 250 && (hrPeak === null || h > hrPeak)) hrPeak = Math.round(h);
  const effort = effortPace.some((v) => v !== null && v > 0) ? effortPace : speed;
  // Every length of the curve, 30 s to 2 h: the whole-curve models need the sprint and the long bests;
  // critical speed, Riegel's law and the best efforts take those of 2–20 minutes from them.
  const durations = CURVE_DURATIONS;
  const whole: [number, number][] = [[0, 1e9]];
  // The bests of pace from the effort pace, or without downhills (curve.ts), as rTSS normalises the pace.
  const fast = new Map(bestsWithin(run, whole, 'speed', durations, 'effort').map((b) => [b.duration, b]));
  const strong = new Map(bestsWithin(run, whole, 'power', durations).map((b) => [b.duration, b]));
  const round = (v: number | null, k = 1000) => (v === null ? null : Math.round(v * k) / k);
  // Efficiency while moving, from the 10 s windows (as the run chart's efficiency).
  const w = run.windows;
  /** The heart rate of the 10 s windows that start inside [from, to): the mean after the first HR_LAG s (of a longer stretch), and the peak. */
  const heartIn = (from: number, to: number): { mean: number | null; peak: number | null } => {
    const lag = to - from > 2 * HR_LAG ? HR_LAG : 0;
    let peak: number | null = null;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < w.start.length; i++) {
      const h = (w.values.heartRate?.[i] ?? null);
      if (w.start[i] < from - 5 || w.start[i] >= to || h === null) continue;
      if (peak === null || h > peak) peak = h;
      if (w.start[i] >= from + lag - 5) { sum += h; n++; }
    }
    return { mean: n ? Math.round(sum / n) : null, peak: peak === null ? null : Math.round(peak) };
  };
  // The effort pace where the watch gives it: a hill run at an even effort counts as level.
  const efforts = w.values.effortPace?.some((v) => v !== null && v > 0) ? w.values.effortPace : null;
  let sp = 0;
  let hrSum = 0;
  let both = 0;
  let movingWindows = 0;
  const steady = { sp: 0, hr: 0, both: 0, windows: 0 };
  for (let i = 0; i < w.start.length; i++) {
    if (w.flags.stopped[i]) continue;
    movingWindows++;
    const past = w.start[i] >= WARMUP;
    if (past) steady.windows++;
    const v = (efforts?.[i] ?? w.values.speed?.[i] ?? null);
    const h = (w.values.heartRate?.[i] ?? null);
    if (v !== null && v > 0 && h !== null && h > 0) {
      sp += v; hrSum += h; both++;
      if (past) { steady.sp += v; steady.hr += h; steady.both++; }
    }
  }
  return {
    moving: movingWindows * 10,
    avgHr: both ? Math.round(hrSum / both) : null,
    ef: both ? round((sp / both) * 60 / (hrSum / both)) : null,
    // Past the warm-up: a heart rate rising from 110 to 145 in the first 10 minutes of an even hour reads as 4 % of drift.
    decoupling: round(decouplingOf(run, WARMUP, (w.start[w.start.length - 1] ?? 0) + 10), 10),
    steadyMoving: steady.windows * 10,
    steadySpeed: steady.both ? round(steady.sp / steady.both) : null,
    steadyHr: steady.both ? Math.round(steady.hr / steady.both) : null,
    duration: run.duration, hrFrom, hr, hrPeak,
    normSpeed: round(normalised(t, effort)), normPower: round(normalised(t, power), 10),
    bests: durations.map((duration) => {
      const f = fast.get(duration);
      const p = strong.get(duration);
      return {
        duration, speed: f ? round(1000 / f.value) : null, power: p ? round(p.value, 10) : null,
        ...(f ? (() => { const h = heartIn(f.from, f.to); return { speedAt: [Math.round(f.from), Math.round(f.to)] as [number, number], speedHr: h.mean, speedHrPeak: h.peak }; })() : {}),
        ...(p ? (() => { const h = heartIn(p.from, p.to); return { powerAt: [Math.round(p.from), Math.round(p.to)] as [number, number], powerHr: h.mean, powerHrPeak: h.peak }; })() : {}),
      };
    }),
  };
}

import { CS_RANGE, CURVE_DURATIONS, bestsWithin } from '@/lib/curve';
import type { RunFile, Series } from '@/lib/kernel';

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
  /** the highest heart rate held for 10 s in all, bpm */
  hrPeak: number | null;
  /** normalised effort speed, m/s: the 4th-power mean of the 30 s rolling mean (grade-adjusted effort pace where the watch gives it) */
  normSpeed: number | null;
  /** normalised power, W, the same way */
  normPower: number | null;
  /** the bests of 2–20 minutes, for the critical speed and power: speed m/s and power W */
  bests: { duration: number; speed: number | null; power: number | null }[];
}

/** A sample counts until the next one, but no longer than this, s: a pause counts as nothing. */
const HOLD = 5;
/** The rolling mean of the normalisation, s (Coggan's normalised power). */
const ROLL = 30;

const holdOf = (t: number[], i: number) => (i + 1 < t.length ? Math.min(t[i + 1] - t[i], HOLD) : 1);

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
  const { t, heartRate, speed, effortPace, power } = run.samples;
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
  let held = 0;
  let hrPeak: number | null = null;
  for (let k = hr.length - 1; k >= 0; k--) { held += hr[k]; if (held >= 10) { hrPeak = hrFrom + k; break; } }
  const effort = effortPace.some((v) => v !== null && v > 0) ? effortPace : speed;
  const durations = CURVE_DURATIONS.filter((d) => d >= CS_RANGE[0] && d <= CS_RANGE[1]);
  const whole: [number, number][] = [[0, 1e9]];
  const fast = new Map(bestsWithin(run, whole, 'speed', durations).map((b) => [b.duration, 1000 / b.value]));
  const strong = new Map(bestsWithin(run, whole, 'power', durations).map((b) => [b.duration, b.value]));
  const round = (v: number | null, k = 1000) => (v === null ? null : Math.round(v * k) / k);
  return {
    duration: run.duration, hrFrom, hr, hrPeak,
    normSpeed: round(normalised(t, effort)), normPower: round(normalised(t, power), 10),
    bests: durations.map((duration) => ({ duration, speed: round(fast.get(duration) ?? null), power: round(strong.get(duration) ?? null, 10) })),
  };
}

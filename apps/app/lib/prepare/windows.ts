import { type Samples, type Series, WINDOW_METRICS, type WindowMetric, type Windows } from '@/lib/kernel';

export const WINDOW_SECONDS = 10;
/** Windows that start before this many seconds into the run are flagged (spec F3). */
export const FIRST_SECONDS_FLAGGED = 150;
/** Below this mean speed a window counts as stopped (model's choice: 0.5 m/s ≈ 33 min/km). */
export const STOPPED_SPEED = 0.5;
/** Effort pace differing from pace by more than this share flags grade (spec section 5: 4%). */
export const GRADE_TOLERANCE = 0.04;
/** A metric missing in more than this share of a window's samples flags missing signal. */
export const MISSING_SHARE = 0.5;



/** Metrics whose absence flags a window (the ones blocks and comparisons rest on). */
const SIGNAL_METRICS: WindowMetric[] = ['speed', 'heartRate'];



/** Builds the 10 s windows of a run's samples: metric means and quality flags (spec F3). */
export function buildWindows(samples: Samples): Windows {
  const last = samples.t.length ? samples.t[samples.t.length - 1] : -1;
  const count = Math.floor(last / WINDOW_SECONDS) + 1;
  const w = {
    start: [] as number[],
    n: [] as number[],
    flags: { stopped: [] as boolean[], first150: [] as boolean[], grade: [] as boolean[], missingSignal: [] as (string[] | null)[] },
  } as Windows;
  for (const m of WINDOW_METRICS) w[m] = [];

  // Sample index ranges per window (samples are in time order).
  const from: number[] = new Array(count).fill(0);
  const to: number[] = new Array(count).fill(0);
  let i = 0;
  for (let k = 0; k < count; k++) {
    from[k] = i;
    while (i < samples.t.length && samples.t[i] < (k + 1) * WINDOW_SECONDS) i++;
    to[k] = i;
  }

  for (let k = 0; k < count; k++) {
    const n = to[k] - from[k];
    w.start.push(k * WINDOW_SECONDS);
    w.n.push(n);
    const missing: string[] = [];
    for (const m of WINDOW_METRICS) {
      const { mean, present } = meanOf(samples[m], from[k], to[k]);
      w[m].push(mean === null ? null : round(mean, 3));
      if (SIGNAL_METRICS.includes(m) && (n === 0 || present / n < 1 - MISSING_SHARE)) missing.push(m);
    }
    const speed = w.speed[k];
    const effort = w.effortPace[k];
    // A paused watch records few or no samples: a window under half full counts as stopped.
    const stopped = n < WINDOW_SECONDS / 2 || speed === null || speed < STOPPED_SPEED;
    w.flags.stopped.push(stopped);
    w.flags.first150.push(k * WINDOW_SECONDS < FIRST_SECONDS_FLAGGED);
    w.flags.grade.push(!stopped && speed !== null && effort !== null && Math.abs(effort / speed - 1) > GRADE_TOLERANCE);
    w.flags.missingSignal.push(missing.length ? missing : null);
  }
  return w;
}

function meanOf(series: Series, from: number, to: number): { mean: number | null; present: number } {
  let sum = 0;
  let present = 0;
  for (let i = from; i < to; i++) {
    const v = series[i];
    if (v !== null && v !== undefined) {
      sum += v;
      present++;
    }
  }
  return { mean: present ? sum / present : null, present };
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

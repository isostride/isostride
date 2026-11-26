import { MAX_SAMPLE_COVER, metricSeries, type Samples, type Series, type Windows } from '@/lib/kernel';

export { MAX_SAMPLE_COVER };

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
const SIGNAL_METRICS = ['speed', 'heartRate'];



/** Builds the 10 s windows of a run's samples: metric means and quality flags (spec F3). */
export function buildWindows(samples: Samples): Windows {
  const { t } = samples;
  const last = t.length ? t[t.length - 1] : -1;
  const count = Math.floor(last / WINDOW_SECONDS) + 1;
  const keys = Object.keys(samples.values);
  const w: Windows = {
    start: [],
    n: [],
    flags: { stopped: [], first150: [], grade: [], missingSignal: [] },
    values: Object.fromEntries(keys.map((k) => [k, []])),
  };

  // Sample index ranges per window (samples are in time order), and the seconds of each window the
  // samples cover: each from its time to the next sample's, at most MAX_SAMPLE_COVER.
  const from: number[] = new Array(count).fill(0);
  const to: number[] = new Array(count).fill(0);
  const covered: number[] = new Array(count).fill(0);
  let i = 0;
  for (let k = 0; k < count; k++) {
    from[k] = i;
    while (i < t.length && t[i] < (k + 1) * WINDOW_SECONDS) i++;
    to[k] = i;
  }
  for (let j = 0; j < t.length; j++) {
    const end = Math.min(j + 1 < t.length ? t[j + 1] : t[j] + 1, t[j] + MAX_SAMPLE_COVER);
    for (let k = Math.floor(t[j] / WINDOW_SECONDS); k < count && k * WINDOW_SECONDS < end; k++)
      covered[k] += Math.max(0, Math.min(end, (k + 1) * WINDOW_SECONDS) - Math.max(t[j], k * WINDOW_SECONDS));
  }

  for (let k = 0; k < count; k++) {
    const n = to[k] - from[k];
    w.start.push(k * WINDOW_SECONDS);
    w.n.push(n);
    const missing: string[] = [];
    for (const m of keys) {
      const { mean, present } = meanOf(metricSeries(samples, m), from[k], to[k]);
      w.values[m]!.push(mean === null ? null : round(mean, 3));
      if (SIGNAL_METRICS.includes(m) && (n === 0 || present / n < 1 - MISSING_SHARE)) missing.push(m);
    }
    for (const m of SIGNAL_METRICS) if (!(m in samples.values)) missing.push(m);
    const speed = w.values.speed?.[k] ?? null;
    const effort = w.values.effortPace?.[k] ?? null;
    // A paused watch records no samples: a window less than half covered counts as stopped.
    const stopped = covered[k] < WINDOW_SECONDS / 2 || speed === null || speed < STOPPED_SPEED;
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

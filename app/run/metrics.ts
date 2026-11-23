import { efficiencyOf } from '@/lib/blocks';
import type { RunFile } from '@/lib/kernel';

/**
 * The metrics of a run's chart and its lines for drawing, shared by the Run screen and its widget on
 * the Dashboard (the runner's "Pin na kazdej karcie-widgecie": the same widget there).
 */
export type WindowKey = 'speed' | 'efficiency' | 'effortPace' | 'heartRate' | 'cadence' | 'groundContactTime' | 'verticalOscillation' | 'stepLength' | 'power' | 'altitude' | 'legSpringStiffness';
const round0 = (unit: string) => (v: number) => `${Math.round(v)} ${unit}`;
/** The metrics a run can show, in the order of the picker; the first four show by default. */
const int = (v: number, d = 0) => v.toFixed(d);
/** Pace in s/km as m:ss. */
/** Round steps of a pace axis, s/km: 0:05 up to 5:00. */
const PACE_STEPS = [5, 10, 15, 30, 60, 120, 300];
export const mmss = (v: number) => { const r = Math.round(v); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
export const METRICS: { key: WindowKey; title: string; short: string; unit: string; format: (v: number) => string; tick: (v: number, d?: number) => string; minSpan: number; invert?: boolean; steps?: number[] }[] = [
  { key: 'speed', title: 'Pace', short: 'Pace', unit: 'min/km', format: (v) => `${mmss(v)} /km`, tick: mmss, minSpan: 20, invert: true, steps: PACE_STEPS },
  { key: 'heartRate', title: 'Heart rate', short: 'HR', unit: 'bpm', format: round0('bpm'), tick: int, minSpan: 10 },
  { key: 'cadence', title: 'Cadence', short: 'Cadence', unit: 'spm', format: round0('spm'), tick: int, minSpan: 6 },
  { key: 'groundContactTime', title: 'Ground contact time', short: 'GCT', unit: 'ms', format: round0('ms'), tick: int, minSpan: 20 },
  { key: 'efficiency', title: 'Efficiency', short: 'Effic.', unit: 'm per heartbeat, 1 min means', format: (v) => `${v.toFixed(2)} m/beat`, tick: (v, d = 2) => v.toFixed(Math.max(2, d)), minSpan: 0.1 },
  { key: 'effortPace', title: 'Effort pace', short: 'Effort', unit: 'min/km, grade-adjusted', format: (v) => `${mmss(v)} /km`, tick: mmss, minSpan: 20, invert: true, steps: PACE_STEPS },
  { key: 'verticalOscillation', title: 'Vertical oscillation', short: 'Vert. osc.', unit: 'mm', format: round0('mm'), tick: int, minSpan: 10 },
  { key: 'stepLength', title: 'Step length', short: 'Step', unit: 'mm', format: round0('mm'), tick: int, minSpan: 60 },
  { key: 'power', title: 'Power', short: 'Power', unit: 'W', format: round0('W'), tick: int, minSpan: 20 },
  { key: 'legSpringStiffness', title: 'Leg spring stiffness', short: 'LSS', unit: 'kN/m', format: (v) => `${v.toFixed(1)} kN/m`, tick: (v, d = 1) => v.toFixed(Math.max(1, d)), minSpan: 1 },
  { key: 'altitude', title: 'Elevation', short: 'Elev.', unit: 'm', format: round0('m'), tick: int, minSpan: 10 },
];

/**
 * Efficiency for drawing: the means of speed and of heart rate over a minute around each window
 * (stops left out), then their ratio, metres per beat. Heart rate follows the pace with a lag,
 * so the ratio of single 10 s windows jumps at every change of pace; over a minute it does not.
 */
export function efficiencySeries(speed: (number | null)[], heartRate: (number | null)[], stopped: boolean[]): (number | null)[] {
  const mean = (v: (number | null)[], i: number) => {
    const xs: number[] = [];
    for (let k = Math.max(0, i - 3); k <= Math.min(v.length - 1, i + 3); k++) { const x = v[k]; if (x !== null && !stopped[k]) xs.push(x); }
    return xs.length >= 3 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return speed.map((_, i) => efficiencyOf(mean(speed, i), mean(heartRate, i)));
}

/**
 * A metric for drawing: nothing at a stop or the windows on either side of it (slowing down,
 * speeding up), then the median of each window and its neighbours, so one odd window does not spike.
 */
export function forDrawing(v: (number | null)[], stopped: boolean[]): (number | null)[] {
  const near = (i: number) => stopped[i] || stopped[i - 1] || stopped[i + 1];
  const kept = v.map((x, i) => (near(i) ? null : x));
  return kept.map((x, i) => {
    if (x === null) return null;
    const n = [kept[i - 1], x, kept[i + 1]].filter((y): y is number => y !== null && y !== undefined).sort((a, b) => a - b);
    return n[Math.floor(n.length / 2)];
  });
}

/** Each metric of a run as drawn: pace in s/km, nothing at the stops, one odd window smoothed. */
export function seriesOf(run: RunFile): Record<WindowKey, (number | null)[]> {
  const w = run.windows;
  // The line breaks where the runner stood: a stop is no value of pace, cadence or heart rate.
  // Pace is drawn in s/km (its ticks are round in pace, not in m/s).
  const asPace = (v: (number | null)[]) => v.map((s) => (s !== null && s > 0 ? 1000 / s : null));
  return Object.fromEntries(METRICS.map((m) => {
    const raw = m.key === 'efficiency' ? efficiencySeries(w.speed, w.heartRate, w.flags.stopped) : (w[m.key] as (number | null)[]);
    return [m.key, forDrawing(m.key === 'speed' || m.key === 'effortPace' ? asPace(raw) : raw, w.flags.stopped)];
  })) as Record<WindowKey, (number | null)[]>;
}

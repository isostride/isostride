import { efficiencyOf } from '@/lib/blocks';
import { isPace, metricSeries, secondsPerKm, type MetricInfo, type RunFile } from '@/lib/kernel';
import { metricView } from '@/components';

/**
 * The metrics of a run's chart and its lines for drawing, shared by the Run screen and its widget on
 * the Dashboard (the runner's "Pin na kazdej karcie-widgecie": the same widget there).
 */
export type WindowKey = string;

/** A metric of the run's chart: its names, unit, value and tick, the least range of its axis. */
export interface RunMetric {
  key: WindowKey;
  title: string;
  short: string;
  unit: string;
  format: (v: number) => string;
  tick: (v: number, d?: number) => string;
  minSpan: number;
  invert?: boolean;
  steps?: number[];
}

/** Pace in s/km as m:ss. */
export const mmss = (v: number) => { const r = Math.round(v); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
/** The known metrics in the order of the picker; the first four show by default; a run's others follow by name. */
const ORDER = ['speed', 'heartRate', 'cadence', 'groundContactTime', 'efficiency', 'effortPace', 'verticalOscillation', 'stepLength', 'power', 'legSpringStiffness', 'altitude'];
/** The run chart's own short names and notes of the known metrics. */
const SHORT: Record<string, string> = { heartRate: 'HR', groundContactTime: 'GCT', efficiency: 'Effic.', effortPace: 'Effort', verticalOscillation: 'Vert. osc.', stepLength: 'Step', legSpringStiffness: 'LSS', altitude: 'Elev.' };
const UNIT: Record<string, string> = { efficiency: 'm per heartbeat, 1 min means', effortPace: 'min/km, grade-adjusted' };

/** A metric of a run's chart, from the run's own metrics (their names and units as its file gives them). */
export function runMetric(key: WindowKey, catalog?: readonly MetricInfo[] | null): RunMetric {
  const v = metricView(key, catalog);
  return { key, title: v.title, short: SHORT[key] ?? v.short, unit: UNIT[key] ?? v.unit, format: v.fmt, tick: v.tick, minSpan: v.minSpan, invert: v.invert, steps: v.steps };
}

/** The metrics a run can show (requirement "Every metric offered everywhere"): the known ones in their order, then its others by name. */
export function runMetricsOf(run: RunFile): RunMetric[] {
  const keys = Object.keys(run.windows.values);
  if (run.windows.values.speed && run.windows.values.heartRate) keys.push('efficiency');
  const known = ORDER.filter((k) => keys.includes(k));
  const others = keys.filter((k) => !known.includes(k)).map((k) => runMetric(k, run.metrics)).sort((a, b) => a.title.localeCompare(b.title));
  return [...known.map((k) => runMetric(k, run.metrics)), ...others];
}

/** The known metrics of the run chart, for links and saved views made before a run is read. */
export const METRICS: RunMetric[] = ORDER.map((k) => runMetric(k));

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
  const asPace = (v: (number | null)[]) => v.map((s) => secondsPerKm(s));
  return Object.fromEntries(runMetricsOf(run).map((m) => {
    const raw = m.key === 'efficiency' ? efficiencySeries(metricSeries(w, 'speed'), metricSeries(w, 'heartRate'), w.flags.stopped) : metricSeries(w, m.key);
    return [m.key, forDrawing(isPace(m.key, run.metrics) ? asPace(raw) : raw, w.flags.stopped)];
  }));
}

import { efficiencyOf } from '@/lib/blocks';
import { isPace, metricSeries, secondsPerKm, type MetricInfo, type RunFile } from '@/lib/kernel';
import { metricView, rollingMean } from '@/components';
import { distanceUnit, msg, t } from '@/lib/i18n';

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
const SHORT: Record<string, string> = { heartRate: msg('HR'), groundContactTime: msg('GCT'), efficiency: msg('Effic.'), effortPace: msg('Effort'), verticalOscillation: msg('Vert. osc.'), stepLength: msg('Step'), legSpringStiffness: msg('LSS'), altitude: msg('Elev.') };
const UNIT: Record<string, () => string> = { efficiency: () => t('m per heartbeat, 1 min means'), effortPace: () => t('min/{unit}, grade-adjusted', { unit: distanceUnit() }) };

/** A metric of a run's chart, from the run's own metrics (their names and units as its file gives them). */
export function runMetric(key: WindowKey, catalog?: readonly MetricInfo[] | null): RunMetric {
  const v = metricView(key, catalog);
  return { key, title: v.title, short: SHORT[key] ? t(SHORT[key]) : v.short, unit: UNIT[key] ? UNIT[key]() : v.unit, format: v.fmt, tick: v.tick, minSpan: v.minSpan, invert: v.invert, steps: v.steps };
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
 * The first and the last window alone are no stop to the window beside them: the recording starts or
 * ends in them, mostly a second or two without a value ("nie podoba mi sie koncowka ... brak tempa?
 * w corosie wyglada normalnie": the last 10 s of a run went missing with them).
 */
export function forDrawing(v: (number | null)[], stopped: boolean[]): (number | null)[] {
  const last = v.length - 1;
  const near = (i: number) => stopped[i] || (i - 1 > 0 && stopped[i - 1]) || (i + 1 < last && stopped[i + 1]);
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

/** Below this speed, m/s, a second counts as standing (as a window does in lib/prepare: 0.5 m/s ≈ 33 min/km). */
const STANDING_SPEED = 0.5;
/** A pause longer than this, s, without samples breaks the line (lib/prepare's MAX_SAMPLE_COVER). */
const PAUSE = 10;
/** The seconds left out before and after standing or a pause: slowing down and speeding up. */
const STOP_MARGIN = 5;

/**
 * Each metric of a run second by second, as the file records it, for the run chart (the runner's
 * "w coros widze metryke co 1 sekunde ... czemu piszesz o 10s ?", answered "1 s on the chart"):
 * pace in s/km; nothing while standing (speed under 0.5 m/s) or in a pause without samples, nor
 * within 5 s of either; a second without a value (the watch finding its signal, its last record) is
 * no stop and leaves the seconds beside it drawn. A pause gets a point of no value, so the line breaks
 * there. Efficiency is the ratio of the minute's means of speed and heart rate around each second.
 */
export function secondsOf(run: RunFile): { x: number[]; series: Record<WindowKey, (number | null)[]> } {
  const { t } = run.samples;
  const speed = run.samples.values.speed;
  const x: number[] = [];
  /** the sample of each point, -1 for the break inside a pause */
  const src: number[] = [];
  /** the times of standing or of the edges of a pause */
  const still: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (i > 0 && t[i] - t[i - 1] > PAUSE) {
      x.push(t[i - 1] + 1);
      src.push(-1);
      still.push(t[i - 1] + 1, t[i] - 1);
    }
    x.push(t[i]);
    src.push(i);
    const v = speed?.[i] ?? null;
    if (v !== null && v < STANDING_SPEED) still.push(t[i]);
  }
  still.sort((a, b) => a - b);
  const hidden: boolean[] = new Array(x.length).fill(false);
  for (let i = 0, k = 0; i < x.length; i++) {
    while (k < still.length && still[k] < x[i] - STOP_MARGIN) k++;
    hidden[i] = src[i] < 0 || (k < still.length && still[k] <= x[i] + STOP_MARGIN);
  }
  const raw = (key: string) => {
    const v = run.samples.values[key];
    return src.map((j, i) => (hidden[i] || j < 0 || !v ? null : v[j] ?? null));
  };
  return {
    x,
    series: Object.fromEntries(runMetricsOf(run).map((m) => {
      if (m.key === 'efficiency') {
        const sp = rollingMean(x, raw('speed'), 60);
        const hr = rollingMean(x, raw('heartRate'), 60);
        return [m.key, sp.map((v, i) => efficiencyOf(v, hr[i]))];
      }
      const v = raw(m.key);
      return [m.key, isPace(m.key, run.metrics) ? v.map((s) => secondsPerKm(s)) : v];
    })),
  };
}

/**
 * The statistics of a range with their lowest and highest values taken second by second (the
 * runner's "min/max of a selection from seconds"), where the chart has the metric; the mean as given.
 */
export function withSecondExtremes<S extends { min: number; max: number; minAt: number; maxAt: number }>(metrics: Partial<Record<string, S>>, x: number[], series: Record<string, (number | null)[]>, from: number, to: number): Partial<Record<string, S>> {
  const out: Partial<Record<string, S>> = { ...metrics };
  for (const [key, stat] of Object.entries(metrics)) {
    const y = series[key];
    if (!stat || !y) continue;
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < x.length; i++) {
      const v = y[i];
      if (v === null || x[i] < from || x[i] >= to) continue;
      if (lo < 0 || v < y[lo]!) lo = i;
      if (hi < 0 || v > y[hi]!) hi = i;
    }
    if (lo >= 0) out[key] = { ...stat, min: y[lo]!, max: y[hi]!, minAt: x[lo], maxAt: x[hi] };
  }
  return out;
}

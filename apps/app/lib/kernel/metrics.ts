/**
 * The catalog of metrics (ADR "Metrics from the file"): what each metric is called, its unit, where it
 * comes from, which way is better and how it is shown. The import makes a metric of every numeric
 * field of a FIT record; the ones below are known to the app and keep their keys and look, any other
 * one takes its name and unit from the file (requirement "Read all FIT fields").
 */

/** Which way is better: higher, lower, or not known (requirement "Metric direction set by the runner"). */
export type Direction = 'higher' | 'lower' | 'neutral';

export interface MetricInfo {
  /** the key in samples, windows, instances, settings and links */
  key: string;
  /** full name, e.g. "Ground contact time" */
  name: string;
  /** a button's name, e.g. "Ground contact" */
  short: string;
  /** as the file names it, or the app's own for the known ones ("" for none) */
  unit: string;
  /** a field of the FIT profile, a developer field, or computed by the app */
  origin: 'standard' | 'developer' | 'derived';
  direction: Direction;
  /** pace: a speed in m/s shown as min/km */
  display: 'value' | 'pace';
  /** decimals of a value */
  decimals: number;
  /** the least range an axis of it shows, in its unit (in s/km for a pace) */
  minSpan: number;
}

const known = (key: string, name: string, short: string, unit: string, direction: Direction, decimals: number, minSpan: number, extra: Partial<MetricInfo> = {}): MetricInfo =>
  ({ key, name, short, unit, origin: 'standard', direction, display: 'value', decimals, minSpan, ...extra });

/** The metrics the app knows, under the keys of before, so saved zones, analyses and links stay valid. */
export const KNOWN_METRICS: Record<string, MetricInfo> = Object.fromEntries([
  known('speed', 'Pace', 'Pace', 'min/km', 'lower', 0, 20, { display: 'pace' }),
  known('heartRate', 'Heart rate', 'Heart rate', 'bpm', 'lower', 0, 10),
  known('cadence', 'Cadence', 'Cadence', 'spm', 'higher', 0, 6),
  known('groundContactTime', 'Ground contact time', 'Ground contact', 'ms', 'lower', 0, 20),
  known('verticalOscillation', 'Vertical oscillation', 'Vertical osc.', 'mm', 'lower', 0, 10),
  known('stepLength', 'Step length', 'Step length', 'mm', 'higher', 0, 60),
  known('power', 'Power', 'Power', 'W', 'higher', 0, 20),
  known('altitude', 'Elevation', 'Elevation', 'm', 'neutral', 0, 10),
  known('respirationRate', 'Respiration rate', 'Respiration', 'brpm', 'neutral', 0, 4),
  known('temperature', 'Temperature', 'Temperature', '°C', 'neutral', 0, 2),
  known('efficiency', 'Efficiency', 'Efficiency', 'm/beat', 'higher', 3, 0.1, { origin: 'derived' }),
  known('effortPace', 'Effort pace', 'Effort pace', 'min/km', 'lower', 0, 20, { origin: 'developer', display: 'pace' }),
  known('legSpringStiffness', 'Leg spring stiffness', 'Leg stiffness', 'kN/m', 'higher', 1, 1, { origin: 'developer' }),
].map((m) => [m.key, m]));

/** Metrics that describe the ground or the day rather than the running: no block or zone of their own. */
export const CONTEXT_METRICS: readonly string[] = ['altitude', 'temperature'];

/** "verticalRatio" → "Vertical ratio"; a developer field's own name is kept as it is. */
export function nameOfField(field: string): string {
  const words = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A metric the app does not know: named and measured as the file names it, neutral, 1 decimal. */
export function unknownMetric(key: string, name: string, unit: string, origin: 'standard' | 'developer'): MetricInfo {
  return { key, name, short: name.length > 16 ? `${name.slice(0, 15)}…` : name, unit, origin, direction: 'neutral', display: 'value', decimals: 1, minSpan: 0 };
}

/** The folder's metrics: derived/metrics.json, every metric some run holds. */
export interface MetricsFile {
  algorithmVersion: number;
  metrics: MetricInfo[];
}

/** What the screens know of a metric: the folder's entry, the app's own, or a bare one from its key. */
export function metricInfo(key: string, catalog?: readonly MetricInfo[] | null): MetricInfo {
  return KNOWN_METRICS[key] ?? catalog?.find((m) => m.key === key) ?? unknownMetric(key, nameOfField(key.replace(/^dev\./, '')), '', key.startsWith('dev.') ? 'developer' : 'standard');
}

/** The direction the runner set for a metric in Settings, else the app's own. */
export function directionOf(info: MetricInfo, set?: Record<string, Direction> | null): Direction {
  return set?.[info.key] ?? info.direction;
}

/** A pace metric's values are speeds (m/s); shown and compared as s/km. */
export function isPace(key: string, catalog?: readonly MetricInfo[] | null): boolean {
  return metricInfo(key, catalog).display === 'pace';
}

/** A speed in m/s as s/km; null for a standstill. */
export function secondsPerKm(speed: number | null): number | null {
  return speed !== null && speed > 0 ? 1000 / speed : null;
}

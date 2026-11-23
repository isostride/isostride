import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';
import { DEFAULT_PERFORMANCE, parsePerformance, type PerformanceSettings } from './performance';

/**
 * The zones of the runner's metrics ("w settingsach chce podawac zakresy"): the boundaries between
 * zones of each metric, in the unit the run chart draws it (pace in s/km), kept in
 * user/settings.json. Z1 is the easiest zone: the lowest values, for pace the slowest.
 */

/** A metric that can have zones: its key on the run chart, its name, unit, and whether it is a pace. */
export interface ZoneMetric {
  key: string;
  title: string;
  unit: string;
  /** given and shown as m:ss per km; a higher zone is a lower number */
  pace?: boolean;
}

export const ZONE_METRICS: ZoneMetric[] = [
  { key: 'heartRate', title: 'Heart rate', unit: 'bpm' },
  { key: 'speed', title: 'Pace', unit: 'min/km', pace: true },
  { key: 'cadence', title: 'Cadence', unit: 'spm' },
  { key: 'power', title: 'Power', unit: 'W' },
  { key: 'groundContactTime', title: 'Ground contact time', unit: 'ms' },
  { key: 'verticalOscillation', title: 'Vertical oscillation', unit: 'mm' },
  { key: 'stepLength', title: 'Step length', unit: 'mm' },
  { key: 'efficiency', title: 'Efficiency', unit: 'm/beat' },
  { key: 'effortPace', title: 'Effort pace', unit: 'min/km', pace: true },
  { key: 'legSpringStiffness', title: 'Leg spring stiffness', unit: 'kN/m' },
  { key: 'altitude', title: 'Elevation', unit: 'm' },
];

const PACES = new Set(ZONE_METRICS.filter((m) => m.pace).map((m) => m.key));

export interface SettingsFile {
  schemaVersion: 1;
  /** by metric key: the boundaries between its zones, from Z1 up */
  zones: Record<string, number[]>;
  /** the performance model: how a run's load is computed and how fitness and fatigue follow it */
  performance: PerformanceSettings;
  /** true when no settings were saved and the default zones apply (not written) */
  defaults?: boolean;
}

/**
 * The zones that apply until the runner saves their own, for trying the app ("dodaj domyslne
 * strefy ... do testow"): heart rate at 60–90 % of a maximum of 190, common pace and cadence zones;
 * then ("chodzi mi tez o strefy ... np. vertical oscillation, ground contact", "dodaj domyslne") the
 * ground contact time and the vertical oscillation in the five bands of Garmin's running dynamics,
 * drawn from many runners (ground contact under 218, 218–248, 249–277, 278–308, over 308 ms; vertical
 * oscillation under 6.4, 6.4–8.1, 8.2–9.7, 9.8–11.5, over 11.5 cm).
 */
export const DEFAULT_ZONES: Record<string, number[]> = {
  heartRate: [114, 133, 152, 171],
  speed: [360, 315, 285, 255],
  cadence: [160, 170, 180],
  groundContactTime: [218, 249, 278, 309],
  verticalOscillation: [64, 82, 98, 116],
};

/** Boundaries in zone order: finite and distinct, ascending, or descending for a pace (Z1 the slowest). */
export function sortBoundaries(metric: string, values: number[]): number[] {
  const unique = [...new Set(values.filter((v) => Number.isFinite(v) && v > 0))];
  return unique.sort((a, b) => (PACES.has(metric) ? b - a : a - b));
}

/** The zone of a value, 0 for Z1: a value on a boundary belongs to the zone above it. */
export function zoneOf(metric: string, boundaries: number[], value: number): number {
  return PACES.has(metric) ? boundaries.filter((b) => value <= b).length : boundaries.filter((b) => value >= b).length;
}

/** The ranges of the zones, Z1 first, in the metric's numbers (lo below hi); open ends are null. */
export function zoneRanges(metric: string, boundaries: number[]): { lo: number | null; hi: number | null }[] {
  const asc = [...boundaries].sort((a, b) => a - b);
  const ranges = [null, ...asc].map((lo, i) => ({ lo, hi: i < asc.length ? asc[i] : null }));
  return PACES.has(metric) ? ranges.reverse() : ranges;
}

/** The opacity of the wash of zone i of n, as the run chart and the settings draw it: deeper for a higher zone. */
export const zoneShade = (i: number, n: number) => (n <= 1 ? 0.1 : 0.06 + (0.22 * i) / (n - 1));

/**
 * Pace zones from the threshold pace (the critical speed, s/km), as Friel's run zones: Z1 slower than
 * 129 % of it, Z2 to 114 %, Z3 to 106 %, Z4 to 99 %, Z5 faster; boundaries as paces, the slowest first.
 */
export function zonesFromPace(threshold: number): number[] {
  return [1.29, 1.14, 1.06, 0.99].map((f) => Math.round(threshold * f));
}

/** Power zones from the critical power, as Stryd's: easy under 80 %, moderate to 90 %, threshold to 100 %, interval to 115 %, repetition above. */
export function zonesFromPower(cp: number): number[] {
  return [0.8, 0.9, 1, 1.15].map((f) => Math.round(cp * f));
}

/** Heart rate zones from the maximum heart rate: boundaries at 60, 70, 80 and 90 % of it. */
export function zonesFromMaxHr(max: number): number[] {
  return [0.6, 0.7, 0.8, 0.9].map((f) => Math.round(max * f));
}

/** "5:30" as 330 s, "160" as 160; null for anything else. */
function parseOne(text: string, pace: boolean): number | null {
  const t = text.trim();
  if (pace) {
    const m = t.match(/^(\d{1,2}):([0-5]\d)$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  const v = Number(t);
  return t !== '' && Number.isFinite(v) && v > 0 ? v : null;
}

/** The boundaries the runner typed, separated by commas, semicolons or spaces (pace as m:ss); null if one does not read. */
export function parseBoundaries(metric: string, text: string): number[] | null {
  const pace = PACES.has(metric);
  const parts = text.split(/[\s,;]+/).filter((p) => p !== '');
  const values = parts.map((p) => parseOne(p, pace));
  return values.every((v): v is number => v !== null) ? sortBoundaries(metric, values) : null;
}

/** Boundaries as the runner types them. */
export function formatBoundaries(metric: string, boundaries: number[]): string {
  return boundaries.map((b) => (PACES.has(metric) ? `${Math.floor(b / 60)}:${String(Math.round(b % 60)).padStart(2, '0')}` : String(b))).join(', ');
}

export async function readSettings(folder: DataFolder): Promise<SettingsFile> {
  const file = await readJson<Partial<SettingsFile>>(folder, PATHS.settings);
  // No file, or one that holds only the performance model: the default zones apply.
  if (file === null || file.zones === undefined) return { schemaVersion: 1, zones: structuredClone(DEFAULT_ZONES), performance: file ? parsePerformance(file.performance) : { ...DEFAULT_PERFORMANCE }, defaults: true };
  const zones: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(file?.zones ?? {})) {
    if (!Array.isArray(v)) continue;
    const b = sortBoundaries(k, v.map(Number));
    if (b.length) zones[k] = b;
  }
  return { schemaVersion: 1, zones, performance: parsePerformance(file.performance) };
}

/** Writes the settings; without `zones` the file holds no zones of the runner's, and the defaults go on applying. */
export async function writeSettings(folder: DataFolder, file: Omit<SettingsFile, 'performance' | 'zones'> & { zones?: Record<string, number[]>; performance?: PerformanceSettings }): Promise<void> {
  // Metrics with no zones are dropped, so the file holds only what the runner entered.
  const zones = file.zones && Object.fromEntries(Object.entries(file.zones).map(([k, v]) => [k, sortBoundaries(k, v)] as const).filter(([, v]) => v.length));
  await writeJson(folder, PATHS.settings, { schemaVersion: 1, ...(zones ? { zones } : {}), performance: parsePerformance(file.performance) });
}

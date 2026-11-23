import { Decoder, Profile, Stream } from '@garmin/fitsdk';
import { KNOWN_METRICS, nameOfField, unknownMetric, type Lap, type MetricInfo, type Samples, type Series } from '@/lib/kernel';

/**
 * Fields of a record that are not a measure of the moment (requirement "Read all FIT fields"): the
 * time, the position and the distance (kept apart), running totals and counters, duplicates of
 * another field, and the watch's own bookkeeping.
 */
const NOT_METRICS = new Set([
  'timestamp', 'positionLat', 'positionLong', 'distance', 'compressedSpeedDistance', 'cycles', 'totalCycles',
  'accumulatedPower', 'compressedAccumulatedPower', 'calories', 'timeFromCourse', 'time128', 'deviceIndex', 'zone',
  'gpsAccuracy', 'batterySoc', 'speed1s', 'cadence256', 'fractionalCadence', 'enhancedSpeed', 'enhancedAltitude',
  'enhancedRespirationRate', 'stanceTime', 'altitude', 'speed', 'cadence',
]);

/** Standard fields read under the keys of before (the app's names) or in place of their duplicates. */
const RENAMED: Record<string, string> = { stanceTime: 'groundContactTime', enhancedRespirationRate: 'respirationRate' };

/**
 * The metric a numeric field of a record becomes: its key (the app's own name for a known one, the
 * field it stands in for for a duplicate), or null for a field that is not a metric (time, position,
 * distance, running totals, the watch's bookkeeping).
 */
export function metricKeyOfField(field: string): string | null {
  const merged: Record<string, string> = { enhancedSpeed: 'speed', speed: 'speed', enhancedAltitude: 'altitude', altitude: 'altitude', cadence: 'cadence', fractionalCadence: 'cadence', stanceTime: 'groundContactTime', enhancedRespirationRate: 'respirationRate', respirationRate: 'respirationRate' };
  if (merged[field]) return merged[field];
  return NOT_METRICS.has(field) ? null : RENAMED[field] ?? field;
}

/** COROS' developer fields under the keys of before. */
const DEVELOPER_KEYS: Record<string, string> = { 'Effort Pace': 'effortPace', 'Leg Spring Stiffness': 'legSpringStiffness' };

/** The unit of each field of a record, as the FIT profile gives it. */
const RECORD_UNITS: Record<string, string> = Object.fromEntries(
  Object.values((Profile.messages as Record<number, { fields: Record<number, { name: string; units: string | string[] }> }>)[Profile.MesgNum.RECORD].fields)
    .map((f) => [f.name, Array.isArray(f.units) ? f.units[0] ?? '' : f.units ?? '']),
);

/** The FIT profile's and the apps' units as the app writes them. */
function unitOf(unit: string): string {
  return ({ percent: '%', watts: 'W', Watts: 'W', C: '°C', degrees: '°' } as Record<string, string>)[unit] ?? unit;
}

/** "Form Power" → "dev.formPower". */
function developerKey(name: string): string {
  const words = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  return `dev.${words.map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('') || 'field'}`;
}

export interface ParsedRun {
  /** ISO start time, the run's key. */
  startTime: string;
  /** The watch that recorded the run, e.g. "COROS PACE 4". */
  device: string;
  /** m */
  distance: number;
  /** timer time, s */
  duration: number;
  /** elapsed time, s */
  elapsed: number;
  /** Mean temperature the watch measured, °C, when it did. */
  temperature: number | null;
  samples: Samples;
  laps: Lap[];
  /** the run's metrics, with their names and units as the file gives them */
  metrics: MetricInfo[];
  /**
   * The device behind each metric (metric provenance). The FIT files
   * name only the watch, so every metric starts as the watch here; the gear
   * register later says which heart rate sensor was worn.
   */
  sources: Record<string, string>;
}

/** Why a file could not be imported; shown to the runner on the Runs screen. */
export class FitImportError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'FitImportError';
  }
}

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

type Mesg = Record<string, unknown> & { developerFields?: Record<string, number> };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Reads one FIT file of a run (COROS, Garmin or any watch) into a run. Throws FitImportError when it is not a readable run. */
export function parseFit(bytes: Uint8Array): ParsedRun {
  const stream = Stream.fromByteArray(Array.from(bytes));
  if (!Decoder.isFIT(stream)) throw new FitImportError('not a FIT file');
  const decoder = new Decoder(stream);
  if (!decoder.checkIntegrity()) throw new FitImportError('damaged FIT file (integrity check failed)');

  const { messages, errors } = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    mergeHeartRates: true,
  });
  if (errors.length) throw new FitImportError(`unreadable FIT file: ${String(errors[0])}`);

  const session = (messages.sessionMesgs?.[0] ?? null) as Mesg | null;
  if (!session) throw new FitImportError('no session in the file');
  if (session.sport !== 'running') throw new FitImportError(`not a run (sport: ${String(session.sport ?? 'unknown')})`);

  const records = (messages.recordMesgs ?? []) as Mesg[];
  if (!records.length) throw new FitImportError('no samples in the file');

  const start = session.startTime as Date;
  const startMs = start.getTime();

  // Developer fields are keyed by their field description: each one a metric named as it names
  // itself; one name from two apps kept apart (requirement "Read developer fields").
  const developer: { key: string; field: number; info: MetricInfo }[] = [];
  for (const d of (messages.fieldDescriptionMesgs ?? []) as Mesg[]) {
    const name = String(d.fieldName ?? '').trim();
    if (!name || (d.nativeMesgNum !== undefined && d.nativeMesgNum !== 'record' && d.nativeMesgNum !== Profile.MesgNum.RECORD)) continue;
    let key = DEVELOPER_KEYS[name] ?? developerKey(name);
    if (developer.some((x) => x.key === key)) key = `${key}.${String(d.developerDataIndex ?? developer.length)}`;
    const unit = unitOf(String(d.units ?? '').trim());
    developer.push({ key, field: d.key as number, info: KNOWN_METRICS[key] ?? unknownMetric(key, name, unit, 'developer') });
  }

  const values: Record<string, Series> = {};
  const standard: Record<string, MetricInfo> = {};
  const put = (key: string, i: number, v: number | null) => {
    if (v === null) return;
    (values[key] ??= new Array<number | null>(i).fill(null))[i] = v;
  };
  const s: Samples = { t: [], distance: [], lat: [], lon: [], values };
  let i = 0;
  for (const r of records) {
    const ts = r.timestamp as Date | undefined;
    if (!ts) continue;
    s.t.push(Math.round((ts.getTime() - startMs) / 1000));
    s.distance.push(num(r.distance));
    const lat = num(r.positionLat);
    const lon = num(r.positionLong);
    s.lat.push(lat === null ? null : round6(lat * SEMICIRCLE_TO_DEG));
    s.lon.push(lon === null ? null : round6(lon * SEMICIRCLE_TO_DEG));
    put('speed', i, num(r.enhancedSpeed) ?? num(r.speed));
    put('altitude', i, num(r.enhancedAltitude) ?? num(r.altitude));
    const cad = num(r.cadence);
    // FIT running cadence counts strides (one foot); steps per minute count both feet.
    put('cadence', i, cad === null ? null : Math.round((cad + (num(r.fractionalCadence) ?? 0)) * 2 * 10) / 10);
    put('groundContactTime', i, num(r.stanceTime));
    put('respirationRate', i, num(r.enhancedRespirationRate) ?? num(r.respirationRate));
    for (const [field, v] of Object.entries(r)) {
      if (NOT_METRICS.has(field) || field === 'respirationRate' || typeof v !== 'number' || !Number.isFinite(v)) continue;
      const key = RENAMED[field] ?? field;
      standard[key] ??= KNOWN_METRICS[key] ?? unknownMetric(key, nameOfField(key), unitOf(RECORD_UNITS[field] ?? ''), 'standard');
      put(key, i, v);
    }
    for (const d of developer) put(d.key, i, num(r.developerFields?.[d.field]));
    i++;
  }
  // Every series as long as the samples, null where a record lacked the field.
  for (const k of Object.keys(values)) values[k] = Array.from({ length: i }, (_, j) => values[k][j] ?? null);
  for (const k of ['speed', 'altitude', 'cadence', 'groundContactTime', 'respirationRate']) if (values[k]) standard[k] ??= KNOWN_METRICS[k];
  const metrics = [...Object.values(standard), ...developer.filter((d) => values[d.key]).map((d) => d.info)];

  const laps: Lap[] = ((messages.lapMesgs ?? []) as Mesg[]).map((l) => {
    const lapStart = Math.round(((l.startTime as Date).getTime() - startMs) / 1000);
    return {
      start: lapStart,
      end: lapStart + Math.round(num(l.totalElapsedTime) ?? 0),
      duration: num(l.totalTimerTime) ?? 0,
      distance: num(l.totalDistance) ?? 0,
    };
  });

  const deviceInfo = ((messages.deviceInfoMesgs ?? []) as Mesg[])[0];
  const fileId = ((messages.fileIdMesgs ?? []) as Mesg[])[0];
  // The watch by its name; a Garmin's by its product ("Garmin fenix2"), as its files name no product.
  const maker = fileId?.manufacturer === undefined ? null : String(fileId.manufacturer);
  const product = fileId?.garminProduct ?? deviceInfo?.garminProduct;
  const device = String(deviceInfo?.productName ?? fileId?.productName ?? (product !== undefined && maker ? `${maker.charAt(0).toUpperCase()}${maker.slice(1)} ${String(product)}` : maker ?? 'unknown'));

  return {
    startTime: start.toISOString(),
    device,
    distance: num(session.totalDistance) ?? 0,
    duration: num(session.totalTimerTime) ?? 0,
    elapsed: num(session.totalElapsedTime) ?? 0,
    temperature: num(session.avgTemperature),
    samples: s,
    laps,
    metrics,
    sources: Object.fromEntries(metrics.map((m) => [m.key, device])),
  };
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** The run's id: its UTC start time, compact and sortable, e.g. 20261109-190552. */
export function runId(startTime: string): string {
  return startTime.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

import { Decoder, Stream } from '@garmin/fitsdk';

/** One metric series of a run, one value per sample; null where the watch recorded nothing. */
export type Series = (number | null)[];

/** The 1 s samples of a run, columnar: one array per field, all of the same length. */
export interface Samples {
  /** Seconds since the start of the run (elapsed time, pauses included). */
  t: number[];
  /** m/s */
  speed: Series;
  /** bpm */
  heartRate: Series;
  /** steps per minute (both feet) */
  cadence: Series;
  /** ground contact time, ms */
  groundContactTime: Series;
  /** vertical oscillation, mm */
  verticalOscillation: Series;
  /** step length, mm */
  stepLength: Series;
  /** W */
  power: Series;
  /** m */
  altitude: Series;
  /** degrees */
  lat: Series;
  /** degrees */
  lon: Series;
  /** °C */
  temperature: Series;
  /** COROS developer field "Effort Pace", m/s */
  effortPace: Series;
  /** COROS developer field "Leg Spring Stiffness", kN/m */
  legSpringStiffness: Series;
  /** m, cumulative */
  distance: Series;
}

export const SAMPLE_FIELDS = [
  't', 'speed', 'heartRate', 'cadence', 'groundContactTime', 'verticalOscillation', 'stepLength',
  'power', 'altitude', 'lat', 'lon', 'temperature', 'effortPace', 'legSpringStiffness', 'distance',
] as const satisfies readonly (keyof Samples)[];

export interface Lap {
  /** seconds since the start of the run */
  start: number;
  end: number;
  /** timer time, s */
  duration: number;
  /** m */
  distance: number;
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
  /**
   * The device behind each metric (metric provenance). The FIT files of COROS
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

/** Reads one COROS FIT file into a run. Throws FitImportError when it is not a readable run. */
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

  // Developer fields are keyed by their field description; find COROS' by name.
  const devKeys: Record<string, number[]> = {};
  for (const d of (messages.fieldDescriptionMesgs ?? []) as Mesg[]) {
    const name = String(d.fieldName ?? '');
    (devKeys[name] ??= []).push(d.key as number);
  }
  const dev = (r: Mesg, name: string): number | null => {
    for (const k of devKeys[name] ?? []) {
      const v = num(r.developerFields?.[k]);
      if (v !== null) return v;
    }
    return null;
  };

  const s: Samples = {
    t: [], speed: [], heartRate: [], cadence: [], groundContactTime: [], verticalOscillation: [], stepLength: [],
    power: [], altitude: [], lat: [], lon: [], temperature: [], effortPace: [], legSpringStiffness: [], distance: [],
  };
  for (const r of records) {
    const ts = r.timestamp as Date | undefined;
    if (!ts) continue;
    s.t.push(Math.round((ts.getTime() - startMs) / 1000));
    s.speed.push(num(r.enhancedSpeed) ?? num(r.speed));
    s.heartRate.push(num(r.heartRate));
    const cad = num(r.cadence);
    const frac = num(r.fractionalCadence) ?? 0;
    // FIT running cadence counts strides (one foot); steps per minute count both feet.
    s.cadence.push(cad === null ? null : Math.round((cad + frac) * 2 * 10) / 10);
    s.groundContactTime.push(num(r.stanceTime));
    s.verticalOscillation.push(num(r.verticalOscillation));
    s.stepLength.push(num(r.stepLength));
    s.power.push(num(r.power));
    s.altitude.push(num(r.enhancedAltitude) ?? num(r.altitude));
    const lat = num(r.positionLat);
    const lon = num(r.positionLong);
    s.lat.push(lat === null ? null : round6(lat * SEMICIRCLE_TO_DEG));
    s.lon.push(lon === null ? null : round6(lon * SEMICIRCLE_TO_DEG));
    s.temperature.push(num(r.temperature));
    s.effortPace.push(dev(r, 'Effort Pace'));
    s.legSpringStiffness.push(dev(r, 'Leg Spring Stiffness'));
    s.distance.push(num(r.distance));
  }

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
  const device = String(deviceInfo?.productName ?? fileId?.productName ?? fileId?.manufacturer ?? 'unknown');

  return {
    startTime: start.toISOString(),
    device,
    distance: num(session.totalDistance) ?? 0,
    duration: num(session.totalTimerTime) ?? 0,
    elapsed: num(session.totalElapsedTime) ?? 0,
    temperature: num(session.avgTemperature),
    samples: s,
    laps,
    sources: Object.fromEntries(SAMPLE_FIELDS.filter((f) => f !== 't').map((f) => [f, device])),
  };
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** The run's id: its UTC start time, compact and sortable, e.g. 20261109-190552. */
export function runId(startTime: string): string {
  return startTime.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

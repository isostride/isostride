/**
 * The shared kernel's run contracts (ADR "A small shared kernel"): the shapes of a run's
 * samples, laps and windows and of the files derived/ holds for runs, which ingest writes
 * and context, detection, compare and the pages read. Types only, no I/O.
 */

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

/** Metrics averaged per window. */
export const WINDOW_METRICS = [
  'speed', 'heartRate', 'cadence', 'groundContactTime', 'verticalOscillation', 'stepLength',
  'power', 'altitude', 'effortPace', 'legSpringStiffness',
] as const;
export type WindowMetric = (typeof WINDOW_METRICS)[number];

/** 10 s windows of a run, columnar. */
export type Windows = {
  /** window start, s since the start of the run */
  start: number[];
  /** number of samples in the window */
  n: number[];
  flags: {
    stopped: boolean[];
    first150: boolean[];
    grade: boolean[];
    /** the signal metrics missing in the window, or null */
    missingSignal: (string[] | null)[];
  };
} & Record<WindowMetric, Series>;

/** The run layer and day layer of the context, as runs-index.json carries them (denormalized). */
export interface RunContext {
  shoesId: string | null;
  shoes: string | null;
  /** true when the shoes come from the run's override, not from the date */
  shoesOverridden: boolean;
  hrSensorId: string | null;
  /** the device behind the heart rate: the registered sensor worn, or the watch's wrist sensor */
  heartRateSource: string;
  workoutType: string | null;
  techniqueCue: string | null;
  note: string | null;
  load3: number;
  load7: number;
}

/** One row of runs-index.json: everything the list and analysis screens need without opening the run file. */
export interface RunIndexRow {
  id: string;
  startTime: string;
  file: string;
  device: string;
  distance: number;
  duration: number;
  /** m/s over timer time */
  avgSpeed: number;
  avgHeartRate: number | null;
  temperature: number | null;
  hasGps: boolean;
  laps: number;
  algorithmVersion: number;
}

/** A row of runs-index.json after the context join: the run and day layers ride along. */
export type IndexedRun = RunIndexRow & Partial<RunContext>;

export interface RunsIndex {
  schemaVersion: number;
  algorithmVersion: number;
  runs: IndexedRun[];
}

/** derived/runs/<id>.json */
export interface RunFile {
  schemaVersion: number;
  algorithmVersion: number;
  id: string;
  startTime: string;
  file: string;
  device: string;
  distance: number;
  duration: number;
  elapsed: number;
  temperature: number | null;
  sources: Record<string, string>;
  laps: Lap[];
  samples: Samples;
  windows: Windows;
}

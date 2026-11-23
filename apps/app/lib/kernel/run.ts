/**
 * The shared kernel's run contracts (ADR "A small shared kernel"): the shapes of a run's
 * samples, laps and windows and of the files derived/ holds for runs, which ingest writes
 * and context, detection, compare and the pages read. Types only, no I/O.
 */
import type { MetricInfo } from './metrics';

/** One metric series of a run, one value per sample; null where the watch recorded nothing. */
export type Series = (number | null)[];

/**
 * The samples of a run, columnar: one array per field, all of the same length, one value per record
 * of the file (every 1 s, or every few seconds on a watch that records smart). The metrics are every
 * numeric field the file holds, by their keys (lib/kernel/metrics.ts; ADR "Metrics from the file").
 */
export interface Samples {
  /** Seconds since the start of the run (elapsed time, pauses included). */
  t: number[];
  /** m, cumulative */
  distance: Series;
  /** degrees */
  lat: Series;
  /** degrees */
  lon: Series;
  /** every metric of the run, e.g. speed (m/s), heartRate (bpm), cadence (steps per minute, both feet) */
  values: Partial<Record<string, Series>>;
}

export interface Lap {
  /** seconds since the start of the run */
  start: number;
  end: number;
  /** timer time, s */
  duration: number;
  /** m */
  distance: number;
}

/** 10 s windows of a run, columnar. */
export interface Windows {
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
  /** the mean of each metric of the run in each window */
  values: Partial<Record<string, Series>>;
}

/** The run layer and day layer of the context, as runs-index.json carries them (denormalized). */
export interface RunContext {
  shoesId: string | null;
  shoes: string | null;
  /** true when the shoes come from the run's override, not from the date */
  shoesOverridden: boolean;
  hrSensorId: string | null;
  /** the device behind the heart rate: the registered sensor worn, or the watch's wrist sensor */
  heartRateSource: string;
  /** the runner's own title of the run */
  title: string | null;
  workoutType: string | null;
  techniqueCue: string | null;
  note: string | null;
  /** the load of the days before the run, by the model of Settings: 3 and 7 days */
  load3: number;
  load7: number;
  /** the run's own load by the model of Settings; null until computed */
  load: number | null;
  /** the run lacked what the model needs: its load is estimated from its duration */
  loadEstimated?: boolean;
  /** the form (fitness − fatigue) in the morning of the run's day */
  form: number;
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
  /** the keys of the metrics the run holds */
  metrics: string[];
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
  /** the run's metrics, with their names and units as its file gives them */
  metrics: MetricInfo[];
  laps: Lap[];
  samples: Samples;
  windows: Windows;
}

/** A metric's series in a run's samples or windows; all null when the run holds no such metric. */
export function metricSeries(x: Samples | Windows, key: string): Series {
  return x.values[key] ?? new Array<number | null>('t' in x ? x.t.length : x.start.length).fill(null);
}

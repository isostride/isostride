/** Block definitions and instances (spec sections 2, 3 and 5). */

import { CONTEXT_METRICS } from '@/lib/kernel';
import type { ProfileKey } from './profile';

export type BlockType = 'route' | 'structure' | 'steady' | 'effort' | 'tag' | 'pattern' | 'rule' | 'profile';

/**
 * A block defined in Analysis by a rule (the author's remodelling of 19 Nov 2026: "wybieram dane
 * - czyli tworze np bloki - najszybsze 5 min przy tetnie powyzej 160 ... system wybiera mi
 * wszystkie segmenty i je uzywa"): which runs, the shape of a segment within them, the conditions
 * a segment must meet, how many per run, and the statistic its metrics are read by.
 */

/** Which runs a rule draws from; an empty criterion is not checked. Dates as YYYY-MM-DD (local). */
export interface RunFilter {
  dateFrom: string | null;
  dateTo: string | null;
  /** the run's title contains this text (case-insensitive) */
  title: string;
  workoutTypes: string[];
  techniqueCues: string[];
  shoes: string[];
  heartRateSources: string[];
  devices: string[];
  /** laps recorded in the run */
  lapsMin: number | null;
  lapsMax: number | null;
}

/**
 * The stretch of each run a block takes (the one model of a block, the runner's request of 22 Nov
 * 2026: "ujednolic model ... nie chce tworzyc blokow na 5 roznych sposob"): the whole run, each lap
 * (or only the laps set up as a length), the fastest stretch of a length (or only when it was run as
 * an effort), a stretch that keeps the conditions for a time, the main effort of the run, the effort
 * laps of runs with one layout of laps, every pass over a stretch of route, or the stretch most like
 * a profile of distance, terrain and pace. The last four take a reference from a run.
 */
export type RuleShape =
  | { type: 'run' }
  | { type: 'lap'; /** only the laps set up as this length (a workout's element), within the share */ planned?: { kind: 'time' | 'distance'; target: number; tolerance: number } }
  | { type: 'fastest'; kind: 'time' | 'distance'; /** s or m */ target: number; /** only when it was run as an effort */ effort?: boolean }
  | { type: 'steady'; /** s */ minDuration: number }
  | { type: 'main' }
  | { type: 'pattern'; laps: PatternLap[]; tolerance: number }
  | { type: 'route'; track: RefPoint[]; length: number; heading: number }
  | { type: 'profile'; key: ProfileKey; minScore: number };

/** The shapes that take their reference from a run: they are made from a run, not typed in. */
export const REFERENCE_SHAPES = ['main', 'pattern', 'route', 'profile'] as const;

/**
 * What a segment must meet to be an instance; null = not checked. Pace in s/km, distance in m,
 * duration in s. "On average" over the segment; "always" in each of its 10 s windows.
 */
export interface Conditions {
  paceMin: number | null;
  paceMax: number | null;
  hrMin: number | null;
  hrMax: number | null;
  distanceMin: number | null;
  distanceMax: number | null;
  durationMin: number | null;
  durationMax: number | null;
  alwaysHrMin: number | null;
  alwaysHrMax: number | null;
  alwaysPaceMin: number | null;
  alwaysPaceMax: number | null;
  /**
   * any metric of the runs, on average within [metricMin, metricMax] (requirement "Every metric offered
   * everywhere"), in the unit compare shows it (a pace in s/km); null for none
   */
  metric?: string | null;
  metricMin?: number | null;
  metricMax?: number | null;
  /** how the segment starts: right after a stop, on the move, or either */
  start: BlockStart;
}

/** The fastest qualifying segment of each run, or every one. */
export type Pick = 'best' | 'all';

/**
 * The statistic a segment's metrics are read by ("avg, min, max, mediana"): the average over its
 * moving samples, or the median, minimum or maximum over its 10 s windows with movement, so one
 * odd sample is no extreme.
 */
export type Stat = 'avg' | 'median' | 'min' | 'max';
export const STATS: Stat[] = ['avg', 'median', 'min', 'max'];
export const STAT_LABEL: Record<Stat, string> = { avg: 'average', median: 'median', min: 'minimum', max: 'maximum' };

export interface Rule {
  runs: RunFilter;
  shape: RuleShape;
  conditions: Conditions;
  pick: Pick;
  stat: Stat;
}

export interface RefPoint {
  lat: number;
  lon: number;
  heading: number;
}

export type BlockParams =
  | { type: 'route'; track: RefPoint[]; length: number; heading: number }
  | { type: 'structure'; kind: 'time' | 'distance'; /** s or m */ target: number; /** share, e.g. 0.03 */ tolerance: number }
  | { type: 'steady'; /** s */ minDuration: number }
  /** the fastest fragment of a distance or duration in a run, on any route, when it is an effort */
  | { type: 'effort'; kind: 'time' | 'distance'; /** s or m */ target: number }
  /** the main effort of every run tagged with a workout type */
  | { type: 'tag'; workoutType: string }
  /** runs whose laps follow one layout; its effort laps are the instances */
  | { type: 'pattern'; laps: PatternLap[]; tolerance: number }
  /** the segments a rule selects */
  | ({ type: 'rule' } & Rule)
  /** in each run, the stretch of a distance most like a profile of terrain and pace, from a score (requirement "Similar stretches of a selection") */
  | { type: 'profile'; key: ProfileKey; minScore: number };

/** One lap of a lap pattern: set by time or distance, or free (a warm-up to a point, the last lap); effort laps are compared. */
export interface PatternLap {
  kind: 'time' | 'distance' | 'free';
  /** s or m; 0 for a free lap */
  target: number;
  effort: boolean;
}

/** Matching tolerances (spec section 5 defaults; editable per definition). */
export interface Tolerances {
  /** pace band, s/km; null = any pace */
  paceMin: number | null;
  paceMax: number | null;
  /** max |effort pace / pace − 1| */
  gradeMax: number;
  /** route: share of reference points within routeRadius, same direction */
  routeShare: number;
  routeRadius: number;
  /** max coefficient of variation of speed within the block */
  cvMax: number;
  /** max |speed over the 2 min before / block speed − 1|; null = not checked */
  effortBeforeMax: number | null;
  /** heart rate from this many s after the block's start, the same in every instance; null = the whole block */
  hrSkip: number | null;
  /** how every instance starts: right after a stop (standing), on the move (flying), or either */
  start: BlockStart;
}

export type BlockStart = 'any' | 'standing' | 'flying';

/** A standing start: a stop (or auto-pause, or the run's start) within this many s before the block. */
export const STANDING_WINDOW = 10;

/** Heart rate starts at this minute of the block by default for effort and workout-type blocks (model's choice). */
export const LOGICAL_HR_SKIP = 5 * 60;

export const DEFAULT_TOLERANCES: Tolerances = {
  paceMin: null,
  paceMax: null,
  gradeMax: 0.04,
  routeShare: 0.9,
  routeRadius: 30,
  cvMax: 0.15,
  effortBeforeMax: 0.12,
  hrSkip: null,
  start: 'any',
};

/**
 * Tolerances of a rule block: the rule's conditions decide, so the general conditions are off
 * (model's choice: grade up to 100 %, CV up to 1, no check of the effort before, any pace).
 */
export const RULE_TOLERANCES: Tolerances = { ...DEFAULT_TOLERANCES, paceMin: null, paceMax: null, gradeMax: 1, cvMax: 1, effortBeforeMax: null };

/** Minimum block length: shorter fragments are rejected for every metric (one decision per run). */
export const MIN_SECONDS = { block: 60 } as const;

export interface BlockDefinition {
  id: string;
  name: string;
  origin: 'manual' | 'recommendation';
  /** a rejected recommendation is kept so it is not proposed again */
  status: 'active' | 'rejected';
  createdAt: string;
  params: BlockParams;
  tolerances: Tolerances;
}

/** user/block-definitions.json */
export interface BlockDefinitionsFile {
  definitions: BlockDefinition[];
}

/**
 * A metric of a block: any metric of its run (ADR "Metrics from the file"), by its key, and
 * efficiency, metres per heartbeat (speed × 60 / heart rate).
 */
export type BlockMetric = string;

/** The metrics of a block of a run holding these metrics: all but the ground's and the day's, and efficiency with pace and heart rate. */
export function blockMetricsOf(runMetrics: readonly string[]): BlockMetric[] {
  const own = runMetrics.filter((m) => !CONTEXT_METRICS.includes(m) && m !== 'efficiency');
  return own.includes('speed') && own.includes('heartRate') ? [...own, 'efficiency'] : own;
}

/** Metres per heartbeat: speed in m/s × 60 / heart rate in bpm. */
export function efficiencyOf(speed: number | null, heartRate: number | null): number | null {
  return speed !== null && heartRate !== null && speed > 0 && heartRate > 0 ? (speed * 60) / heartRate : null;
}

export interface InstanceContext {
  /** stopped: seconds standing inside the block (slow samples and auto-pause), left out of its metrics */
  block: { pace: number; grade: number; duration: number; heading: number | null; cv: number; stopped: number; start: 'standing' | 'flying' };
  before: { minuteOfRun: number; kmOfRun: number; effortBefore: number | null; lap: number | null };
  run: { device: string; shoes: string | null; heartRateSource: string; workoutType: string | null; techniqueCue: string | null };
  /** load3/load7: the load of the 3 and 7 days before, by the model of Settings; form: fitness − fatigue that morning */
  day: { load3: number; load7: number; form?: number; temperature: number | null };
}

export interface BlockInstance {
  id: string;
  definitionId: string;
  runId: string;
  /** run start time, ISO */
  runStart: string;
  /** block start and end, s since the start of the run */
  start: number;
  end: number;
  duration: number;
  distance: number;
  metrics: Record<BlockMetric, number | null>;
  /** per-minute means inside the block */
  profile: Record<BlockMetric, (number | null)[]>;
  context: InstanceContext;
  status: 'accepted' | 'rejected';
  /** why it was rejected (every failed condition) */
  reasons: string[];
}

export interface BlockInstancesFile {
  algorithmVersion: number;
  instances: BlockInstance[];
}

export interface Recommendation {
  id: string;
  name: string;
  params: BlockParams;
  tolerances: Tolerances;
  /** runs the block was found in */
  runs: number;
  instances: number;
  /** instances that meet the matching conditions (counted before it is proposed) */
  accepted?: number;
  /** why it is proposed */
  basis: string;
}

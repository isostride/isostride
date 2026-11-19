/** Block definitions and instances (spec sections 2, 3 and 5). */

export type BlockType = 'route' | 'structure' | 'steady';

export interface RefPoint {
  lat: number;
  lon: number;
  heading: number;
}

export type BlockParams =
  | { type: 'route'; track: RefPoint[]; length: number; heading: number }
  | { type: 'structure'; kind: 'time' | 'distance'; /** s or m */ target: number; /** share, e.g. 0.03 */ tolerance: number }
  | { type: 'steady'; /** s */ minDuration: number };

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
  /** heart rate: max seconds stopped inside the block (a stop never rejects the block itself) */
  hrStoppedMax: number;
  /** heart rate: block start at least this many s into the run */
  hrStartMin: number;
}

export const DEFAULT_TOLERANCES: Tolerances = {
  paceMin: null,
  paceMax: null,
  gradeMax: 0.04,
  routeShare: 0.9,
  routeRadius: 30,
  cvMax: 0.15,
  effortBeforeMax: 0.12,
  hrStoppedMax: 30,
  hrStartMin: 8 * 60,
};

/** Heart rate: no stop in this many seconds before the block's end (heart rate drops while standing). */
export const HR_STOP_TAIL = 120;

/** Minimum block length per metric (spec section 5). */
export const MIN_SECONDS = { heartRate: 4 * 60, gait: 60 } as const;

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

export const BLOCK_METRICS = [
  'speed', 'heartRate', 'cadence', 'groundContactTime', 'verticalOscillation', 'stepLength', 'power', 'effortPace', 'legSpringStiffness',
] as const;
export type BlockMetric = (typeof BLOCK_METRICS)[number];

export interface InstanceContext {
  /** stopped: seconds standing inside the block (slow samples and auto-pause), left out of its metrics */
  block: { pace: number; grade: number; duration: number; heading: number | null; cv: number; stopped: number };
  before: { minuteOfRun: number; kmOfRun: number; effortBefore: number | null; lap: number | null };
  run: { device: string; shoes: string | null; heartRateSource: string; workoutType: string | null; techniqueCue: string | null };
  day: { load3: number; load7: number; temperature: number | null };
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
  /** heart rate usable: long enough and late enough; else why not */
  heartRate: { valid: boolean; reason?: string };
  /** gait metrics usable (≥ 60 s) */
  gaitValid: boolean;
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

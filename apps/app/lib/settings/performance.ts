import { msg } from '@/lib/i18n';

/**
 * The performance model's settings (the author's request of 20 Nov 2026: "chce aby model byl
 * ustawiany przez uzytkownika w ustawieniach"), kept in user/settings.json with the zones.
 */

/** How a run's load is computed (the author chose "TRIMP Edwardsa, TRIMP Banistera, rTSS (tempo), Power TSS (CP)"). */
export type LoadModel = 'trimpBanister' | 'trimpEdwards' | 'rtss' | 'powerTss';

/** Each load model: its name and what it is (texts shown through t() where shown), and the unit of its load. */
export const LOAD_MODELS: { key: LoadModel; name: string; unit: string; about: string }[] = [
  { key: 'trimpBanister', name: msg('Banister TRIMP'), unit: 'TRIMP', about: msg('minutes weighted by the heart rate reserve, exponentially (Banister 1991)') },
  { key: 'trimpEdwards', name: msg('Edwards TRIMP'), unit: 'TRIMP', about: msg('minutes in each heart rate zone times the zone’s number (Edwards 1993)') },
  { key: 'rtss', name: msg('rTSS'), unit: 'rTSS', about: msg('hours × (normalised effort pace ÷ threshold pace)² × 100') },
  { key: 'powerTss', name: msg('Power TSS'), unit: 'TSS', about: msg('hours × (normalised power ÷ critical power)² × 100') },
];

/**
 * How the curve of the bests is modelled (the runner's "chce moc wybrac model ... ktory pozniej
 * powinien byc uzywany tu i tu", 25 Nov 2026): the curve drawn, the predicted race times, VDOT and what
 * rests on them follow it; critical speed and power, the thresholds of rTSS and Power TSS, keep the
 * bests of 2–20 minutes whichever is chosen.
 */
export type CurveModel = 'riegel' | 'whole';
export const CURVE_MODELS: { key: CurveModel; name: string; about: string }[] = [
  { key: 'riegel', name: msg('Riegel and critical speed'), about: msg('the bests of 2–20 minutes: the critical speed or power model up to 20 minutes, Riegel’s law past them and for the predicted times (Monod & Scherrer 1965; Riegel 1981)') },
  { key: 'whole', name: msg('Péronnet–Thibault and omni-domain'), about: msg('the bests of 30 seconds to 2 hours: Péronnet–Thibault for pace and the predicted times (1989), the omni-domain model for power (Puchowicz 2020)') },
];

export interface PerformanceSettings {
  load: LoadModel;
  /** how the curve of the bests is modelled, and the predicted times with it */
  curve: CurveModel;
  /** bpm */
  restHr: number;
  /** bpm; null: the highest heart rate held for 10 s in the runs */
  maxHr: number | null;
  sex: 'male' | 'female';
  /** s/km; null: the critical speed of the 90 days up to the run */
  thresholdPace: number | null;
  /** W; null: the critical power of the 90 days up to the run */
  thresholdPower: number | null;
  /** time constant of fitness (CTL), days */
  fitnessDays: number;
  /** time constant of fatigue (ATL), days */
  fatigueDays: number;
  /** the runner saved the model: the resting heart rate and the rest are theirs, not the defaults */
  confirmed: boolean;
  /**
   * The thresholds of the models' checks the runner set ("tak" to setting them in Settings), by the
   * check's key; any other takes its default (lib/load checks each against its range).
   */
  thresholds: Record<string, number>;
}

/** Until the runner sets their own (model's choices: Banister TRIMP, resting HR 60, 42 and 7 days). */
export const DEFAULT_PERFORMANCE: PerformanceSettings = {
  load: 'trimpBanister', curve: 'riegel', restHr: 60, maxHr: null, sex: 'male', thresholdPace: null, thresholdPower: null, fitnessDays: 42, fatigueDays: 7, confirmed: false, thresholds: {},
};

/** The range each value of the model may lie in (model's choices), in its unit: bpm, s/km, W, days. */
export const PERFORMANCE_RANGES = {
  restHr: [25, 120], maxHr: [100, 240], thresholdPace: [120, 900], thresholdPower: [50, 800], fitnessDays: [7, 120], fatigueDays: [2, 30],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Which of the values, as typed, cannot be saved: one outside its range, a maximum heart rate not above
 * the resting one, fatigue lasting as long as fitness or longer (the form is fitness less fatigue: its
 * sign would turn). Empty where a value may be left to the app (null).
 */
export function invalidPerformance(v: { restHr: number | null; maxHr: number | null; thresholdPace: number | null; thresholdPower: number | null; fitnessDays: number | null; fatigueDays: number | null }): (keyof typeof PERFORMANCE_RANGES)[] {
  const out = (Object.keys(PERFORMANCE_RANGES) as (keyof typeof PERFORMANCE_RANGES)[]).filter((k) => { const x = v[k]; return x !== null && (x < PERFORMANCE_RANGES[k][0] || x > PERFORMANCE_RANGES[k][1]); });
  if (v.restHr !== null && v.maxHr !== null && v.maxHr <= v.restHr && !out.includes('maxHr')) out.push('maxHr');
  if (v.fitnessDays !== null && v.fatigueDays !== null && v.fatigueDays >= v.fitnessDays && !out.includes('fatigueDays')) out.push('fatigueDays');
  return out;
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** The settings as read from a file: unknown or out-of-range values fall back to the defaults. */
export function parsePerformance(v: unknown): PerformanceSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_PERFORMANCE;
  const R = PERFORMANCE_RANGES;
  const restHr = num(o.restHr, ...R.restHr) ?? d.restHr;
  const maxHr = num(o.maxHr, ...R.maxHr);
  const fitnessDays = num(o.fitnessDays, ...R.fitnessDays) ?? d.fitnessDays;
  const fatigueDays = num(o.fatigueDays, ...R.fatigueDays) ?? d.fatigueDays;
  // A file whose values contradict each other: the maximum heart rate left to the app, the time constants the defaults.
  const constants = fatigueDays < fitnessDays ? { fitnessDays, fatigueDays } : { fitnessDays: d.fitnessDays, fatigueDays: d.fatigueDays };
  return {
    load: LOAD_MODELS.some((m) => m.key === o.load) ? (o.load as LoadModel) : d.load,
    curve: CURVE_MODELS.some((m) => m.key === o.curve) ? (o.curve as CurveModel) : d.curve,
    restHr,
    maxHr: maxHr !== null && maxHr > restHr ? maxHr : null,
    sex: o.sex === 'female' ? 'female' : 'male',
    thresholdPace: num(o.thresholdPace, ...R.thresholdPace),
    thresholdPower: num(o.thresholdPower, ...R.thresholdPower),
    ...constants,
    confirmed: o.confirmed === true,
    thresholds: Object.fromEntries(Object.entries(o.thresholds && typeof o.thresholds === 'object' ? o.thresholds as Record<string, unknown> : {}).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))),
  };
}

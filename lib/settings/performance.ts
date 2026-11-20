/**
 * The performance model's settings (the author's request of 20 Nov 2026: "chce aby model byl
 * ustawiany przez uzytkownika w ustawieniach"), kept in user/settings.json with the zones.
 */

/** How a run's load is computed (the author chose "TRIMP Edwardsa, TRIMP Banistera, rTSS (tempo), Power TSS (CP)"). */
export type LoadModel = 'trimpBanister' | 'trimpEdwards' | 'rtss' | 'powerTss';

export const LOAD_MODELS: { key: LoadModel; name: string; unit: string; about: string }[] = [
  { key: 'trimpBanister', name: 'Banister TRIMP', unit: 'TRIMP', about: 'minutes weighted by the heart rate reserve, exponentially (Banister 1991)' },
  { key: 'trimpEdwards', name: 'Edwards TRIMP', unit: 'TRIMP', about: 'minutes in each heart rate zone times the zone’s number (Edwards 1993)' },
  { key: 'rtss', name: 'rTSS', unit: 'rTSS', about: 'hours × (normalised effort pace ÷ threshold pace)² × 100' },
  { key: 'powerTss', name: 'Power TSS', unit: 'TSS', about: 'hours × (normalised power ÷ critical power)² × 100' },
];

export interface PerformanceSettings {
  load: LoadModel;
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
}

/** Until the runner sets their own (model's choices: Banister TRIMP, resting HR 60, 42 and 7 days). */
export const DEFAULT_PERFORMANCE: PerformanceSettings = {
  load: 'trimpBanister', restHr: 60, maxHr: null, sex: 'male', thresholdPace: null, thresholdPower: null, fitnessDays: 42, fatigueDays: 7,
};

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** The settings as read from a file: unknown or out-of-range values fall back to the defaults. */
export function parsePerformance(v: unknown): PerformanceSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_PERFORMANCE;
  return {
    load: LOAD_MODELS.some((m) => m.key === o.load) ? (o.load as LoadModel) : d.load,
    restHr: num(o.restHr, 25, 120) ?? d.restHr,
    maxHr: num(o.maxHr, 100, 240),
    sex: o.sex === 'female' ? 'female' : 'male',
    thresholdPace: num(o.thresholdPace, 120, 900),
    thresholdPower: num(o.thresholdPower, 50, 800),
    fitnessDays: num(o.fitnessDays, 7, 120) ?? d.fitnessDays,
    fatigueDays: num(o.fatigueDays, 2, 30) ?? d.fatigueDays,
  };
}

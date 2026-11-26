import { CS_RANGE, estimateCurve, type CurveMetric } from '@/lib/curve';
import { LOAD_MODELS, zoneOf, type PerformanceSettings } from '@/lib/settings';
import type { LoadSummary } from './summary';

/**
 * The load of each run by the model chosen in Settings (requirement "Load model chosen in
 * Settings", ADR "Load and form models").
 */

/** The critical speed and power of a run are those of the bests in the days up to it (model's choice: 90). */
export const THRESHOLD_DAYS = 90;
const DAY = 86_400_000;

export interface LoadRow {
  id: string;
  startTime: string;
  /** timer time, s */
  duration: number;
}

export interface RunLoad {
  load: number;
  /** the run lacked what its model needs: its duration times the runner's median load per minute */
  estimated: boolean;
  /** the threshold the load was computed against: speed m/s (rTSS) or power W (Power TSS) */
  threshold: number | null;
}

/** A run's peak more than this above every other run's is a sensor's spike, not the runner's maximum, bpm (model's choice). */
export const MAX_HR_SPIKE = 5;

/**
 * The highest heart rate held for 10 s in the runs, bpm: the highest run's peak, unless it lies more than
 * MAX_HR_SPIKE above every other run's (a strap's or a wrist sensor's spike), then the next run's.
 */
export function autoMaxHr(summaries: LoadSummary[]): number | null {
  const peaks = summaries.map((s) => s.hrPeak).filter((v): v is number => v !== null).sort((a, b) => b - a);
  if (!peaks.length) return null;
  return peaks.length > 1 && peaks[0] - peaks[1] > MAX_HR_SPIKE ? peaks[1] : peaks[0];
}

/** Banister's TRIMP: minutes × HRr × 0.64·e^(1.92·HRr) (women 0.86·e^(1.67·HRr)), HRr the heart rate reserve used. */
export function banisterTrimp(s: LoadSummary, restHr: number, maxHr: number, sex: 'male' | 'female'): number | null {
  if (!s.hr.length || maxHr <= restHr) return null;
  const [a, b] = sex === 'female' ? [0.86, 1.67] : [0.64, 1.92];
  let sum = 0;
  s.hr.forEach((sec, k) => {
    const r = Math.min(1, Math.max(0, (s.hrFrom + k - restHr) / (maxHr - restHr)));
    sum += (sec / 60) * r * a * Math.exp(b * r);
  });
  return sum;
}

/** Edwards counts nothing under this share of the maximum heart rate (Edwards 1993: his bands start at 50 %). */
export const EDWARDS_FLOOR = 0.5;

/**
 * Edwards' TRIMP: minutes in each heart rate zone times its number (Z1 = 1), from the zones of Settings;
 * with a maximum heart rate, the minutes under EDWARDS_FLOOR of it count nothing.
 */
export function edwardsTrimp(s: LoadSummary, hrZones: number[], maxHr: number | null = null): number | null {
  if (!s.hr.length || !hrZones.length) return null;
  const floor = maxHr ? EDWARDS_FLOOR * maxHr : 0;
  let sum = 0;
  s.hr.forEach((sec, k) => { if (s.hrFrom + k >= floor) sum += (sec / 60) * (zoneOf('heartRate', hrZones, s.hrFrom + k) + 1); });
  return sum;
}

/** Training stress: hours × (normalised ÷ threshold)² × 100 (an hour at the threshold is 100). */
export function stressScore(duration: number, normalised: number | null, threshold: number | null): number | null {
  if (normalised === null || threshold === null || threshold <= 0) return null;
  return (duration / 3600) * (normalised / threshold) ** 2 * 100;
}

/**
 * A critical speed (power) is taken for a threshold only when its reserve, D′ (W′), is worth this many
 * seconds at it or more (model's choice: 12 s, about 50 m at 4 m/s): a smaller one means the short bests
 * were held back, and the fit then lies near the pace of the easy runs.
 */
export const MIN_RESERVE_SECONDS = 12;

/** The threshold of a run: its value, and where it comes from. */
export interface CriticalAt {
  rate: number;
  /** D′ (m) or W′ (J) of the same fit */
  reserve: number;
  /** own: the bests of the 90 days up to the run; held: the last own one before; first: the first own one after (runs before any) */
  from: 'own' | 'held' | 'first';
}

/**
 * The critical speed (m/s) or power (W) at each run: the Monod–Scherrer fit of the best of each length
 * of 2–20 minutes over the runs of the THRESHOLD_DAYS days up to and with it, when its reserve is worth
 * MIN_RESERVE_SECONDS or more; else the last one so taken holds (a stretch of easy running does not lower
 * the threshold to the easy pace), and the runs before the first take the first. Null when no window
 * gives one.
 */
export function criticalSeries(rows: LoadRow[], summaries: Record<string, LoadSummary>, metric: CurveMetric): Record<string, CriticalAt | null> {
  const sorted = [...rows].filter((r) => summaries[r.id]).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const at = sorted.map((r) => Date.parse(r.startTime));
  const own: ({ rate: number; reserve: number } | null)[] = [];
  let from = 0;
  for (let i = 0; i < sorted.length; i++) {
    while (at[i] - at[from] > THRESHOLD_DAYS * DAY) from++;
    const best = new Map<number, number>();
    for (let k = from; k <= i; k++) {
      for (const b of summaries[sorted[k].id].bests) {
        if (b.duration < CS_RANGE[0] || b.duration > CS_RANGE[1]) continue;
        const v = metric === 'power' ? b.power : b.speed;
        if (v !== null && v > (best.get(b.duration) ?? 0)) best.set(b.duration, v);
      }
    }
    const points = [...best].map(([duration, v]) => ({ duration, value: metric === 'power' ? v : 1000 / v }));
    const c = estimateCurve(points, metric)?.critical ?? null;
    own.push(c && c.rate > 0 && c.reserve >= MIN_RESERVE_SECONDS * c.rate ? { rate: c.rate, reserve: c.reserve } : null);
  }
  const first = own.find((v) => v !== null) ?? null;
  const out: Record<string, CriticalAt | null> = {};
  let held: { rate: number; reserve: number } | null = null;
  sorted.forEach((r, i) => {
    const v = own[i];
    if (v !== null) held = v;
    out[r.id] = v !== null ? { ...v, from: 'own' } : held !== null ? { ...held, from: 'held' } : first !== null ? { ...first, from: 'first' } : null;
  });
  return out;
}

/** The critical speed (m/s) or power (W) at each run, as criticalSeries takes it; null without one. */
export function criticalByRun(rows: LoadRow[], summaries: Record<string, LoadSummary>, metric: CurveMetric): Record<string, number | null> {
  return Object.fromEntries(Object.entries(criticalSeries(rows, summaries, metric)).map(([id, c]) => [id, c?.rate ?? null]));
}

/** The load of every run with a summary, by the model and parameters given. */
export function runLoads(rows: LoadRow[], summaries: Record<string, LoadSummary>, p: PerformanceSettings, hrZones: number[]): Record<string, RunLoad> {
  const have = rows.filter((r) => summaries[r.id]);
  const maxHr = p.maxHr ?? autoMaxHr(have.map((r) => summaries[r.id]));
  const critical = p.load === 'rtss' && p.thresholdPace === null ? criticalByRun(have, summaries, 'speed')
    : p.load === 'powerTss' && p.thresholdPower === null ? criticalByRun(have, summaries, 'power') : {};
  const raw = new Map<string, { load: number | null; threshold: number | null }>();
  for (const r of have) {
    const s = summaries[r.id];
    if (p.load === 'trimpBanister') raw.set(r.id, { load: maxHr === null ? null : banisterTrimp(s, p.restHr, maxHr, p.sex), threshold: null });
    else if (p.load === 'trimpEdwards') raw.set(r.id, { load: edwardsTrimp(s, hrZones, maxHr), threshold: null });
    else if (p.load === 'rtss') {
      const threshold = p.thresholdPace !== null ? 1000 / p.thresholdPace : critical[r.id] ?? null;
      raw.set(r.id, { load: stressScore(s.duration, s.normSpeed, threshold), threshold });
    } else {
      const threshold = p.thresholdPower ?? critical[r.id] ?? null;
      raw.set(r.id, { load: stressScore(s.duration, s.normPower, threshold), threshold });
    }
  }
  // A run without what its model needs: its duration at the runner's median load per minute (minutes when no run has it).
  const perMinute = [...raw].filter(([, v]) => v.load !== null && v.load > 0).map(([id, v]) => v.load! / (summaries[id].duration / 60)).sort((a, b) => a - b);
  const median = perMinute.length ? perMinute[Math.floor(perMinute.length / 2)] : 1;
  const out: Record<string, RunLoad> = {};
  for (const r of have) {
    const v = raw.get(r.id)!;
    const estimated = v.load === null;
    const load = estimated ? (summaries[r.id].duration / 60) * median : v.load!;
    out[r.id] = { load: Math.round(load * 10) / 10, estimated, threshold: v.threshold === null ? null : Math.round(v.threshold * 1000) / 1000 };
  }
  return out;
}

/** The unit a model's load is given in. */
export const loadUnit = (p: PerformanceSettings) => LOAD_MODELS.find((m) => m.key === p.load)!.unit;

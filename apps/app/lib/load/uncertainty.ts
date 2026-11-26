import { CS_RANGE, estimateCurve, fitCritical, fitWholeCurve, wholePredictions } from '@/lib/curve';
import { dayOf } from '@/lib/gear';
import { jackknifeMany } from '@/lib/stats';
import { MARKER_DAYS } from './insights';
import type { LoadRow } from './models';
import type { LoadSummary } from './summary';

/**
 * How far today's fitness markers may lie from what they are (requirement "Uncertainty of the
 * markers"): each by the jackknife of the runs it rests on, the model fitted again with each run of the
 * window left out in turn, so a value one run decides shows a wide range. By runs, not by bests (the
 * review of 26 Nov 2026): the bests of one hard effort are not separate measurements, a 20-minute effort
 * leaves a best of every shorter length, and leaving one length out leaves the effort in. For today only:
 * week by week every week would be fitted n times again.
 */

/** A value and the range it may lie in (95 %), in the value's unit. */
export interface Range { value: number; se: number; low: number; high: number }

export interface MarkerRanges {
  /** critical speed, m/s, and D′, m */
  cs: Range | null;
  dPrime: Range | null;
  /** critical power, W, and W′, J */
  cp: Range | null;
  wPrime: Range | null;
  /** predicted race times, s, by distance, by the curve model chosen */
  predictions: { distance: number; range: Range | null }[];
}

const DAY = 86_400_000;
type Point = { duration: number; value: number };

/** The bests of each run of the MARKER_DAYS days up to `today`, in the order of the runs. */
function runsOf(rows: LoadRow[], summaries: Record<string, LoadSummary>, today: string): LoadSummary['bests'][] {
  const to = new Date(`${today}T23:59:59`).getTime();
  return [...rows].sort((a, b) => a.startTime.localeCompare(b.startTime)).flatMap((r) => {
    const s = summaries[r.id];
    const at = Date.parse(r.startTime);
    return !s || at <= to - MARKER_DAYS * DAY || at > to || dayOf(r.startTime) > today ? [] : [s.bests];
  });
}

/** The best of each length over runs: speed (as a pace, s/km) or power, every length in order. */
function bestsOf(runs: LoadSummary['bests'][], metric: 'speed' | 'power'): Point[] {
  const best = new Map<number, number>();
  for (const bests of runs) for (const b of bests) {
    const v = metric === 'power' ? b.power : b.speed;
    if (v !== null && v > (best.get(b.duration) ?? 0)) best.set(b.duration, v);
  }
  return [...best].sort(([a], [b]) => a - b).map(([duration, v]) => ({ duration, value: metric === 'power' ? v : 1000 / v }));
}

const within = (p: Point) => p.duration >= CS_RANGE[0] && p.duration <= CS_RANGE[1];

/**
 * The ranges of today's markers: critical speed and D′, critical power and W′ from the bests of 2–20
 * minutes, as the markers fit them; the predicted times from Riegel's law over the same bests, or with
 * the whole curve chosen from Péronnet–Thibault over the bests of every length. Each with every run of
 * the window left out in turn; none under 3 runs, or when the fit has no value without one of them.
 */
export function markerRanges(rows: LoadRow[], summaries: Record<string, LoadSummary>, today: string, model: 'riegel' | 'whole' = 'riegel', distances = [5000, 10000, 21097.5, 42195]): MarkerRanges {
  const runs = runsOf(rows, summaries, today);
  // One fit for each sample left one short gives every value of it: critical rate, reserve and, for pace, the predicted times.
  const fromFit = (metric: 'speed' | 'power', withTimes: boolean) => (sample: LoadSummary['bests'][]) => {
    const s = bestsOf(sample, metric).filter(within);
    // The critical model alone unless the predicted times of Riegel's law are wanted too.
    if (!withTimes) { const c = fitCritical(s, metric); return [c?.rate ?? null, c?.reserve ?? null]; }
    const e = estimateCurve(s, metric);
    return [e?.critical?.rate ?? null, e?.critical?.reserve ?? null, ...distances.map((d) => e?.predictions.find((p) => p.distance === d)?.seconds ?? null)];
  };
  const [cs, dPrime, ...riegel] = jackknifeMany(runs, fromFit('speed', model === 'riegel'));
  const [cp, wPrime] = jackknifeMany(runs, fromFit('power', false));
  const whole = model === 'whole' ? jackknifeMany(runs, (sample) => { const w = wholePredictions(fitWholeCurve(bestsOf(sample, 'speed'), 'speed')); return distances.map((d) => w.find((p) => p.distance === d)?.seconds ?? null); }) : riegel;
  return { cs, dPrime, cp, wPrime, predictions: distances.map((distance, k) => ({ distance, range: whole[k] ?? null })) };
}

/** The standard error of a range as a share of its value; null without a range. */
export const relativeSe = (r: Range | null): number | null => (r && r.value !== 0 ? r.se / Math.abs(r.value) : null);

/**
 * The standard errors that settle a critical rate and its reserve, as a share of each (model's choice: the
 * 5 % and 10 % used in the critical power literature for a fit's standard error). Past them the value
 * rests on one run or two: in doubt, not wrong.
 */
export const RATE_PRECISION = 0.05;
export const RESERVE_PRECISION = 0.1;

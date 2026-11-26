import { CS_RANGE, estimateCurve, fitCritical, fitWholeCurve, wholePredictions } from '@/lib/curve';
import { dayOf } from '@/lib/gear';
import { jackknifeMany } from '@/lib/stats';
import { MARKER_DAYS } from './insights';
import type { LoadRow } from './models';
import type { LoadSummary } from './summary';

/**
 * How far today's fitness markers may lie from what they are (requirement "Uncertainty of the
 * markers"): each by the jackknife of the bests it rests on, the model fitted again with each best left
 * out in turn, so a value one best decides shows a wide range. For today only: week by week every
 * week would be fitted n times again.
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

/** The best of each length over the runs of the MARKER_DAYS days up to `today`: speed (as a pace, s/km) and power, every length. */
function bestsOf(rows: LoadRow[], summaries: Record<string, LoadSummary>, today: string): { speed: Point[]; power: Point[] } {
  const to = new Date(`${today}T23:59:59`).getTime();
  const speed = new Map<number, number>();
  const power = new Map<number, number>();
  for (const r of rows) {
    const s = summaries[r.id];
    const at = Date.parse(r.startTime);
    if (!s || at <= to - MARKER_DAYS * DAY || at > to || dayOf(r.startTime) > today) continue;
    for (const b of s.bests) {
      if (b.speed !== null && b.speed > (speed.get(b.duration) ?? 0)) speed.set(b.duration, b.speed);
      if (b.power !== null && b.power > (power.get(b.duration) ?? 0)) power.set(b.duration, b.power);
    }
  }
  const sorted = (m: Map<number, number>, value: (v: number) => number) => [...m].sort(([a], [b]) => a - b).map(([duration, v]) => ({ duration, value: value(v) }));
  return { speed: sorted(speed, (v) => 1000 / v), power: sorted(power, (v) => v) };
}

const within = (p: Point) => p.duration >= CS_RANGE[0] && p.duration <= CS_RANGE[1];

/**
 * The ranges of today's markers: critical speed and D′, critical power and W′ from the bests of 2–20
 * minutes, as the markers fit them; the predicted times from Riegel's law over the same bests, or with
 * the whole curve chosen from Péronnet–Thibault over the bests of every length.
 */
export function markerRanges(rows: LoadRow[], summaries: Record<string, LoadSummary>, today: string, model: 'riegel' | 'whole' = 'riegel', distances = [5000, 10000, 21097.5, 42195]): MarkerRanges {
  const { speed, power } = bestsOf(rows, summaries, today);
  const sp = speed.filter(within);
  const pw = power.filter(within);
  // One fit for each sample left one short gives every value of it: critical rate, reserve and, for pace, the predicted times.
  const fromFit = (metric: 'speed' | 'power', withTimes: boolean) => (s: Point[]) => {
    // The critical model alone unless the predicted times of Riegel's law are wanted too.
    if (!withTimes) { const c = fitCritical(s, metric); return [c?.rate ?? null, c?.reserve ?? null]; }
    const e = estimateCurve(s, metric);
    return [e?.critical?.rate ?? null, e?.critical?.reserve ?? null, ...distances.map((d) => e?.predictions.find((p) => p.distance === d)?.seconds ?? null)];
  };
  const [cs, dPrime, ...riegel] = jackknifeMany(sp, fromFit('speed', model === 'riegel'));
  const [cp, wPrime] = jackknifeMany(pw, fromFit('power', false));
  const whole = model === 'whole' ? jackknifeMany(speed, (s) => { const w = wholePredictions(fitWholeCurve(s, 'speed')); return distances.map((d) => w.find((p) => p.distance === d)?.seconds ?? null); }) : riegel;
  return { cs, dPrime, cp, wPrime, predictions: distances.map((distance, k) => ({ distance, range: whole[k] ?? null })) };
}

/** The standard error of a range as a share of its value; null without a range. */
export const relativeSe = (r: Range | null): number | null => (r && r.value !== 0 ? r.se / Math.abs(r.value) : null);

/**
 * The standard errors that settle a critical rate and its reserve, as a share of each (model's choice: the
 * 5 % and 10 % used in the critical power literature for a fit's standard error). Past them the value
 * rests on one best or two: in doubt, not wrong, as the envelope may leave a best out that it rested on.
 */
export const RATE_PRECISION = 0.05;
export const RESERVE_PRECISION = 0.1;

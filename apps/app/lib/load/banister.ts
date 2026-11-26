import { dayOf } from '@/lib/gear';
import { SEED_DAYS } from './form';

/**
 * Banister's impulse–response model fitted to the runner's own performances (the author's request
 * of 21 Nov 2026: "dopasowanie wag modelu Banistera do Twoich wynikow ... mozesz to zrobic"; ADR
 * "Fitted model and VO2max estimates"): performance(t) = p0 + k1·g1(t) − k2·g2(t), where g is the
 * sum of the loads before day t, each decayed by e^(−age/τ) (Banister et al. 1975; Busso 2003).
 */

export interface BanisterFit {
  p0: number;
  k1: number;
  k2: number;
  /** the time constants of fitness and fatigue, days */
  tau1: number;
  tau2: number;
  /** the share of the performances' variance the model explains */
  r2: number;
  /**
   * the share it predicts of performances it was not fitted to: the performances in CV_FOLDS blocks of
   * consecutive days, each predicted by the model fitted (time constants included) to the others; 1 − PRESS/SST
   */
  r2cv: number;
  /** performances fitted */
  n: number;
  /** the model's performance on each day of the loads */
  fitted: { date: string; value: number }[];
  /** from the day after the last load, under the `future` loads given (none: resting): the model's performance on each of the next days */
  projection: { date: string; value: number }[];
  /** the highest of the projection */
  peak: { date: string; value: number };
  /** the mean size of each term on the days fitted, in the performance's unit: k1·fitness and k2·fatigue */
  terms: { fitness: number; fatigue: number };
}

/**
 * A fit needs this many performances (model's choice: 15, three for each block of the cross-validation;
 * 8 points of pure noise passed every check of a model of five parameters), spread over this many days at least.
 */
export const BANISTER_MIN_POINTS = 15;
export const BANISTER_MIN_SPAN = 42;
/** The grid of the time constants, days. */
export const TAU1_RANGE: [number, number] = [15, 60];
export const TAU2_RANGE: [number, number] = [2, 20];
/** The blocks of consecutive performances of the cross-validation (model's choice). */
export const CV_FOLDS = 5;

const next = (day: string, n = 1) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return dayOf(d.toISOString()); };

/**
 * The decayed sums of the loads before each day (the morning of the day), for a time constant; the
 * history taken to start in the steady state of the `seed` load a day, as the form's averages start.
 */
function impulse(loads: number[], tau: number, seed: number): number[] {
  const decay = Math.exp(-1 / tau);
  const out = [(seed * decay) / (1 - decay)];
  for (let i = 1; i < loads.length; i++) out.push(decay * (out[i - 1] + loads[i - 1]));
  return out;
}

/** Ordinary least squares of y on [1, a, b]: the three coefficients, or null when singular. */
function ols3(y: number[], a: number[], b: number[]): [number, number, number] | null {
  const n = y.length;
  let sa = 0, sb = 0, sy = 0, saa = 0, sbb = 0, sab = 0, say = 0, sby = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i]; sb += b[i]; sy += y[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; say += a[i] * y[i]; sby += b[i] * y[i];
  }
  // Normal equations, solved by Cramer's rule.
  const m = [[n, sa, sb], [sa, saa, sab], [sb, sab, sbb]];
  const r = [sy, say, sby];
  const det3 = (q: number[][]) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
  const d = det3(m);
  if (Math.abs(d) < 1e-9) return null;
  const col = (k: number) => det3(m.map((row, i) => row.map((v, j) => (j === k ? r[i] : v))));
  return [col(0) / d, col(1) / d, col(2) / d];
}

type GridFit = { sse: number; tau1: number; tau2: number; c: [number, number, number] };

/** The grid search over the performances `use` (indices into obs): the pair of time constants with the least squared error and positive gains. */
function fitGrid(obs: { i: number; y: number }[], use: number[], g1s: Map<number, number[]>, g2s: Map<number, number[]>): GridFit | null {
  const y = use.map((k) => obs[k].y);
  let best: GridFit | null = null;
  for (const [tau1, g1] of g1s) {
    const a = use.map((k) => g1[obs[k].i]);
    for (const [tau2, g2] of g2s) {
      if (tau2 >= tau1) continue;
      const b = use.map((k) => g2[obs[k].i]);
      const c = ols3(y, a, b);
      if (!c || c[1] <= 0 || c[2] >= 0) continue;
      let sse = 0;
      for (let k = 0; k < y.length; k++) sse += (y[k] - (c[0] + c[1] * a[k] + c[2] * b[k])) ** 2;
      if (!best || sse < best.sse) best = { sse, tau1, tau2, c };
    }
  }
  return best;
}

/**
 * The model fitted to the daily loads (every day, from the first) and the performances measured on
 * some of those days: the time constants by a grid search (τ2 < τ1), p0, k1, k2 by least squares,
 * the pair with the least squared error and positive gains kept; and the same fit cross-validated
 * over CV_FOLDS blocks of consecutive performances. Null with fewer than BANISTER_MIN_POINTS
 * performances or a span under BANISTER_MIN_SPAN days. The projection runs over `horizon` days past the
 * last, with the `future` loads of the days after it (a scenario of What if), rest after them.
 */
export function fitBanister(days: { date: string; load: number }[], performances: { date: string; value: number }[], horizon = 42, future: number[] = []): BanisterFit | null {
  const index = new Map(days.map((d, i) => [d.date, i]));
  const obs = performances.filter((p) => index.has(p.date)).map((p) => ({ i: index.get(p.date)!, y: p.value })).sort((a, b) => a.i - b.i);
  if (obs.length < BANISTER_MIN_POINTS) return null;
  if (obs[obs.length - 1].i - obs[0].i < BANISTER_MIN_SPAN) return null;
  // The loads continue with the future's, then rest, over the horizon, so the projection uses the same sums.
  const ahead = Math.max(horizon, future.length);
  const loads = [...days.map((d) => d.load), ...future, ...Array(ahead - future.length).fill(0)];
  // The history starts in the steady state of its first weeks, as the form's averages do (form.ts).
  const first = days.slice(0, SEED_DAYS);
  const seed = first.length ? first.reduce((s, d) => s + d.load, 0) / first.length : 0;
  const g1s = new Map<number, number[]>();
  const g2s = new Map<number, number[]>();
  for (let t = TAU1_RANGE[0]; t <= TAU1_RANGE[1]; t++) g1s.set(t, impulse(loads, t, seed));
  for (let t = TAU2_RANGE[0]; t <= TAU2_RANGE[1]; t++) g2s.set(t, impulse(loads, t, seed));
  const y = obs.map((o) => o.y);
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  const sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const all = obs.map((_, k) => k);
  const best = fitGrid(obs, all, g1s, g2s);
  if (!best) return null;
  // Cross-validation: each block predicted by the grid fitted to the others (the mean of the others when none fits).
  let press = 0;
  for (let f = 0; f < CV_FOLDS; f++) {
    const fold = (k: number) => Math.floor((k * CV_FOLDS) / obs.length) === f;
    const train = all.filter((k) => !fold(k));
    const fit = fitGrid(obs, train, g1s, g2s);
    const trainMean = train.reduce((s, k) => s + obs[k].y, 0) / Math.max(1, train.length);
    for (const k of all.filter(fold)) {
      const o = obs[k];
      const predicted = fit ? fit.c[0] + fit.c[1] * g1s.get(fit.tau1)![o.i] + fit.c[2] * g2s.get(fit.tau2)![o.i] : trainMean;
      press += (o.y - predicted) ** 2;
    }
  }
  const g1 = g1s.get(best.tau1)!;
  const g2 = g2s.get(best.tau2)!;
  const [p0, k1, minusK2] = best.c;
  const value = (i: number) => Math.round((p0 + k1 * g1[i] + minusK2 * g2[i]) * 100) / 100;
  const fitted = days.map((d, i) => ({ date: d.date, value: value(i) }));
  const last = days[days.length - 1].date;
  const projection = Array.from({ length: ahead }, (_, k) => ({ date: next(last, k + 1), value: value(days.length + k) }));
  const peak = projection.reduce((m, p) => (p.value > m.value ? p : m), projection[0]);
  const meanAt = (g: number[]) => obs.reduce((s, o) => s + g[o.i], 0) / obs.length;
  const terms = { fitness: k1 * meanAt(g1), fatigue: -minusK2 * meanAt(g2) };
  return {
    p0, k1, k2: -minusK2, tau1: best.tau1, tau2: best.tau2,
    r2: sst > 0 ? 1 - best.sse / sst : 0, r2cv: sst > 0 ? 1 - press / sst : 0,
    n: obs.length, fitted, projection, peak, terms,
  };
}

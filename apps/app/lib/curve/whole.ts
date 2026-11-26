import { envelopeGaps, fitEnvelope } from './envelope';
import type { CurveMetric } from './curve';

/**
 * A model of the whole curve, from a sprint to two hours (the runner's request of 25 Nov 2026: "zrob
 * Peronnet–Thibault albo dla mocy model omni-domain (Puchowicz 2020)"): the bests of every length are
 * fitted together, where the critical model holds only for 2–20 minutes and Riegel's law only from 3.
 *
 * Pace: Péronnet & Thibault (1989), in the mechanical form without the resting metabolism, with speed
 * in place of power (the energy cost of running per metre taken as constant):
 *   v(t) = MAS · (1 − k1/t · (1 − e^(−t/k1))) − A · ln(t/TMAP) + S/t · (1 − e^(−t/k2)) · (1 + PT_ANAEROBIC · ln(t/TMAP)),
 *   the logarithms counting only past TMAP;
 * MAS the maximal aerobic speed, held for TMAP; A its decline past TMAP, the runner's endurance; S the
 * anaerobic reserve, m, declining past TMAP by the authors' constant. Without the bests to settle A (two
 * past TMAP, the longest of 30 minutes or more) A is Riegel's 1.06 (A = PT_RIEGEL_DECLINE · MAS): one
 * 10-minute best would otherwise decide the marathon.
 * Power: the omni-domain model of Puchowicz, Baker & Clarke (2020):
 *   P(t) = W′/t · (1 − e^(−t · (Pmax − CP)/W′)) + CP − A · ln(t/TCPmax) past TCPmax;
 * W′ spent no faster than the sprint power Pmax allows, the critical power falling log-linearly after
 * TCPmax. Both fitted as an envelope, as every model of the curve (envelope.ts). The decline of
 * OmPD is fixed at 0 without a best past TCPmax.
 */

/** Péronnet & Thibault's constants: the aerobic and anaerobic time constants and the time MAS is held, s. */
export const PT_K1 = 30;
export const PT_K2 = 20;
export const PT_TMAP = 420;
/** The decline of the anaerobic reserve past TMAP, per unit of ln(t/TMAP) (Péronnet & Thibault 1989: A = −0.233). */
export const PT_ANAEROBIC = -0.233;
/**
 * The decline of the aerobic speed past TMAP, as a share of MAS per unit of ln t, when the bests do not
 * settle it: speed ∝ t^(−0.06) far from the sprint, Riegel's exponent 1.06 (Riegel 1981).
 */
export const PT_RIEGEL_DECLINE = 0.06;
/** The decline is fitted with this many bests past TMAP, the longest this long at least, s (model's choice: 30 minutes, OmPD's TCPmax). */
export const DECLINE_POINTS = 2;
export const DECLINE_LONGEST = 1800;
/** The time after which the omni-domain model's critical power declines, s (TCPmax). */
export const OMPD_TCPMAX = 1800;
/** A whole-curve fit needs this many bests, one of them this short at most and one this long at least, s. */
export const WHOLE_MIN_POINTS = 4;
export const WHOLE_SHORT = 180;
export const WHOLE_LONG = 600;

export interface WholeCurve {
  model: 'pt' | 'ompd';
  metric: CurveMetric;
  /** pt: mas (m/s), s (m), a (m/s per unit of ln t); ompd: cp (W), wp (J), pmax (W), a (W per unit of ln t) */
  params: Record<string, number>;
  /** the lengths of the bests it was fitted to, s */
  range: [number, number];
  n: number;
  /** how far the curve lies above the bests near it, on average: the root mean square of the relative gap (0 where it rests on them) */
  error: number;
  /** the lengths of the bests far below the curve (more than FAR_BELOW of envelope.ts): no all-out efforts, which do not pull it */
  far: number[];
  /** whether the decline past TMAP or TCPmax was fitted (P–T: two bests past TMAP and one of 30 minutes; OmPD: a best past TCPmax); else P–T takes Riegel's and OmPD none */
  decline: boolean;
}

/** Péronnet–Thibault: the speed, m/s, held for t seconds. */
export function ptRate(p: { mas: number; s: number; a: number }, t: number): number {
  const past = t > PT_TMAP ? Math.log(t / PT_TMAP) : 0;
  const aerobic = p.mas * (1 - (PT_K1 / t) * (1 - Math.exp(-t / PT_K1))) - p.a * past;
  const anaerobic = (p.s / t) * (1 - Math.exp(-t / PT_K2)) * Math.max(0, 1 + PT_ANAEROBIC * past);
  return aerobic + anaerobic;
}

/** The omni-domain model: the power, W, held for t seconds. */
export function ompdRate(p: { cp: number; wp: number; pmax: number; a: number }, t: number): number {
  const base = (p.wp / t) * (1 - Math.exp((-t * Math.max(p.pmax - p.cp, 1e-6)) / p.wp)) + p.cp;
  return t > OMPD_TCPMAX ? base - p.a * Math.log(t / OMPD_TCPMAX) : base;
}

/** The rate a curve's value stands for, and back: speed, m/s, from a pace in s/km; power as it is. */
const rateOf = (metric: CurveMetric, value: number) => (metric === 'power' ? value : 1000 / value);
const valueOf = (metric: CurveMetric, rate: number) => (metric === 'power' ? rate : 1000 / rate);

/** The whole curve's value at a length: a pace in s/km, or a power in W. */
export function wholeValue(c: WholeCurve, duration: number): number {
  const p = c.params;
  const rate = c.model === 'pt' ? ptRate({ mas: p.mas, s: p.s, a: p.a }, duration) : ompdRate({ cp: p.cp, wp: p.wp, pmax: p.pmax, a: p.a }, duration);
  return valueOf(c.metric, Math.max(rate, 1e-9));
}

/**
 * The whole curve fitted to the bests (a pace in s/km, or a power in W, by length): Péronnet–Thibault
 * for pace, the omni-domain model for power. Null with fewer than WHOLE_MIN_POINTS bests, or without
 * one of WHOLE_SHORT seconds at most and one of WHOLE_LONG at least: the sprint and the decline would
 * be guesses.
 */
export function fitWholeCurve(points: { duration: number; value: number }[], metric: CurveMetric): WholeCurve | null {
  const pts = points.filter((p) => p.duration > 0 && p.value > 0).map((p) => ({ t: p.duration, r: rateOf(metric, p.value) })).sort((a, b) => a.t - b.t);
  if (pts.length < WHOLE_MIN_POINTS || pts[0].t > WHOLE_SHORT || pts[pts.length - 1].t < WHOLE_LONG) return null;
  const range: [number, number] = [pts[0].t, pts[pts.length - 1].t];
  const near = (t: number) => pts.reduce((b, p) => (Math.abs(Math.log(p.t / t)) < Math.abs(Math.log(b.t / t)) ? p : b));
  if (metric === 'speed') {
    // Positive parameters by their logarithms; a start from the bests: MAS near 7 minutes, S from the shortest.
    const mas0 = near(PT_TMAP).r * 0.95;
    const s0 = Math.max(20, (pts[0].r - mas0) * pts[0].t);
    const decline = pts.filter((q) => q.t > PT_TMAP).length >= DECLINE_POINTS && range[1] >= DECLINE_LONGEST;
    // Without the long bests the decline is Riegel's share of MAS, MAS and S still from the fit.
    const params = (x: number[]) => ({ mas: Math.exp(x[0]), s: Math.exp(x[1]), a: decline ? Math.exp(x[2]) : PT_RIEGEL_DECLINE * Math.exp(x[0]) });
    const x0 = [Math.log(mas0), Math.log(s0), Math.log(mas0 * PT_RIEGEL_DECLINE)];
    const p = params(fitEnvelope(decline ? 'pt' : 'pt-riegel', pts, (x, t) => ptRate(params(x), t), decline ? x0 : x0.slice(0, 2), [0.1, 0.5, 1].slice(0, decline ? 3 : 2)));
    const { error, far } = envelopeGaps(pts, (t) => ptRate(p, t));
    return { model: 'pt', metric, params: p, range, n: pts.length, error, far, decline };
  }
  const decline = range[1] > OMPD_TCPMAX;
  const cp0 = near(1200).r * 0.95;
  const wp0 = Math.max(1000, (near(120).r - cp0) * 120);
  const pmax0 = pts[0].r * 1.3;
  // Pmax above CP by its logarithm; the decline fixed at 0 without a best past TCPmax.
  const params = (x: number[]) => ({ cp: Math.exp(x[0]), wp: Math.exp(x[1]), pmax: Math.exp(x[0]) + Math.exp(x[2]), a: decline ? Math.exp(x[3]) : 0 });
  const x0 = [Math.log(cp0), Math.log(wp0), Math.log(Math.max(1, pmax0 - cp0)), Math.log(cp0 * 0.03)];
  const p = params(fitEnvelope(decline ? 'ompd' : 'ompd-flat', pts, (x, t) => ompdRate(params(x), t), decline ? x0 : x0.slice(0, 3), [0.1, 0.5, 0.3, 1].slice(0, decline ? 4 : 3)));
  const { error, far } = envelopeGaps(pts, (t) => ompdRate(p, t));
  return { model: 'ompd', metric, params: p, range, n: pts.length, error, far, decline };
}

/**
 * The race times the whole curve of pace implies: the time T at which the distance held, v(T) · T,
 * reaches each distance (by bisection: the distance held grows with the time). Speed only.
 */
export function wholePredictions(c: WholeCurve | null, distances: number[] = [5000, 10000, 21097.5, 42195]): { distance: number; seconds: number }[] {
  if (!c || c.metric !== 'speed') return [];
  const covered = (t: number) => (1000 / wholeValue(c, t)) * t;
  return distances.flatMap((distance) => {
    let [lo, hi] = [1, 12 * 3600];
    // Past half a day, or where the decline turns the distance held back, the model says nothing.
    if (covered(hi) < distance) return [];
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (covered(mid) < distance) lo = mid; else hi = mid; }
    return [{ distance, seconds: hi }];
  });
}

/** The lengths named on the whole curve's time axis, s. */
export const WHOLE_AXIS = [30, 60, 120, 300, 600, 1200, 1800, 3600, 7200];

/** The longest length a whole curve is drawn to, s: past its longest best, an extrapolation (model's choice: two hours). */
export const WHOLE_TO = 7200;

/** The whole curve sampled for a chart: over the bests it was fitted to, and past them up to WHOLE_TO as an extrapolation. */
export function curveOfWhole(c: WholeCurve): { estimate: { duration: number; value: number }[]; extrapolate: { duration: number; value: number }[]; at: (duration: number) => number } {
  const sample = (from: number, to: number, n: number) => Array.from({ length: n }, (_, k) => { const d = from * Math.pow(to / from, k / (n - 1)); return { duration: d, value: wholeValue(c, d) }; });
  return {
    estimate: sample(c.range[0], c.range[1], 40),
    extrapolate: c.range[1] < WHOLE_TO ? sample(c.range[1], WHOLE_TO, 12) : [],
    at: (d) => wholeValue(c, d),
  };
}

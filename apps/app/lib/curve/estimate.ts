import { linearFit } from '@/lib/stats';
import type { CurveMetric } from './curve';

/** The estimate's models need this many best stretches of at least MIN_FIT_SECONDS. */
export const MIN_FIT_POINTS = 3;
/** Stretches shorter than this are sprints the endurance models do not describe (model's choice: 3 minutes). */
export const MIN_FIT_SECONDS = 180;
/** The critical speed and critical power models hold for efforts of about 2 to 20 minutes (Jones & Vanhatalo 2017). */
export const CS_RANGE: [number, number] = [120, 1200];
/** Distances the estimate predicts a time for: 5 km, 10 km, half and full marathon. */
export const PREDICTED_DISTANCES = [5000, 10000, 21097.5, 42195];

export interface CurveEstimate {
  metric: CurveMetric;
  /** Riegel's power law, r(t) = e^a · t^(−k), r the speed (m/s) or the power (W): it falls by the factor 2^(−k) for every doubling of the time */
  a: number;
  k: number;
  /** best stretches the law was fitted to */
  n: number;
  /**
   * The critical speed model, d = CS·t + D′ (rate m/s, reserve m), or the critical power model,
   * W = CP·t + W′ (rate W, reserve J), from the bests of 2–20 minutes; null below MIN_FIT_POINTS of them.
   */
  critical: { rate: number; reserve: number; n: number } | null;
  /** predicted times by distance, s, from the power law; speed only */
  predictions: { distance: number; seconds: number }[];
}

/** The rate a curve's value stands for: speed, m/s, from a pace; power as it is. */
const rateOf = (metric: CurveMetric, value: number) => (metric === 'power' ? value : 1000 / value);

/**
 * The estimated curve from the measured one (the author's request of 19 Nov 2026: "dodaj
 * estymowana ... bazujac na researchu"): Riegel's power law (Riegel 1981, "Athletic records and
 * human endurance": time grows with distance to the power 1.06, that is speed falls with time to
 * the power about −0.06), its exponent fitted by least squares in log–log to the best stretches
 * of 3 minutes and more and its level raised to the strongest of them (an envelope: the law is
 * meant for maximal efforts), and the critical speed model (Monod & Scherrer 1965; Hill 1993;
 * Jones & Vanhatalo 2017) fitted to the bests of 2–20 minutes. For power (the author's request of
 * 20 Nov 2026: "krzywe z wyborem predkosci i mocy") the same law of power over time, and the
 * critical power model (Monod & Scherrer 1965; Moritani et al. 1981), W = CP·t + W′, in place of
 * critical speed; no race times. Null with fewer than MIN_FIT_POINTS bests.
 */
export function estimateCurve(points: { duration: number; value: number }[], metric: CurveMetric = 'speed'): CurveEstimate | null {
  const rate = (v: number) => rateOf(metric, v);
  const fit = points.filter((p) => p.duration >= MIN_FIT_SECONDS);
  if (fit.length < MIN_FIT_POINTS) return null;
  const f = linearFit(fit.map((p) => Math.log(p.duration)), fit.map((p) => Math.log(rate(p.value))));
  const k = -f.slope;
  // The envelope (the author's choice of 19 Nov 2026): the law's slope from the fit, its level
  // raised to the strongest best, so no measured best lies above the estimate; Riegel's law is
  // meant for a maximal effort, and an easy long run is no such effort.
  const a = Math.max(...fit.map((p) => Math.log(rate(p.value)) + k * Math.log(p.duration)));
  const csPts = points.filter((p) => p.duration >= CS_RANGE[0] && p.duration <= CS_RANGE[1]);
  let critical: CurveEstimate['critical'] = null;
  if (csPts.length >= MIN_FIT_POINTS) {
    // Distance (or work) against time: the slope is the critical rate, the intercept the reserve above it.
    const c = linearFit(csPts.map((p) => p.duration), csPts.map((p) => rate(p.value) * p.duration));
    critical = { rate: c.slope, reserve: c.intercept, n: csPts.length };
  }
  // d = v·t = e^a · t^(1−k)  ⇒  t = (d / e^a)^(1/(1−k)); meaningless when the law says speed rises with time.
  const predictions = metric === 'speed' && k < 1 && k > -0.5 ? PREDICTED_DISTANCES.map((distance) => ({ distance, seconds: Math.pow(distance / Math.exp(a), 1 / (1 - k)) })) : [];
  return { metric, a, k, n: fit.length, critical, predictions };
}

/** The estimated value at a length of time, from the power law: a pace, s/km, or a power, W. */
export function estimatedValue(e: CurveEstimate, duration: number): number {
  const r = Math.exp(e.a) * Math.pow(duration, -e.k);
  return e.metric === 'power' ? r : 1000 / r;
}

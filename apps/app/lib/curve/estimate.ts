import { linearFit } from '@/lib/stats';
import { fitEnvelope } from './envelope';
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
 * of 3 minutes and more, and the critical speed model (Monod & Scherrer 1965; Hill 1993; Jones &
 * Vanhatalo 2017), v = CS + D′/t, fitted to the bests of 2–20 minutes. Both fitted as an envelope
 * (envelope.ts: the runner's "idz ta metoda"): every parameter from the bests, by least squares with
 * an error that lets no best lie above the curve and no easy run pull it down; started from the
 * ordinary least-squares fit (log–log for the law, distance against time for the critical model). For
 * power (the author's request of 20 Nov 2026: "krzywe z wyborem predkosci i mocy") the same law of
 * power over time, and the critical power model (Monod & Scherrer 1965; Moritani et al. 1981),
 * P = CP + W′/t, in place of critical speed; no race times. Null with fewer than MIN_FIT_POINTS bests.
 */
export function estimateCurve(points: { duration: number; value: number }[], metric: CurveMetric = 'speed'): CurveEstimate | null {
  const rate = (v: number) => rateOf(metric, v);
  const fit = points.filter((p) => p.duration >= MIN_FIT_SECONDS);
  if (fit.length < MIN_FIT_POINTS) return null;
  const law = fit.map((p) => ({ t: p.duration, r: rate(p.value) }));
  const f = linearFit(law.map((p) => Math.log(p.t)), law.map((p) => Math.log(p.r)));
  // r = e^a · t^(−k): a and k from the envelope's fit, started from the log–log line.
  const [a, k] = fitEnvelope('riegel', law, ([a0, k0], t) => Math.exp(a0 - k0 * Math.log(t)), [f.intercept, -f.slope], [0.02, 0.01]);
  const critical = fitCritical(points, metric);
  // d = v·t = e^a · t^(1−k)  ⇒  t = (d / e^a)^(1/(1−k)); meaningless when the law says speed rises with time.
  const predictions = metric === 'speed' && k < 1 && k > -0.5 ? PREDICTED_DISTANCES.map((distance) => ({ distance, seconds: Math.pow(distance / Math.exp(a), 1 / (1 - k)) })) : [];
  return { metric, a, k, n: fit.length, critical, predictions };
}

/**
 * The critical speed (power) model alone, as estimateCurve fits it: v = CS + D′/t (P = CP + W′/t) as the
 * envelope of the bests of CS_RANGE, started from distance (work) against time; null below MIN_FIT_POINTS
 * of them.
 */
export function fitCritical(points: { duration: number; value: number }[], metric: CurveMetric = 'speed'): CurveEstimate['critical'] {
  const csPts = points.filter((p) => p.duration >= CS_RANGE[0] && p.duration <= CS_RANGE[1]).map((p) => ({ t: p.duration, r: rateOf(metric, p.value) }));
  if (csPts.length < MIN_FIT_POINTS) return null;
  // Distance (or work) against time for the start: the slope is the critical rate, the intercept the reserve above it.
  const c = linearFit(csPts.map((p) => p.t), csPts.map((p) => p.r * p.t));
  const [cr, reserve] = fitEnvelope('critical', csPts, ([cr0, d0], t) => cr0 + d0 / t, [c.slope, c.intercept], [Math.abs(c.slope) * 0.02 || 0.01, Math.abs(c.intercept) * 0.1 + 1]);
  return { rate: cr, reserve, n: csPts.length };
}

/** The estimated value at a length of time, from the power law: a pace, s/km, or a power, W. */
export function estimatedValue(e: CurveEstimate, duration: number): number {
  const r = Math.exp(e.a) * Math.pow(duration, -e.k);
  return e.metric === 'power' ? r : 1000 / r;
}

/** The longest length the curve's charts reach: past the 20 minutes of the fit, an extrapolation (model's choice: an hour). */
export const EXTRAPOLATE_TO = 3600;
/** The lengths named on the curve's time axis, s: those of the fit, then 30 minutes and an hour. */
export const CURVE_AXIS = [120, 180, 300, 600, 900, 1200, 1800, 3600];

/** Whether the critical model can draw the curve: a positive rate and a positive reserve. */
const hyperbolic = (e: CurveEstimate) => !!e.critical && e.critical.rate > 0 && e.critical.reserve > 0;

/**
 * The fitted value at a length of time (the runner's question of 25 Nov 2026: "czy krzywa tempa i mocy
 * jest napewno prostolinijna?", answered "ok" to the hyperbola within 2–20 minutes and the power law,
 * marked as an extrapolation, past them): within CS_RANGE the critical model, rate = CS + D′/t (or
 * CP + W′/t), the curve critical speed and D′ come from, bending towards CS; elsewhere, or when the
 * critical model has no positive rate and reserve, Riegel's power law, the predicted times' model.
 * A pace in s/km, or a power in W.
 */
export function fittedValue(e: CurveEstimate, duration: number): number {
  if (hyperbolic(e) && duration >= CS_RANGE[0] && duration <= CS_RANGE[1]) {
    const r = e.critical!.rate + e.critical!.reserve / duration;
    return e.metric === 'power' ? r : 1000 / r;
  }
  return estimatedValue(e, duration);
}

/** The fitted curve sampled for a chart: `n` lengths evenly on a logarithmic axis from `from` to `to`, s. */
export function sampleFitted(e: CurveEstimate, from: number, to: number, n = 25): { duration: number; value: number }[] {
  return Array.from({ length: n }, (_, k) => { const d = from * Math.pow(to / from, k / (n - 1)); return { duration: d, value: fittedValue(e, d) }; });
}

/**
 * The curve of a chart: the fit over 2–20 minutes, and past 20 minutes up to EXTRAPOLATE_TO the power
 * law, an extrapolation drawn apart from it. `at` reads either under the pointer.
 */
export function curveOfEstimate(e: CurveEstimate): { estimate: { duration: number; value: number }[]; extrapolate: { duration: number; value: number }[]; at: (duration: number) => number } {
  return {
    estimate: sampleFitted(e, CS_RANGE[0], CS_RANGE[1]),
    extrapolate: Array.from({ length: 9 }, (_, k) => { const d = CS_RANGE[1] * Math.pow(EXTRAPOLATE_TO / CS_RANGE[1], k / 8); return { duration: d, value: estimatedValue(e, d) }; }),
    // Under 2 minutes neither the critical model nor Riegel's law describes a best (the runner's "ponizej 2
    // min ... nie liczyc roznicy"): no value, so no gap is measured there.
    at: (d) => (d < CS_RANGE[0] ? Number.NaN : fittedValue(e, d)),
  };
}

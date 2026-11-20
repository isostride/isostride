import { linearFit } from '@/lib/stats';

/** The estimate's models need this many best stretches of at least MIN_FIT_SECONDS. */
export const MIN_FIT_POINTS = 3;
/** Stretches shorter than this are sprints the endurance models do not describe (model's choice: 3 minutes). */
export const MIN_FIT_SECONDS = 180;
/** The critical speed model holds for efforts of about 2 to 20 minutes (Jones & Vanhatalo 2017). */
export const CS_RANGE: [number, number] = [120, 1200];
/** Distances the estimate predicts a time for: 5 km, 10 km, half and full marathon. */
export const PREDICTED_DISTANCES = [5000, 10000, 21097.5, 42195];

export interface CurveEstimate {
  /** Riegel's power law, v(t) = e^a · t^(−k): speed falls by the factor 2^(−k) for every doubling of the time */
  a: number;
  k: number;
  /** best stretches the law was fitted to */
  n: number;
  /** the critical speed model, d = CS·t + D′, from the bests of 2–20 minutes; null below MIN_FIT_POINTS of them */
  cs: { cs: number; dPrime: number; n: number } | null;
  /** predicted times by distance, s, from the power law */
  predictions: { distance: number; seconds: number }[];
}

/**
 * The estimated pace curve from the measured one (the author's request of 19 Nov 2026: "dodaj
 * estymowana ... bazujac na researchu"): Riegel's power law (Riegel 1981, "Athletic records and
 * human endurance": time grows with distance to the power 1.06, that is speed falls with time to
 * the power about −0.06), its exponent fitted by least squares in log–log to the best stretches
 * of 3 minutes and more and its level raised to the strongest of them (an envelope: the law is
 * meant for maximal efforts), and the critical speed model (Monod & Scherrer 1965; Hill 1993;
 * Jones & Vanhatalo 2017) fitted to the bests of 2–20 minutes. Null with fewer than
 * MIN_FIT_POINTS bests.
 */
export function estimateCurve(points: { duration: number; pace: number }[]): CurveEstimate | null {
  const fit = points.filter((p) => p.duration >= MIN_FIT_SECONDS);
  if (fit.length < MIN_FIT_POINTS) return null;
  const f = linearFit(fit.map((p) => Math.log(p.duration)), fit.map((p) => Math.log(1000 / p.pace)));
  const k = -f.slope;
  // The envelope (the author's choice of 19 Nov 2026): the law's slope from the fit, its level
  // raised to the strongest best, so no measured best lies above the estimate; Riegel's law is
  // meant for a maximal effort, and an easy long run is no such effort.
  const a = Math.max(...fit.map((p) => Math.log(1000 / p.pace) + k * Math.log(p.duration)));
  const csPts = points.filter((p) => p.duration >= CS_RANGE[0] && p.duration <= CS_RANGE[1]);
  let cs: CurveEstimate['cs'] = null;
  if (csPts.length >= MIN_FIT_POINTS) {
    const c = linearFit(csPts.map((p) => p.duration), csPts.map((p) => (1000 / p.pace) * p.duration));
    cs = { cs: c.slope, dPrime: c.intercept, n: csPts.length };
  }
  // d = v·t = e^a · t^(1−k)  ⇒  t = (d / e^a)^(1/(1−k)); meaningless when the law says speed rises with time.
  const predictions = k < 1 && k > -0.5 ? PREDICTED_DISTANCES.map((distance) => ({ distance, seconds: Math.pow(distance / Math.exp(a), 1 / (1 - k)) })) : [];
  return { a, k, n: fit.length, cs, predictions };
}

/** The estimated pace, s/km, at a length of time, from the power law. */
export function estimatedPace(e: CurveEstimate, duration: number): number {
  return 1000 / (Math.exp(e.a) * Math.pow(duration, -e.k));
}

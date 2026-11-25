import { nelderMead } from '@/lib/stats';

/**
 * How every model of the curve is fitted to the bests (the runner's "idz ta metoda", 25 Nov 2026, after
 * "myslalem ze dopasowanie krzywej polega na tym ze dopasowujesz sie do pomiarow i liczysz przez to
 * parametry modelu"): the parameters come from the measurements alone, by least squares with an error
 * that says what a best is. A best is a lower bound of what the runner can do: one can always run slower
 * than one's most, never faster. So a best above the curve costs ENVELOPE_WEIGHT times more than one
 * just below it, and one far below it (an easy run, no all-out effort) stops pulling: its cost levels off
 * past ENVELOPE_REACH (Welsch's loss). The curve then rests on the strongest bests, as an envelope,
 * with no correction after the fit. Riegel's law, the critical model, Péronnet–Thibault and the
 * omni-domain model are all fitted so.
 */

/** How many times more a best above the curve costs than one as far below it (model's choice). */
export const ENVELOPE_WEIGHT = 1000;
/** How far below the curve, as a share, a best still pulls it (model's choice: 3 %). */
export const ENVELOPE_REACH = 0.03;
/** A best this far below the curve, as a share, is counted as no all-out effort: three times the reach, where its pull is all but gone. */
export const FAR_BELOW = 3 * ENVELOPE_REACH;

/** The cost of one best: `model` and `best` are rates (speed or power) at its length; `reach` as ENVELOPE_REACH. */
export function envelopeCost(model: number, best: number, reach = ENVELOPE_REACH): number {
  const e = model / best - 1;
  if (!Number.isFinite(e)) return 1e6;
  const c2 = reach ** 2;
  return e < 0 ? ENVELOPE_WEIGHT * e * e : c2 * (1 - Math.exp(-(e * e) / c2));
}

/** Fits already made, by the model's name and its bests: the weeks of the markers over time share their bests, mostly. */
const FITTED = new Map<string, number[]>();
/** How many fits are kept (model's choice): past it the oldest go. */
const FITTED_KEPT = 500;

/**
 * The parameters of a model fitted to bests (t in s, r a rate) by the envelope's cost, from a start
 * (a least-squares fit, or a guess from the bests) and the size of the first steps. `model` names the
 * rate function: the same model and bests give the fit made before.
 */
export function fitEnvelope(model: string, points: { t: number; r: number }[], rate: (x: number[], t: number) => number, x0: number[], step: number[]): number[] {
  const key = JSON.stringify([model, points, x0, step]);
  const known = FITTED.get(key);
  if (known) return [...known];
  const x = fit(points, rate, x0, step);
  if (FITTED.size >= FITTED_KEPT) FITTED.delete(FITTED.keys().next().value!);
  FITTED.set(key, x);
  return [...x];
}

function fit(points: { t: number; r: number }[], rate: (x: number[], t: number) => number, x0: number[], step: number[]): number[] {
  // The cost of a best far below levels off, and a curve far above most bests rests on that flat: a local
  // minimum. So the reach narrows by steps (graduated non-convexity): wide, the cost is all but quadratic
  // and every best pulls; each step starts from the one before, and the bests far below let go one by one.
  // Run from the start given and from the ordinary least squares of the relative error; the lower cost wins.
  const cost = (x: number[], reach = ENVELOPE_REACH) => points.reduce((s, p) => s + envelopeCost(rate(x, p.t), p.r, reach), 0);
  const ordinary = nelderMead((x) => points.reduce((s, p) => { const e = rate(x, p.t) / p.r - 1; return s + (Number.isFinite(e) ? e * e : 1e6); }, 0), x0, step, 1000, 1e-8).x;
  const fits = [x0, ordinary].map((start) => {
    let x = start;
    // The wide reaches only lead the way, each to a rough minimum; the envelope's own reach to the end.
    for (const reach of [0.5, 0.25, 0.12, 0.06]) x = nelderMead((y) => cost(y, reach), x, step, 500, 1e-6).x;
    x = nelderMead((y) => cost(y), x, step, 3000, 1e-10).x;
    return { x, value: cost(x) };
  });
  return fits.reduce((a, b) => (b.value < a.value ? b : a)).x;
}

/** How far the fitted curve lies above the bests near it (the root mean square of the share), and which lie far below. */
export function envelopeGaps(points: { t: number; r: number }[], rate: (t: number) => number): { error: number; far: number[] } {
  const gaps = points.map((p) => ({ t: p.t, e: rate(p.t) / p.r - 1 }));
  const near = gaps.filter((g) => g.e <= FAR_BELOW);
  return { error: Math.sqrt(near.reduce((s, g) => s + g.e * g.e, 0) / Math.max(1, near.length)), far: gaps.filter((g) => g.e > FAR_BELOW).map((g) => g.t) };
}

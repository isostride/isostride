/**
 * A seeded generator (mulberry32): the same numbers for the same seed, so a day of the demo runner is
 * the same run whenever and in whatever order it is generated.
 */
export interface Rng {
  /** in [0, 1) */
  next(): number;
  /** a normal deviate (Box and Muller) */
  gauss(): number;
  /** in [−a, a) */
  noise(a: number): number;
  /** a whole number in [lo, hi] */
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
}

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return {
    next,
    gauss,
    noise: (x) => (next() - 0.5) * 2 * x,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
  };
}

/** A wandering value: back to 0 with the time constant tau (s), sd its spread; step() once a second. */
export function wander(r: Rng, tau: number, sd: number): { step(): number } {
  let x = r.gauss() * sd;
  const k = sd * Math.sqrt(2 / tau);
  return { step() { x += -x / tau + k * r.gauss(); return x; } };
}

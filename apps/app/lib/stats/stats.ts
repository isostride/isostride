/** Own statistics (ADR "Own statistics module"): means, linear regression, bootstrap. */

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation. */
export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export interface Fit {
  slope: number;
  intercept: number;
}

/** Ordinary least squares y = intercept + slope · x; slope 0 when x does not vary. */
export function linearFit(x: number[], y: number[]): Fit {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

/** A small seeded generator (mulberry32), so every bootstrap gives the same interval for the same data. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const BOOTSTRAP_ITERATIONS = 1000;
export const CONFIDENCE = 0.95;

/** Percentile bootstrap interval of a statistic of one sample (resampled with replacement). */
export function bootstrap<T>(sample: T[], statistic: (s: T[]) => number, seed = 1, iterations = BOOTSTRAP_ITERATIONS): [number, number] {
  const next = rng(seed);
  const stats: number[] = [];
  for (let k = 0; k < iterations; k++) {
    const s = sample.map(() => sample[Math.floor(next() * sample.length)]);
    const v = statistic(s);
    if (Number.isFinite(v)) stats.push(v);
  }
  stats.sort((a, b) => a - b);
  const alpha = (1 - CONFIDENCE) / 2;
  return [quantile(stats, alpha), quantile(stats, 1 - alpha)];
}

/** Percentile bootstrap interval of mean(b) − mean(a), resampling each group on its own. */
export function bootstrapDiff(a: number[], b: number[], seed = 1, iterations = BOOTSTRAP_ITERATIONS): [number, number] {
  const next = rng(seed);
  const diffs: number[] = [];
  for (let k = 0; k < iterations; k++) {
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < a.length; i++) sa += a[Math.floor(next() * a.length)];
    for (let i = 0; i < b.length; i++) sb += b[Math.floor(next() * b.length)];
    diffs.push(sb / b.length - sa / a.length);
  }
  diffs.sort((x, y) => x - y);
  const alpha = (1 - CONFIDENCE) / 2;
  return [quantile(diffs, alpha), quantile(diffs, 1 - alpha)];
}

/**
 * The minimum of a function by the Nelder–Mead simplex (Nelder & Mead 1965; Lagarias et al. 1998
 * coefficients): no gradient, deterministic. `step` is the size of the first simplex on each axis.
 * Restarted once from its own result, which keeps a collapsed simplex from stopping short.
 */
export function nelderMead(f: (x: number[]) => number, x0: number[], step: number[], iterations = 2000, tolerance = 1e-12): { x: number[]; value: number } {
  const run = (start: number[]) => {
    const n = start.length;
    let simplex = [start, ...start.map((_, i) => start.map((v, k) => (k === i ? v + step[i] : v)))].map((x) => ({ x, v: f(x) }));
    for (let it = 0; it < iterations; it++) {
      simplex.sort((a, b) => a.v - b.v);
      if (Math.abs(simplex[n].v - simplex[0].v) <= tolerance * (Math.abs(simplex[0].v) + tolerance)) break;
      const centroid = start.map((_, k) => simplex.slice(0, n).reduce((s, p) => s + p.x[k], 0) / n);
      const along = (t: number) => centroid.map((c, k) => c + t * (simplex[n].x[k] - c));
      const r = along(-1);
      const fr = f(r);
      if (fr < simplex[0].v) {
        const e = along(-2);
        const fe = f(e);
        simplex[n] = fe < fr ? { x: e, v: fe } : { x: r, v: fr };
      } else if (fr < simplex[n - 1].v) {
        simplex[n] = { x: r, v: fr };
      } else {
        const c = fr < simplex[n].v ? along(-0.5) : along(0.5);
        const fc = f(c);
        if (fc < Math.min(fr, simplex[n].v)) simplex[n] = { x: c, v: fc };
        else simplex = simplex.map((p, i) => (i === 0 ? p : { x: p.x.map((v, k) => simplex[0].x[k] + 0.5 * (v - simplex[0].x[k])), v: 0 })).map((p, i) => (i === 0 ? p : { x: p.x, v: f(p.x) }));
      }
    }
    simplex.sort((a, b) => a.v - b.v);
    return { x: simplex[0].x, value: simplex[0].v };
  };
  const first = run(x0);
  const second = run(first.x);
  return second.value <= first.value ? second : first;
}

/** Student's t of `df` degrees of freedom for a two-sided 95 % interval (tables; past 30 the normal 1.96). */
export function t975(df: number): number {
  const table = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
  return df < 1 ? Number.NaN : df <= 30 ? table[df - 1] : 1.96;
}

/**
 * The jackknife of a statistic of a sample (Quenouille 1949; Tukey 1958): the statistic again with each
 * point left out in turn, its standard error √((n−1)/n · Σ(θᵢ − θ̄)²), and a 95 % interval of ± Student's
 * t of n−1 degrees around the statistic of the whole sample. Null under 3 points, or when the statistic
 * has no value for the whole or for a sample left one short.
 */
export function jackknife<T>(sample: T[], statistic: (s: T[]) => number | null): { value: number; se: number; low: number; high: number } | null {
  return jackknifeMany(sample, (s) => [statistic(s)])[0];
}

/**
 * The jackknife of several statistics of one fit at once (as jackknife): the fit is made once for the
 * whole sample and once for each point left out, and every statistic read from it. Each is null where it
 * has no value for the whole or for a sample left one short.
 */
export function jackknifeMany<T>(sample: T[], statistics: (s: T[]) => (number | null)[]): ({ value: number; se: number; low: number; high: number } | null)[] {
  const n = sample.length;
  const whole = statistics(sample);
  if (n < 3) return whole.map(() => null);
  const left = Array.from({ length: n }, (_, i) => statistics(sample.filter((_, k) => k !== i)));
  return whole.map((value, j) => {
    if (value === null || !Number.isFinite(value)) return null;
    const vs = left.map((l) => l[j] ?? null);
    if (vs.some((v) => v === null || !Number.isFinite(v))) return null;
    const m = (vs as number[]).reduce((s, v) => s + v, 0) / n;
    const se = Math.sqrt(((n - 1) / n) * (vs as number[]).reduce((s, v) => s + (v - m) ** 2, 0));
    const half = t975(n - 1) * se;
    return { value, se, low: value - half, high: value + half };
  });
}

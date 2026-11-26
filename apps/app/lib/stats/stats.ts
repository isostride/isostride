/** Own statistics (ADR "Own statistics module"): means, linear regression, intervals by Student's t, the jackknife. */

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

/** A small seeded generator (mulberry32): the same numbers for the same seed, for the tests' random splits. */
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
  // Past the table by the quantile's expansion in 1/df (2.04 at 31, 2.00 at 60, 1.98 at 120), not the normal's 1.96 at once.
  return df < 1 ? Number.NaN : df <= 30 ? table[Math.floor(df) - 1] : 1.96 + 2.4 / df;
}

/**
 * The effect of x on y beside a covariate z, all three fitted together (y = a + effect · x + covariate · z,
 * least squares): the effect, its standard error and the degrees of freedom left (n − 3), the covariate's
 * slope, and the standard deviation of the points about the fit. With x a group (0 or 1) it is the
 * analysis of covariance, the groups' difference at one value of z; with x a time, a trend at one z.
 * The standard error is the whole of it: Var(effect) = s² · Szz / (Sxx · Szz − Sxz²), which holds what
 * estimating the covariate's slope from the same points costs. Correcting the values by that slope and
 * then reading them as plain measurements left it out (the review of 26 Nov 2026: with no change at all,
 * a trend over runs whose pace drifted read "change" in 3 series of 10, a comparison of groups two
 * spreads apart in pace in 2 of 10, for the 1 in 20 the interval names). Null under 4 points, or when x
 * and z cannot be told apart.
 */
export function fitWithCovariate(y: number[], x: number[], z: number[]): { effect: number; covariate: number; se: number; df: number; residual: number } | null {
  const n = y.length;
  if (n < 4) return null;
  const [mx, mz, my] = [mean(x), mean(z), mean(y)];
  let sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const [dx, dz, dy] = [x[i] - mx, z[i] - mz, y[i] - my];
    sxx += dx * dx; szz += dz * dz; sxz += dx * dz; sxy += dx * dy; szy += dz * dy; syy += dy * dy;
  }
  const det = sxx * szz - sxz * sxz;
  if (!(sxx > 0 && szz > 0) || det <= 1e-9 * sxx * szz) return null;
  const effect = (sxy * szz - szy * sxz) / det;
  const covariate = (szy * sxx - sxy * sxz) / det;
  const residual = Math.sqrt(Math.max(0, syy - effect * sxy - covariate * szy) / (n - 3));
  return { effect, covariate, se: residual * Math.sqrt(szz / det), df: n - 3, residual };
}

/** The median: the middle value, or the mean of the two middle ones of an even count; null of none. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Welch's interval of mean(b) − mean(a) for two samples of unequal spread (Welch 1947): the difference,
 * its standard error, the degrees of freedom of Welch–Satterthwaite, and the 95 % interval by Student's t
 * of them (rounded down). Null under two values on a side. The percentile bootstrap it replaces is too
 * narrow for the few runs a comparison has: at 4 a side it covered zero 85 % of the time for 95 %.
 */
export function welch(a: number[], b: number[]): { difference: number; se: number; df: number; ci: [number, number] } | null {
  if (a.length < 2 || b.length < 2) return null;
  const [va, vb] = [sd(a) ** 2 / a.length, sd(b) ** 2 / b.length];
  const difference = mean(b) - mean(a);
  const se = Math.sqrt(va + vb);
  if (se === 0) return { difference, se: 0, df: a.length + b.length - 2, ci: [difference, difference] };
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const half = t975(Math.max(1, Math.floor(df))) * se;
  return { difference, se, df, ci: [difference - half, difference + half] };
}

/**
 * The least-squares line through points with the 95 % interval of its slope: slope ± Student's t of n − 2
 * degrees times its standard error, and the standard deviation of the points about the line (n − 2).
 * Null under three points or with one x.
 */
export function lineWithInterval(xs: number[], ys: number[]): { slope: number; intercept: number; ci: [number, number]; residual: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (!(sxx > 0)) return null;
  const f = linearFit(xs, ys);
  const sse = xs.reduce((s, x, k) => s + (ys[k] - (f.intercept + f.slope * x)) ** 2, 0);
  const residual = Math.sqrt(sse / (n - 2));
  const half = t975(n - 2) * (residual / Math.sqrt(sxx));
  return { slope: f.slope, intercept: f.intercept, ci: [f.slope - half, f.slope + half], residual };
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
 * has no value for the whole or for a sample left one short. `positive`: the statistics cannot be
 * negative, and each that is above zero for every sample is ranged by its logarithm.
 */
export function jackknifeMany<T>(sample: T[], statistics: (s: T[]) => (number | null)[], positive = false): ({ value: number; se: number; low: number; high: number } | null)[] {
  const n = sample.length;
  const whole = statistics(sample);
  if (n < 3) return whole.map(() => null);
  const left = Array.from({ length: n }, (_, i) => statistics(sample.filter((_, k) => k !== i)));
  return whole.map((value, j) => {
    if (value === null || !Number.isFinite(value)) return null;
    const vs = left.map((l) => l[j] ?? null);
    if (vs.some((v) => v === null || !Number.isFinite(v))) return null;
    // A quantity that cannot be negative (a speed, a reserve, a time), by its logarithm: the range is then a
    // share each way and stays above zero (a D′ of 150 m read "−39 to 339 m").
    const log = positive && value > 0 && (vs as number[]).every((v) => v > 0);
    const xs = log ? (vs as number[]).map(Math.log) : (vs as number[]);
    const m = xs.reduce((s, v) => s + v, 0) / n;
    const spread = Math.sqrt(((n - 1) / n) * xs.reduce((s, v) => s + (v - m) ** 2, 0));
    const half = t975(n - 1) * spread;
    return log ? { value, se: value * spread, low: value * Math.exp(-half), high: value * Math.exp(half) } : { value, se: spread, low: value - half, high: value + half };
  });
}

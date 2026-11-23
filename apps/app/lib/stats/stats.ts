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

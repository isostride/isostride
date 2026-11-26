import { describe, expect, it } from 'vitest';
import { CURVE_DURATIONS, OMPD_TCPMAX, PT_TMAP, curveOfWhole, fitWholeCurve, ompdRate, ptRate, wholeValue } from '@/lib/curve';
import { nelderMead } from '@/lib/stats';

describe('Whole curve', () => {
  it('Simplex finds a minimum', () => {
    // Rosenbrock's valley: the minimum at (1, 1).
    const r = nelderMead(([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2, [-1.2, 1], [0.5, 0.5], 5000);
    expect(r.x[0]).toBeCloseTo(1, 3);
    expect(r.x[1]).toBeCloseTo(1, 3);
  });

  it('Péronnet–Thibault fitted to the bests of pace', () => {
    // A runner of MAS 5 m/s (3:20 /km) held 7 minutes, an anaerobic reserve of 150 m, a decline of 0.25 m/s per unit of ln t.
    const truth = { mas: 5, s: 150, a: 0.25 };
    const pts = CURVE_DURATIONS.map((d) => ({ duration: d, value: 1000 / ptRate(truth, d) }));
    // Up to TMAP the speed falls (the reserve spent), past it the decline: slower at 2 h than at 20 min.
    expect(ptRate(truth, 60)).toBeGreaterThan(ptRate(truth, PT_TMAP));
    expect(ptRate(truth, 7200)).toBeLessThan(ptRate(truth, 1200));
    const c = fitWholeCurve(pts, 'speed')!;
    expect(c.model).toBe('pt');
    expect(c.params.mas).toBeCloseTo(5, 2);
    expect(c.params.s).toBeCloseTo(150, 0);
    expect(c.params.a).toBeCloseTo(0.25, 3);
    expect(c.error).toBeLessThan(1e-4);
    expect(c.range).toEqual([30, 7200]);
    for (const p of pts) expect(wholeValue(c, p.duration)).toBeCloseTo(p.value, 1);
    // Not a line on the log axis: from 30 s to 2 min the pace changes more than from 30 min to 2 h.
    expect(wholeValue(c, 120) - wholeValue(c, 30)).toBeGreaterThan(wholeValue(c, 7200) - wholeValue(c, 1800));
  });

  it('Omni-domain model fitted to the bests of power', () => {
    // CP 300 W, W′ 20 kJ, a sprint of 900 W, 15 W less per unit of ln t past 30 minutes.
    const truth = { cp: 300, wp: 20000, pmax: 900, a: 15 };
    const pts = CURVE_DURATIONS.map((d) => ({ duration: d, value: ompdRate(truth, d) }));
    const c = fitWholeCurve(pts, 'power')!;
    expect(c.model).toBe('ompd');
    expect(c.decline).toBe(true);
    expect(c.params.cp).toBeCloseTo(300, 0);
    expect(c.params.wp / 1000).toBeCloseTo(20, 1);
    expect(c.params.pmax).toBeCloseTo(900, -1);
    expect(c.params.a).toBeCloseTo(15, 0);
    // Without a best past TCPmax the decline is Riegel's: 6 % of the critical power per unit of ln t.
    const short = fitWholeCurve(pts.filter((p) => p.duration <= OMPD_TCPMAX), 'power')!;
    expect(short.decline).toBe(false);
    expect(short.params.a).toBeCloseTo(0.06 * short.params.cp, 9);
    expect(short.params.cp).toBeCloseTo(300, 0);
  });

  it('Too few bests, or none short or long enough: no whole curve', () => {
    const pts = CURVE_DURATIONS.map((d) => ({ duration: d, value: 1000 / ptRate({ mas: 5, s: 150, a: 0.25 }, d) }));
    expect(fitWholeCurve(pts.slice(0, 3), 'speed')).toBeNull();
    expect(fitWholeCurve(pts.filter((p) => p.duration >= 300), 'speed')).toBeNull();
    expect(fitWholeCurve(pts.filter((p) => p.duration <= 300), 'speed')).toBeNull();
    // Drawn over its bests, and past the longest as an extrapolation up to two hours.
    const c = fitWholeCurve(pts.filter((p) => p.duration <= 1800), 'speed')!;
    const drawn = curveOfWhole(c);
    expect(drawn.estimate[drawn.estimate.length - 1].duration).toBeCloseTo(1800, 6);
    expect(drawn.extrapolate[drawn.extrapolate.length - 1].duration).toBeCloseTo(7200, 6);
  });
});

describe('Curve model chosen', () => {
  it('Predicted times of the whole curve', async () => {
    const { wholePredictions } = await import('@/lib/curve');
    const truth = { mas: 5, s: 150, a: 0.25 };
    const c = fitWholeCurve(CURVE_DURATIONS.map((d) => ({ duration: d, value: 1000 / ptRate(truth, d) })), 'speed')!;
    const p = wholePredictions(c);
    expect(p.map((x) => x.distance)).toEqual([5000, 10000, 21097.5, 42195]);
    // Each time is the one at which the distance held reaches the race: v(T) · T = d.
    for (const x of p) expect(ptRate(truth, x.seconds) * x.seconds).toBeCloseTo(x.distance, -1);
    // Longer races, slower paces.
    for (let i = 1; i < p.length; i++) expect(p[i].distance / p[i].seconds).toBeLessThan(p[i - 1].distance / p[i - 1].seconds);
    expect(wholePredictions(null)).toEqual([]);
  });

  it('Chosen in the settings, Riegel by default', async () => {
    const { parsePerformance, DEFAULT_PERFORMANCE } = await import('@/lib/settings');
    expect(DEFAULT_PERFORMANCE.curve).toBe('riegel');
    expect(parsePerformance({ curve: 'whole' }).curve).toBe('whole');
    expect(parsePerformance({ curve: 'other' }).curve).toBe('riegel');
    expect(parsePerformance({}).curve).toBe('riegel');
  });

  it('What if predicts by the model chosen, as Capacity does', async () => {
    const { curveWhatIf } = await import('@/lib/load');
    const { wholePredictions } = await import('@/lib/curve');
    const truth = { mas: 5, s: 150, a: 0.25 };
    const bests = CURVE_DURATIONS.filter((d) => d <= 3600).map((d) => ({ duration: d, speed: ptRate(truth, d) }));
    const riegel = curveWhatIf(bests, []);
    const whole = curveWhatIf(bests, [], new Map(), 'whole');
    // Riegel's law from 3–20 minutes; the whole curve from every length.
    expect(riegel.now.predictions).toEqual(riegel.now.estimate!.predictions);
    expect(whole.now.predictions).toEqual(wholePredictions(fitWholeCurve(bests.map((b) => ({ duration: b.duration, value: 1000 / b.speed })), 'speed')));
    expect(whole.now.predictions[3].seconds).not.toBeCloseTo(riegel.now.predictions[3].seconds, -1);
    // Critical speed is the same whichever model is chosen.
    expect(whole.now.estimate!.critical).toEqual(riegel.now.estimate!.critical);
  });
});

describe('Whole curve as an envelope', () => {
  it('No best above it; easy long runs do not pull it down', () => {
    // A runner of MAS 5 m/s, S 150 m, a = 0.25: the bests up to 30 minutes all-out, a little noisy;
    // those of 45 minutes to 2 hours from easy long runs, 20 % slower than the runner can do.
    const truth = { mas: 5, s: 150, a: 0.25 };
    const noise = [1, 0.99, 1.005, 0.995, 1, 0.99, 1.004, 0.997, 1];
    const pts = CURVE_DURATIONS.map((d, i) => ({ duration: d, value: 1000 / (ptRate(truth, d) * (d > 1800 ? 0.8 : noise[i] ?? 1)) }));
    const c = fitWholeCurve(pts, 'speed')!;
    // No best is faster than the curve by more than 0.1 %, and it rests on at least one of them.
    for (const p of pts) expect(wholeValue(c, p.duration)).toBeLessThanOrEqual(p.value * 1.001);
    expect(pts.some((p) => Math.abs(wholeValue(c, p.duration) / p.value - 1) < 1e-3)).toBe(true);
    // The hard 20 and 30 minutes stay on it, within 1 %: the easy long runs lie below it, far.
    for (const d of [1200, 1800]) expect(Math.abs(1000 / wholeValue(c, d) / ptRate(truth, d) - 1)).toBeLessThan(0.01);
    for (const d of [3600, 7200]) expect(wholeValue(c, d)).toBeLessThan(pts.find((p) => p.duration === d)!.value * 0.9);
    // Power the same way.
    const power = CURVE_DURATIONS.map((d, i) => ({ duration: d, value: ompdRate({ cp: 300, wp: 20000, pmax: 900, a: 15 }, d) * (d > 1800 ? 0.8 : noise[i] ?? 1) }));
    const w = fitWholeCurve(power, 'power')!;
    for (const p of power) expect(wholeValue(w, p.duration)).toBeGreaterThanOrEqual(p.value * 0.999);
  });

  it('Riegel and critical speed: no value under 2 minutes', async () => {
    const { curveOfEstimate, estimateCurve } = await import('@/lib/curve');
    const e = estimateCurve([120, 180, 300, 600, 900, 1200].map((d) => ({ duration: d, value: 1000 / (4 + 200 / d) })))!;
    const c = curveOfEstimate(e);
    expect(Number.isNaN(c.at(60))).toBe(true);
    expect(Number.isFinite(c.at(120))).toBe(true);
  });
});

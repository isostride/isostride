import { describe, expect, it } from 'vitest';
import { formSeries, loadWhatIf, markerRanges, relativeSe, reserveBalance, responseWhatIf, type LoadSummary } from '@/lib/load';
import { jackknife, t975 } from '@/lib/stats';

const summary = (bests: LoadSummary['bests']): LoadSummary => ({ duration: 3600, hrFrom: 0, hr: [], hrPeak: null, normSpeed: null, normPower: null, bests, moving: 3600, avgHr: null, ef: null, decoupling: null });
const day = (i: number) => { const d = new Date('2026-01-01T12:00:00'); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * The gaps the review of the models found (the runner's "a tez rzeczy poza pr?": "niepewność CS, D′ i
 * prognoz, D′ balance w trakcie biegu oraz What if na dopasowanym modelu odpowiedzi").
 */
describe('Performance models extended', () => {
  it('The range of the markers by the jackknife', () => {
    // The jackknife of a mean is its standard error: 1, 2, 3, 4, 5 → mean 3, s/√n = 0.707, ± t(4) = 2.776.
    const j = jackknife([1, 2, 3, 4, 5], (s) => s.reduce((a, b) => a + b, 0) / s.length)!;
    expect(j.value).toBe(3);
    expect(j.se).toBeCloseTo(Math.sqrt(2.5 / 5), 9);
    expect(j.high - j.value).toBeCloseTo(t975(4) * j.se, 9);
    expect(jackknife([1, 2], (s) => s[0])).toBeNull();
    // Bests that follow CS 4 m/s and D′ 200 m exactly: no best moves the fit, the range is narrow.
    const lengths = [120, 180, 300, 600, 900, 1200];
    const exact = { a: summary(lengths.map((d) => ({ duration: d, speed: 4 + 200 / d, power: 250 + 15000 / d }))) };
    const rows = [{ id: 'a', startTime: '2026-11-20T08:00:00', duration: 3600 }];
    const tight = markerRanges(rows, exact, '2026-11-25');
    expect(tight.cs!.value).toBeCloseTo(4, 3);
    expect(relativeSe(tight.cs)!).toBeLessThan(0.01);
    expect(tight.cp!.value).toBeCloseTo(250, 1);
    expect(tight.predictions.find((p) => p.distance === 5000)!.range).not.toBeNull();
    // One best of 3 minutes 8 % above the rest: left out, the fit moves, the range widens.
    const lifted = { a: summary(lengths.map((d) => ({ duration: d, speed: (4 + 200 / d) * (d === 180 ? 1.08 : 1), power: null }))) };
    const wide = markerRanges(rows, lifted, '2026-11-25');
    expect(relativeSe(wide.dPrime)!).toBeGreaterThan(relativeSe(tight.dPrime)! * 10);
    // Under 4 bests no best can be left out: no range.
    const three = { a: summary([120, 300, 1200].map((d) => ({ duration: d, speed: 4 + 200 / d, power: null }))) };
    expect(markerRanges(rows, three, '2026-11-25').cs).toBeNull();
  });

  it('D′ balance through a run', () => {
    // CS 4 m/s, D′ 200 m: 50 s at 6 m/s spends 100 m (half); 60 s standing brings back (D′ − balance)·(1 − e^(−4·60/200)).
    const t = Array.from({ length: 111 }, (_, i) => i);
    const v = t.map((i) => (i < 50 ? 6 : 0));
    const b = reserveBalance(t, v, 4, 200);
    expect(b.share[50]).toBeCloseTo(0.5, 9);
    expect(b.low).toEqual({ t: 50, share: expect.closeTo(0.5, 9) });
    expect(b.share[110] * 200).toBeCloseTo(200 - 100 * Math.exp((-4 * 60) / 200), 6);
    // Past the reserve, the balance goes under 0: the critical speed or D′ is too low for this run.
    expect(reserveBalance(t, t.map(() => 7), 4, 200).low!.share).toBeLessThan(0);
    // At the critical speed or under it, the reserve stays full.
    expect(reserveBalance(t, t.map(() => 4), 4, 200).low!.share).toBe(1);
  });

  it('What if runs the fitted response over the scenario', () => {
    // 200 days of loads and performances from a known model (as the Response tab's test), then weeks of the scenario.
    const loads = Array.from({ length: 200 }, (_, i) => (i % 7 === 6 ? 0 : 60 + 40 * Math.sin(i / 9)));
    const runs = loads.map((load, i) => ({ startTime: `${day(i)}T08:00:00`, load }));
    const p = { fitnessDays: 42, fatigueDays: 7 };
    const seed = loads.slice(0, 28).reduce((s, x) => s + x, 0) / 28;
    const sum = (i: number, tau: number) => { let s = (seed * Math.exp(-(i + 1) / tau)) / (1 - Math.exp(-1 / tau)); for (let k = 0; k < i; k++) s += loads[k] * Math.exp(-(i - k) / tau); return s; };
    const perf = Array.from({ length: 66 }, (_, k) => ({ date: day(3 * k + 2), value: 50 + 0.1 * sum(3 * k + 2, 40) - 0.25 * sum(3 * k + 2, 8) }));
    const today = day(199);
    // Weeks of nothing: the scenario is resting, so its projection is the resting one.
    const rest = responseWhatIf(loadWhatIf(runs, p, today, [0, 0]), perf)!;
    expect(rest.plan.map((x) => x.value)).toEqual(rest.resting.map((x) => x.value));
    expect(rest.r2cv).toBeGreaterThan(0.99);
    // Three weeks at 200 %: fatigue holds the performance below resting at their end; it peaks after them.
    const hard = responseWhatIf(loadWhatIf(runs, p, today, [200, 200, 200]), perf)!;
    expect(hard.end).toBeLessThan(rest.plan[20].value);
    expect(hard.peak.date > day(199 + 21)).toBe(true);
    expect(hard.today).toBeCloseTo(rest.today, 9);
    // Without performances enough for a fit: none.
    expect(responseWhatIf(loadWhatIf(runs, p, today, [100]), perf.slice(0, 5))).toBeNull();
    expect(formSeries(runs, p).length).toBe(200);
  });
});

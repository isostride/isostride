import { describe, expect, it } from 'vitest';
import { decouplingOf } from '@/lib/blocks';
import { CURVE_DURATIONS, RIEGEL_DECLINE, fitWholeCurve, ompdRate, ptRate, wholePredictions, wholeValue, type WholeCurve } from '@/lib/curve';
import {
  TAU_APART, criticalSeries, danielsVdot, effortVdots, efficiencyNow, efficiencyRuns, fitBanister, hrVo2Now, performancesFor, reserveBalance, summarizeLoad,
  type LoadSummary,
} from '@/lib/load';
import { syntheticRun } from '../support/synthetic';

const summary = (extra: Partial<LoadSummary>): LoadSummary => ({ duration: 3600, hrFrom: 0, hr: [], hrPeak: null, normSpeed: null, normPower: null, bests: [], moving: 3600, avgHr: 140, ef: 1.4, decoupling: null, ...extra });
const day = (i: number) => { const d = new Date('2026-01-01T12:00:00'); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * The second review of the models (the runner's "kolejna runda review modelu performance w isostride ....
 * co jest zle co bys jeszcze zmienil", then "zrob wszystkie", 26 Nov 2026): each fault with the behaviour
 * that replaces it.
 */
describe('Performance models reviewed again', () => {
  it('The decline of the whole curve from all-out long bests only', () => {
    // A runner of MAS 5 m/s with Riegel's own decline, all-out up to 20 minutes; the bests of 30 minutes to 2 hours
    // come from easy long runs, 12 % under what the runner can do. A free decline bent the curve down to them
    // (a marathon of 3:32 against 2:55); now they are taken for easy runs and the decline is Riegel's.
    const riegel = { mas: 5, s: 250, a: RIEGEL_DECLINE * 5 };
    const bests = (truth: { mas: number; s: number; a: number }, f: (d: number) => number) => CURVE_DURATIONS.map((duration) => ({ duration, value: 1000 / (ptRate(truth, duration) * f(duration)) }));
    const marathon = (c: WholeCurve) => wholePredictions(c).find((p) => p.distance === 42195)!.seconds;
    const truth = marathon({ model: 'pt', metric: 'speed', params: riegel, range: [30, 7200], n: 13, error: 0, far: [], decline: true });
    const easy = fitWholeCurve(bests(riegel, (d) => (d >= 1800 ? 0.88 : 1)), 'speed')!;
    expect(easy.decline).toBe(false);
    expect(easy.params.a).toBeCloseTo(RIEGEL_DECLINE * easy.params.mas, 9);
    expect(easy.params.mas).toBeCloseTo(5, 1);
    expect(easy.far).toEqual([1800, 2700, 3600, 5400, 7200]);
    expect(Math.abs(marathon(easy) / truth - 1)).toBeLessThan(0.01);
    // A runner who lasts better than Riegel's (a decline of 0.2), all-out up to 30 minutes, longer runs easy: the
    // 30-minute best lies above the curve with Riegel's decline, so the decline is the runner's own.
    const lasting = { mas: 5, s: 250, a: 0.2 };
    const own = fitWholeCurve(bests(lasting, (d) => (d > 1800 ? 0.85 : 1)), 'speed')!;
    expect(own.decline).toBe(true);
    expect(own.params.a).toBeCloseTo(0.2, 2);
    expect(own.far).toEqual([2700, 3600, 5400, 7200]);
    // One all-out half hour (a raced 10 km) among long runs at 85 % of what the runner can do: the decline is fitted,
    // to the bests that are all-out. Fitted to all of them, the curve came to rest on the easy long bests under a
    // maximal aerobic speed 6 % too high, and the marathon of 3:21 read as 4:09.
    const racer = { mas: 4.4, s: 200, a: RIEGEL_DECLINE * 4.4 };
    const raced = fitWholeCurve(bests(racer, (d) => (d > 1800 ? 0.85 : 1)), 'speed')!;
    expect(raced.decline).toBe(true);
    expect(raced.params.mas).toBeCloseTo(4.4, 1);
    expect(Math.abs(marathon(raced) / marathon({ ...raced, params: racer }) - 1)).toBeLessThan(0.03);
    // Power: easy long runs 15 % under the curve leave the decline Riegel's, 6 % of the critical power, and an
    // hour within 1 % of what the runner can hold (it read 274 W against 295).
    const power = { cp: 300, wp: 20000, pmax: 900, a: 15 };
    const watts = fitWholeCurve(CURVE_DURATIONS.map((duration) => ({ duration, value: ompdRate(power, duration) * (duration > 1800 ? 0.85 : 1) })), 'power')!;
    expect(watts.decline).toBe(false);
    expect(watts.params.a).toBeCloseTo(RIEGEL_DECLINE * watts.params.cp, 9);
    expect(Math.abs(wholeValue(watts, 3600) / ompdRate(power, 3600) - 1)).toBeLessThan(0.01);
    // All-out up to 45 minutes, an hour and more at 85 %: two hours within 3 % of what the runner can hold (236 W against 278).
    const strong = { cp: 300, wp: 20000, pmax: 900, a: RIEGEL_DECLINE * 300 };
    const held = fitWholeCurve(CURVE_DURATIONS.map((duration) => ({ duration, value: ompdRate(strong, duration) * (duration > 2700 ? 0.85 : 1) })), 'power')!;
    expect(held.decline).toBe(true);
    expect(Math.abs(wholeValue(held, 7200) / ompdRate(strong, 7200) - 1)).toBeLessThan(0.03);
  });

  it('D′ balance against the bests before the run', () => {
    // A run of 1 Oct sets a critical speed of 4 m/s with D′ 200 m. On 1 Nov a race: 10 minutes at 4.6 m/s, 360 m
    // above that critical speed.
    const bests = (speed: (d: number) => number) => [120, 180, 300, 600, 900, 1200].map((duration) => ({ duration, speed: speed(duration), power: null }));
    const rows = [{ id: 'a', startTime: '2026-10-01T08:00:00', duration: 3600 }, { id: 'race', startTime: '2026-11-01T08:00:00', duration: 3600 }];
    const summaries = { a: summary({ bests: bests((d) => 4 + 200 / d) }), race: summary({ bests: bests((d) => (d <= 600 ? 4.6 : (4.6 * 600 + 3 * (d - 600)) / d)) }) };
    const t = Array.from({ length: 1201 }, (_, i) => i);
    const speed = t.map((s) => (s < 600 ? 4.6 : 3));
    // With the race among its own bests the threshold rises to hold it: the balance ends at exactly 0 %.
    const withIt = criticalSeries(rows, summaries, 'speed').race!;
    expect(withIt.rate).toBeGreaterThan(4.3);
    expect(reserveBalance(t, speed, withIt.rate, withIt.reserve).low!.share).toBeCloseTo(0, 2);
    // Against the bests before it: 360 m spent of 200, 80 % past the reserve.
    const before = criticalSeries(rows, summaries, 'speed', true);
    expect(before.race).toEqual({ rate: expect.closeTo(4, 3), reserve: expect.closeTo(200, 0), from: 'own' });
    expect(reserveBalance(t, speed, before.race!.rate, before.race!.reserve).low).toEqual({ t: 600, share: expect.closeTo(-0.8, 2) });
    // The first run has no bests before it: it takes the first threshold after it.
    expect(before.a!.from).toBe('first');
  });

  it('Decoupling past the warm-up', () => {
    // An even hour at 3 m/s; the heart rate rises from 110 to 145 in the first 10 minutes and stays there. From
    // the start the first half averages 139 bpm against 145, a "drift" of 4 %; past the warm-up there is none.
    const run = syntheticRun(3600, (t) => ({ speed: 3, heartRate: t < 600 ? 110 + (35 * t) / 600 : 145 }));
    expect(decouplingOf(run, 0, 3600)!).toBeCloseTo(4, 0);
    expect(Math.abs(summarizeLoad(run).decoupling!)).toBeLessThan(0.2);
  });

  it('Efficiency and VO2max now, up to today', () => {
    // Easy runs up to 15 Oct, none since: on 26 Nov the last 28 days hold no run, so there is no value now; the
    // runs of the 28 days before those stand as the value before.
    const rows = [0, 1, 2, 3].map((k) => ({ id: `r${k}`, startTime: `2026-10-${12 + k}T08:00:00`, duration: 3600 }));
    const summaries = Object.fromEntries(rows.map((r) => [r.id, summary({ avgHr: 140, ef: 1.3, decoupling: 3 })]));
    const points = efficiencyRuns(rows, summaries, 190);
    expect(efficiencyNow(points).ef).toBeCloseTo(1.3, 9);
    expect(efficiencyNow(points, '2026-10-16')).toMatchObject({ ef: expect.closeTo(1.3, 9), easyRuns: 4, longRuns90: 4, decoupling: 3 });
    expect(efficiencyNow(points, '2026-11-26')).toMatchObject({ ef: null, easyRuns: 0, before: expect.closeTo(1.3, 9), longRuns90: 4 });
    const perRun = rows.map((r) => ({ startTime: r.startTime, vo2max: 52 }));
    expect(hrVo2Now(perRun)).toEqual({ value: 52, runs: 4 });
    expect(hrVo2Now(perRun, '2026-11-26')).toEqual({ value: null, runs: 0 });
    expect(hrVo2Now(perRun, '2026-11-10')).toEqual({ value: 52, runs: 2 });
  });

  it('The range of the fitted time constants', () => {
    // Loads of 200 days and performances every third day from a known model: τ1 40, τ2 8.
    const loads = Array.from({ length: 200 }, (_, i) => (i % 7 === 6 ? 0 : 60 + 40 * Math.sin(i / 9)));
    const days = loads.map((load, i) => ({ date: day(i), load }));
    const seed = loads.slice(0, 28).reduce((s, v) => s + v, 0) / 28;
    const sum = (i: number, tau: number) => { let s = (seed * Math.exp(-(i + 1) / tau)) / (1 - Math.exp(-1 / tau)); for (let k = 0; k < i; k++) s += loads[k] * Math.exp(-(i - k) / tau); return s; };
    const model = (tau1: number, tau2: number) => (i: number) => 50 + 0.1 * sum(i, tau1) - 0.25 * sum(i, tau2);
    const performances = (truth: (i: number) => number, noise: number) => {
      let state = 12345;
      const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 - 0.5; };
      return Array.from({ length: 66 }, (_, k) => ({ date: day(3 * k + 2), value: truth(3 * k + 2) + noise * random() }));
    };
    // Without noise no other pair fits as well: the range is the pair itself.
    const exact = fitBanister(days, performances(model(40, 8), 0))!;
    expect([exact.tau1, exact.tau2]).toEqual([40, 8]);
    expect(exact.tau1Range).toEqual([40, 40]);
    expect(exact.tau2Range).toEqual([8, 8]);
    // With noise other pairs fit as well: a range around the best pair, which holds the truth.
    const noisy = fitBanister(days, performances(model(40, 8), 6))!;
    expect(noisy.tau1Range[0]).toBeLessThanOrEqual(Math.min(40, noisy.tau1));
    expect(noisy.tau1Range[1]).toBeGreaterThanOrEqual(Math.max(40, noisy.tau1));
    expect(noisy.tau1Range[1] - noisy.tau1Range[0]).toBeGreaterThan(0);
    expect(noisy.tau2Range[0]).toBeLessThanOrEqual(8);
    expect(noisy.tau2Range[1]).toBeGreaterThanOrEqual(8);
    // Time constants closer than twice apart are not tried: of a truth of 20 and 15 days the fit keeps fitness
    // lasting twice as long as fatigue at least.
    const close = fitBanister(days, performances(model(20, 15), 2))!;
    expect(close.tau1).toBeGreaterThanOrEqual(TAU_APART * close.tau2);
    expect(close.tau1Range[0]).toBeGreaterThanOrEqual(TAU_APART * close.tau2Range[0]);
  });

  it('VDOT of the all-out efforts of a day', () => {
    // A maximum of 190 bpm: a best of 5 minutes or more is all-out from a mean of 88 % of it, 167 bpm.
    const best = (duration: number, speed: number, speedHr: number) => ({ duration, speed, power: null, speedHr, speedHrPeak: speedHr + 5 });
    const rows = [
      { id: 'race', startTime: '2026-11-08T09:00:00', duration: 3600 }, { id: 'jog', startTime: '2026-11-08T18:00:00', duration: 3600 },
      { id: 'easy', startTime: '2026-11-10T08:00:00', duration: 3600 }, { id: 'sprint', startTime: '2026-11-12T08:00:00', duration: 3600 },
      { id: 'later', startTime: '2026-11-20T08:00:00', duration: 3600 },
    ];
    const summaries = {
      // 20 minutes at 4.2 m/s and 5 at 4.4, both all-out: the day's VDOT is the higher of the two.
      race: summary({ bests: [best(300, 4.4, 176), best(1200, 4.2, 172)] }),
      jog: summary({ bests: [best(1200, 3, 130)] }),
      // No all-out effort: no performance that day. Nor from an all-out best under 5 minutes.
      easy: summary({ bests: [best(1200, 3.4, 150)] }),
      sprint: summary({ bests: [best(120, 5.5, 180)] }),
      later: summary({ bests: [best(600, 4.3, 175)] }),
    };
    const vdot = (seconds: number, speed: number) => Math.round(danielsVdot(speed * seconds, seconds) * 10) / 10;
    expect(effortVdots(rows, summaries, 190)).toEqual([
      { date: '2026-11-08', value: Math.max(vdot(300, 4.4), vdot(1200, 4.2)) },
      { date: '2026-11-20', value: vdot(600, 4.3) },
    ]);
    // On the day of the effort, and up to today only; none without a maximum heart rate.
    expect(performancesFor('vdot', rows, summaries, 60, 190, '2026-11-15').map((p) => p.date)).toEqual(['2026-11-08']);
    expect(effortVdots(rows, summaries, null)).toEqual([]);
  });
});

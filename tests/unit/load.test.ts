import { describe, expect, it } from 'vitest';
import { autoMaxHr, banisterTrimp, criticalByRun, dayLoads, edwardsTrimp, formSeries, normalised, runLoads, stressScore, summarizeLoad, type LoadSummary } from '@/lib/load';
import { DEFAULT_PERFORMANCE, type PerformanceSettings } from '@/lib/settings';
import { syntheticRun } from '../support/synthetic';

const HR_ZONES = [114, 133, 152, 171];
/** A summary of `minutes` at one heart rate, speed and power. */
const steady = (minutes: number, hr: number | null, extra: Partial<LoadSummary> = {}): LoadSummary => ({
  duration: minutes * 60, hrFrom: hr ?? 0, hr: hr === null ? [] : [minutes * 60], hrPeak: hr, normSpeed: null, normPower: null, bests: [],
  moving: minutes * 60, avgHr: hr, ef: null, decoupling: null, ...extra,
});
const perf = (p: Partial<PerformanceSettings>): PerformanceSettings => ({ ...DEFAULT_PERFORMANCE, ...p });

describe('Performance model', () => {
  it('Loads of the four models', () => {
    // The summary of a run: seconds at each heart rate, the peak held, the normalised speed and power.
    const run = syntheticRun(1800, (t) => ({ speed: 3, heartRate: t < 900 ? 140 : 160, power: t % 60 < 30 ? 300 : 200 }));
    const s = summarizeLoad(run);
    expect(s.hr[140 - s.hrFrom]).toBeCloseTo(900, -1);
    expect(s.hr[160 - s.hrFrom]).toBeCloseTo(900, -1);
    expect(s.hrPeak).toBe(160);
    expect(s.normSpeed).toBeCloseTo(3, 2);
    // Alternating 30 s at 300 W and 200 W: the normalised power lies above the 250 W average.
    expect(s.normPower!).toBeGreaterThan(250);
    expect(s.normPower!).toBeLessThan(300);
    expect(normalised([0, 1, 2], [null, null, null])).toBeNull();
    expect(s.bests.map((b) => b.duration)).toEqual([120, 180, 300, 600, 900, 1200]);
    expect(s.bests[0].speed).toBeCloseTo(3, 2);

    // Banister: 30 min at half the heart rate reserve (rest 60, max 180: 120 bpm), men 0.64·e^(1.92·0.5).
    expect(banisterTrimp(steady(30, 120), 60, 180, 'male')!).toBeCloseTo(30 * 0.5 * 0.64 * Math.exp(0.96), 6);
    expect(banisterTrimp(steady(30, 120), 60, 180, 'female')!).toBeCloseTo(30 * 0.5 * 0.86 * Math.exp(0.835), 6);
    expect(banisterTrimp(steady(30, null), 60, 180, 'male')).toBeNull();
    // Edwards: 30 min at 150 bpm is Z3 of the zones (114, 133, 152, 171): 90.
    expect(edwardsTrimp(steady(30, 150), HR_ZONES)).toBe(90);
    expect(edwardsTrimp(steady(30, 175), HR_ZONES)).toBe(150);
    // TSS: an hour at the threshold is 100; half an hour at 90 % of it 40.5.
    expect(stressScore(3600, 4, 4)).toBe(100);
    expect(stressScore(1800, 0.9 * 250, 250)).toBeCloseTo(40.5, 6);
    expect(stressScore(1800, 3, null)).toBeNull();

    // The model chosen gives the loads; the maximum heart rate from the runs when not set.
    const rows = [{ id: 'a', startTime: '2026-10-01T07:00:00Z', duration: 1800 }, { id: 'b', startTime: '2026-10-02T07:00:00Z', duration: 3600 }];
    const sums = { a: steady(30, 120, { hrPeak: 180 }), b: steady(60, 150, { normSpeed: 3.5, normPower: 250 }) };
    expect(autoMaxHr(Object.values(sums))).toBe(180);
    const banister = runLoads(rows, sums, perf({ load: 'trimpBanister', restHr: 60 }), HR_ZONES);
    expect(banister.a.load).toBeCloseTo(30 * 0.5 * 0.64 * Math.exp(0.96), 1);
    expect(banister.a.estimated).toBe(false);
    expect(runLoads(rows, sums, perf({ load: 'trimpEdwards' }), HR_ZONES).b.load).toBe(180);
    // rTSS against a threshold pace set by hand (4:00/km = 4.1667 m/s): an hour at 3.5 m/s.
    expect(runLoads(rows, sums, perf({ load: 'rtss', thresholdPace: 240 }), HR_ZONES).b.load).toBeCloseTo(100 * (3.5 / (1000 / 240)) ** 2, 0);
    const power = runLoads(rows, sums, perf({ load: 'powerTss', thresholdPower: 250 }), HR_ZONES);
    expect(power.b).toEqual({ load: 100, estimated: false, threshold: 250 });
    // A run without what the model needs: its duration at the median load per minute, marked estimated.
    expect(power.a.estimated).toBe(true);
    expect(power.a.load).toBeCloseTo(30 * (100 / 60), 1);
  });

  it('Critical speed and power of the 90 days', () => {
    // Bests that follow the critical power model (CP 250 W, W′ 15 kJ) in one run; a run 100 days later with weaker bests.
    const bests = (cp: number) => [120, 180, 300, 600, 900, 1200].map((d) => ({ duration: d, speed: null, power: cp + 15000 / d }));
    const rows = [
      { id: 'early', startTime: '2026-01-01T07:00:00Z', duration: 3600 },
      { id: 'late', startTime: '2026-04-11T07:00:00Z', duration: 3600 },
      { id: 'later', startTime: '2026-04-12T07:00:00Z', duration: 3600 },
    ];
    const sums: Record<string, LoadSummary> = { early: steady(60, 150, { bests: bests(250) }), late: steady(60, 150, { bests: bests(220) }), later: steady(60, 150) };
    const cp = criticalByRun(rows, sums, 'power');
    expect(cp.early).toBeCloseTo(250, 6);
    // 100 days on, the early run has left the window: the critical power of the later bests only.
    expect(cp.late).toBeCloseTo(220, 6);
    expect(cp.later).toBeCloseTo(220, 6);
    // With the threshold left to the curve, Power TSS uses it.
    const loads = runLoads(rows, { ...sums, later: { ...sums.later, normPower: 220 } }, perf({ load: 'powerTss' }), HR_ZONES);
    expect(loads.later.threshold).toBeCloseTo(220, 2);
    expect(loads.later.load).toBe(100);
  });

  it('Fitness, fatigue and form', () => {
    // 100 a day for 120 days: fitness and fatigue reach 100, form 0, the ratio 1.
    const start = new Date('2026-01-01T07:00:00');
    const daily = Array.from({ length: 120 }, (_, k) => { const d = new Date(start); d.setDate(d.getDate() + k); return { startTime: d.toISOString(), load: 100 }; });
    const s = formSeries(daily, { fitnessDays: 42, fatigueDays: 7 });
    expect(s).toHaveLength(120);
    expect(s[119].fitness).toBeGreaterThan(94);
    expect(s[119].fatigue).toBeCloseTo(100, 0);
    expect(Math.abs(s[119].form)).toBeLessThan(6);
    expect(s[119].acwr).toBeCloseTo(1, 1);
    expect(s[26].acwr).toBeNull();
    // The first day: its morning form is 0, its load lifts fatigue (τ 7) more than fitness (τ 42).
    expect(s[0].form).toBe(0);
    expect(s[0].fatigue).toBeGreaterThan(s[0].fitness);
    // A block of rest after: fatigue falls faster than fitness, so the form rises above zero.
    const rest = formSeries(daily, { fitnessDays: 42, fatigueDays: 7 }, '2026-05-15');
    const last = rest[rest.length - 1];
    expect(last.load).toBe(0);
    expect(last.form).toBeGreaterThan(10);
    // Two runs a day count as one day's load; days with no run are in the series.
    const two = formSeries([{ startTime: '2026-03-01T07:00:00', load: 40 }, { startTime: '2026-03-01T18:00:00', load: 60 }, { startTime: '2026-03-04T07:00:00', load: 10 }], { fitnessDays: 42, fatigueDays: 7 });
    expect(two.map((d) => d.load)).toEqual([100, 0, 0, 10]);
    // The context's day layer: the load of the 3 and 7 days before, and the form that morning.
    const days = dayLoads(daily.slice(0, 10), { fitnessDays: 42, fatigueDays: 7 });
    const tenth = Object.values(days)[9];
    expect(tenth.load3).toBe(300);
    expect(tenth.load7).toBe(700);
    expect(tenth.form).toBeLessThan(0);
  });
});

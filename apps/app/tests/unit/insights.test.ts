import { describe, expect, it } from 'vitest';
import { efficiencyRuns, formSeries, hrVo2Now, intensityShares, markersOverTime, seilerByWeek, summarizeLoad, trailingMean, weekOf, weeklyLoad, weeksUpTo, zonesByWeek, type LoadSummary } from '@/lib/load';
import { jackknifeMany } from '@/lib/stats';
import { syntheticRun } from '../support/synthetic';

const HR_ZONES = [114, 133, 152, 171];
const base = (extra: Partial<LoadSummary>): LoadSummary => ({ duration: 3600, hrFrom: 0, hr: [], hrPeak: null, normSpeed: null, normPower: null, bests: [], moving: 3600, avgHr: 140, ef: 1.4, decoupling: null, ...extra });
const row = (id: string, startTime: string) => ({ id, startTime, duration: 3600 });

describe('Performance markers', () => {
  it('Weekly load, monotony and strain', () => {
    // A week of 100 a day but Sunday, then one of 200 a day: monotony = mean / sd; strain = load × monotony.
    const week = (from: number, load: number) => [0, 1, 2, 3, 4, 5].map((k) => ({ startTime: `2026-11-${String(from + k).padStart(2, '0')}T07:00:00`, load }));
    const days = formSeries([...week(2, 100), ...week(9, 200)], { fitnessDays: 42, fatigueDays: 7 }, '2026-11-15');
    expect(weekOf('2026-11-08')).toBe('2026-11-02');
    const [w, second] = weeklyLoad(days);
    expect(w.start).toBe('2026-11-02');
    expect(w.load).toBe(600);
    const mean = 600 / 7;
    const sd = Math.sqrt((6 * (100 - mean) ** 2 + mean ** 2) / 7);
    expect(w.monotony).toBeCloseTo(mean / sd, 2);
    expect(w.strain).toBe(Math.round(600 * w.monotony!));
    // The averages start from the mean load of the first days (129 a day), so the first week's ramp is the
    // change of fitness within it, from the end of its first day: a few points down, not the 125 it starts from.
    expect(w.ramp).toBeLessThan(0);
    expect(w.ramp).toBeGreaterThan(-10);
    // The heavier week raises fitness: a positive ramp.
    expect(second.ramp).toBeGreaterThan(0);
    // The same load every day: no spread, no monotony.
    expect(weeklyLoad(formSeries([0, 1, 2, 3, 4, 5, 6].map((k) => ({ startTime: `2026-11-${String(2 + k).padStart(2, '0')}T07:00:00`, load: 50 })), { fitnessDays: 42, fatigueDays: 7 }))[0].monotony).toBeNull();
  });

  it('Fitness markers of 90 days', () => {
    // Bests that follow critical speed 4 m/s and D′ 200 m in a run of 1 Sep; a week with none 100 days later.
    const bests = [120, 180, 300, 600, 900, 1200].map((d) => ({ duration: d, speed: 4 + 200 / d, power: 250 + 15000 / d }));
    const rows = [row('a', '2026-09-01T07:00:00Z'), row('b', '2026-12-10T07:00:00Z')];
    const weeks = markersOverTime(rows, { a: base({ bests }), b: base({}) });
    expect(weeks[0].end).toBe('2026-09-06');
    expect(weeks[0].cs).toBeCloseTo(4, 6);
    expect(weeks[0].dPrime).toBeCloseTo(200, 3);
    expect(weeks[0].cp).toBeCloseTo(250, 6);
    expect(weeks[0].wPrime).toBeCloseTo(15000, 2);
    expect(weeks[0].predictions.map((p) => p.distance)).toEqual([5000, 10000, 21097.5, 42195]);
    // A week ending within 90 days still has the run; the last, 100 days on, has none: no markers.
    expect(weeks.find((w) => w.end === '2026-11-29')!.cs).toBeCloseTo(4, 6);
    expect(weeks[weeks.length - 1]).toMatchObject({ end: '2026-12-13', cs: null, cp: null, runs: 1 });
  });

  it('Intensity in the zones', () => {
    const hr = Array(80).fill(0);
    hr[110 - 100] = 1200; hr[120 - 100] = 1200; hr[140 - 100] = 600; hr[160 - 100] = 300; hr[175 - 100] = 300;
    const weeks = zonesByWeek([row('a', '2026-11-03T07:00:00Z')], { a: base({ hrFrom: 100, hr }) }, HR_ZONES);
    expect(weeks).toEqual([{ start: '2026-11-02', seconds: [1200, 1200, 600, 300, 300] }]);
    // Seiler's shares by the maximum (200 bpm): under 164 low, 164–174 moderate, from 174 high; 40 min low, 10
    // moderate, 10 high: 2/3, 1/6, 1/6, whatever the zones of Settings (their Z3, 133–152, is low here).
    const seiler = Array(100).fill(0);
    seiler[150 - 100] = 1200; seiler[160 - 100] = 1200; seiler[165 - 100] = 600; seiler[180 - 100] = 600;
    const sw = seilerByWeek([row('a', '2026-11-03T07:00:00Z')], { a: base({ hrFrom: 100, hr: seiler }) }, 200);
    expect(sw).toEqual([{ start: '2026-11-02', seconds: [2400, 600, 600] }]);
    const s = intensityShares(sw);
    expect(s.low).toBeCloseTo(2 / 3, 6);
    expect(s.moderate).toBeCloseTo(1 / 6, 6);
    expect(s.high).toBeCloseTo(1 / 6, 6);
    expect(intensityShares([])).toEqual({ low: 0, moderate: 0, high: 0, seconds: 0 });
    expect(seilerByWeek([row('a', '2026-11-03T07:00:00Z')], { a: base({ hrFrom: 100, hr: seiler }) }, null)).toEqual([]);
  });

  it('Efficiency and decoupling', () => {
    // A steady hour, heart rate drifting up from 140 to 150 at 3 m/s: efficiency about 1.24 m per beat; past the
    // 10 minutes of the warm-up the halves average 143.75 and 147.92 bpm, a decoupling of 1 − 143.75/147.92 = 2.8 %.
    const run = syntheticRun(3600, (t) => ({ speed: 3, heartRate: 140 + (10 * t) / 3600 }));
    const s = summarizeLoad(run);
    expect(s.moving).toBeGreaterThan(3500);
    expect(s.ef!).toBeCloseTo((3 * 60) / 145, 2);
    expect(s.decoupling!).toBeCloseTo(100 * (1 - 143.75 / 147.92), 1);
    // Easy when the mean heart rate is under 82 % of the maximum (156 of 190); decoupling only for runs of 45 min and more.
    const rows = [row('long', '2026-11-03T07:00:00Z'), row('short', '2026-11-04T07:00:00Z'), row('none', '2026-11-05T07:00:00Z')];
    const eff = efficiencyRuns(rows, { long: s, short: base({ moving: 1800, avgHr: 160, decoupling: 2 }), none: base({ ef: null }) }, 190);
    expect(eff.map((e) => [e.runId, e.easy, e.decoupling === null])).toEqual([['long', true, false], ['short', false, true]]);
    expect(efficiencyRuns([row('e', '2026-11-03T07:00:00Z')], { e: base({ avgHr: 125 }) }, 190)[0].easy).toBe(true);
    // Without a maximum heart rate no run is known to be easy.
    expect(efficiencyRuns([row('e', '2026-11-03T07:00:00Z')], { e: base({ avgHr: 125 }) }, null)[0].easy).toBe(false);
    // The trailing mean over 28 days.
    const pts = [{ startTime: '2026-10-01T07:00:00Z', v: 1 }, { startTime: '2026-10-15T07:00:00Z', v: 3 }, { startTime: '2026-11-20T07:00:00Z', v: 5 }];
    expect(trailingMean(pts, (p) => p.v, 28)).toEqual([1, 2, 5]);
  });

  it('The weeks up to today, not the last weeks that have a run', () => {
    // Twelve weeks of running in spring, a break, one run this week: "12 weeks" is this week alone.
    const spring = Array.from({ length: 12 }, (_, k) => ({ start: `2026-0${k < 4 ? 3 : k < 8 ? 4 : 5}-${String([2, 9, 16, 23, 6, 13, 20, 27, 4, 11, 18, 25][k]).padStart(2, '0')}` }));
    const weeks = [...spring, { start: '2026-11-23' }];
    expect(weeksUpTo(weeks, '2026-11-26', 12)).toEqual([{ start: '2026-11-23' }]);
    // The first of the twelve is the Monday 11 weeks before this week's; a year reaches back to spring.
    expect(weeksUpTo([{ start: '2026-09-07' }, { start: '2026-08-31' }], '2026-11-26', 12)).toEqual([{ start: '2026-09-07' }]);
    expect(weeksUpTo(weeks, '2026-11-26', 52)).toHaveLength(13);
  });

  it('The range of a value that cannot be negative stays above zero', () => {
    // A reserve that rests on one run of four: without it the fit gives 40, with it 150.
    const runs = [150, 40, 40, 40];
    const top = (s: number[]) => [Math.max(...s)];
    const [plain] = jackknifeMany(runs, top);
    const [positive] = jackknifeMany(runs, top, true);
    expect(plain!.low).toBeLessThan(0);
    expect(positive!.low).toBeGreaterThan(0);
    expect(positive!.low * positive!.high).toBeCloseTo(150 * 150, 6);
    // Two qualifying runs: the estimate lies between them (it read the higher).
    expect(hrVo2Now([{ startTime: '2026-11-20T08:00:00', vo2max: 48 }, { startTime: '2026-11-24T08:00:00', vo2max: 54 }], '2026-11-26')).toEqual({ value: 51, runs: 2 });
  });
});

import { describe, expect, it } from 'vitest';
import { efficiencyRuns, formSeries, intensityShares, markersOverTime, summarizeLoad, trailingMean, weekOf, weeklyLoad, zonesByWeek, type LoadSummary } from '@/lib/load';
import { syntheticRun } from '../support/synthetic';

const HR_ZONES = [114, 133, 152, 171];
const base = (extra: Partial<LoadSummary>): LoadSummary => ({ duration: 3600, hrFrom: 0, hr: [], hrPeak: null, normSpeed: null, normPower: null, bests: [], moving: 3600, avgHr: 140, ef: 1.4, decoupling: null, ...extra });
const row = (id: string, startTime: string) => ({ id, startTime, duration: 3600 });

describe('Performance markers', () => {
  it('Weekly load, monotony and strain', () => {
    // A week of 100 a day but Sunday: monotony = mean / sd; strain = load × monotony; fitness rises: a positive ramp.
    const days = formSeries([0, 1, 2, 3, 4, 5].map((k) => ({ startTime: `2026-11-${String(2 + k).padStart(2, '0')}T07:00:00`, load: 100 })), { fitnessDays: 42, fatigueDays: 7 }, '2026-11-08');
    expect(weekOf('2026-11-08')).toBe('2026-11-02');
    const [w] = weeklyLoad(days);
    expect(w.start).toBe('2026-11-02');
    expect(w.load).toBe(600);
    const mean = 600 / 7;
    const sd = Math.sqrt((6 * (100 - mean) ** 2 + mean ** 2) / 7);
    expect(w.monotony).toBeCloseTo(mean / sd, 2);
    expect(w.strain).toBe(Math.round(600 * w.monotony!));
    expect(w.ramp).toBeGreaterThan(0);
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
    // 40 min in Z1 and Z2, 10 in Z3, 10 in Z4 and Z5, in one week: 2/3 low, 1/6 moderate, 1/6 high.
    const hr = Array(80).fill(0);
    hr[110 - 100] = 1200; hr[120 - 100] = 1200; hr[140 - 100] = 600; hr[160 - 100] = 300; hr[175 - 100] = 300;
    const weeks = zonesByWeek([row('a', '2026-11-03T07:00:00Z')], { a: base({ hrFrom: 100, hr }) }, HR_ZONES);
    expect(weeks).toEqual([{ start: '2026-11-02', seconds: [1200, 1200, 600, 300, 300] }]);
    const s = intensityShares(weeks);
    expect(s.low).toBeCloseTo(2 / 3, 6);
    expect(s.moderate).toBeCloseTo(1 / 6, 6);
    expect(s.high).toBeCloseTo(1 / 6, 6);
    expect(intensityShares([])).toEqual({ low: 0, moderate: 0, high: 0, seconds: 0 });
  });

  it('Efficiency and decoupling', () => {
    // A steady hour, heart rate drifting up from 140 to 150 at 3 m/s: efficiency about 1.24 m per beat; the halves
    // average 142.5 and 147.5 bpm, a decoupling of 1 − 142.5/147.5 = 3.4 %.
    const run = syntheticRun(3600, (t) => ({ speed: 3, heartRate: 140 + (10 * t) / 3600 }));
    const s = summarizeLoad(run);
    expect(s.moving).toBeGreaterThan(3500);
    expect(s.ef!).toBeCloseTo((3 * 60) / 145, 2);
    expect(s.decoupling!).toBeCloseTo(100 * (1 - 142.5 / 147.5), 0);
    // Easy when the mean heart rate is below Z3; decoupling only for runs of 45 min and more.
    const rows = [row('long', '2026-11-03T07:00:00Z'), row('short', '2026-11-04T07:00:00Z'), row('none', '2026-11-05T07:00:00Z')];
    const eff = efficiencyRuns(rows, { long: s, short: base({ moving: 1800, avgHr: 160, decoupling: 2 }), none: base({ ef: null }) }, HR_ZONES);
    expect(eff.map((e) => [e.runId, e.easy, e.decoupling === null])).toEqual([['long', false, false], ['short', false, true]]);
    expect(efficiencyRuns([row('e', '2026-11-03T07:00:00Z')], { e: base({ avgHr: 125 }) }, HR_ZONES)[0].easy).toBe(true);
    // The trailing mean over 28 days.
    const pts = [{ startTime: '2026-10-01T07:00:00Z', v: 1 }, { startTime: '2026-10-15T07:00:00Z', v: 3 }, { startTime: '2026-11-20T07:00:00Z', v: 5 }];
    expect(trailingMean(pts, (p) => p.v, 28)).toEqual([1, 2, 5]);
  });
});

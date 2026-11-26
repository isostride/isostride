import { describe, expect, it } from 'vitest';
import { clearDifference, differenceNoise, effortsByRun, lapEfforts, meanOf, trendPerWeek, valueOf } from '@/lib/compare';
import { syntheticRun } from '../support/synthetic';
import { inst } from '../support/instances';

describe('Workouts compared rep by rep', () => {
  it('A segment’s efforts grouped by run', () => {
    // A 10-minute segment ("stworzylem segmenty 10 minutowe"): three efforts on 24 Nov given out of order, two on 13 Oct, one left out.
    const efforts = [
      inst('2026-11-24', { start: 2000, end: 2600, pace: 240, metrics: { power: 248 } }),
      inst('2026-11-24', { start: 800, end: 1400, pace: 245, metrics: { power: 246 } }),
      inst('2026-11-24', { start: 1500, end: 1900, pace: 250, metrics: { power: 240 } }),
      inst('2026-10-13', { start: 800, end: 1400, pace: 250, metrics: { power: 237 } }),
      inst('2026-10-13', { start: 1600, end: 2200, pace: 246, metrics: { power: 238 } }),
      { ...inst('2026-10-13', { start: 2400, end: 3000 }), status: 'rejected' as const },
    ];
    const runs = effortsByRun(efforts, ['power', 'heartRate'], valueOf);
    // The oldest run first; each run's efforts in their order, the rejected left out.
    expect(runs.map((r) => [r.runId, r.efforts.length])).toEqual([['run-2026-10-13', 2], ['run-2026-11-24', 3]]);
    expect([runs[1].durations, runs[1].metrics.power]).toEqual([[600, 400, 600], [246, 240, 248]]);
    // Each effort's pace from its time and distance (1 km each here); the run's from them together.
    expect(runs[1].pace).toEqual([600, 400, 600]);
    expect(runs[1].meanPace).toBeCloseTo(1600 / 3, 6);
  });

  it('How the figures change: a run’s mean, and the trend per week', () => {
    // A run's mean of its efforts, the missing left out ("Średnia biegu").
    expect([meanOf([246, 247, 248]), meanOf([null, 240, 250]), meanOf([null])]).toEqual([247, 245, null]);
    // The trend over the runs' means: 2 W more a week over three weeks ("Trend w czasie"); fewer than 3 runs, none.
    const at = (d: string) => `2026-11-${d}T18:00:00.000Z`;
    expect(trendPerWeek([{ at: at('03'), value: 240 }, { at: at('10'), value: 242 }, { at: at('17'), value: 244 }])!.perWeek).toBeCloseTo(2, 6);
    expect(trendPerWeek([{ at: at('03'), value: 240 }, { at: at('10'), value: null }, { at: at('17'), value: 244 }])).toBeNull();
  });

  it('A change coloured only when it is told from the noise', () => {
    // Pace, the least change 5 s/km: a second is no change, 22 s is one ("Efforts tab colouring any change").
    expect([clearDifference(-1, 5, [null]), clearDifference(-22, 5, [null]), clearDifference(0, 0, [])]).toEqual([false, true, false]);
    // A figure of the file's own, no least range known: any change, unless the noise is measured and wider.
    expect([clearDifference(0.3, 0, [null]), clearDifference(0.3, 0, [0.5])]).toEqual([true, false]);
    // Six efforts bouncing ±4 s about 240 with no drift: two of them lie up to some 20 s apart by chance, so a last
    // effort 6 s slower than the first is no fade; six rising 3 s each with a second of bounce are one.
    const order = [0, 1, 2, 3, 4, 5];
    const bouncing = differenceNoise(order, [240, 244, 236, 243, 237, 246])!;
    expect(bouncing).toBeGreaterThan(10);
    expect(clearDifference(6, 5, [bouncing])).toBe(false);
    const fading = differenceNoise(order, [240, 244, 245, 250, 251, 256])!;
    expect(clearDifference(16, 5, [fading])).toBe(true);
    // Under 4 points the noise is not measured.
    expect(differenceNoise([0, 1, 2], [240, 250, 245])).toBeNull();
    // The trend per week: coloured when its interval leaves zero out. A steady 2 s a week over 6 weeks with a second
    // of bounce is told from none; the same bounce of 15 s is not.
    const at = (k: number) => new Date(Date.UTC(2026, 8, 1 + 7 * k, 18)).toISOString();
    const weeks = (vs: number[]) => trendPerWeek(vs.map((value, k) => ({ at: at(k), value })))!;
    expect(weeks([300, 299, 296, 295, 292, 290])).toMatchObject({ clear: true });
    expect(weeks([300, 285, 311, 280, 305, 290]).clear).toBe(false);
  });

  it('A run added whole: its laps its efforts, or the whole run', () => {
    // Two laps: 5:00/km then 4:00/km, heart rate 140 then 160 ("1 ma lapy, 2-i nie ma").
    const laps = [{ start: 0, end: 600, duration: 600, distance: 2000 }, { start: 600, end: 1200, duration: 600, distance: 2500 }];
    const run = { ...syntheticRun(1200, (t) => ({ speed: t < 600 ? 1000 / 300 : 1000 / 240, heartRate: t < 600 ? 140 : 160 }), laps), id: 'r1' };
    const efforts = lapEfforts(run, '~runs', ['heartRate']);
    expect(efforts.map((e) => [e.definitionId, e.start, e.end, e.distance])).toEqual([['~runs', 0, 600, 2000], ['~runs', 600, 1200, 2500]]);
    expect(efforts.map((e) => [Math.round(valueOf(e, 'speed')!), valueOf(e, 'heartRate')])).toEqual([[300, 140], [240, 160]]);
    // No laps: one effort, the whole run.
    const whole = lapEfforts({ ...run, laps: [] }, '~runs', ['heartRate']);
    expect(whole.map((e) => [e.start, e.duration])).toEqual([[0, 1200]]);
    expect(valueOf(whole[0], 'heartRate')).toBeCloseTo(150, 1);
  });
});

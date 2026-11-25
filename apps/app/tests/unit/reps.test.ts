import { describe, expect, it } from 'vitest';
import { effortsByRun, meanOf, trendPerWeek, valueOf } from '@/lib/compare';
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
    expect(trendPerWeek([{ at: at('03'), value: 240 }, { at: at('10'), value: 242 }, { at: at('17'), value: 244 }])).toBeCloseTo(2, 6);
    expect(trendPerWeek([{ at: at('03'), value: 240 }, { at: at('10'), value: null }, { at: at('17'), value: 244 }])).toBeNull();
  });
});

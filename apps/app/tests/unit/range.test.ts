import { describe, expect, it } from 'vitest';
import { rangeStats, trendPer10Min, zoneShares } from '@/lib/blocks';
import { syntheticRun } from '../support/synthetic';

const PACE = (s: number) => 1000 / s;

describe('Statistics of a selection', () => {
  it('Statistics of a selected stretch', () => {
    // 10 minutes at 5:00 /km and 140 bpm, then 10 minutes at 4:00 /km and 160 bpm.
    const run = syntheticRun(1200, (t) => (t < 600
      ? { speed: PACE(300), heartRate: 140, cadence: 170, altitude: 100 + t / 60 }
      : { speed: PACE(240), heartRate: 160, cadence: 180, altitude: 110 - (t - 600) / 60 }));
    const second = rangeStats(run, 600, 1200);
    expect(second.seconds).toBe(600);
    expect(second.distance).toBeCloseTo(2500, 0);
    const pace = second.metrics.speed!;
    expect(pace.min).toBeCloseTo(240, 0);
    expect(pace.max).toBeCloseTo(240, 0);
    expect(pace.avg).toBeCloseTo(240, 0);
    expect(second.metrics.heartRate).toMatchObject({ min: 160, avg: 160, max: 160, trend: 0 });
    expect(second.metrics.cadence!.avg).toBe(180);
    expect(second.metrics.altitude!.max).toBeLessThanOrEqual(110);
    // A metric with no value in the run is left out.
    expect(second.metrics.power).toBeUndefined();

    // Nothing selected: the whole run; the average pace from the mean speed, 4:27 /km.
    const whole = rangeStats(run, 0, 1200);
    expect(whole.distance).toBeCloseTo(4500, -1);
    expect(Math.round(whole.metrics.speed!.avg)).toBe(267);
    expect(whole.metrics.speed!.min).toBeCloseTo(240, 0);
    expect(whole.metrics.speed!.max).toBeCloseTo(300, 0);
    expect(whole.metrics.heartRate!.avg).toBeCloseTo(150, 0);
    expect(whole.metrics.efficiency!.min).toBeLessThan(whole.metrics.efficiency!.max);

    // A stretch with only stops has no metrics.
    const stopped = syntheticRun(120, () => ({ speed: 0, heartRate: 100 }));
    expect(rangeStats(stopped, 0, 120).metrics).toEqual({});
  });
});

describe('Trend of a selection', () => {
  it('Trend and decoupling of a stretch', () => {
    // 20 minutes at a steady 5:00 /km, the heart rate rising evenly from 140 to 160 bpm.
    const run = syntheticRun(1200, (t) => ({ speed: PACE(300), heartRate: 140 + (20 * t) / 1200 }));
    const s = rangeStats(run, 0, 1200);
    expect(s.metrics.heartRate!.trend).toBeCloseTo(10, 0);
    expect(Math.abs(s.metrics.speed!.trend!)).toBeLessThan(0.5);
    // The second half at 155 bpm against the first at 145: the pace decoupled from the heart rate by about 6.5 %.
    expect(s.decoupling).toBeCloseTo(6.5, 0);
    // The min and the max with where they occur: near the start and near the end.
    expect(s.metrics.heartRate!.minAt).toBeLessThan(30);
    expect(s.metrics.heartRate!.maxAt).toBeGreaterThan(1170);
    // Under a minute: no trend; no heart rate: no decoupling.
    expect(rangeStats(run, 100, 150).metrics.heartRate!.trend).toBeNull();
    expect(rangeStats(syntheticRun(600, () => ({ speed: PACE(300) })), 0, 600).decoupling).toBeNull();
    expect(trendPer10Min([0], [1])).toBeNull();
  });
});

describe('Selection at a glance', () => {
  it('Figures and zones of a range', () => {
    // 10 min at 140 bpm climbing 10 m, a 1 min stop, 10 min at 160 bpm descending 10 m; zones at 150 bpm.
    const run = syntheticRun(1260, (t) => (t < 600 ? { speed: PACE(300), heartRate: 140, altitude: 100 + t / 60 }
      : t < 660 ? { speed: 0, heartRate: 120, altitude: 110 }
        : { speed: PACE(240), heartRate: 160, altitude: 110 - (t - 660) / 60 }));
    const s = rangeStats(run, 0, 1260);
    expect(s.seconds).toBe(1260);
    expect(Math.abs(s.moving - 1200)).toBeLessThanOrEqual(20);
    expect(s.ascent!).toBeCloseTo(10, -1);
    expect(s.descent!).toBeCloseTo(10, -1);
    const shares = zoneShares(run, 'heartRate', 2, (v) => (v >= 150 ? 1 : 0), 0, 1260)!;
    expect(shares[0]).toBeCloseTo(0.5, 1);
    expect(shares[0] + shares[1]).toBeCloseTo(1);
    expect(zoneShares(run, 'power', 2, () => 0, 0, 1260)).toBeNull();
    expect(rangeStats(syntheticRun(60, () => ({ speed: PACE(300) })), 0, 60).ascent).toBeNull();
  });
});

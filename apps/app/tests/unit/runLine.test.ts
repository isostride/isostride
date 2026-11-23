import { describe, expect, it } from 'vitest';
import { forDrawing, secondsOf, withSecondExtremes } from '@/app/run/metrics';
import { thinPoints } from '@/components/charts';
import { syntheticRun } from '../support/synthetic';

describe('Run line drawn to its ends', () => {
  it('Line kept beside the first and last window', () => {
    const v = [null, 300, 200, 200, 200, 200, 200, null];
    const stopped = [true, false, false, false, false, false, false, true];
    // The recording starting and ending: the windows beside them drawn.
    expect(forDrawing(v, stopped)).toEqual([null, 300, 200, 200, 200, 200, 200, null]);
    // A stop inside the run: the windows on either side of it left out (slowing down, speeding up).
    const inside = [false, false, false, true, false, false, false, false];
    expect(forDrawing([200, 200, 200, null, 200, 200, 200, 200], inside)).toEqual([200, 200, null, null, null, 200, 200, 200]);
    // Standing at the end for more than one window: the window before the standing left out.
    const standing = [false, false, false, false, false, true, true, true];
    expect(forDrawing([200, 200, 200, 200, 200, 0.1, 0.1, null], standing)).toEqual([200, 200, 200, 200, null, null, null, null]);
  });

  it('Run drawn second by second', () => {
    // 5 m/s (3:20 /km) with no speed in the first 3 s and the last second, standing from 100 to 119 s.
    const run = syntheticRun(240, (t) => ({ speed: t < 3 || t === 239 ? null : t >= 100 && t < 120 ? 0 : 5 + (t % 2) * 0.1, heartRate: 150 + (t % 3) }));
    // A pause without samples from 150 to 169 s.
    const keep = run.samples.t.map((t) => t < 150 || t >= 170);
    const pick = <T,>(a: T[]) => a.filter((_, i) => keep[i]);
    run.samples = { t: pick(run.samples.t), distance: pick(run.samples.distance), lat: pick(run.samples.lat), lon: pick(run.samples.lon), values: Object.fromEntries(Object.entries(run.samples.values).map(([k, v]) => [k, pick(v ?? [])])) };
    const { x, series } = secondsOf(run);
    const pace = (t: number) => series.speed[x.indexOf(t)];
    // Every second, its own value: no means of 10 s.
    expect(pace(10)).toBe(200);
    expect(pace(11)).toBeCloseTo(1000 / 5.1, 6);
    // The seconds without a value are no stop: the seconds beside them drawn, to the end of the run.
    expect([pace(2), pace(3), pace(238), pace(239)]).toEqual([null, expect.any(Number), expect.any(Number), null]);
    // Standing: nothing then, nor within 5 s of it; heart rate too.
    expect([pace(94), pace(95), pace(124), pace(125)].map((v) => v !== null)).toEqual([true, false, false, true]);
    expect(series.heartRate[x.indexOf(110)]).toBeNull();
    // A pause: a break in the line, 5 s left out on either side.
    expect(x.filter((t) => t > 149 && t < 170)).toEqual([150]);
    expect(pace(150)).toBeNull();
    expect([pace(144), pace(145), pace(174), pace(175)].map((v) => v !== null)).toEqual([true, false, false, true]);
    // Efficiency: from the minute's means of speed and heart rate.
    expect(series.efficiency[x.indexOf(60)]).toBeCloseTo((5.05 * 60) / 151, 1);
    // The lowest and highest of a range second by second, where they are.
    const stats = withSecondExtremes({ speed: { min: 0, max: 0, minAt: 0, maxAt: 0, avg: 198 } }, x, series, 0, 100);
    expect(stats.speed).toEqual({ min: 1000 / 5.1, max: 200, minAt: 3, maxAt: 4, avg: 198 });
  });

  it('Line thinned to its pixels', () => {
    // 1000 points over 100 px, a peak at one of them: two points a pixel, the peak kept; a break kept.
    const pts: ([number, number] | null)[] = Array.from({ length: 1000 }, (_, i) => (i === 500 ? null : [i / 10, i === 333 ? 90 : 50]));
    const thin = thinPoints(pts);
    expect(thin.length).toBeLessThanOrEqual(2 * 101 + 1);
    expect(thin.some((p) => p && p[1] === 90)).toBe(true);
    expect(thin.filter((p) => p === null)).toHaveLength(1);
    // Few points: as they are.
    const few: [number, number][] = [[0, 1], [50, 2], [100, 3]];
    expect(thinPoints(few)).toBe(few);
  });
});

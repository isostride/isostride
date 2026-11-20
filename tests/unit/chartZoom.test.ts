import { describe, expect, it } from 'vitest';
import { MIN_SPAN, clampDomain, distanceMap, kmLabel, kmTicks, panDomain, spanTicks, rollingMean, smoothSpan, stepTicks, wheelFactor, zoomDomain } from '@/components/chartZoom';

const RUN = 3600;

describe('Zoom of the run chart', () => {
  it('Zoom steps kept inside the run', () => {
    // In by 2 around the middle, then out by 2: back where it was.
    const half = zoomDomain([0, RUN], 0.5, 1800, RUN);
    expect(half).toEqual([900, 2700]);
    expect(zoomDomain(half, 2, 1800, RUN)).toEqual([0, RUN]);
    // The time under the pointer keeps its place: a quarter in, it stays a quarter in.
    const at = zoomDomain([0, 2000], 0.5, 500, RUN);
    expect(at).toEqual([250, 1250]);
    expect((500 - at[0]) / (at[1] - at[0])).toBeCloseTo(0.25);
    // Never narrower than two windows (20 s), never past the run's ends.
    expect(zoomDomain([100, 130], 0.5, 115, RUN)).toEqual([105, 105 + MIN_SPAN]);
    expect(zoomDomain([3000, 3600], 4, 3500, RUN)).toEqual([1200, 3600]);
    expect(zoomDomain([0, RUN], 2, 0, RUN)).toEqual([0, RUN]);
    expect(zoomDomain([5, 5], 2, 5, RUN)).toEqual([0, MIN_SPAN]);
    // Moving stops at either end, the range kept.
    expect(panDomain([900, 2700], 600, RUN)).toEqual([1500, 3300]);
    expect(panDomain([900, 2700], 5000, RUN)).toEqual([1800, 3600]);
    expect(panDomain([900, 2700], -5000, RUN)).toEqual([0, 1800]);
    // A run shorter than the least range is shown whole.
    expect(clampDomain([10, 12], 15)).toEqual([0, 15]);
  });

  it('Round ticks of time and pace', () => {
    // The time axis: every 10 minutes over an hour, every 10 s over a minute, inside the range.
    expect(spanTicks(0, 3600)).toEqual([0, 600, 1200, 1800, 2400, 3000, 3600]);
    expect(spanTicks(905, 965)).toEqual([910, 920, 930, 940, 950, 960]);
    expect(spanTicks(0, 30000)).toEqual(Array.from({ length: 9 }, (_, i) => i * 3600));
    // A pace scale at round seconds of a clock: 4:00, 4:30, 5:00, not 3:20, 6:40.
    const PACE = [5, 10, 15, 30, 60, 120, 300];
    expect(stepTicks(230, 310, PACE)).toEqual([240, 270, 300]);
    expect(stepTicks(200, 800, PACE)).toEqual([300, 600]);
    expect(stepTicks(0, 100000, PACE)).toHaveLength(334);
  });
});

describe('Time or distance on the x axis', () => {
  it('Time and distance mapped', () => {
    // 10 min at 5:00 /km, a 2 min stop, 10 min at 4:00 /km: 1 Hz samples.
    const t: number[] = [];
    const d: (number | null)[] = [];
    let dist = 0;
    for (let s = 0; s <= 1320; s++) {
      t.push(s);
      d.push(s === 700 ? null : dist);
      dist += s < 600 ? 1000 / 300 : s < 720 ? 0 : 1000 / 240;
    }
    const map = distanceMap(t, d);
    expect(map.toDist(300)).toBeCloseTo(1000, 0);
    expect(map.toDist(650)).toBeCloseTo(2000, 0);
    expect(map.toDist(719)).toBeCloseTo(2000, 0);
    expect(map.toTime(2000)).toBeCloseTo(600, 0);
    expect(map.toTime(3250)).toBeCloseTo(1020, 0);
    expect(map.toTime(-5)).toBe(0);
    expect(map.max).toBeCloseTo(4500, -1);
    expect(map.toTime(9999)).toBe(1320);
    expect(map.toDist(5000)).toBe(map.max);
    expect(kmTicks(0, 4500)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(kmTicks(1900, 2600)).toEqual([2000, 2200, 2400, 2600]);
    expect(kmLabel(2250)).toBe('2.25 km');
    expect(kmLabel(3000)).toBe('3 km');
    const empty = distanceMap([], []);
    expect([empty.toDist(5), empty.toTime(5), empty.max]).toEqual([0, 0, 0]);
  });
});

describe('Zoom of the run chart', () => {
  it('Wheel zooms on every mouse', () => {
    // A notch of 100 px (Windows) halves or doubles the range; one of 4 px (macOS) zooms by about 15 %.
    expect(wheelFactor(100)).toBeCloseTo(2);
    expect(wheelFactor(-100)).toBeCloseTo(0.5);
    expect(wheelFactor(4)).toBeGreaterThan(1.12);
    expect(wheelFactor(-4)).toBeLessThan(0.89);
    // Lines (Firefox) and pages are turned into pixels; a huge spin is capped at 4 times.
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(99));
    expect(wheelFactor(1, 2)).toBeCloseTo(4);
    expect(wheelFactor(0)).toBe(1);
  });
});

describe('Smoothing that follows the zoom', () => {
  it('Rolling mean of a line', () => {
    // 10 s windows alternating 140 and 160 bpm, a stop of 3 windows in the middle.
    const x = Array.from({ length: 30 }, (_, i) => i * 10 + 5);
    const y: (number | null)[] = x.map((_, i) => (i >= 14 && i < 17 ? null : i % 2 ? 160 : 140));
    const smooth = rollingMean(x, y, 60);
    // Over a minute the alternation evens out to about 150; the stop stays a break.
    for (const i of [4, 8, 22, 26]) expect(Math.abs(smooth[i]! - 150)).toBeLessThanOrEqual(3.5);
    expect(smooth.slice(14, 17)).toEqual([null, null, null]);
    // The span follows the range shown: 1/30 of it, 10 s (no smoothing) to 2 min.
    expect(smoothSpan(1800)).toBe(60);
    expect(smoothSpan(300)).toBe(10);
    expect(smoothSpan(36000)).toBe(120);
    expect(rollingMean(x, y, 10)).toBe(y);
    expect(rollingMean([], [], 60)).toEqual([]);
  });
});

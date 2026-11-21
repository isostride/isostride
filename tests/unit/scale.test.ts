import { describe, expect, it } from 'vitest';
import { columnPath, coverTicks, ensureSpan, niceTicks, tickDecimals } from '@/components/chartKit';

describe('Chart scales', () => {
  it('A small difference stays small', () => {
    // 1.46 against 1.47 m per beat: the axis shows at least 0.1, so the two sit close together.
    const [lo, hi] = ensureSpan(1.46, 1.47, 0.1);
    expect(hi - lo).toBeCloseTo(0.1, 9);
    expect((lo + hi) / 2).toBeCloseTo(1.465, 9);
    // A wide range is kept as it is.
    expect(ensureSpan(140, 160, 10)).toEqual([140, 160]);
  });

  it('Tick labels never repeat', () => {
    // Steps of 0.005 or 0.025 need 3 decimals, 0.05 two, whole steps none.
    expect(tickDecimals(niceTicks(1.46, 1.47, 3))).toBe(3);
    expect(tickDecimals([1.4, 1.425, 1.45])).toBe(3);
    expect(tickDecimals([1.4, 1.45, 1.5])).toBe(2);
    expect(tickDecimals([140, 150, 160])).toBe(0);
    const labels = niceTicks(1.41, 1.51, 4).map((t, _, all) => t.toFixed(tickDecimals(all)));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('Charts end on gridlines', () => {
    // The scale encloses the data: no line runs past the top or the bottom gridline.
    for (const [lo, hi] of [[0, 427], [3.71, 4.12], [-2.3, 5.4], [192, 241]] as const) {
      const t = coverTicks(lo, hi);
      expect(t[0]).toBeLessThanOrEqual(lo);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(hi);
    }
    // With little room wasted: 0–427 ends at 500, not 600.
    expect(coverTicks(0, 427)).toEqual([0, 100, 200, 300, 400, 500]);
    // A column stands square on its baseline, its data end rounded; below the baseline the lower end is.
    expect(columnPath(10, 20, 40, 100)).toBe('M10,100V44Q10,40 14,40H26Q30,40 30,44V100Z');
    expect(columnPath(10, 20, 140, 100)).toBe('M10,100V136Q10,140 14,140H26Q30,140 30,136V100Z');
    // A column shorter than the radius is rounded no more than its height.
    expect(columnPath(0, 20, 98, 100)).toBe('M0,100V100Q0,98 2,98H18Q20,98 20,100V100Z');
  });
});

import { describe, expect, it } from 'vitest';
import { ensureSpan, niceTicks, tickDecimals } from '@/components/chartKit';

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
});

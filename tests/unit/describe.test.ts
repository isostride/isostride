import { describe, expect, it } from 'vitest';
import { describeAb, describeDelta, describeTrend, type TrendSeries } from '@/lib/compare';
import { days, inst } from '../support/instances';

const bpm = (v: number) => `${Math.round(v)} bpm`;
const series = (fit: TrendSeries['fit'], noise = 3.8, n = 6): TrendSeries => ({
  source: 'wrist (COROS PACE 4)', noise, fit,
  points: days('2026-08-03', n, 14).map((d) => ({ instance: inst(d), date: `${d}T07:00:00.000Z`, raw: 150, corrected: 150 })),
});

describe('Result transparency', () => {
  it('Results described in words', () => {
    expect(describeDelta('speed', -12)).toBe('12 s/km faster');
    expect(describeDelta('heartRate', -6.3)).toBe('6.3 bpm lower');
    expect(describeDelta('groundContactTime', 4)).toBe('4 ms higher');

    // A change beyond the noise, its interval on one side of zero.
    const change = describeTrend(series({ slope: -0.1, intercept: 154, change: -8, ci: [-12, -4], verdict: 'change' }), 'heartRate', bpm);
    expect(change.headline).toBe('Changed: 8 bpm lower');
    expect(change.sentence).toMatch(/^Heart rate on this segment went from 154 bpm to 146 bpm \(fitted\) between .+, over 6 efforts\. That is more than the noise between efforts \(±3\.8 bpm\)/);
    // Within the noise; an uncertain interval; too few instances.
    expect(describeTrend(series({ slope: 0, intercept: 150, change: 2, ci: [-1, 5], verdict: 'no detectable change' }), 'heartRate', bpm).sentence).toMatch(/within the noise between efforts \(±3\.8 bpm\)\.$/);
    expect(describeTrend(series({ slope: 0, intercept: 150, change: -6, ci: [-14, 9], verdict: 'no detectable change' }), 'heartRate', bpm).sentence).toMatch(/not certain: the 95% interval of the change \(-14 to 9 bpm\) includes zero\.$/);
    expect(describeTrend(series(null, 3.8, 3), 'heartRate', bpm)).toMatchObject({ headline: 'Not enough efforts yet', change: false });

    // A/B: B against A.
    const ab = (difference: number | null, verdict: 'change' | 'no detectable change' | null, ci: [number, number] | null = [-1, 1]) =>
      describeAb({ a: { label: 'Shoes A', points: [1, 2, 3, 4] }, b: { label: 'Shoes B', points: [1, 2, 3, 4] }, difference, ci, noise: 1.4, verdict }, 'groundContactTime', 4);
    expect(ab(-6, 'change', [-8, -4])).toMatchObject({ headline: 'Difference: 6 ms lower with Shoes B', change: true });
    expect(ab(-0.1, 'no detectable change').sentence).toMatch(/^With Shoes B, ground contact time is 0\.1 ms lower than with Shoes A \(4 efforts with Shoes A, 4 with Shoes B\)\. That is within the noise/);
    expect(ab(-0.1, null).headline).toBe('No verdict yet');
    expect(ab(null, null).headline).toBe('Nothing to compare yet');
  });
});

describe('Running efficiency metric', () => {
  it('Efficiency changes read to the thousandth', async () => {
    const { formatAmount, percentChange } = await import('@/lib/compare');
    // Efficiency moves in thousandths of a metre per beat: no rounding to 0.1.
    expect(describeDelta('efficiency', 0.062)).toBe('0.062 m/beat higher');
    expect(formatAmount('efficiency', 0.0214)).toBe('0.021 m/beat');
    expect(formatAmount('heartRate', 3.84)).toBe('3.8 bpm');
    // A change as a share of where it started.
    expect(percentChange(0.062, 1.43)).toBe('+4.3%');
    expect(percentChange(-13, 280)).toBe('−4.6%');
    expect(percentChange(0, 150)).toBe('±0.0%');
    expect(percentChange(5, 0)).toBe('');
  });
});

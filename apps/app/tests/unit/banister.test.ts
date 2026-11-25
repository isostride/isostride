import { describe, expect, it } from 'vitest';
import { danielsVdot, fitBanister, hrVo2max, uthVo2max, vdotOverTime, type LoadSummary } from '@/lib/load';

const day = (i: number) => { const d = new Date('2026-01-01T12:00:00'); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const summary = (extra: Partial<LoadSummary>): LoadSummary => ({ duration: 3600, hrFrom: 0, hr: [], hrPeak: null, normSpeed: null, normPower: null, bests: [], moving: 3600, avgHr: 150, ef: 1.2, decoupling: null, ...extra });

describe('Fitted model and VO2max', () => {
  it('VO2max three ways', () => {
    // Daniels: a 5 km in 20:00 is a VDOT of about 49.8 (his tables give 50 for 19:57); a 10 km in 41:21, about 50.
    expect(danielsVdot(5000, 1200)).toBeCloseTo(49.8, 1);
    expect(danielsVdot(10000, 41 * 60 + 21)).toBeCloseTo(50, 0);
    expect(vdotOverTime([{ end: '2026-03-01', cs: 4, dPrime: 200, cp: null, wPrime: null, runs: 3, predictions: [{ distance: 5000, seconds: 1200 }] }])).toEqual([{ end: '2026-03-01', vdot: 49.8 }]);
    // An hour at 3 m/s (180 m/min) and 150 bpm, rest 60, max 190: VO2 39.5 at 69 % of the reserve, so about 55.5.
    expect(hrVo2max(summary({}), 60, 190)).toBeCloseTo(55.5, 1);
    // Too short, or too easy (under half the reserve): no estimate.
    expect(hrVo2max(summary({ moving: 900 }), 60, 190)).toBeNull();
    expect(hrVo2max(summary({ avgHr: 110, ef: 1.6 }), 60, 190)).toBeNull();
    // Uth: 15.3 × 190 ÷ 50.
    expect(uthVo2max(50, 190)).toBe(58.1);
  });

  it('Banister model fitted to performances', () => {
    // Loads of 200 days and performances every third day from a known model: p0 50, k1 0.1, k2 0.25, τ1 40, τ2 8.
    const loads = Array.from({ length: 200 }, (_, i) => (i % 7 === 6 ? 0 : 60 + 40 * Math.sin(i / 9)));
    const days = loads.map((load, i) => ({ date: day(i), load }));
    // The history starts in the steady state of the mean load of its first 28 days, as the form's averages do.
    const seed = loads.slice(0, 28).reduce((s, v) => s + v, 0) / 28;
    const sum = (i: number, tau: number) => { let s = (seed * Math.exp(-(i + 1) / tau)) / (1 - Math.exp(-1 / tau)); for (let k = 0; k < i; k++) s += loads[k] * Math.exp(-(i - k) / tau); return s; };
    const truth = (i: number) => 50 + 0.1 * sum(i, 40) - 0.25 * sum(i, 8);
    const perf = Array.from({ length: 66 }, (_, k) => ({ date: day(3 * k + 2), value: truth(3 * k + 2) }));
    const fit = fitBanister(days, perf)!;
    expect(fit.tau1).toBe(40);
    expect(fit.tau2).toBe(8);
    expect(fit.k1).toBeCloseTo(0.1, 4);
    expect(fit.k2).toBeCloseTo(0.25, 4);
    expect(fit.p0).toBeCloseTo(50, 2);
    expect(fit.r2).toBeCloseTo(1, 6);
    // Left out of the fit, each block of performances is still predicted.
    expect(fit.r2cv).toBeGreaterThan(0.99);
    expect(fit.n).toBe(66);
    expect(fit.fitted[100].value).toBeCloseTo(truth(100), 1);
    // Resting from the day after the last load: fatigue fades first, so performance rises to a peak, then falls.
    expect(fit.projection).toHaveLength(42);
    expect(fit.projection[0].date).toBe(day(200));
    const peakAt = fit.projection.findIndex((p) => p.date === fit.peak.date);
    expect(peakAt).toBeGreaterThan(0);
    expect(peakAt).toBeLessThan(41);
    expect(fit.peak.value).toBeGreaterThan(fit.projection[0].value);
    // Too few performances (under 15), or over too short a span: no fit.
    expect(fitBanister(days, perf.slice(0, 14))).toBeNull();
    expect(fitBanister(days, perf.slice(0, 20).map((p, k) => ({ ...p, date: day(k) })))).toBeNull();
    // Performances of pure noise: the grid finds a fit, but it predicts nothing left out of it.
    let state = 7;
    const noise = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
    const random = Array.from({ length: 20 }, (_, k) => ({ date: day(30 + 8 * k), value: 50 + (noise() - 0.5) * 6 }));
    const lucky = fitBanister(days, random);
    if (lucky) expect(lucky.r2cv).toBeLessThan(0.3);
  });
});

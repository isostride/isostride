import { describe, expect, it } from 'vitest';
import { ALL_RUNS, CURVE_KEYS, bestKey, estimateCurve, estimatedPace, paceCurve, bestStretch, bestWindow, datesPeriod, describeRunSet, formatRunSet, metricKeyLabel, metricOf, parseRunSet, presetPeriod, runStat, selectRuns, seriesSentence, trendOfRuns, type AnswerPoint, type RunSet } from '@/lib/ask';
import { parseItems, formatItems, addItem } from '@/lib/compare';
import type { RunFile } from '@/lib/kernel';
import { rowFor, syntheticRun } from '../support/synthetic';

const NOW = new Date('2026-11-19T12:00:00');
const PACE = (s: number) => 1000 / s;
const NO_FILTERS = { workoutType: null, shoes: null, title: null };

describe('Run sets in Analysis', () => {
  it('Run set kept in the link', () => {
    // A run set goes into the Analysis link as an item and comes back the same; its id is its spec.
    const set: RunSet = { period: datesPeriod('2026-03-01', null), filters: { workoutType: 'easy', shoes: 'Buty Łódź', title: 'COROS test' }, stat: 'max' };
    const spec = formatRunSet(set);
    expect(spec).toBe('2026-03-01||max|easy|Buty%20%C5%81%C3%B3d%C5%BA|COROS%20test');
    expect(parseRunSet(spec)).toEqual(set);
    const items = addItem(addItem([], 'block', 'b1'), 'set', spec);
    expect(parseItems(formatItems(items))).toEqual(items);
    expect(parseRunSet('nonsense')).toBeNull();
    expect(parseRunSet('yesterday||avg|||')).toBeNull();
    expect(parseRunSet(formatRunSet(ALL_RUNS))).toEqual(ALL_RUNS);
    // In words, for the chip.
    expect(describeRunSet(set)).toBe('Runs since 2026-03-01 · tag easy · shoes Buty Łódź · title “COROS test” · maximum');
    expect(describeRunSet(ALL_RUNS)).toBe('All runs');
    // The period presets, from today.
    expect(presetPeriod('year', NOW)).toEqual({ from: '2026-01-01', to: null, label: '2026' });
    expect(presetPeriod('quarter', NOW)).toMatchObject({ from: '2026-08-20', label: 'last 3 months' });
    expect(presetPeriod('month', NOW).from).toBe('2026-10-20');
    // Metric keys: a block metric, or the fastest stretch of a length, read as a pace.
    expect(bestKey({ kind: 'time', target: 600 })).toBe('best:600s');
    expect(bestWindow('best:5000m')).toEqual({ kind: 'distance', target: 5000 });
    expect(bestWindow('heartRate')).toBeNull();
    expect(metricOf('best:600s')).toBe('speed');
    expect(metricKeyLabel('best:600s')).toBe('Fastest 10 min');
    expect(metricKeyLabel('heartRate', 'max')).toBe('maximum heart rate');
  });

  it('Change of a metric over runs', () => {
    // Nine runs a week apart, efficiency rising 0.01 m/beat each week with little scatter: a change.
    const points: AnswerPoint[] = Array.from({ length: 9 }, (_, k) => ({ runId: `r${k}`, date: `2026-0${1 + Math.floor(k / 4)}-${String(1 + (k % 4) * 7).padStart(2, '0')}T07:00:00.000Z`, title: null, value: 1.4 + 0.01 * k + (k % 2 ? 0.002 : -0.002), from: null, to: null, distance: null }));
    const fit = trendOfRuns(points);
    expect(fit).not.toBeNull();
    expect(fit!.change).toBeCloseTo(0.08, 1);
    expect(fit!.verdict).toBe('change');
    const s = seriesSentence('efficiency', 'avg', 'since 2026-01-01', { points, fit });
    expect(s).toMatch(/^Efficiency since 2026-01-01: 1\.4\d* m\/beat → 1\.4\d* m\/beat over 9 runs, 0\.0[78]\d* m\/beat higher \(\+5\.\d%\), beyond the noise between runs \(±0\.0\d* m\/beat\): change\.$/);
    // Too few runs: the points, no verdict; none: said so.
    expect(trendOfRuns(points.slice(0, 4))).toBeNull();
    expect(seriesSentence('efficiency', 'median', 'since 2026-01-01', { points: points.slice(0, 4), fit: null })).toBe('Median efficiency since 2026-01-01: 4 runs, too few for a verdict (5 needed); the points are shown as they are.');
    expect(seriesSentence('best:600s', 'avg', 'over all runs', { points: [], fit: null })).toBe('No run over all runs has a value of fastest 10 min.');
  });

  it('Fastest stretch across runs', () => {
    // A run with 10 minutes at 4:00/km inside easy running, and an easy run: the stretch is found in the first.
    const withEffort = { ...syntheticRun(1800, (t) => ({ speed: t >= 600 && t < 1200 ? PACE(240) : PACE(360), heartRate: 150 })), id: 'a', startTime: '2026-04-02T07:00:00.000Z' } as RunFile;
    const easy = { ...syntheticRun(1500, () => ({ speed: PACE(360), heartRate: 140 })), id: 'b', startTime: '2026-04-09T07:00:00.000Z' } as RunFile;
    const rows = [rowFor(withEffort, { title: 'tempo day' }), rowFor(easy)];
    const points = [withEffort, easy].map((r, k) => bestStretch(r, rows[k], { kind: 'time', target: 600 })!);
    expect(points[0]).toMatchObject({ runId: 'a', title: 'tempo day' });
    expect(Math.abs(points[0].from! - 600)).toBeLessThanOrEqual(2);
    expect(Math.abs(points[0].to! - 1200)).toBeLessThanOrEqual(2);
    expect(points[0].value).toBeCloseTo(240, 0);
    expect(points[1].value).toBeCloseTo(360, 0);
    // A run shorter than the window has no stretch.
    expect(bestStretch({ ...easy, samples: { ...easy.samples, t: easy.samples.t.slice(0, 300), distance: easy.samples.distance.slice(0, 300) } }, rows[1], { kind: 'time', target: 600 })).toBeNull();
    // A fastest stretch read as a pace, with its own sentence.
    expect(seriesSentence('best:600s', 'avg', 'since 2026-03-01', { points, fit: null })).toBe('Fastest 10 min since 2026-03-01: 2 runs, too few for a verdict (5 needed); the points are shown as they are.');
    // The runs a set covers: by period, tag, shoes and title.
    expect(selectRuns(rows, datesPeriod('2026-04-05', null), NO_FILTERS).map((r) => r.id)).toEqual(['b']);
    expect(selectRuns(rows, datesPeriod(null, null), { workoutType: 'LONG', shoes: 'shoes a', title: 'tempo' }).map((r) => r.id)).toEqual(['a']);
  });

  it('Statistic of a run', () => {
    // A run with windows at 6:00/km, 4:00/km for its middle third, and 5:00/km: the statistics of pace and heart rate.
    const run = syntheticRun(900, (t) => ({ speed: t < 300 ? PACE(360) : t < 600 ? PACE(240) : PACE(300), heartRate: t < 300 ? 130 : t < 600 ? 170 : 150 }));
    expect(runStat(run, 'speed', 'min')).toBeCloseTo(240, 0);
    expect(runStat(run, 'speed', 'max')).toBeCloseTo(360, 0);
    expect(runStat(run, 'speed', 'median')).toBeCloseTo(300, 0);
    expect(runStat(run, 'heartRate', 'max')).toBe(170);
    expect(runStat(run, 'heartRate', 'median')).toBe(150);
    expect(runStat(run, 'heartRate', 'avg')).toBeCloseTo(150, 0);
    // Efficiency per window: the fast third's 4.17 m/s at 170 bpm is its maximum; a metric never recorded has none.
    expect(runStat(run, 'efficiency', 'max')).toBeCloseTo((PACE(240) * 60) / 170, 2);
    expect(runStat(run, 'cadence', 'median')).toBeNull();
    // A single odd window is the extreme of the windows, not of the samples: a 1 s spike in speed does not count.
    const spike = syntheticRun(600, (t) => ({ speed: t === 300 ? PACE(120) : PACE(300), heartRate: 150 }));
    expect(runStat(spike, 'speed', 'min')).toBeGreaterThan(250); // the sample alone would say 2:00
  });

  it('Pace curve from the fastest stretches', () => {
    // Three runs: 1-minute bests of 3:40, 3:30 and 3:50; 10-minute bests in two of them; none long enough for 30 minutes.
    const pt = (runId: string, value: number, k: number): AnswerPoint => ({ runId, date: `2026-10-0${k + 1}T07:00:00.000Z`, title: k === 1 ? 'tempo' : null, value, from: 60 * k, to: 60 * k + 60, distance: null });
    const series = {
      'best:60s': { points: [pt('a', 220, 0), pt('b', 210, 1), pt('c', 230, 2)], fit: null },
      'best:600s': { points: [pt('a', 250, 0), pt('c', 240, 2)], fit: null },
      'best:1800s': { points: [], fit: null },
    };
    expect(CURVE_KEYS).toContain('best:1800s');
    expect(paceCurve(series)).toEqual([
      { duration: 60, pace: 210, runId: 'b', date: '2026-10-02T07:00:00.000Z', title: 'tempo', from: 60, to: 120 },
      { duration: 600, pace: 240, runId: 'c', date: '2026-10-03T07:00:00.000Z', title: null, from: 120, to: 180 },
    ]);
    expect(paceCurve({})).toEqual([]);
  });

  it('Estimated pace curve', () => {
    // Bests that follow Riegel's law with exponent 1.07 (speed ∝ t^−0.07), 4:00/km at 10 min: the law is recovered.
    const v10 = 1000 / 240;
    const law = [180, 300, 600, 1200, 1800, 3600].map((d) => ({ duration: d, pace: 1000 / (v10 * Math.pow(d / 600, -0.07)) }));
    const e = estimateCurve([{ duration: 60, pace: 190 }, ...law])!;
    expect(e.n).toBe(6);
    expect(e.k).toBeCloseTo(0.07, 3);
    expect(estimatedPace(e, 600)).toBeCloseTo(240, 0);
    // Predicted times along the law: 10 km in about 44.4 min, the marathon about 3 h 29 min; the sprint of 60 s is left out of the fit.
    const by = Object.fromEntries(e.predictions.map((p) => [p.distance, p.seconds]));
    expect(by[10000] / 60).toBeCloseTo(44.4, 0);
    expect(by[42195] / 3600).toBeCloseTo(3.5, 1);
    // Critical speed from the 2–20 min bests: d = CS·t + D′.
    expect(e.cs).not.toBeNull();
    expect(e.cs!.n).toBe(4);
    expect(1000 / e.cs!.cs).toBeGreaterThan(240);
    expect(e.cs!.dPrime).toBeGreaterThan(0);
    // An envelope: an easy long run below the law leaves the line on the strongest bests, and no best lies above it.
    const withEasy = [...law, { duration: 7200, pace: 400 }];
    const env = estimateCurve(withEasy)!;
    expect(env.k).toBeGreaterThan(0.07);
    for (const p of withEasy) expect(estimatedPace(env, p.duration)).toBeLessThanOrEqual(p.pace + 1e-9);
    expect(withEasy.some((p) => Math.abs(estimatedPace(env, p.duration) - p.pace) < 1e-6)).toBe(true);
    // Fewer than 3 bests of 3 minutes and more: no estimate; with none of 2–20 min, no critical speed.
    expect(estimateCurve(law.slice(0, 2))).toBeNull();
    expect(estimateCurve([{ duration: 1800, pace: 250 }, { duration: 3600, pace: 260 }, { duration: 7200, pace: 275 }])!.cs).toBeNull();
  });
});

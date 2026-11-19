import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY, bestStretch, runStat, datesPeriod, describeQuery, presetPeriod, queryFromParams, queryToParams, selectRuns, sentenceOf, trendOfRuns, type AnswerPoint, type Query } from '@/lib/ask';
import type { RunFile } from '@/lib/kernel';
import { rowFor, syntheticRun } from '../support/synthetic';

const NOW = new Date('2026-11-19T12:00:00');
const PACE = (s: number) => 1000 / s;
const NO_FILTERS = { workoutType: null, shoes: null, title: null };

describe('Questions about the data', () => {
  it('Question kept in the link', () => {
    // The controls' question goes into the link and comes back the same; defaults stay out of it.
    const best: Query = { kind: 'best', window: { kind: 'time', target: 600 }, period: datesPeriod('2026-03-01', null), filters: { ...NO_FILTERS, workoutType: 'easy' }, limit: 10 };
    expect(queryToParams(best).toString()).toBe('kind=best&window=600s&from=2026-03-01&tag=easy');
    expect(queryFromParams(queryToParams(best))).toEqual(best);
    const top: Query = { kind: 'top', metric: 'heartRate', stat: 'max', direction: 'low', period: datesPeriod('2026-10-01', '2026-10-31'), filters: { ...NO_FILTERS, shoes: 'Alpha', title: 'COROS test' }, limit: 5 };
    expect(queryFromParams(queryToParams(top))).toEqual(top);
    const trend: Query = { kind: 'trend', metric: 'efficiency', stat: 'avg', period: datesPeriod('2026-02-01', null), filters: NO_FILTERS };
    expect(queryToParams(trend).toString()).toBe('kind=trend&metric=efficiency&from=2026-02-01');
    // Nothing, or nonsense, in the link: the default question; a "top" without a direction ranks the better way.
    expect(queryFromParams(new URLSearchParams(''))).toEqual(DEFAULT_QUERY);
    expect(queryFromParams(new URLSearchParams('kind=top&metric=nope&stat=mode&from=yesterday&top=999'))).toMatchObject({ kind: 'top', metric: 'speed', stat: 'avg', direction: 'low', period: { from: null, to: null }, limit: 100 });
    expect(queryFromParams(new URLSearchParams('kind=best&window=5x'))).toMatchObject({ window: { kind: 'time', target: 600 } });
    // The presets of the period, from today.
    expect(presetPeriod('year', NOW)).toEqual({ from: '2026-01-01', to: null, label: '2026' });
    expect(presetPeriod('quarter', NOW)).toMatchObject({ from: '2026-08-20', label: 'last 3 months' });
    expect(presetPeriod('month', NOW).from).toBe('2026-10-20');
    expect(describeQuery(best)).toBe('Fastest 10 min since 2026-03-01, top 10, tag easy');
    expect(describeQuery(top)).toBe('Lowest maximum heart rate 2026-10-01 – 2026-10-31, top 5, shoes Alpha, title “COROS test”');
    expect(describeQuery(DEFAULT_QUERY)).toBe('Change of pace over all runs');
  });

  it('Change of a metric over runs', () => {
    // Nine runs a week apart, efficiency rising 0.01 m/beat each week with little scatter: a change.
    const points: AnswerPoint[] = Array.from({ length: 9 }, (_, k) => ({ runId: `r${k}`, date: `2026-0${1 + Math.floor(k / 4)}-${String(1 + (k % 4) * 7).padStart(2, '0')}T07:00:00.000Z`, title: null, value: 1.4 + 0.01 * k + (k % 2 ? 0.002 : -0.002), from: null, to: null, distance: null }));
    const fit = trendOfRuns(points);
    expect(fit).not.toBeNull();
    expect(fit!.change).toBeCloseTo(0.08, 1);
    expect(fit!.verdict).toBe('change');
    const q: Query = { kind: 'trend', metric: 'efficiency', stat: 'avg', period: datesPeriod('2026-01-01', null), filters: NO_FILTERS };
    const s = sentenceOf(q, 'efficiency', points, [], fit);
    expect(s).toMatch(/^Efficiency since 2026-01-01: 1\.4\d* m\/beat → 1\.4\d* m\/beat over 9 runs, 0\.0[78]\d* m\/beat higher \(\+5\.\d%\), beyond the noise between runs \(±0\.0\d* m\/beat\): change\.$/);
    // Too few runs: the points, no verdict.
    expect(trendOfRuns(points.slice(0, 4))).toBeNull();
    expect(sentenceOf(q, 'efficiency', points.slice(0, 4), [], null)).toContain('too few for a verdict');
    expect(sentenceOf(q, 'efficiency', [], [], null)).toContain('No run since 2026-01-01');
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
    const q: Query = { kind: 'best', window: { kind: 'time', target: 600 }, period: datesPeriod('2026-03-01', null), filters: NO_FILTERS, limit: 10 };
    const ranking = [...points].sort((a, b) => a.value - b.value);
    expect(sentenceOf(q, 'speed', points, ranking, null)).toBe('Fastest 10 min since 2026-03-01: 4:00 /km on 2 Apr 2026 (tempo day), minute 10–20 of the run; 2 runs ranked.');
    // The runs a question covers: by period, tag, shoes and title.
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
    // The statistic rides in the link and in the words of the question.
    const q: Query = { kind: 'trend', metric: 'heartRate', stat: 'max', period: datesPeriod(null, null), filters: NO_FILTERS };
    expect(queryToParams(q).toString()).toBe('kind=trend&metric=heartRate&stat=max');
    expect(queryFromParams(queryToParams(q))).toEqual(q);
    expect(describeQuery(q)).toBe('Change of maximum heart rate over all runs');
    expect(sentenceOf(q, 'heartRate', [], [], null)).toBe('No run over all runs has a value of maximum heart rate to answer with.');
  });
});

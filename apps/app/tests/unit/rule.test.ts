import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { EMPTY_CONDITIONS, EMPTY_FILTER, RULE_TOLERANCES, decodeRule, defaultTolerances, definitionFromRule, encodeRule, matchesRunFilter, presetDates, readDefinitions, ruleName, ruleOf, windowStat, type Rule } from '@/lib/blocks';
import { valueOf } from '@/lib/compare';
import { detectInstances, instancesOf } from '@/lib/detection';
import { PATHS, writeJson } from '@/lib/fs';
import type { RunFile } from '@/lib/kernel';
import { NodeFolder } from '../support/nodeFolder';
import { rowFor, syntheticRun } from '../support/synthetic';

const NOW = new Date('2026-11-19T12:00:00');
const PACE = (s: number) => 1000 / s;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A run from segments of [seconds, s/km, bpm], one lap per segment. */
function run(id: string, start: string, segments: [number, number, number?][]): RunFile {
  const ends: number[] = [];
  let t = 0;
  for (const [s] of segments) ends.push((t += s));
  const at = (x: number) => segments[ends.findIndex((e) => x < e)] ?? segments[segments.length - 1];
  const r = syntheticRun(t, (x) => ({ speed: PACE(at(x)[1]), heartRate: at(x)[2] ?? 150 }));
  let from = 0;
  r.laps = segments.map(([s, p]) => { const lap = { start: from, end: from + s, duration: s, distance: s * PACE(p) }; from += s; return lap; });
  return { ...r, id, startTime: `${start}T07:00:00.000Z` };
}
const found = (rule: Rule, r: RunFile, extra = {}) => detectInstances(definitionFromRule('', rule), r, rowFor(r, extra), []);
const WHOLE = ruleOf({ type: 'run' });
const FIVE_MIN = ruleOf({ type: 'fastest', kind: 'time', target: 300 });

describe('Blocks defined in Analysis', () => {
  it('Rule in words and in the link', async () => {
    // "The fastest 5 minutes with the heart rate above 160, since March": its name, and the link carries it.
    const rule: Rule = { ...FIVE_MIN, conditions: { ...EMPTY_CONDITIONS, alwaysHrMin: 160 }, runs: { ...EMPTY_FILTER, dateFrom: '2026-03-01', workoutTypes: ['tempo'] } };
    expect(ruleName(rule)).toBe('Fastest 5 min · HR never below 160 · tempo · since 2026-03-01');
    const code = encodeRule(rule);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeRule(code)).toEqual(rule);
    expect(decodeRule(encodeRule(WHOLE))).toEqual(WHOLE);
    expect(decodeRule('nonsense')).toBeNull();
    expect(decodeRule(btoa(JSON.stringify({ s: { type: 'fastest', kind: 'time', target: 0 } })))).toBeNull();
    // Other shapes in words: laps by distance and pace, a steady stretch, whole runs by their maximum.
    expect(ruleName({ ...ruleOf({ type: 'lap' }), conditions: { ...EMPTY_CONDITIONS, distanceMin: 3000, distanceMax: 5000, paceMin: 235, paceMax: 245 } })).toBe('Laps · 3–5 km · 3:55–4:05 /km');
    expect(ruleName({ ...ruleOf({ type: 'steady', minDuration: 600 }), conditions: { ...EMPTY_CONDITIONS, alwaysPaceMin: 290, alwaysPaceMax: 310, start: 'flying' } })).toBe('Steady 10 min or more · pace always 4:50–5:10 /km · flying start');
    expect(ruleName({ ...WHOLE, stat: 'max', runs: { ...EMPTY_FILTER, title: 'COROS test', shoes: ['Alpha'] } })).toBe('Runs · “COROS test” · Alpha · maximum');
    expect(ruleName({ ...FIVE_MIN, pick: 'all' })).toBe('Fastest 5 min · every one');
    // The fastest stretch one per run by default, the other shapes every one; the period presets count from today.
    expect([FIVE_MIN.pick, WHOLE.pick, ruleOf({ type: 'lap' }).pick]).toEqual(['best', 'all', 'all']);
    expect(presetDates('year', NOW)).toEqual({ dateFrom: '2026-01-01', dateTo: null });
    expect(presetDates('quarter', NOW).dateFrom).toBe('2026-08-20');
    expect(presetDates('month', NOW).dateFrom).toBe('2026-10-20');
    expect(presetDates('all', NOW)).toEqual({ dateFrom: null, dateTo: null });
    // A rule block's general conditions are off; a "criteria" block of an older file reads as the rule it was.
    expect(defaultTolerances('rule')).toEqual(RULE_TOLERANCES);
    const folder = new NodeFolder(path.join(dir, 'legacy'));
    const criteria = { title: 'coros', distanceMin: 3000, distanceMax: 5000, paceMin: null, paceMax: null, durationMin: null, durationMax: null, workoutTypes: ['race'], techniqueCues: [], shoes: [], heartRateSources: [], dateFrom: '2026-10-01', dateTo: null, devices: [], heartRateMin: 150, heartRateMax: null, lapsMin: null, lapsMax: null };
    await writeJson(folder, PATHS.blockDefinitions, { definitions: [{ id: 'old', name: 'Old', origin: 'manual', status: 'active', createdAt: '', params: { type: 'criteria', scope: 'lap', criteria }, tolerances: {} }] });
    const [old] = await readDefinitions(folder);
    expect(old.params).toMatchObject({ type: 'rule', shape: { type: 'lap' }, pick: 'all', stat: 'avg', runs: { title: 'coros', workoutTypes: ['race'], dateFrom: '2026-10-01' }, conditions: { distanceMin: 3000, distanceMax: 5000, hrMin: 150 } });
    expect(old.tolerances).toEqual(RULE_TOLERANCES);
  });

  // Three runs: a 4 km test at 4:00/km titled "COROS test", an easy 8 km, and an easy 4 km. Each test
  // below runs a few detections only, so it stays well under the 100 ms of a unit test.
  const threeRuns = () => {
    const runs = [run('t', '2026-10-01', [[960, 240]]), run('e', '2026-10-03', [[2880, 360]]), run('f', '2026-10-05', [[1440, 360]])];
    const extras = [{ title: 'COROS test 4 km', workoutType: 'race' }, { workoutType: 'easy' }, { workoutType: 'easy', title: 'easy loop' }];
    const ids = (rule: Rule) => runs.flatMap((r, k) => found(rule, r, extras[k])).map((i) => i.runId);
    return { runs, extras, ids };
  };
  const cond = (c: Partial<Rule['conditions']>): Rule => ({ ...WHOLE, conditions: { ...EMPTY_CONDITIONS, ...c } });
  const from = (f: Partial<Rule['runs']>): Rule => ({ ...WHOLE, runs: { ...EMPTY_FILTER, ...f } });

  it('Runs chosen by a rule', () => {
    const { ids } = threeRuns();
    // Distance 3–5 km: the two 4 km runs; with pace 3:55–4:05 too: the test alone.
    expect(ids(cond({ distanceMin: 3000, distanceMax: 5000 }))).toEqual(['t', 'f']);
    expect(ids(cond({ distanceMin: 3000, distanceMax: 5000, paceMin: 235, paceMax: 245 }))).toEqual(['t']);
    expect(ids(cond({ hrMin: 100 }))).toEqual([]); // the rows carry no average heart rate
  });

  it('Runs chosen by their title, type and date', () => {
    const { ids } = threeRuns();
    expect(ids(from({ title: 'coros' }))).toEqual(['t']);
    expect(ids(from({ title: 'coros', workoutTypes: ['easy'] }))).toEqual([]);
    expect(ids(from({ workoutTypes: ['easy', 'race'], dateFrom: '2026-10-02' }))).toEqual(['e', 'f']);
  });

  it('No condition takes every run whole', () => {
    const { runs, extras } = threeRuns();
    const every = runs.flatMap((r, k) => found(WHOLE, r, extras[k]));
    expect(every.map((i) => [i.runId, i.start, i.status])).toEqual([['t', 0, 'accepted'], ['e', 0, 'accepted'], ['f', 0, 'accepted']]);
    expect(every[0].duration).toBe(960);
    expect(matchesRunFilter({ ...EMPTY_FILTER, shoes: ['Shoes B'] }, rowFor(runs[0]))).toBe(false);
    expect(matchesRunFilter({ ...EMPTY_FILTER, lapsMin: 1, lapsMax: 1, devices: ['COROS PACE 4'] }, rowFor(runs[0]))).toBe(true);
  });

  it('Fastest stretch with the heart rate above a floor', () => {
    // Easy running at 6:00/km and 140 bpm, 5 min at 4:00/km and 150 bpm from minute 10, 5 min at 4:10/km and 165 bpm from minute 25.
    const r = run('a', '2026-10-01', [[600, 360, 140], [300, 240, 150], [600, 360, 140], [300, 250, 165]]);
    const near = (v: number, target: number) => expect(Math.abs(v - target)).toBeLessThanOrEqual(2);
    // With no condition: the fastest 5 minutes of the run, the stretch at 4:00/km.
    const [plain] = found(FIVE_MIN, r);
    near(plain.start, 600);
    expect(plain.context.block.pace).toBe(240);
    // With the heart rate never below 160: the stretch at 165 bpm, though it is slower.
    const [above] = found({ ...FIVE_MIN, conditions: { ...EMPTY_CONDITIONS, alwaysHrMin: 160 } }, r);
    near(above.start, 1500);
    expect(above).toMatchObject({ status: 'accepted', metrics: { heartRate: 165 }, context: { block: { pace: 250 } } });
    // The same by its average heart rate, 160 and more; none with the heart rate above 170.
    near(found({ ...FIVE_MIN, conditions: { ...EMPTY_CONDITIONS, hrMin: 160 } }, r)[0].start, 1500);
    expect(found({ ...FIVE_MIN, conditions: { ...EMPTY_CONDITIONS, alwaysHrMin: 170 } }, r)).toEqual([]);
    // Every one, with the heart rate never below 145: both stretches, in the order of the run.
    const both = found({ ...FIVE_MIN, pick: 'all', conditions: { ...EMPTY_CONDITIONS, alwaysHrMin: 145 } }, r);
    expect(both).toHaveLength(2);
    near(both[0].start, 600);
    near(both[1].start, 1500);
    // Pace always within 4:05–4:15 keeps the slower one; an average pace in that band takes the fastest stretch that still
    // averages inside it, a mix of easy running and the stretch at 4:00/km.
    near(found({ ...FIVE_MIN, conditions: { ...EMPTY_CONDITIONS, alwaysPaceMin: 245, alwaysPaceMax: 255 } }, r)[0].start, 1500);
    const [mixed] = found({ ...FIVE_MIN, conditions: { ...EMPTY_CONDITIONS, paceMin: 245, paceMax: 255 } }, r);
    expect(mixed.start).toBeLessThan(600);
    expect((mixed.end - mixed.start) / (mixed.distance / 1000)).toBeGreaterThanOrEqual(245);
    // A run the rule does not draw from has no segment.
    expect(found({ ...FIVE_MIN, runs: { ...EMPTY_FILTER, dateFrom: '2026-11-01' } }, r)).toEqual([]);
    // By distance: the fastest kilometre lies in the stretch at 4:00/km.
    const [km] = found(ruleOf({ type: 'fastest', kind: 'distance', target: 1000 }), r);
    expect(km.start).toBeGreaterThanOrEqual(600);
    expect(km.end).toBeLessThanOrEqual(900);
  });

  it('Laps and steady stretches by a rule', () => {
    // A workout of a warm-up, a 3 km lap at 4:00/km and a cool-down, beside an easy run of one lap.
    const workout = run('w', '2026-10-01', [[720, 360], [720, 240], [360, 360]]);
    const easy = run('e', '2026-10-03', [[2880, 360]]);
    const laps: Rule = { ...ruleOf({ type: 'lap' }), conditions: { ...EMPTY_CONDITIONS, distanceMin: 2500, distanceMax: 3500, paceMin: 235, paceMax: 245 } };
    expect([found(laps, workout), found(laps, easy)].map((l) => l.length)).toEqual([1, 0]);
    expect(found(laps, workout)[0]).toMatchObject({ start: 720, end: 1440, status: 'accepted', context: { before: { lap: 2 }, block: { pace: 240 } } });
    // Every lap without a condition; the best of each run is its fastest lap.
    expect(found(ruleOf({ type: 'lap' }), workout).map((i) => i.start)).toEqual([0, 720, 1440]);
    expect(found({ ...ruleOf({ type: 'lap' }), pick: 'best' }, workout).map((i) => i.start)).toEqual([720]);
    // A steady stretch: pace always 4:50–5:10 for 10 minutes or more, found between the easier parts.
    const tempo = run('s', '2026-10-05', [[600, 360], [720, 300], [600, 360]]);
    const steady = (minDuration: number): Rule => ({ ...ruleOf({ type: 'steady', minDuration }), conditions: { ...EMPTY_CONDITIONS, alwaysPaceMin: 290, alwaysPaceMax: 310 } });
    expect(found(steady(600), tempo).map((i) => [i.start, i.end])).toEqual([[600, 1320]]);
    expect(found(steady(900), tempo)).toEqual([]);
    // A stop breaks a steady stretch: two stretches of unbroken running, the shorter left out by the length.
    const stopped = { ...syntheticRun(1500, (t) => ({ speed: t >= 900 && t < 960 ? 0 : PACE(300), heartRate: 150 })), id: 'p', startTime: '2026-10-07T07:00:00.000Z' } as RunFile;
    expect(found(ruleOf({ type: 'steady', minDuration: 600 }), stopped).map((i) => [i.start, i.end])).toEqual([[0, 900]]);
  });

  it('Statistic of a segment', () => {
    // A run of 6:00/km, 4:00/km for its middle third and 5:00/km, with heart rate 130, 170 and 150.
    const r = run('a', '2026-10-01', [[300, 360, 130], [300, 240, 170], [300, 300, 150]]);
    expect(windowStat(r, 'speed', 'min')).toBeCloseTo(240, 0);
    expect(windowStat(r, 'speed', 'max')).toBeCloseTo(360, 0);
    expect(windowStat(r, 'speed', 'median')).toBeCloseTo(300, 0);
    expect(windowStat(r, 'heartRate', 'max')).toBe(170);
    expect(windowStat(r, 'heartRate', 'avg')).toBeCloseTo(150, 0);
    expect(windowStat(r, 'efficiency', 'max')).toBeCloseTo((PACE(240) * 60) / 170, 2);
    expect(windowStat(r, 'cadence', 'median')).toBeNull();
    // Inside a stretch only: the last third's heart rate.
    expect(windowStat(r, 'heartRate', 'max', 600, 900)).toBe(150);
    // A single odd sample is no extreme: the statistics read the 10 s windows.
    const spike = syntheticRun(600, (t) => ({ speed: t === 300 ? PACE(120) : PACE(300), heartRate: 150 }));
    expect(windowStat(spike, 'speed', 'min')).toBeGreaterThan(250);
    // A block read by its maximum: each segment's metrics are the maxima of its windows; pace by its minimum is the fastest window.
    const [max] = found({ ...WHOLE, stat: 'max' }, r);
    expect(max.metrics.heartRate).toBe(170);
    expect(valueOf(found({ ...WHOLE, stat: 'min' }, r)[0], 'speed')).toBeCloseTo(240, 0);
    expect(found(WHOLE, r)[0].metrics.heartRate).toBeCloseTo(150, 0);
  });

  it('Rule computed from the data folder', async () => {
    // Eight short runs a week apart, pace quickening 5 s/km a week, five of them tagged easy.
    const folder = new NodeFolder(path.join(dir, 'runs'));
    const day = (k: number) => new Date(Date.UTC(2026, 8, 2 + 7 * k, 7)).toISOString();
    const runs: RunFile[] = Array.from({ length: 8 }, (_, k) => ({
      ...syntheticRun(200, (t) => ({ speed: t >= 60 && t < 180 ? PACE(240 - 5 * k) : PACE(330 - 5 * k), heartRate: 150 - k })),
      id: `r${k}`, startTime: day(k),
    }));
    await writeJson(folder, PATHS.runsIndex, { schemaVersion: 1, algorithmVersion: 1, runs: runs.map((r, k) => rowFor(r, { workoutType: k % 3 ? 'easy' : 'tempo' })) });
    for (const r of runs) await writeJson(folder, PATHS.runFile(r.id), r);
    const twoMin = { ...definitionFromRule('', ruleOf({ type: 'fastest', kind: 'time', target: 120 })), id: 'two' };
    const easy = { ...definitionFromRule('', { ...WHOLE, stat: 'max', runs: { ...EMPTY_FILTER, workoutTypes: ['easy'] } }), id: 'easy' };
    // Both blocks in one pass over the eight run files, read with progress; nothing is written.
    const seen: number[] = [];
    const got = await instancesOf(folder, [twoMin, easy], (p) => seen.push(p.done));
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(got.two.map((i) => i.runId)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
    expect(got.two[7]).toMatchObject({ start: 60, definitionId: 'two', status: 'accepted', context: { block: { pace: 205 } } });
    expect(got.easy.map((i) => i.metrics.heartRate)).toEqual([149, 148, 146, 145, 143]);
    expect(fs.existsSync(path.join(dir, 'runs', PATHS.blockInstances))).toBe(false);
    // A run no rule draws from is not read at all.
    const read: number[] = [];
    await instancesOf(folder, [easy], (p) => read.push(p.total));
    expect(read).toEqual([5, 5, 5, 5, 5]);
  });
});

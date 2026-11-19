import { describe, expect, it } from 'vitest';
import { EMPTY_CRITERIA, criteriaName, definitionFromCriteria, isEmptyCriteria, matchesCriteria, runSubject, type Criteria } from '@/lib/blocks';
import { detectInstances } from '@/lib/detection';
import type { RunFile } from '@/lib/kernel';
import { rowFor, syntheticRun } from '../support/synthetic';

const PACE = (s: number) => 1000 / s;

/** A run from segments of [seconds, s/km], one lap per segment. */
function run(id: string, start: string, segments: [number, number][]): RunFile {
  const ends: number[] = [];
  let t = 0;
  for (const [s] of segments) ends.push((t += s));
  const speedAt = (x: number) => PACE(segments[ends.findIndex((e) => x < e)]?.[1] ?? segments[segments.length - 1][1]);
  const r = syntheticRun(t, (x) => ({ speed: speedAt(x), heartRate: 150 }));
  let from = 0;
  r.laps = segments.map(([s, p]) => { const lap = { start: from, end: from + s, duration: s, distance: s * PACE(p) }; from += s; return lap; });
  return { ...r, id, startTime: `${start}T07:00:00.000Z` };
}

describe('Blocks from criteria', () => {
  it('Runs filtered by criteria', () => {
    // Three runs: a 4 km test at 4:00/km titled "COROS test", an easy 8 km, and a 4 km easy run.
    const test = run('t', '2026-10-01', [[960, 240]]);
    const easy8 = run('e', '2026-10-03', [[2880, 360]]);
    const easy4 = run('f', '2026-10-05', [[1440, 360]]);
    const rows = [rowFor(test, { title: 'COROS test 4 km', workoutType: 'race' }), rowFor(easy8, { workoutType: 'easy' }), rowFor(easy4, { workoutType: 'easy', title: 'easy loop' })];
    const matching = (c: Partial<Criteria>) => rows.filter((r) => matchesCriteria({ ...EMPTY_CRITERIA, ...c }, runSubject(r))).map((r) => r.id);
    // Distance 3–5 km: the two 4 km runs; with pace 3:55–4:05 too: the test alone; combined with the title.
    expect(matching({ distanceMin: 3000, distanceMax: 5000 })).toEqual(['t', 'f']);
    expect(matching({ distanceMin: 3000, distanceMax: 5000, paceMin: 235, paceMax: 245 })).toEqual(['t']);
    expect(matching({ title: 'coros' })).toEqual(['t']);
    expect(matching({ title: 'coros', workoutTypes: ['easy'] })).toEqual([]);
    expect(matching({ workoutTypes: ['easy', 'race'], dateFrom: '2026-10-02' })).toEqual(['e', 'f']);
    expect(matching({ durationMax: 1500, heartRateMin: 100 })).toEqual([]); // rows carry no average heart rate
    // No criterion at all: every run, and the sheet says so.
    expect(matching({})).toEqual(['t', 'e', 'f']);
    expect(isEmptyCriteria(EMPTY_CRITERIA)).toBe(true);
    expect(isEmptyCriteria({ ...EMPTY_CRITERIA, lapsMin: 2 })).toBe(false);
  });

  it('Criteria block: whole run or lap', () => {
    // A workout with a 2 km warm-up, a 3 km effort at 4:00/km and a cool-down, beside an easy run.
    const workout = run('w', '2026-10-01', [[720, 360], [720, 240], [360, 360]]);
    const easy = run('e', '2026-10-03', [[2880, 360]]);
    const criteria = { ...EMPTY_CRITERIA, distanceMin: 2500, distanceMax: 3500, paceMin: 235, paceMax: 245 };
    // As laps: the effort lap of the workout is the instance, measured on its own.
    const byLap = definitionFromCriteria('', criteria, 'lap');
    const laps = [workout, easy].map((r) => detectInstances(byLap, r, rowFor(r), []));
    expect(laps.map((l) => l.length)).toEqual([1, 0]);
    expect(laps[0][0]).toMatchObject({ start: 720, end: 1440, status: 'accepted', context: { before: { lap: 2 } } });
    expect(laps[0][0].context.block.pace).toBe(240);
    // As whole runs: neither run is 2.5–3.5 km at that pace; a 4 km run at 4:00/km is, whole.
    const byRun = definitionFromCriteria('', { ...criteria, distanceMax: 4500 }, 'run');
    const test = run('t', '2026-10-05', [[960, 240]]);
    const runs = [workout, easy, test].map((r) => detectInstances(byRun, r, rowFor(r), []));
    expect(runs.map((l) => l.length)).toEqual([0, 0, 1]);
    expect(runs[2][0]).toMatchObject({ start: 0, status: 'accepted' });
    expect(runs[2][0].duration).toBe(960);
    // The name says the criteria; the general conditions are off for such a block.
    expect(byLap.name).toBe('Laps 2.5–3.5 km · 3:55–4:05 /km');
    expect(criteriaName({ ...EMPTY_CRITERIA, title: 'COROS test', workoutTypes: ['race'] }, 'run')).toBe('“COROS test” · race');
    expect(byRun.tolerances).toMatchObject({ paceMin: null, effortBeforeMax: null, cvMax: 1 });
  });
});

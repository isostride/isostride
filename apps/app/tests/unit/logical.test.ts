import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TOLERANCES, defaultTolerances, type BlockDefinition, type BlockParams } from '@/lib/blocks';
import { detectInstances, recommend } from '@/lib/detection';
import type { RunFile } from '@/lib/kernel';
import { rowFor, syntheticRun } from '../support/synthetic';

const EASY = 1000 / 360; // 6:00/km
const FAST = 1000 / 240; // 4:00/km

/** A run from segments of [seconds, m/s]; laps at the segment ends when `laps` is set. */
function run(id: string, start: string, segments: [number, number][], laps = false): RunFile {
  const ends: number[] = [];
  let t = 0;
  for (const [s] of segments) ends.push((t += s));
  const speedAt = (x: number) => segments[ends.findIndex((e) => x < e)]?.[1] ?? segments[segments.length - 1][1];
  const r = syntheticRun(t, (x) => ({ speed: speedAt(x), heartRate: 150 }));
  let from = 0;
  r.laps = laps
    ? segments.map(([s, v]) => { const lap = { start: from, end: from + s, duration: s, distance: s * v }; from += s; return lap; })
    : [{ start: 0, end: t, duration: t, distance: r.distance }];
  return { ...r, id, startTime: `${start}T07:00:00.000Z` };
}

const def = (params: BlockParams): BlockDefinition => ({
  id: 'd', name: 'block', origin: 'manual', status: 'active', createdAt: '2026-11-19T00:00:00Z', params, tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null },
});

describe('Effort blocks on any route', () => {
  it('Time trial on two routes', () => {
    // 5 km at 4:00/km inside easy running at 6:00/km, on 2 different routes, and an easy run.
    const a = run('a', '2026-10-01', [[600, EASY], [1200, FAST], [600, EASY]]);
    const b = run('b', '2026-10-08', [[900, EASY], [1200, FAST], [300, EASY]]);
    const easy = run('c', '2026-10-15', [[3600, EASY]]);
    const fiveK = def({ type: 'effort', kind: 'distance', target: 5000 });
    const found = [a, b, easy].map((r) => detectInstances(fiveK, r, rowFor(r), []));
    expect(found.map((f) => f.length)).toEqual([1, 1, 0]);
    for (const [i] of found.slice(0, 2)) {
      expect(i.distance).toBeGreaterThanOrEqual(4990);
      expect(i.context.block.pace).toBe(240);
      expect(i.status).toBe('accepted');
    }
    // 3 such runs make the system propose the "5 km effort" block.
    const c = run('e', '2026-10-22', [[600, EASY], [1200, FAST], [600, EASY]]);
    const recs = recommend([], [a, b, c, easy], new Map(), [], [a, b, c, easy].map((r) => rowFor(r)));
    expect(recs.map((r) => r.name)).toContain('5 km effort');
  });
});

describe('Blocks by workout type', () => {
  // One with a warm-up lap, a 20-minute lap at 4:10/km and a cool-down lap; two without laps. Each test
  // below runs a few detections only, so it stays well under the 100 ms of a unit test on CI too.
  const lapped = () => run('t1', '2026-10-01', [[600, EASY], [1200, 1000 / 250], [300, EASY]], true);
  const unlapped = () => [run('t2', '2026-10-08', [[1800, 1000 / 250]]), run('t3', '2026-10-15', [[1500, 1000 / 250]])];
  const test = def({ type: 'tag', workoutType: 'test' });

  it('Tagged test runs compared', () => {
    const laps = lapped();
    const [i1] = detectInstances(test, laps, rowFor(laps, { workoutType: 'test' }), []);
    expect([i1.start, i1.end, i1.context.before.lap]).toEqual([600, 1800, 2]);
    for (const r of unlapped()) {
      const [i] = detectInstances(test, r, rowFor(r, { workoutType: 'test' }), []);
      expect([i.start, i.end]).toEqual([150, r.samples.t[r.samples.t.length - 1] - 60]);
    }
  });

  it('Untagged run gives nothing', () => {
    const laps = lapped();
    expect(detectInstances(test, laps, rowFor(laps, { workoutType: 'easy' }), [])).toEqual([]);
  });

  it('Tagged runs proposed as a block', () => {
    // Once 3 runs carry the tag, the block is proposed.
    const runs = [lapped(), ...unlapped()];
    const rows = runs.map((r) => rowFor(r, { workoutType: 'test' }));
    expect(recommend([], runs, new Map(), [], rows).map((r) => r.name)).toContain('Workout: test');
  });
});

describe('Blocks by lap pattern', () => {
  /** 2 km warm-up, n × (8 min at 4:00/km, 1.5 min jog), cool-down. */
  const workout = (id: string, start: string, n: number) =>
    run(id, start, [[667, 2000 / 667], ...Array.from({ length: n }, () => [[480, FAST], [90, EASY]] as [number, number][]).flat(), [400, EASY]], true);

  // The workouts built once (their building is no part of what the test checks).
  let runs: ReturnType<typeof workout>[];
  let short: ReturnType<typeof workout>;
  beforeAll(() => {
    runs = [workout('w1', '2026-10-01', 4), workout('w2', '2026-10-08', 4), workout('w3', '2026-10-15', 4)];
    short = workout('w4', '2026-10-22', 3);
  });

  it('Same workout found by its laps', () => {
    const recs = recommend([], [...runs, short], new Map(), [], [...runs, short].map((r) => rowFor(r)));
    const pattern = recs.find((r) => r.params.type === 'pattern')!;
    expect(pattern.name).toBe('2 km + 4 × 8 min');
    const d = def(pattern.params);
    for (const r of runs) {
      const found = detectInstances(d, r, rowFor(r), []);
      expect(found.map((i) => i.context.before.lap)).toEqual([2, 4, 6, 8]);
      expect(found.every((i) => i.context.block.pace === 240)).toBe(true);
    }
    expect(detectInstances(d, short, rowFor(short), [])).toEqual([]);
  });
});

describe('Heart rate window per block', () => {
  // 30 minutes at 4:00/km after 3 and after 13 easy minutes; heart rate 150 in the effort's
  // first 5 minutes, 170 after. Built once (their building is no part of what the test checks).
  const effortRun = (id: string, warmUp: number) => {
    const r = run(id, '2026-10-01', [[warmUp, EASY], [1800, FAST], [300, EASY]]);
    r.samples.values.heartRate = r.samples.t.map((t) => (t < warmUp ? 130 : t < warmUp + 300 ? 150 : t < warmUp + 1800 ? 170 : 140));
    return r;
  };
  let efforts: ReturnType<typeof effortRun>[];
  let early: ReturnType<typeof effortRun>;
  beforeAll(() => {
    efforts = [effortRun('early', 180), effortRun('late', 780)];
    early = effortRun('route-like', 180);
  });

  it('Heart rate from the same minute of every effort', () => {
    const thirty = { ...def({ type: 'effort', kind: 'time', target: 1800 }), tolerances: { ...defaultTolerances('effort'), effortBeforeMax: null } };
    expect(thirty.tolerances.hrSkip).toBe(300);
    for (const r of efforts) {
      const [i] = detectInstances(thirty, r, rowFor(r), []);
      expect(i.status).toBe('accepted');
      expect(i.metrics.heartRate).toBe(170);
    }
    // A block without the attribute has heart rate over the whole block, wherever it starts in the run.
    const whole = { ...def({ type: 'effort', kind: 'time', target: 1800 }), tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null } };
    const [w] = detectInstances(whole, early, rowFor(early), []);
    expect(w.status).toBe('accepted');
    expect(w.metrics.heartRate).toBeCloseTo((300 * 150 + 1500 * 170) / 1800, 0);
  });
});

describe('Standing or flying start', () => {
  it('Time trial from a standing start', () => {
    // 10 minutes easy, a 30 s stop, then 3 km at 4:00/km; and the same 3 km flowing on without a stop.
    const stopped = run('s1', '2026-10-01', [[600, EASY], [30, 0], [720, FAST], [300, EASY]]);
    const flowing = run('s2', '2026-10-08', [[600, EASY], [720, FAST], [300, EASY]]);
    const threeK = (start: 'standing' | 'flying') => ({ ...def({ type: 'effort', kind: 'distance', target: 3000 }), tolerances: { ...defaultTolerances('effort'), effortBeforeMax: null, start } });
    const standing = threeK('standing');
    const [i] = detectInstances(standing, stopped, rowFor(stopped), []);
    expect(i.start).toBeGreaterThanOrEqual(630);
    expect(i.start).toBeLessThanOrEqual(632);
    expect(i.context.block.start).toBe('standing');
    expect(i.status).toBe('accepted');
    expect(detectInstances(standing, flowing, rowFor(flowing), [])).toEqual([]);
    // With a flying start the second run gives its 3 km from minute 10, on the move.
    const flying = threeK('flying');
    const [f] = detectInstances(flying, flowing, rowFor(flowing), []);
    expect(Math.abs(f.start - 600)).toBeLessThanOrEqual(2);
    expect([f.context.block.start, f.status]).toEqual(['flying', 'accepted']);
    // The stop's last sample is at 629 s: a flying fragment starts more than 10 s after it.
    for (const g of detectInstances(flying, stopped, rowFor(stopped), [])) expect(g.start).toBeGreaterThan(629 + 10);
  });
});

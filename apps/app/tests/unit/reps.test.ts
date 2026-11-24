import { describe, expect, it } from 'vitest';
import { changeOf, compareReps, runsOfLayout, workoutOf } from '@/lib/compare';
import { patternName } from '@/lib/blocks';
import type { RunFile } from '@/lib/kernel';
import { syntheticRun } from '../support/synthetic';

/** One lap of a synthetic workout: its time, its pace (s/km) and its metrics. */
type Part = { s: number; pace: number; power?: number; cadence?: number; groundContactTime?: number };

/** A run of the parts one after another, a lap each, starting at `start`. */
function workout(id: string, start: string, parts: Part[]): RunFile {
  const laps: RunFile['laps'] = [];
  let t = 0;
  for (const p of parts) { laps.push({ start: t, end: t + p.s, duration: p.s, distance: (p.s * 1000) / p.pace }); t += p.s; }
  const at = (time: number) => parts[laps.findIndex((l) => time >= l.start && time < l.end)];
  const run = syntheticRun(t, (time) => { const p = at(time); return { speed: 1000 / p.pace, power: p.power ?? 200, cadence: p.cadence ?? 165, groundContactTime: p.groundContactTime ?? 240 }; }, laps);
  return { ...run, id, startTime: start };
}

/** 10 min warm-up, 3 × 10 min with 2 min jogs, 5 min cool-down: the runner's workout of 13 Oct and of 24 Nov. */
const threeByTen = (id: string, start: string, reps: [number, number, number][], jogs: number[]) => workout(id, start, [
  { s: 600, pace: 330 },
  { s: 600, pace: reps[0][0], power: reps[0][1], cadence: reps[0][2], groundContactTime: 218 - (reps[0][1] > 240 ? 3 : 0) },
  { s: 120, pace: jogs[0] },
  { s: 600, pace: reps[1][0], power: reps[1][1], cadence: reps[1][2], groundContactTime: 211 - (reps[1][1] > 240 ? 3 : 0) },
  { s: 120, pace: jogs[1] },
  { s: 600, pace: reps[2][0], power: reps[2][1], cadence: reps[2][2], groundContactTime: 211 - (reps[2][1] > 240 ? 3 : 0) },
  { s: 120, pace: jogs[2] },
  { s: 300, pace: 360 },
]);
const october = threeByTen('a', '2026-10-13T18:49:00.000Z', [[250, 237, 170], [246, 238, 173], [246, 238, 175]], [429, 436, 508]);
const november = threeByTen('b', '2026-11-24T18:00:00.000Z', [[240, 246, 172], [234, 247, 177], [234, 248, 179]], [373, 390, 418]);

describe('Workouts compared rep by rep', () => {
  it('Reps paired and their changes computed', () => {
    // The layout: the warm-up and the jogs are no efforts; the jog after the last rep is a recovery, the cool-down is not.
    const w = workoutOf(october);
    expect(patternName(w.pattern)).toBe('10 min + 3 × 10 min');
    expect(w.efforts).toEqual([1, 3, 5]);
    expect(w.recoveries).toEqual([2, 4, 6]);

    const c = compareReps(november, october, ['power', 'cadence', 'groundContactTime', 'heartRate'])!;
    // The older first, whichever is given first; one layout.
    expect([c.a.run.id, c.b.run.id, c.sameLayout, c.reps]).toEqual(['a', 'b', true, 3]);
    // Each rep's pace from its lap's time and distance; about 11 s/km faster, faster in every rep.
    expect(c.a.pace.map((p) => Math.round(p!))).toEqual([250, 246, 246]);
    expect(c.b.pace.map((p) => Math.round(p!))).toEqual([240, 234, 234]);
    const pace = changeOf(c.a.pace, c.b.pace, 'lower')!;
    expect([Math.round(pace.mean * 10) / 10, pace.verdict]).toEqual([-11.3, 'better']);
    // The mean pace of the reps, 4.6 % faster; 7.28 km in the 30 min of work, 350 m more.
    expect([Math.round(c.a.meanPace!), Math.round(c.b.meanPace!)]).toEqual([247, 236]);
    expect(Math.round(changeOf([c.a.meanPace], [c.b.meanPace], 'lower')!.share! * 1000) / 10).toBe(-4.6);
    expect([c.a.work.duration, Math.round(c.a.work.distance), Math.round(c.b.work.distance - c.a.work.distance)]).toEqual([1800, 7278, 350]);
    // Each metric's mean in each rep; the range of the differences; better or worse by its direction.
    expect(c.metrics).toEqual(['power', 'cadence', 'groundContactTime']);
    expect(c.b.metrics.power).toEqual([246, 247, 248]);
    const power = changeOf(c.a.metrics.power, c.b.metrics.power, 'higher')!;
    expect([power.min, power.max, power.verdict, Math.round(power.share! * 1000) / 10]).toEqual([9, 10, 'better', 3.9]);
    const cadence = changeOf(c.a.metrics.cadence, c.b.metrics.cadence, 'higher')!;
    expect([cadence.min, cadence.max, cadence.verdict]).toEqual([2, 4, 'better']);
    const contact = changeOf(c.a.metrics.groundContactTime, c.b.metrics.groundContactTime, 'lower')!;
    expect([contact.min, contact.max, contact.verdict]).toEqual([-3, -3, 'better']);
    // The jogs: 7:09–8:28 then, 6:13–6:58 now.
    expect(c.a.recoveries.pace.map(Math.round)).toEqual([429, 436, 508]);
    expect(c.b.recoveries.pace.map(Math.round)).toEqual([373, 390, 418]);
    expect(c.a.recoveries.duration).toBe(120);
  });

  it('Changes that go both ways have no verdict', () => {
    expect(changeOf([1, 2], [2, 1], 'higher')!.verdict).toBeNull();
    expect(changeOf([1, 2], [0, 1], 'higher')!.verdict).toBe('worse');
    expect(changeOf([1, 2], [2, 3], 'neutral')!.verdict).toBeNull();
    // A pair with a value missing is left out; none at all: no change.
    expect(changeOf([1, null], [2, 5], 'higher')!.diffs).toEqual([1]);
    expect(changeOf([null], [2], 'higher')).toBeNull();
  });

  it('Runs of other layouts compared by their efforts in order', () => {
    // 2 × 15 min against 3 × 10 min: two reps each, flagged.
    const other = workout('c', '2026-10-27T19:40:00.000Z', [{ s: 600, pace: 330 }, { s: 900, pace: 245 }, { s: 180, pace: 420 }, { s: 900, pace: 247 }, { s: 300, pace: 360 }]);
    const c = compareReps(october, other, [])!;
    expect([c.sameLayout, c.reps, c.a.run.id]).toEqual([false, 2, 'a']);
    // A run of no workout (one lap): nothing to compare.
    const easy = workout('d', '2026-10-28T19:40:00.000Z', [{ s: 1800, pace: 330 }]);
    expect(compareReps(october, easy, [])).toBeNull();
  });
});

describe('Previous workout of a layout', () => {
  it('Previous run of the layout found', async () => {
    const between = threeByTen('m', '2026-11-04T18:00:00.000Z', [[245, 240, 172], [244, 240, 172], [244, 240, 172]], [420, 420, 420]);
    const other = workout('x', '2026-11-10T18:00:00.000Z', [{ s: 600, pace: 330 }, { s: 900, pace: 245 }, { s: 180, pace: 420 }, { s: 900, pace: 247 }, { s: 300, pace: 360 }, { s: 60, pace: 400 }, { s: 60, pace: 400 }, { s: 60, pace: 400 }]);
    const runs = [october, between, other, november];
    const rows = runs.map((r) => ({ id: r.id, startTime: r.startTime, laps: r.laps.length }));
    const reads: string[] = [];
    const read = async (id: string) => { reads.push(id); return runs.find((r) => r.id === id) ?? null; };
    // The latest earlier run of the layout; the runs with as many laps read, newest first.
    expect((await runsOfLayout(rows, november, read, { first: true })).map((r) => r.id)).toEqual(['m']);
    expect(reads).toEqual(['x', 'm']);
    // Between October and November: one other run of the layout.
    expect((await runsOfLayout(rows, november, read, { since: october.startTime })).map((r) => r.id)).toEqual(['m']);
    // None before October.
    expect(await runsOfLayout(rows, october, read, { first: true })).toEqual([]);
  });
});

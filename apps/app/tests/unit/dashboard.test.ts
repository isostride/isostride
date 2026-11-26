import { describe, expect, it } from 'vitest';
import { DEFAULT_TILES, addTile, hasTile, moveTile, paceProfile, removeTile, resizeTile, sizeOf, weekContext, weekFigures, weeklyDistance } from '@/lib/dashboard';

const run = (startTime: string, km: number, min = 30) => ({ startTime, distance: km * 1000, duration: min * 60 });
// Sunday 22 Nov 2026: the week runs from Monday 16 Nov.
const TODAY = new Date(2026, 10, 22, 12);

describe('Dashboard', () => {
  it('Tiles added, moved and removed', () => {
    expect(DEFAULT_TILES.map((t) => t.kind)).toEqual(['week', 'form', 'last', 'weekly', 'recent']);
    let tiles = addTile(DEFAULT_TILES, 'segment', 'b-1');
    expect(tiles.at(-1)).toEqual({ id: 'segment:b-1', kind: 'segment', ref: 'b-1' });
    expect(addTile(tiles, 'segment', 'b-1')).toBe(tiles);
    expect(hasTile(tiles, 'segment', 'b-1')).toBe(true);
    tiles = moveTile(tiles, 'segment:b-1', -1);
    expect(tiles.map((t) => t.id).slice(-2)).toEqual(['segment:b-1', 'recent']);
    expect(moveTile(tiles, 'week', -1)).toBe(tiles);
    expect(moveTile(tiles, 'nothing', 1)).toBe(tiles);
    expect(removeTile(tiles, 'week').map((t) => t.id)).not.toContain('week');
  });

  it('This week and the weeks before', () => {
    const runs = [run('2026-11-16T07:00:00', 10), run('2026-11-18T18:00:00', 5.5, 28), run('2026-11-22T09:00:00', 8), run('2026-11-12T07:00:00', 12), run('2026-10-01T07:00:00', 20)];
    const w = weekFigures(runs, TODAY);
    expect(w).toMatchObject({ runs: 3, lastWeekKm: 12, time: 88 * 60 });
    expect(w.km).toBeCloseTo(23.5);
    expect(w.byDay).toEqual([10, 0, 5.5, 0, 0, 0, 8]);
    const weeks = weeklyDistance(runs, 4, TODAY);
    expect(weeks.map((x) => x.monday)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
    expect(weeks.map((x) => x.km)).toEqual([0, 0, 12, 23.5]);
    expect(weeks[3].runs).toBe(3);
  });

  it('This week read against the weeks before', () => {
    // On Wednesday 18 Nov: last week up to its Wednesday (not its weekend), and the mean of the four weeks before.
    const wednesday = new Date(2026, 10, 18, 20);
    const runs = [run('2026-11-16T07:00:00', 10), run('2026-11-09T07:00:00', 8), run('2026-11-11T07:00:00', 6), run('2026-11-14T07:00:00', 20), run('2026-11-03T07:00:00', 30), run('2026-10-28T07:00:00', 10), run('2026-10-20T07:00:00', 16), run('2026-09-01T07:00:00', 99)];
    const c = weekContext(runs, wednesday);
    expect(c.lastWeekToDateKm).toBe(14);
    expect(c.averageKm).toBe((34 + 30 + 10 + 16) / 4);
    // A runner one week in: that week alone; with no week before, nothing to read against.
    expect(weekContext([run('2026-11-16T07:00:00', 10), run('2026-11-12T07:00:00', 7)], wednesday)).toEqual({ lastWeekToDateKm: 0, averageKm: 7, weeks: 1 });
    expect(weekContext([run('2026-11-16T07:00:00', 10)], wednesday).averageKm).toBeNull();
    expect(weekContext([], wednesday)).toEqual({ lastWeekToDateKm: 0, averageKm: null, weeks: 0 });
  });

  it('A run pinned, its pace in a few points', () => {
    const tiles = addTile(DEFAULT_TILES, 'run', 'r-1');
    expect(tiles.at(-1)).toEqual({ id: 'run:r-1', kind: 'run', ref: 'r-1' });
    // A widget pinned from its card keeps its name and how it was set.
    expect(addTile([], 'perf', 'load/form', { name: 'Fitness, fatigue and form' })).toEqual([{ id: 'perf:load/form', kind: 'perf', ref: 'load/form', name: 'Fitness, fatigue and form' }]);
    expect(addTile([], 'run', 'r-2', { opts: 'speed,heartRate' })[0].opts).toBe('speed,heartRate');
    // 4 m/s then a stop then 5 m/s, in three stretches: the stop left out.
    expect(paceProfile([4, 4, null, 0.2, 5, 5], 3)).toEqual([250, 200]);
    expect(paceProfile([])).toEqual([]);
  });

  it('A tile sized in thirds of the row', () => {
    expect(DEFAULT_TILES.map(sizeOf)).toEqual([1, 1, 1, 2, 1]);
    expect(sizeOf({ id: 'perf:load/form', kind: 'perf', ref: 'load/form' })).toBe(3);
    let tiles = resizeTile(DEFAULT_TILES, 'weekly');
    expect(sizeOf(tiles.find((t) => t.id === 'weekly')!)).toBe(3);
    tiles = resizeTile(tiles, 'weekly');
    expect(sizeOf(tiles.find((t) => t.id === 'weekly')!)).toBe(1);
  });
});

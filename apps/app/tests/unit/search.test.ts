import { describe, expect, it } from 'vitest';
import { NO_SEARCH, isSearching, matchesSearch, searchFromParams, searchToParams, type RunSearch } from '@/lib/log';
import type { IndexedRun } from '@/lib/kernel';

const run = (day: string, km: number, extra: Partial<IndexedRun> = {}): IndexedRun => ({
  id: day, startTime: new Date(`${day}T07:00:00`).toISOString(), file: `${day}.fit`, device: 'COROS PACE 4',
  distance: km * 1000, duration: km * 300, avgSpeed: 1000 / 300, avgHeartRate: 150, temperature: null,
  hasGps: true, laps: 1, metrics: ['speed', 'heartRate'], algorithmVersion: 1, ...extra,
});

describe('Search runs', () => {
  it('Runs matched by a search', () => {
    const tempo = run('2026-10-14', 10, { title: 'COROS test', workoutType: 'tempo', shoes: 'Shoes A', note: 'windy' });
    const easy = run('2026-11-02', 5, { workoutType: 'easy' });
    const found = (s: Partial<RunSearch>) => [tempo, easy].filter((r) => matchesSearch(r, { ...NO_SEARCH, ...s })).map((r) => r.id);
    for (const text of ['coros test', 'october windy', '2026-10', 'wednesday', 'shoes a', 'COROS  TEST']) expect(found({ text })).toEqual(['2026-10-14']);
    expect(found({ type: 'tempo' })).toEqual(['2026-10-14']);
    expect(found({ type: 'easy' })).toEqual(['2026-11-02']);
    expect(found({ minKm: 8, maxKm: 12 })).toEqual(['2026-10-14']);
    expect(found({ minKm: 4 })).toEqual(['2026-10-14', '2026-11-02']);
    expect(found({ maxKm: 6 })).toEqual(['2026-11-02']);
    expect(found({})).toEqual(['2026-10-14', '2026-11-02']);
    expect(found({ text: 'october easy' })).toEqual([]);
    expect(found({ text: 'pace 4 nov' })).toEqual(['2026-11-02']);
    // In a link and back; empty parts left out; odd numbers ignored.
    const s: RunSearch = { text: 'coros test', type: 'tempo', minKm: 8, maxKm: 12 };
    const p = searchToParams(s, new URLSearchParams('view=x'));
    expect(p.toString()).toBe('view=x&q=coros+test&type=tempo&min=8&max=12');
    expect(searchFromParams(p)).toEqual(s);
    expect(searchToParams(NO_SEARCH, p).toString()).toBe('view=x');
    expect(searchFromParams(new URLSearchParams('min=-1&max=abc&type='))).toEqual(NO_SEARCH);
    expect([isSearching(NO_SEARCH), isSearching(s), isSearching({ ...NO_SEARCH, maxKm: 3 })]).toEqual([false, true, true]);
  });
});

import { describe, expect, it } from 'vitest';
import { spanTicks } from '@/components/chartZoom';
import { viewFromParams, type RunView } from '@/components/runView';
import { DEFAULT_PERFORMANCE, invalidPerformance, parsePerformance } from '@/lib/settings';

const PREFS: RunView = { range: null, slots: ['speed', 'heartRate'], focus: null, layout: 'overlay', axis: 'time', smooth: true, blocks: true, map: null };
const KEYS = { has: () => true };

/** The review of the settings and of the screens (26 Nov 2026, "tak zacznij od poczzatku ... i przejdz przez wszystkie"). */
describe('Settings and screens reviewed', () => {
  it('Values of the model that cannot be saved', () => {
    const typed = { restHr: 50, maxHr: 185, thresholdPace: 270, thresholdPower: null, fitnessDays: 42, fatigueDays: 7 };
    expect(invalidPerformance(typed)).toEqual([]);
    // Outside its range: named, not replaced by a default in silence.
    expect(invalidPerformance({ ...typed, restHr: 6, fatigueDays: 1, fitnessDays: 150, maxHr: 250, thresholdPace: 90 })).toEqual(['restHr', 'maxHr', 'thresholdPace', 'fitnessDays', 'fatigueDays']);
    // Against each other: a maximum heart rate not above the resting one, fatigue not shorter than fitness.
    expect(invalidPerformance({ ...typed, restHr: 110, maxHr: 105 })).toEqual(['maxHr']);
    expect(invalidPerformance({ ...typed, fitnessDays: 20, fatigueDays: 20 })).toEqual(['fatigueDays']);
    // A file that holds such values: the maximum left to the app, the time constants the defaults.
    expect(parsePerformance({ restHr: 110, maxHr: 105 })).toMatchObject({ restHr: 110, maxHr: null });
    expect(parsePerformance({ fitnessDays: 10, fatigueDays: 20 })).toMatchObject({ fitnessDays: DEFAULT_PERFORMANCE.fitnessDays, fatigueDays: DEFAULT_PERFORMANCE.fatigueDays });
    expect(parsePerformance({ fitnessDays: 30, fatigueDays: 5 })).toMatchObject({ fitnessDays: 30, fatigueDays: 5 });
  });

  it("A run's link within what a run can be", () => {
    const read = (query: string) => viewFromParams(new URLSearchParams(query), PREFS, KEYS);
    expect(read('from=600&to=1200').range).toEqual([600, 1200]);
    // A range no run has (it drew ticks until the tab hung) and a zoom no map has: left out.
    expect(read('from=0&to=1e15').range).toBeNull();
    expect(read('from=0&to=Infinity').range).toBeNull();
    expect(read('map=14,100,200').map).toEqual({ z: 14, cx: 100, cy: 200 });
    expect(read('map=-40,0,0').map).toBeNull();
    // The ticks of a span stay few, whatever the span.
    expect(spanTicks(0, 3600)).toEqual([0, 600, 1200, 1800, 2400, 3000, 3600]);
    expect(spanTicks(0, 7 * 86_400).length).toBeLessThanOrEqual(49);
    expect(spanTicks(0, 1e12).length).toBeLessThanOrEqual(49);
  });
});

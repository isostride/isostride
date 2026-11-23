import { describe, expect, it } from 'vitest';
import { addItem, changesByMetric, formatItems, parseItems, runMean } from '@/lib/compare';
import { days, inst } from '../support/instances';
import { syntheticRun } from '../support/synthetic';

const PACE = (s: number) => 1000 / s; // m/s from s/km

describe('Analysis workspace', () => {
  it('Runs compared by their averages', () => {
    // 6 km at 5:00/km with heart rate 140, 4 km at 4:30/km with heart rate 155: one point each per metric.
    const a = syntheticRun(1800, () => ({ speed: PACE(300), heartRate: 140 }));
    const b = syntheticRun(1080, () => ({ speed: PACE(270), heartRate: 155 }));
    expect([runMean(a, 'speed'), runMean(b, 'speed')].map((v) => Math.round(v!))).toEqual([300, 270]);
    expect([runMean(a, 'heartRate'), runMean(b, 'heartRate')]).toEqual([140, 155]);
    // Standing still does not lower the average: only the moving samples count.
    const stops = syntheticRun(1200, (t) => ({ speed: t >= 600 && t < 660 ? 0 : PACE(300), heartRate: t >= 600 && t < 660 ? 100 : 140 }));
    expect([Math.round(runMean(stops, 'speed')!), runMean(stops, 'heartRate')]).toEqual([300, 140]);
    // No heart rate recorded: no average, no efficiency.
    expect(runMean(syntheticRun(600, () => ({ speed: PACE(300) })), 'heartRate')).toBeNull();
    expect(runMean(syntheticRun(600, () => ({ speed: PACE(300) })), 'efficiency')).toBeNull();
    // Efficiency of a run: its moving speed per heart rate, metres per beat.
    expect(runMean(a, 'efficiency')).toBeCloseTo((PACE(300) * 60) / 140, 3);
  });

  it('Blocks and a run compared', () => {
    // Removing the first item keeps the colours of the others; a new item takes the free slot.
    let items = addItem(addItem(addItem([], 'block', 'b1'), 'block', 'b2'), 'run', 'r1');
    expect(items.map((i) => i.slot)).toEqual([0, 1, 2]);
    items = items.filter((i) => i.id !== 'b1');
    expect(items.map((i) => i.slot)).toEqual([1, 2]);
    items = addItem(items, 'run', 'r2');
    expect(items.find((i) => i.id === 'r2')!.slot).toBe(0);
    expect(parseItems(formatItems(items))).toEqual(items);
    // At most 4 items, no duplicate.
    expect(addItem(addItem(items, 'run', 'r3'), 'run', 'r4')).toHaveLength(4);
    expect(addItem(items, 'run', 'r1')).toBe(items);
  });

  it('Items read from a link', () => {
    // Unknown kinds, missing ids and duplicates are dropped; at most 4.
    expect(parseItems(null)).toEqual([]);
    expect(parseItems('x:1:0,b::0,b:a:1,b:a:2,r:b,r:c:3,r:d:0,r:e:1')).toEqual([
      { kind: 'block', id: 'a', slot: 1 }, { kind: 'run', id: 'b', slot: 0 }, { kind: 'run', id: 'c', slot: 3 }, { kind: 'run', id: 'd', slot: 0 },
    ]);
  });
});

describe('Analysis of several metrics', () => {
  it('Several metrics analysed together', () => {
    // Pace faster by 2 s/km every week, heart rate steady: a change for pace, none for heart rate.
    const all = days('2026-08-03', 8).map((d, k) => inst(d, { metrics: { speed: PACE(300 - 2 * k), heartRate: 150 + (k % 2 ? 1 : -1) } }));
    const [pace, hr] = changesByMetric(all, 'def', ['speed', 'heartRate'], false);
    expect(pace).toMatchObject({ metric: 'speed', n: 8, verdict: 'change' });
    expect(pace.change!).toBeCloseTo(-14, 0);
    expect(pace.start!).toBeCloseTo(300, 0);
    expect(hr).toMatchObject({ metric: 'heartRate', n: 8, verdict: 'no detectable change' });
    // A block without instances has no change; one with too few has no verdict.
    expect(changesByMetric([], 'def', ['speed'])).toEqual([{ metric: 'speed', n: 0, change: null, start: null, noise: null, verdict: null }]);
    expect(changesByMetric(all.slice(0, 3), 'def', ['speed'])[0]).toMatchObject({ n: 3, change: null, verdict: null });
  });
});

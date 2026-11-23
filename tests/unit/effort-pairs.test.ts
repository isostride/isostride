import { describe, expect, it } from 'vitest';
import { pairEfforts, type BestEffort } from '@/lib/load';

const effort = (duration: number, runId: string, at: [number, number] | null, value: number): BestEffort =>
  ({ duration, value, runId, startTime: '2026-11-01T08:00:00Z', at, hr: 170, hrKind: 'mean', effort: 'allout' });

describe('Best efforts of pace and power', () => {
  it('One row a length, one effort where pace and power share a stretch', () => {
    const pace = [effort(120, 'r1', [100, 220], 5), effort(300, 'r1', [400, 700], 4.6), null, effort(1200, 'r3', null, 4)];
    const power = [effort(120, 'r1', [150, 270], 380), effort(300, 'r2', [0, 300], 360), null, null];
    const rows = pairEfforts(pace, power);
    expect(rows.map((r) => [r.duration, r.same])).toEqual([[120, true], [300, false], [1200, false]]);
    expect(rows[2].power).toBeNull();
    // The same run but stretches apart: two efforts.
    expect(pairEfforts([effort(120, 'r1', [0, 120], 5)], [effort(120, 'r1', [600, 720], 390)])[0].same).toBe(false);
    expect(pairEfforts([], [])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildInstance, findPasses } from '@/lib/detection';
import type { RefPoint } from '@/lib/blocks';
import type { TrackPoint } from '@/lib/geo';
import { rowFor, steadyDef, syntheticRun } from '../support/synthetic';

const PACE_5_00 = 1000 / 300; // m/s

describe('Strict condition matching', () => {
  it('Steady pass accepted', () => {
    // Steady 5:00/km from minute 2; the block is minutes 12–17.
    const run = syntheticRun(1500, (t) => ({ speed: t < 120 ? 2.5 : PACE_5_00 * (1 + 0.02 * Math.sin(t / 7)), heartRate: 150 }));
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 1020);
    expect(inst.status).toBe('accepted');
    expect(inst.reasons).toEqual([]);
    expect(inst.context.block.cv).toBeLessThan(0.15);
    expect(inst.heartRate.valid).toBe(true);
  });

  it('Hilly fragment rejected', () => {
    const run = syntheticRun(1500, (t) => ({ speed: PACE_5_00, effortPace: PACE_5_00 * 1.07 }));
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 1020);
    expect(inst.status).toBe('rejected');
    expect(inst.reasons).toContain('grade: effort pace differs by 7%, limit 4%');
  });

  it('Auto-pause counts as stopped', () => {
    // The watch paused for 40 s at a crossing in the middle of the block: no samples, so
    // the mean speed of the samples still reads 5:00/km, but the runner stood for 40 s.
    const run = syntheticRun(1500, () => ({ speed: PACE_5_00, heartRate: 150 }));
    const keep = run.samples.t.map((t) => t < 850 || t >= 890);
    for (const k of Object.keys(run.samples) as (keyof typeof run.samples)[]) (run.samples as any)[k] = (run.samples[k] as unknown[]).filter((_, i) => keep[i]);
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 1020);
    expect(inst.status).toBe('rejected');
    expect(inst.reasons).toContain('stopped: 40 s in the block, limit 10 s');
  });

  it('Effort before differs', () => {
    // 20% faster in the 2 minutes before the block.
    const run = syntheticRun(1500, (t) => ({ speed: t < 720 ? PACE_5_00 * 1.2 : PACE_5_00 }));
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 1020);
    expect(inst.reasons).toContain('effort before the block: 20%, limit 12%');
  });
});

describe('Reject with reason', () => {
  it('Unsteady pass rejected', () => {
    // Surges: speed alternates ±25% every 30 s → CV ≈ 0.25.
    const run = syntheticRun(1500, (t) => ({ speed: PACE_5_00 * (Math.floor(t / 30) % 2 ? 1.25 : 0.75) }));
    const inst = buildInstance(steadyDef({ paceMin: null, paceMax: null, effortBeforeMax: null }), run, rowFor(run), 720, 1020);
    expect(inst.status).toBe('rejected');
    expect(inst.reasons.join()).toMatch(/^pace steadiness: CV 0\.2\d, limit 0\.15$/);
  });

  it('Early pass rejected for HR', () => {
    const run = syntheticRun(1500, () => ({ speed: PACE_5_00, heartRate: 140 }));
    const inst = buildInstance(steadyDef({ effortBeforeMax: null }), run, rowFor(run), 360, 660);
    expect(inst.heartRate).toEqual({ valid: false, reason: 'block start 6 min, minimum 8 min' });
    // The block still counts for the gait metrics.
    expect(inst.gaitValid).toBe(true);
  });
});

describe('Minimum length per metric', () => {
  it('Short block, no HR result', () => {
    const run = syntheticRun(1500, () => ({ speed: PACE_5_00, heartRate: 140, groundContactTime: 240 }));
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 900);
    expect(inst.gaitValid).toBe(true);
    expect(inst.heartRate).toEqual({ valid: false, reason: 'block 3 min, minimum 4 min' });
  });

  it('Very short block, no result', () => {
    const run = syntheticRun(1500, () => ({ speed: PACE_5_00 }));
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 765);
    expect(inst.gaitValid).toBe(false);
    expect(inst.heartRate.valid).toBe(false);
  });
});

describe('Route direction', () => {
  it('Southbound pass rejected', () => {
    // A straight 1 km northbound reference; a run along it southbound has no pass.
    const ref: RefPoint[] = Array.from({ length: 101 }, (_, i) => ({ lat: 41.39 + (i * 10) / 111_195, lon: 2.2, heading: 0 }));
    const north: TrackPoint[] = ref.map((p, i) => ({ ...p, d: i * 10, t: i * 3 }));
    const south: TrackPoint[] = [...ref].reverse().map((p, i) => ({ ...p, heading: 180, d: i * 10, t: i * 3 }));
    expect(findPasses(ref, north)).toHaveLength(1);
    expect(findPasses(ref, south)).toHaveLength(0);
  });
});

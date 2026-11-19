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
    expect(inst.metrics.heartRate).toBe(150);
  });

  it('Hilly fragment rejected', () => {
    const run = syntheticRun(1500, (t) => ({ speed: PACE_5_00, effortPace: PACE_5_00 * 1.07 }));
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 1020);
    expect(inst.status).toBe('rejected');
    expect(inst.reasons).toContain('grade: effort pace differs by 7%, limit 4%');
  });

  it('Stop measured on the moving part', () => {
    // A steady 5:00/km block 12 minutes in; the watch paused for 40 s at a crossing (no samples).
    const paused = syntheticRun(1500, () => ({ speed: PACE_5_00, heartRate: 150 }));
    const keep = paused.samples.t.map((t) => t < 850 || t >= 890);
    for (const k of Object.keys(paused.samples) as (keyof typeof paused.samples)[]) (paused.samples as any)[k] = (paused.samples[k] as unknown[]).filter((_, i) => keep[i]);
    const inst = buildInstance(steadyDef(), paused, rowFor(paused), 720, 1020);
    // Accepted, pace 5:00/km and heart rate from the moving samples; the stop of 40 s recorded.
    expect(inst.status).toBe('accepted');
    expect(inst.context.block.pace).toBe(300);
    expect(inst.metrics.heartRate).toBe(150);
    expect(inst.context.block.stopped).toBe(40);

    // A block with a stop in its last 2 minutes is accepted the same way, every metric included.
    const late = syntheticRun(1500, (t) => ({ speed: t >= 960 && t < 965 ? 0 : PACE_5_00, heartRate: 150 }));
    const l = buildInstance(steadyDef(), late, rowFor(late), 720, 1020);
    expect([l.status, l.metrics.heartRate]).toEqual(['accepted', 150]);
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

  it('Early pass keeps its heart rate', () => {
    // A pass 6 minutes into the run: accepted for every metric, heart rate over the whole pass.
    const run = syntheticRun(1500, (t) => ({ speed: PACE_5_00, heartRate: t < 510 ? 130 : 150, groundContactTime: 240 }));
    const inst = buildInstance(steadyDef({ effortBeforeMax: null }), run, rowFor(run), 360, 660);
    expect(inst.status).toBe('accepted');
    expect(inst.metrics.heartRate).toBe(140);
    expect(inst.metrics.groundContactTime).toBe(240);
  });
});

describe('Minimum block length', () => {
  it('Short block has every result', () => {
    // 3 minutes: heart rate, ground contact time, cadence, vertical oscillation and step length.
    const run = syntheticRun(1500, () => ({ speed: PACE_5_00, heartRate: 140, groundContactTime: 240, cadence: 172, verticalOscillation: 80, stepLength: 1160 }));
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 900);
    expect(inst.status).toBe('accepted');
    expect([inst.metrics.heartRate, inst.metrics.groundContactTime, inst.metrics.cadence, inst.metrics.verticalOscillation, inst.metrics.stepLength]).toEqual([140, 240, 172, 80, 1160]);
  });

  it('Very short block, no result', () => {
    // 45 s: rejected for every metric.
    const run = syntheticRun(1500, () => ({ speed: PACE_5_00 }));
    const inst = buildInstance(steadyDef(), run, rowFor(run), 720, 765);
    expect(inst.status).toBe('rejected');
    expect(inst.reasons).toContain('block 45 s, minimum 60 s');
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

describe('Running efficiency metric', () => {
  it('Efficiency of a steady block', () => {
    // 5:00/km at 150 bpm: 1.33 metres per beat; 4:40/km at 150 bpm: 1.43, an improvement.
    const at = (secPerKm: number, hr: number | null) => {
      const run = syntheticRun(1500, () => ({ speed: 1000 / secPerKm, heartRate: hr }));
      return buildInstance(steadyDef({ paceMin: null, paceMax: null }), run, rowFor(run), 720, 1020);
    };
    const easy = at(300, 150);
    expect(easy.metrics.efficiency).toBeCloseTo(1.33, 2);
    expect(easy.profile.efficiency.every((v) => v !== null && Math.abs(v - 1.333) < 0.01)).toBe(true);
    expect(at(280, 150).metrics.efficiency).toBeCloseTo(1.43, 2);
    // A run without heart rate has no efficiency.
    expect(at(300, null).metrics.efficiency).toBeNull();
  });
});

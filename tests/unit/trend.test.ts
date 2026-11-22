import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { fromRecommendation, RECOMMENDATIONS_PATH, writeDefinitions, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { runBlocks } from '@/lib/detection';
import { instancesCsv, selectInstances, computeTrend, profiles } from '@/lib/compare';
import { PATHS, readJson } from '@/lib/fs';
import { importFolder } from '@/lib/pipeline';
import { TEST_DATA, makeDataFolder, recordMeasure } from '../support/fixtures';
import { days, inst } from '../support/instances';

describe('Show trend', () => {
  it('Tempo trend filtered', () => {
    const all = days('2026-08-01', 10).map((d, k) => inst(d, { metrics: { heartRate: 150 }, run: { shoes: k % 2 ? 'Shoes B' : 'Shoes A' } }));
    const t = computeTrend(all, 'def', 'speed', { shoes: 'Shoes A' });
    expect(t.included).toBe(5);
    expect(t.series.flatMap((s) => s.points).every((p) => p.instance.context.run.shoes === 'Shoes A')).toBe(true);
    expect(t.rejected).toHaveLength(5);
    expect(t.rejected[0].reasons).toEqual(['filtered out: shoes is Shoes B']);
  });

  it('Trend verdict on a falling heart rate', () => {
    // Heart rate falls 1 bpm a week for 12 weeks, ±1 bpm noise: a change of about 11 bpm.
    const all = days('2026-08-01', 12).map((d, k) => inst(d, { metrics: { heartRate: 152 - k + (k % 2 ? 1 : -1) } }));
    const s = computeTrend(all, 'def', 'heartRate').series[0];
    expect(s.fit!.change).toBeCloseTo(-11, 0);
    expect(s.fit!.ci[1]).toBeLessThan(0);
    expect(s.fit!.verdict).toBe('change');
  });
});

describe('Separate series per device', () => {
  it('Sensor change splits series', () => {
    const wrist = days('2026-08-01', 6).map((d) => inst(d, { metrics: { heartRate: 150 } }));
    const band = days('2026-10-15', 6).map((d) => inst(d, { metrics: { heartRate: 140 }, run: { heartRateSource: 'Arm band' } }));
    const t = computeTrend([...wrist, ...band], 'def', 'heartRate');
    expect(t.series.map((s) => [s.source, s.points.length])).toEqual([['wrist (COROS PACE 4)', 6], ['Arm band', 6]]);
    // Each series has its own line; none spans both sensors.
    for (const s of t.series) expect(new Set(s.points.map((p) => p.instance.context.run.heartRateSource)).size).toBe(1);
  });
});

describe('Residual pace correction', () => {
  it('Raw and corrected shown', () => {
    // HR rises 0.5 bpm per s/km faster: 150 at 5:00, 155 at 4:50, 145 at 5:10.
    const paces = [290, 300, 310, 295, 305, 300];
    const all = paces.map((p, k) => inst(days('2026-08-01', 6)[k], { pace: p, metrics: { heartRate: 150 - 0.5 * (p - 300) } }));
    const pts = computeTrend(all, 'def', 'heartRate').series[0].points;
    for (const p of pts) expect(p.corrected).toBeCloseTo(150, 6);
    expect(pts.map((p) => p.raw)).toEqual([155, 150, 145, 152.5, 147.5, 150]);
    // Pace itself is never corrected.
    expect(computeTrend(all, 'def', 'speed').series[0].points.every((p) => p.raw === p.corrected)).toBe(true);
  });
});

describe('Minimum instance count', () => {
  it('Trend of four, no verdict', () => {
    const four = days('2026-08-01', 4).map((d, k) => inst(d, { metrics: { heartRate: 150 - k } }));
    expect(computeTrend(four, 'def', 'heartRate').series[0].fit).toBeNull();
    const five = [...four, inst('2026-09-01', { metrics: { heartRate: 146 } })];
    expect(computeTrend(five, 'def', 'heartRate').series[0].fit).not.toBeNull();
  });
});

describe('Noise threshold', () => {
  it('Noise threshold computed', () => {
    const gct = [248, 251, 246, 250, 249];
    const all = gct.map((v, k) => inst(days('2026-08-01', 5)[k], { metrics: { groundContactTime: v } }));
    const s = computeTrend(all, 'def', 'groundContactTime', {}, false).series[0];
    // Hand-computed sample standard deviation: sqrt(14.8 / 4) = 1.92 ms.
    expect(s.noise).toBeCloseTo(1.924, 3);
  });
});

describe('Fragment counted once', () => {
  it('Overlap counted once', () => {
    const a = inst('2026-08-01', { runId: 'r1', start: 600, end: 1080 });
    const b = inst('2026-08-01', { runId: 'r1', start: 840, end: 1320 });
    const { included, rejected } = selectInstances([a, b], 'def', 'speed');
    expect(included.map((i) => i.id)).toEqual([a.id]);
    expect(rejected[0].reasons[0]).toBe('overlaps an included effort of the same run (min 10–18)');
  });
});

describe('Result transparency', () => {
  it('Open instances of a result', () => {
    const ok = inst('2026-08-01', { metrics: { heartRate: 150 } });
    const unsteady = inst('2026-08-08', { status: 'rejected', reasons: ['pace steadiness: CV 0.22, limit 0.15'], metrics: { heartRate: 150 } });
    const noHr = inst('2026-08-15', { metrics: { heartRate: null } });
    const t = computeTrend([ok, unsteady, noHr], 'def', 'heartRate');
    expect(t.included).toBe(1);
    expect(t.rejected.map((r) => r.reasons)).toEqual([['pace steadiness: CV 0.22, limit 0.15'], ['heart rate: not recorded']]);
  });
});

describe('Instance context on hover', () => {
  it('Hover shows context', () => {
    const p = computeTrend([inst('2026-11-14', { metrics: { heartRate: 135 } })], 'def', 'heartRate').series[0].points[0];
    const c = p.instance.context;
    expect({ run: p.instance.runId, date: p.date.slice(0, 10), pace: c.block.pace, direction: c.block.heading, minute: c.before.minuteOfRun, shoes: c.run.shoes, sensor: c.run.heartRateSource })
      .toEqual({ run: 'run-2026-11-14', date: '2026-11-14', pace: 300, direction: 45, minute: 12, shoes: 'Shoes A', sensor: 'wrist (COROS PACE 4)' });
  });
});

describe('Overlay block profiles', () => {
  it('Tempo profiles overlaid', () => {
    const a = inst('2026-08-20', { metrics: { heartRate: 160 } });
    const b = inst('2026-11-12', { metrics: { heartRate: 150 } });
    a.profile.heartRate = Array.from({ length: 25 }, (_, k) => 150 + k * 0.6);
    b.profile.heartRate = Array.from({ length: 25 }, (_, k) => 145 + k * 0.3);
    const p = profiles([a, b], 'heartRate');
    expect(p.map((x) => x.values.length)).toEqual([25, 25]);
    // Drift within the effort: +14.4 bpm in August, +7.2 in November.
    expect(p[0].values[24]! - p[0].values[0]!).toBeCloseTo(14.4, 6);
    expect(p[1].values[24]! - p[1].values[0]!).toBeCloseTo(7.2, 6);
  });
});

describe('Export to CSV', () => {
  it('Export instances to CSV', () => {
    const rows = [inst('2026-08-01', { metrics: { heartRate: 150 } }), inst('2026-08-08', { status: 'rejected', reasons: ['grade: effort pace differs by 7%, limit 4%'] })];
    const csv = instancesCsv(rows, new Map([['def', 'Promenade, NE']])).trim().split('\n');
    expect(csv).toHaveLength(3);
    expect(csv[0].split(',').slice(0, 3)).toEqual(['definition', 'run', 'date']);
    expect(csv[1].startsWith('"Promenade, NE",run-2026-08-01,2026-08-01')).toBe(true);
    expect(csv[2]).toContain('rejected,"grade: effort pace differs by 7%, limit 4%"');
  });
});

describe('Show trend', () => {
  it('Trend opens on a metric with a result', async () => {
    const { firstUsableMetric, reasonSummary } = await import('@/lib/compare');
    // Heart rate recorded in 2 instances only (no heart rate in the other runs), pace in all 6.
    const all = days('2026-08-03', 6).map((d, k) => inst(d, { metrics: { heartRate: k < 2 ? 150 : null } }));
    expect(firstUsableMetric(all, 'def', ['heartRate', 'speed'])).toBe('speed');
    expect(firstUsableMetric(all, 'def', ['heartRate', 'speed'], 2)).toBe('heartRate');
    expect(reasonSummary([{ instance: all[0], reasons: ['pace: 5:40 outside 4:45–5:15', 'grade: 6%'] }, { instance: all[1], reasons: ['pace: 5:30 outside 4:45–5:15'] }])).toEqual(['pace (2)', 'grade (1)']);
  });
});

describe('Running efficiency metric', () => {
  it('Instances from an older version have no efficiency', async () => {
    const { selectInstances, valueOf } = await import('@/lib/compare');
    // A file written before efficiency existed: the field is missing, not null.
    const old = inst('2026-08-03', { metrics: { heartRate: 150 } });
    delete (old.metrics as Partial<typeof old.metrics>).efficiency;
    expect(valueOf(old, 'efficiency')).toBeNull();
    const s = selectInstances([old], 'def', 'efficiency');
    expect(s.included).toEqual([]);
    expect(s.rejected[0].reasons).toEqual(['efficiency: not recorded']);
  });
});

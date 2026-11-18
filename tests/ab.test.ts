import fs from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { RECOMMENDATIONS_PATH, fromRecommendation, writeDefinitions } from '@/lib/blocks/definitions';
import { runBlocks } from '@/lib/blocks/pipeline';
import type { BlockInstance, BlockInstancesFile, Recommendation } from '@/lib/blocks/types';
import { abCsv, byField, computeAb, interleaved } from '@/lib/compare/ab';
import { hash } from '@/lib/compare/trend';
import { rng } from '@/lib/stats/stats';
import { PATHS, readJson } from '@/lib/fs/folder';
import { importFolder } from '@/lib/ingest/importFolder';
import { TEST_DATA, makeDataFolder, recordMeasure } from './support/fixtures';
import { days, inst } from './support/instances';

/** 8 + 8 promenade passes: A every other week, B the weeks between (rotated). */
function shoes(gctA: number[], gctB: number[], rotated = true) {
  const d = days('2026-08-03', 16);
  const a = gctA.map((v, k) => inst(rotated ? d[2 * k] : d[k], { metrics: { groundContactTime: v }, run: { shoes: 'Shoes A' } }));
  const b = gctB.map((v, k) => inst(rotated ? d[2 * k + 1] : d[8 + k], { metrics: { groundContactTime: v }, run: { shoes: 'Shoes B' } }));
  return [...a, ...b];
}
const split = byField('shoes', 'Shoes A', 'Shoes B');

describe('A/B comparison', () => {
  it('Shoe A/B comparison', () => {
    const r = computeAb(shoes([249, 251, 248, 252, 250, 249, 251, 250], [244, 246, 243, 245, 244, 246, 245, 243]), 'def', 'groundContactTime', split, ['Shoes A', 'Shoes B']);
    expect(r.a.points).toHaveLength(8);
    expect(r.b.points).toHaveLength(8);
    expect(r.difference).toBeCloseTo(-5.5, 6);
    expect(r.ci![0]).toBeLessThan(r.difference!);
    expect(r.ci![1]).toBeGreaterThan(r.difference!);
    expect(r.verdict).not.toBeNull();
    expect(r.warnings).toEqual([]);
  });
});

describe('A/B verdict rule', () => {
  it('Verdict: Change', () => {
    // B is 6 ms shorter with ±1 ms spread: the interval excludes zero and 6 > noise.
    const r = computeAb(shoes([250, 251, 249, 250, 251, 249, 250, 250], [244, 245, 243, 244, 245, 243, 244, 244]), 'def', 'groundContactTime', split);
    expect(r.difference).toBeCloseTo(-6, 6);
    expect(r.ci![1]).toBeLessThan(0);
    expect(r.difference!).toBeLessThan(-r.noise!);
    expect(r.verdict).toBe('change');
  });

  it('Verdict below noise', () => {
    // B is 1 ms shorter but instances spread ±3 ms: the difference is within the noise.
    const r = computeAb(shoes([247, 253, 250, 248, 252, 250, 246, 254], [246, 252, 249, 247, 251, 249, 245, 253]), 'def', 'groundContactTime', split);
    expect(Math.abs(r.difference!)).toBeLessThan(r.noise!);
    expect(r.verdict).toBe('no detectable change');
  });
});

describe('Confounding warning', () => {
  it('Shoes changed for good', () => {
    const r = computeAb(shoes([250, 251, 249, 250, 251, 249, 250, 250], [244, 245, 243, 244, 245, 243, 244, 244], false), 'def', 'groundContactTime', split, ['Shoes A', 'Shoes B']);
    expect(r.warnings[0]).toMatch(/^Shoes A and Shoes B do not interleave in time.*Rotate between them/);
    expect(interleaved(['2026-08-01', '2026-08-15'], ['2026-08-08'])).toBe(true);
    expect(interleaved(['2026-08-01', '2026-08-08'], ['2026-08-15'])).toBe(false);
  });
});

describe('Minimum instance count', () => {
  it('A/B side of three, no verdict', () => {
    const all = shoes([250, 251, 249, 250, 251, 249], [244, 245, 243]);
    const r = computeAb(all, 'def', 'groundContactTime', split);
    expect([r.a.points.length, r.b.points.length]).toEqual([6, 3]);
    expect(r.difference).not.toBeNull();
    expect(r.verdict).toBeNull();
  });
});

describe('Export to CSV', () => {
  it('Export A/B result to CSV', () => {
    const r = computeAb(shoes([250, 251, 249, 250, 251, 249, 250, 250], [244, 245, 243, 244, 245, 243, 244, 244]), 'def', 'groundContactTime', split, ['Shoes A', 'Shoes B']);
    const [head, row] = abCsv(r, 'Promenade NE').trim().split('\n');
    expect(head).toContain('difference,raw_difference,ci_low,ci_high,noise,verdict');
    expect(row).toContain('Shoes A,8,250.000,Shoes B,8,244.000,-6.000');
    expect(row).toContain(',change,');
  });
});

describe('Real data', () => {
  let all: BlockInstance[] = [];
  beforeAll(async () => {
    const files = (await fs.readdir(TEST_DATA)).filter((f) => f.endsWith('.fit'));
    const folder = await makeDataFolder(files);
    await importFolder(folder);
    const recs = (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations;
    // The two most-passed promenade segments, with a pace band wide enough for the year's runs.
    const defs = recs.filter((r) => r.params.type === 'route').slice(0, 2).map((r) => fromRecommendation(r, 'active'));
    for (const d of defs) d.tolerances = { ...d.tolerances, paceMin: 240, paceMax: 390 };
    await writeDefinitions(folder, defs);
    await runBlocks(folder);
    all = (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
  }, 180_000);

  it('Random split negative test', async () => {
    // 10 trials, each splitting the runs at random into A and B: a sound rule finds no change.
    const def = all[0].definitionId;
    let noChange = 0;
    let verdicts = 0;
    for (let trial = 0; trial < 10; trial++) {
      const next = rng(hash(`trial-${trial}`));
      const side = new Map<string, 'A' | 'B'>();
      for (const runId of new Set(all.map((i) => i.runId))) side.set(runId, next() < 0.5 ? 'A' : 'B');
      // Ground contact time: a gait metric of the same watch (PACE 4 only, one series).
      const r = computeAb(all, def, 'groundContactTime', (i) => side.get(i.runId) ?? null, ['A', 'B'], { device: 'COROS PACE 4' });
      if (r.verdict) verdicts++;
      if (r.verdict === 'no detectable change') noChange++;
    }
    await recordMeasure('abRandomSplitNoChangeTrials', noChange);
    expect(verdicts).toBe(10);
    expect(noChange).toBeGreaterThanOrEqual(9);
  });

  it('Filter change within 3 s', async () => {
    const def = all[0].definitionId;
    const side = (i: BlockInstance) => (i.runStart < '2026-08-01' ? 'A' : 'B');
    let max = 0;
    for (const metric of ['heartRate', 'groundContactTime', 'speed', 'cadence'] as const) {
      const t0 = performance.now();
      computeAb(all, def, metric, side);
      max = Math.max(max, (performance.now() - t0) / 1000);
    }
    await recordMeasure('abMaxSeconds', Math.round(max * 1000) / 1000);
    expect(max).toBeLessThanOrEqual(3);
  });
});

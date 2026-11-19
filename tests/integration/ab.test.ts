import fs from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { RECOMMENDATIONS_PATH, fromRecommendation, writeDefinitions, type BlockInstance, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { runBlocks } from '@/lib/detection';
import { abCsv, byField, computeAb, interleaved, hash } from '@/lib/compare';
import { rng } from '@/lib/stats';
import { PATHS, readJson } from '@/lib/fs';
import { importFolder } from '@/lib/pipeline';
import { TEST_DATA, makeDataFolder, recordMeasure } from '../support/fixtures';
import { days, inst } from '../support/instances';

/** 8 + 8 promenade passes: A every other week, B the weeks between (rotated). */
function shoes(gctA: number[], gctB: number[], rotated = true) {
  const d = days('2026-08-03', 16);
  const a = gctA.map((v, k) => inst(rotated ? d[2 * k] : d[k], { metrics: { groundContactTime: v }, run: { shoes: 'Shoes A' } }));
  const b = gctB.map((v, k) => inst(rotated ? d[2 * k + 1] : d[8 + k], { metrics: { groundContactTime: v }, run: { shoes: 'Shoes B' } }));
  return [...a, ...b];
}
const split = byField('shoes', 'Shoes A', 'Shoes B');

describe('Real data', () => {
  let all: BlockInstance[] = [];
  beforeAll(async () => {
    const files = (await fs.readdir(TEST_DATA)).filter((f) => f.endsWith('.fit'));
    const folder = await makeDataFolder(files);
    await importFolder(folder);
    const recs = (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations;
    // The two most-passed promenade segments, with a pace band wide enough for the year's runs:
    // these tests judge the verdict rule, not the matching.
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

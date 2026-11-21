import { describe, expect, it } from 'vitest';
import { fromRecommendation, RECOMMENDATIONS_PATH, writeDefinitions, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { runBlocks } from '@/lib/detection';
import { instancesCsv, selectInstances, computeTrend, profiles } from '@/lib/compare';
import { PATHS, readJson } from '@/lib/fs';
import { importFolder } from '@/lib/pipeline';
import { fitFixtures, makeDataFolder, recordMeasure, TEST_DATA } from '../support/fixtures';
import { days, inst } from '../support/instances';

describe('Analysis time budget', () => {
  it('Trend within 3 s', async () => {
    // The runner's whole year, a promenade definition accepted: time the trend of every metric.
    const files = (await fitFixtures());
    const folder = await makeDataFolder(files);
    await importFolder(folder);
    const recs = (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations;
    await writeDefinitions(folder, recs.filter((r) => r.params.type === 'route').slice(0, 3).map((r) => fromRecommendation(r, 'active')));
    await runBlocks(folder);
    const all = (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
    let max = 0;
    for (const def of new Set(all.map((i) => i.definitionId))) {
      for (const metric of ['heartRate', 'speed', 'groundContactTime'] as const) {
        const t0 = performance.now();
        computeTrend(all, def, metric);
        max = Math.max(max, (performance.now() - t0) / 1000);
      }
    }
    await recordMeasure('trendMaxSeconds', Math.round(max * 1000) / 1000);
    expect(max).toBeLessThanOrEqual(3);
  }, 120_000);
});

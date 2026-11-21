import { describe, expect, it } from 'vitest';
import { BLOCK_METRICS, RECOMMENDATIONS_PATH, fromRecommendation, readDefinitions, writeDefinitions, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { runBlocks } from '@/lib/detection';
import { MIN_TREND_INSTANCES, computeTrend, selectInstances } from '@/lib/compare';
import { PATHS, readJson } from '@/lib/fs';
import { importFolder } from '@/lib/pipeline';
import { fitFixtures, makeDataFolder, recordMeasure, TEST_DATA } from '../support/fixtures';

const SINCE_AUG = (await fitFixtures()).filter((f) => f >= '2026-08-03').sort();

/**
 * Acceptance criterion 3 (FF "Matches preliminary analysis"): measures the heart rate
 * trend on the promenade segment, northbound, in the 4:45–5:15/km band, for the model's
 * metric conditions. It records what the application computes; the conditions judge it.
 */
describe('Agreement with the preliminary analysis', () => {
  it('Promenade heart rate trend', async () => {
    const folder = await makeDataFolder(SINCE_AUG);
    await importFolder(folder);
    const recs = (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations;
    const promenade = recs.find(
      (r) => r.params.type === 'route' && r.params.length >= 900 && r.params.length <= 1300 && r.params.heading < 90 &&
        r.params.track.every((p) => p.lat > 41.385 && p.lat < 41.412 && p.lon > 2.19 && p.lon < 2.225),
    );
    expect(promenade, 'promenade segment, northbound').toBeDefined();
    const def = fromRecommendation(promenade!, 'active');
    def.tolerances = { ...def.tolerances, paceMin: 285, paceMax: 315 };
    await writeDefinitions(folder, [def]);
    await runBlocks(folder);
    const all = (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
    const { included } = selectInstances(all, def.id, 'heartRate');
    const augSep = included.filter((i) => i.runStart >= '2026-08' && i.runStart < '2026-10').map((i) => i.metrics.heartRate!);
    const nov14 = included.find((i) => i.runStart.startsWith('2026-11-14'));
    await recordMeasure('promenadeSteadyPasses', included.length);
    if (augSep.length) {
      await recordMeasure('promenadeHrAugSepMin', Math.round(Math.min(...augSep)));
      await recordMeasure('promenadeHrAugSepMax', Math.round(Math.max(...augSep)));
    }
    if (nov14) await recordMeasure('promenadeHrNov14AbsError', Math.abs(Math.round(nov14.metrics.heartRate! - 135)));

    // Criterion 3 as revised on 19 Nov 2026: pace while moving, waits at crossings rejected.
    expect(included.length).toBeGreaterThanOrEqual(5);
    // The August–September passes held waits at crossings (auto-pause): none is steady.
    expect(augSep).toEqual([]);
    expect(Math.abs(nov14!.metrics.heartRate! - 135)).toBeLessThanOrEqual(2);
  }, 120_000);
});

/**
 * Success criterion of step 1 (FF "Detects real change"): in the author's runs the tool finds
 * at least one change larger than the noise. Every suggested block is accepted and the trend
 * of every metric computed; a "change" verdict needs the change beyond the noise threshold,
 * its 95% interval clear of zero, and at least 5 instances.
 */
describe('Success criterion of step 1', () => {
  it('Detects real change', async () => {
    const files = (await fitFixtures());
    const folder = await makeDataFolder(files);
    await importFolder(folder);
    const recs = (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations;
    await writeDefinitions(folder, recs.map((r) => fromRecommendation(r, 'active')));
    await runBlocks(folder);
    const all = (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
    const changes: string[] = [];
    for (const d of await readDefinitions(folder))
      for (const m of BLOCK_METRICS)
        for (const s of computeTrend(all, d.id, m).series)
          if (s.fit?.verdict === 'change') {
            expect(s.points.length).toBeGreaterThanOrEqual(MIN_TREND_INSTANCES);
            expect(Math.abs(s.fit.change)).toBeGreaterThan(s.noise);
            expect(s.fit.ci[0] > 0 || s.fit.ci[1] < 0).toBe(true);
            changes.push(`${d.name} · ${m} · ${s.source}`);
          }
    await recordMeasure('trendChangesDetected', changes.length);
    expect(changes.length).toBeGreaterThanOrEqual(1);
  }, 300_000);
});

import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { RECOMMENDATIONS_PATH, fromRecommendation, writeDefinitions, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { runBlocks } from '@/lib/detection';
import { selectInstances } from '@/lib/compare';
import { PATHS, readJson } from '@/lib/fs';
import { importFolder } from '@/lib/pipeline';
import { TEST_DATA, makeDataFolder, recordMeasure } from '../support/fixtures';

const SINCE_AUG = (await fs.readdir(TEST_DATA)).filter((f) => f.endsWith('.fit') && f >= '2026-08-03').sort();

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

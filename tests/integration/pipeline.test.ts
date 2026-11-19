import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { RECOMMENDATIONS_PATH, fromRecommendation, writeDefinitions, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { PATHS, readJson } from '@/lib/fs';
import { writeGear } from '@/lib/gear';
import type { RunsIndex } from '@/lib/kernel';
import { importFolder, refreshBlocks, refreshContext } from '@/lib/pipeline';
import { TEST_DATA, makeDataFolder } from '../support/fixtures';

const FILES = (await fs.readdir(TEST_DATA)).filter((f) => f.endsWith('.fit') && f >= '2026-10-01' && f < '2026-11-01').sort();

describe('Pipeline', () => {
  it('Gear change refreshes context and blocks', async () => {
    const folder = await makeDataFolder(FILES);
    await importFolder(folder);
    // Gear registered after the import: the context join puts it on every run and instance.
    await writeGear(folder, [{ id: 's', name: 'Shoes October', type: 'shoes', from: '2026-10-01', to: null }]);
    const rec = (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations[0];
    await writeDefinitions(folder, [fromRecommendation(rec, 'active')]);
    await refreshBlocks(folder);
    const before = (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((i) => i.context.run.shoes === null)).toBe(true);
    await refreshContext(folder);
    const index = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    expect(index.runs.every((r) => r.shoes === 'Shoes October')).toBe(true);
    const after = (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
    expect(after.every((i) => i.context.run.shoes === 'Shoes October')).toBe(true);
  }, 120_000);
});

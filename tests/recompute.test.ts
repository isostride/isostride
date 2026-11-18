import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeGear } from '@/lib/context/gear';
import { joinContext } from '@/lib/context/joinContext';
import { readRunTags, writeRunTags } from '@/lib/context/tags';
import { PATHS } from '@/lib/fs/folder';
import { emptyManifest, isOutdated } from '@/lib/fs/manifest';
import { importFolder } from '@/lib/ingest/importFolder';
import { recomputeEverything } from '@/lib/ingest/recompute';
import { ALGORITHM_VERSION } from '@/lib/version';
import { FILES, TEST_DATA, checksums, makeDataFolder, recordMeasure } from './support/fixtures';

async function folderWithUserData() {
  const folder = await makeDataFolder([FILES.pace4, FILES.pace3, FILES.pace4First, FILES.later]);
  await importFolder(folder);
  await writeGear(folder, [
    { id: 'a', name: 'Shoes A', type: 'shoes', from: '2026-01-01', to: '2026-10-31' },
    { id: 'hr', name: 'Arm band', type: 'hrSensor', from: '2026-10-15', to: null },
  ]);
  const tags = await readRunTags(folder);
  tags.tags['20261109-190552'] = { workoutType: 'tempo', note: 'windy' };
  await writeRunTags(folder, tags);
  await folder.writeText(PATHS.blockDefinitions, JSON.stringify({ definitions: [] }));
  await joinContext(folder);
  return folder;
}

const diff = (a: Record<string, string>, b: Record<string, string>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);

describe('Recompute everything', () => {
  it('Recompute gives same results', async () => {
    const folder = await folderWithUserData();
    const derived = path.join(folder.root, PATHS.derived);
    const before = await checksums(derived);
    await fs.rm(derived, { recursive: true });
    await recomputeEverything(folder);
    const differing = diff(before, await checksums(derived));
    await recordMeasure('recomputeDerivedFilesDiffering', differing.length);
    expect(differing).toEqual([]);
  });

  it('FIT files unchanged by recompute', async () => {
    const folder = await folderWithUserData();
    const fit = path.join(folder.root, 'fit');
    const before = await checksums(fit);
    await recomputeEverything(folder);
    const changed = diff(before, await checksums(fit));
    await recordMeasure('recomputeFitFilesChanged', changed.length);
    expect(changed).toEqual([]);
  });
});

describe('User data never overwritten', () => {
  it('User data survives recompute', async () => {
    const folder = await folderWithUserData();
    const user = path.join(folder.root, PATHS.user);
    const before = await checksums(user);
    expect(Object.keys(before).sort()).toEqual(['block-definitions.json', 'gear.json', 'run-tags.json']);
    await recomputeEverything(folder);
    const changed = diff(before, await checksums(user));
    await recordMeasure('recomputeUserFilesChanged', changed.length);
    expect(changed).toEqual([]);
  });
});

describe('Offer recompute on mismatch', () => {
  it('Old version offers recompute', () => {
    expect(isOutdated({ ...emptyManifest(), algorithmVersion: ALGORITHM_VERSION - 1 })).toBe(true);
    expect(isOutdated(emptyManifest())).toBe(false);
    expect(isOutdated(null)).toBe(false);
  });
});

describe('Recompute time budget', () => {
  it('Recompute within 15 min', async () => {
    // All of the runner's files; the time is scaled to the spec's ~300 runs.
    const files = (await fs.readdir(TEST_DATA)).filter((f) => f.endsWith('.fit'));
    const folder = await makeDataFolder(files);
    const t0 = performance.now();
    const report = await recomputeEverything(folder);
    const seconds = (performance.now() - t0) / 1000;
    const per300 = (seconds / files.length) * 300;
    await recordMeasure('recomputeSecondsPer300Runs', Math.round(per300 * 10) / 10);
    expect(report.imported).toBeGreaterThan(100);
    expect(per300).toBeLessThanOrEqual(15 * 60);
  });
});

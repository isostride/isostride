import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeGear, readRunTags, writeRunTags } from '@/lib/gear';
import { joinContext } from '@/lib/context';
import { PATHS, emptyManifest, isOutdated } from '@/lib/fs';
import { importFolder, recomputeEverything } from '@/lib/pipeline';
import { ALGORITHM_VERSION } from '@/lib/kernel';
import { FILES, TEST_DATA, checksums, makeDataFolder, recordMeasure } from '../support/fixtures';

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

describe('Offer recompute on mismatch', () => {
  it('Old version offers recompute', () => {
    expect(isOutdated({ ...emptyManifest(), algorithmVersion: ALGORITHM_VERSION - 1 })).toBe(true);
    expect(isOutdated(emptyManifest())).toBe(false);
    expect(isOutdated(null)).toBe(false);
  });
});

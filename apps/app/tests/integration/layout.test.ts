import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECOMMENDATIONS_PATH, fromRecommendation, writeDefinitions, type Recommendation } from '@/lib/blocks';
import { runBlocks } from '@/lib/detection';
import { writeGear } from '@/lib/gear';
import { joinContext } from '@/lib/context';
import { PATHS, readJson, readManifest } from '@/lib/fs';
import { LEGACY_ROOT, moveLegacyData } from '@/lib/legacy';
import { importFolder } from '@/lib/pipeline';
import { type RunFile, type RunsIndex, SCHEMA_VERSION, ALGORITHM_VERSION } from '@/lib/kernel';
import { fitFixtures, makeDataFolder, recordMeasure, TEST_DATA } from '../support/fixtures';

const SINCE_AUG = (await fitFixtures()).filter((f) => f >= '2026-08-03').sort();

describe('Data folder layout', () => {
  it('Folder layout written', { timeout: 120_000 }, async () => {
    // An empty data folder with FIT files in fit/ (makeDataFolder puts them there).
    const files = SINCE_AUG;
    const folder = await makeDataFolder(files);
    expect((await fs.readdir(path.join(folder.root, 'fit'))).length).toBe(files.length);

    const imported = await importFolder(folder);
    await writeGear(folder, [{ id: 'g1', name: 'Shoes A', type: 'shoes', from: '2026-08-01', to: null }]);
    await joinContext(folder);
    const rec = (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations[0];
    await writeDefinitions(folder, [fromRecommendation(rec, 'active')]);
    await runBlocks(folder);

    const exists = async (p: string) => fs.stat(path.join(folder.root, p)).then(() => true, () => false);
    for (const p of [PATHS.manifest, PATHS.gear, PATHS.blockDefinitions, PATHS.runsIndex, PATHS.segments, PATHS.blockInstances, PATHS.dayState])
      expect(await exists(p), p).toBe(true);
    const index = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    // One run per activity: a second copy of an exported file is a duplicate.
    expect(index.runs).toHaveLength(files.length - imported.duplicates);
    for (const r of index.runs) expect(await exists(PATHS.runFile(r.id)), r.id).toBe(true);
    expect(index.runs.every((r) => r.shoes === 'Shoes A')).toBe(true);

    // manifest.json lists the imported files with the schema and algorithm versions.
    const manifest = (await readManifest(folder))!;
    expect(manifest).toMatchObject({ schemaVersion: SCHEMA_VERSION, algorithmVersion: ALGORITHM_VERSION });
    expect(Object.keys(manifest.files).map((f) => path.basename(f)).sort()).toEqual([...files].sort());
    // Everything computed from the FIT files is in derived/: the manifest too, none beside it.
    expect(PATHS.manifest.startsWith(`${PATHS.derived}/`)).toBe(true);
    expect((await fs.readdir(path.join(folder.root, PATHS.root))).sort()).toEqual(['derived', 'user']);

    // A manifest left at .isostride/ by an earlier version is moved into derived/ on first reading.
    await fs.rename(path.join(folder.root, PATHS.manifest), path.join(folder.root, PATHS.legacyManifest));
    expect(await readManifest(folder)).toEqual(manifest);
    expect(await exists(PATHS.manifest)).toBe(true);
    expect(await exists(PATHS.legacyManifest)).toBe(false);

    // Data left at strideprism/ by a version before 23 Nov 2026 is moved to .isostride/ when the folder is opened.
    const gear = await folder.readText(PATHS.gear);
    await fs.rename(path.join(folder.root, PATHS.root), path.join(folder.root, LEGACY_ROOT));
    expect(await moveLegacyData(folder)).toBe(true);
    expect(await exists(LEGACY_ROOT)).toBe(false);
    expect(await folder.readText(PATHS.gear)).toBe(gear);
    expect(await readManifest(folder)).toEqual(manifest);
    for (const r of index.runs) expect(await exists(PATHS.runFile(r.id)), r.id).toBe(true);
    expect(await moveLegacyData(folder)).toBe(false);
  });
});

describe('Historical import', () => {
  it('All runs since 3 Aug import clean', async () => {
    const folder = await makeDataFolder(SINCE_AUG);
    const report = await importFolder(folder);
    const index = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!;
    let missingDeveloperFields = 0;
    for (const r of index.runs) {
      const run = (await readJson<RunFile>(folder, PATHS.runFile(r.id)))!;
      const has = (s: (number | null)[]) => s.some((v) => v !== null);
      if (!has(run.samples.values.effortPace ?? []) || !has(run.samples.values.legSpringStiffness ?? [])) missingDeveloperFields++;
    }
    await recordMeasure('historicalImportErrors', report.errors);
    await recordMeasure('historicalRunsMissingDeveloperFields', missingDeveloperFields);
    expect(report.errors).toBe(0);
    expect(index.runs).toHaveLength(SINCE_AUG.length - report.duplicates);
    expect(missingDeveloperFields).toBe(0);
  }, 120_000);
});

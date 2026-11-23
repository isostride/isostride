import { describe, expect, it } from 'vitest';
import { definitionFromRule, readDefinitions, ruleOf, writeDefinitions, type BlockInstancesFile } from '@/lib/blocks';
import { instancesOf } from '@/lib/detection';
import { PATHS, readJson } from '@/lib/fs';
import { writeGear } from '@/lib/gear';
import { bumpStamp, cached, dataStamp, importFolder, refreshBlocks, refreshContext } from '@/lib/pipeline';
import { FILES, makeDataFolder, recordMeasure } from '../support/fixtures';
import type { NodeFolder } from '../support/nodeFolder';

/** Counts the run files read from the folder from now on. */
function countRunReads(folder: NodeFolder): string[] {
  const reads: string[] = [];
  const readText = folder.readText.bind(folder);
  folder.readText = async (p: string) => { if (p.startsWith(`${PATHS.runs}/`)) reads.push(p); return readText(p); };
  return reads;
}

describe('Computed once and cached', () => {
  it('Results kept for the data as it is', async () => {
    const folder = await makeDataFolder([FILES.pace3, FILES.pace4First, FILES.pace4]);
    await importFolder(folder);
    const all = definitionFromRule('All runs', ruleOf({ type: 'run' }));
    const key = JSON.stringify([all]);
    const reads = countRunReads(folder);
    // The first time the segments of a rule are computed from the run files and kept.
    const first = await cached(folder, 'instances', key, () => instancesOf(folder, [all]));
    expect(first.hit).toBe(false);
    expect(first.value[all.id]).toHaveLength(3);
    expect(reads.length).toBe(3);
    // The second time they are read back, no run file read; another key is computed apart.
    reads.length = 0;
    const second = await cached(folder, 'instances', key, () => instancesOf(folder, [all]));
    expect(second).toEqual({ value: first.value, hit: true });
    await recordMeasure('cachedResultRunFilesRead', reads.length);
    expect(reads).toEqual([]);
    expect((await cached(folder, 'instances', '[]', async () => ({}))).hit).toBe(false);
    // A change of the data (a new stamp) drops what was kept.
    const stamp = await dataStamp(folder);
    await bumpStamp(folder);
    expect(await dataStamp(folder)).not.toBe(stamp);
    expect((await cached(folder, 'instances', key, () => instancesOf(folder, [all]))).hit).toBe(false);
    // So does a change of the blocks, and an import of new runs; an import of none keeps it.
    await refreshBlocks(folder);
    expect((await cached(folder, 'instances', key, () => instancesOf(folder, [all]))).hit).toBe(false);
    await importFolder(folder);
    expect((await cached(folder, 'instances', key, () => instancesOf(folder, [all]))).hit).toBe(true);
  });

  it('Context change without detection', async () => {
    const folder = await makeDataFolder([FILES.pace3, FILES.pace4First, FILES.pace4]);
    await importFolder(folder);
    // A kept block of whole runs, its instances detected.
    await writeDefinitions(folder, [definitionFromRule('All runs', ruleOf({ type: 'run' }))]);
    await refreshBlocks(folder);
    const instances = async () => (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
    expect((await instances()).length).toBe(3);
    expect((await instances()).every((i) => i.context.run.shoes === null)).toBe(true);

    // New shoes: detection would find the same segments, so the context is written into them; no run file read.
    const reads = countRunReads(folder);
    await writeGear(folder, [{ id: 's', name: 'Shoes S', type: 'shoes', from: '2026-01-01', to: null }]);
    expect(await refreshContext(folder)).toBe('rejoined');
    await recordMeasure('contextChangeRunFilesRead', reads.length);
    expect(reads).toEqual([]);
    expect((await instances()).every((i) => i.context.run.shoes === 'Shoes S')).toBe(true);
    expect((await instances()).length).toBe(3);

    // A kept rule filtering by shoes: a change of shoes can change its segments, so detection runs.
    const [def] = await readDefinitions(folder);
    await writeDefinitions(folder, [{ ...def, params: { ...def.params, runs: { ...(def.params as { runs: object }).runs, shoes: ['Shoes T'] } } as typeof def.params }]);
    await refreshBlocks(folder);
    expect((await instances()).length).toBe(0);
    await writeGear(folder, [{ id: 't', name: 'Shoes T', type: 'shoes', from: '2026-01-01', to: null }]);
    expect(await refreshContext(folder)).toBe('detected');
    expect((await instances()).length).toBe(3);
  });
});

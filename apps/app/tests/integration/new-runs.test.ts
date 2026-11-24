import { describe, expect, it } from 'vitest';
import { markRunsSeen, readNewRuns } from '@/lib/fs';
import { addedRuns, importFolder, recomputeEverything } from '@/lib/pipeline';
import { FILES, addFile, makeDataFolder } from '../support/fixtures';

/**
 * The runs an import added, marked new until the runner opens them (requirement "New runs marked new"):
 * none at the first import of a folder or at a recompute, the runs added by a later import, cleared one
 * by one when opened or all at once.
 */
describe('New runs marked new', () => {
  it('Runs added by a later import marked new until seen', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3]);
    const first = await importFolder(folder);
    expect(addedRuns(first)).toHaveLength(2);
    expect(await readNewRuns(folder)).toEqual([]);

    await addFile(folder, FILES.later);
    await addFile(folder, FILES.pace4First);
    const next = await importFolder(folder);
    const added = addedRuns(next);
    expect(added).toHaveLength(2);
    expect((await readNewRuns(folder)).sort()).toEqual([...added].sort());

    await recomputeEverything(folder);
    expect((await readNewRuns(folder)).sort()).toEqual([...added].sort());

    await markRunsSeen(folder, [added[0]]);
    expect(await readNewRuns(folder)).toEqual([added[1]]);
    await markRunsSeen(folder, 'all');
    expect(await readNewRuns(folder)).toEqual([]);
  });
});

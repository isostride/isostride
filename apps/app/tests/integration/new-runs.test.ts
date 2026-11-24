import { describe, expect, it } from 'vitest';
import { NEW_FOR_MS, markRunsNew, markRunsSeen, readNewRuns } from '@/lib/fs';
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

  it('A run not opened stays new a week at most', async () => {
    // "Do otwarcia, najdłużej 7 dni": marked now, new for 7 days, then no longer.
    const folder = await makeDataFolder([]);
    const now = Date.UTC(2026, 10, 24, 12);
    await markRunsNew(folder, ['20261123-195626'], now);
    expect(await readNewRuns(folder, now + NEW_FOR_MS - 1000)).toEqual(['20261123-195626']);
    expect(await readNewRuns(folder, now + NEW_FOR_MS)).toEqual([]);
    // A file of before, without the times: a run counts from its start, which its id gives.
    await folder.writeText('.isostride/user/new-runs.json', JSON.stringify({ runs: ['20261123-195626'] }));
    expect(await readNewRuns(folder, Date.UTC(2026, 10, 25))).toEqual(['20261123-195626']);
    expect(await readNewRuns(folder, Date.UTC(2026, 11, 1))).toEqual([]);
  });
});

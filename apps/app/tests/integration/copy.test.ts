import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MirroredFolder, PATHS, copyIsCurrent, listFitFiles, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { importFolder, recomputeEverything } from '@/lib/pipeline';
import { FILES, makeDataFolder } from '../support/fixtures';
import { NodeFolder } from '../support/nodeFolder';

/**
 * The folder read through a copy in the browser on a phone (requirement "Phone reads from a copy", ADR
 * "A copy in the browser on phones"): the copy here a second folder on disk, the reads of each counted.
 */
function counted(folder: NodeFolder) {
  const reads: string[] = [];
  const text = folder.readText.bind(folder);
  const bytes = folder.readBytes.bind(folder);
  folder.readText = async (p) => { reads.push(p); return text(p); };
  folder.readBytes = async (p) => { reads.push(p); return bytes(p); };
  return reads;
}

describe('Phone reads from a copy', () => {
  it('Read from the copy once filled, written to both, FIT files from the folder', async () => {
    const runner = await makeDataFolder([FILES.pace4, FILES.pace3]);
    await importFolder(runner);
    const copy = new NodeFolder(await fs.mkdtemp(path.join(os.tmpdir(), 'copy-')));
    const fromFolder = counted(runner);
    const fromCopy = counted(copy);
    const app = new MirroredFolder(runner, copy);

    // The first read comes from the folder and fills the copy; the second from the copy alone.
    const first = await readJson<RunsIndex>(app, PATHS.runsIndex);
    expect(first!.runs).toHaveLength(2);
    expect(fromFolder).toEqual([PATHS.runsIndex]);
    fromFolder.length = 0;
    expect(await readJson<RunsIndex>(app, PATHS.runsIndex)).toEqual(first);
    expect(fromFolder).toEqual([]);
    expect(fromCopy.filter((p) => p === PATHS.runsIndex)).toHaveLength(2);

    // A missing file stays missing; the runner's FIT files and the listing come from the folder.
    expect(await app.readText(PATHS.settings)).toBeNull();
    expect(await listFitFiles(app)).toHaveLength(2);
    fromCopy.length = 0;
    await app.readBytes(`fit/${FILES.pace4}`);
    expect(fromCopy).toEqual([]);

    // A write reaches both; a removal removes from both.
    await app.writeText(PATHS.gear, '{"gear":[]}');
    expect(await runner.readText(PATHS.gear)).toBe('{"gear":[]}');
    expect(await copy.readText(PATHS.gear)).toBe('{"gear":[]}');
    await app.remove(PATHS.gear);
    expect(await runner.readText(PATHS.gear)).toBeNull();
    expect(await copy.readText(PATHS.gear)).toBeNull();

    // A whole recompute through the copy: the folder holds the whole data after it.
    await recomputeEverything(app);
    expect((await readJson<RunsIndex>(runner, PATHS.runsIndex))!.runs).toHaveLength(2);
    expect((await readJson<RunsIndex>(copy, PATHS.runsIndex))!.runs).toHaveLength(2);
  });

  it('A copy of a folder changed outside the browser is not current', async () => {
    const runner = await makeDataFolder([FILES.pace4]);
    await importFolder(runner);
    const copy = new NodeFolder(await fs.mkdtemp(path.join(os.tmpdir(), 'copy-')));
    // An empty copy is current (it fills as it reads); one read through the app holds the folder's stamp.
    expect(await copyIsCurrent(runner, copy)).toBe(true);
    const app = new MirroredFolder(runner, copy);
    await app.readText(PATHS.dataStamp);
    expect(await copyIsCurrent(runner, copy)).toBe(true);
    // The folder's data changed elsewhere (another stamp): the copy is not current.
    await runner.writeText(PATHS.dataStamp, JSON.stringify({ algorithmVersion: 1, stamp: 'elsewhere' }));
    expect(await copyIsCurrent(runner, copy)).toBe(false);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { BrowserFolder } from '@/lib/fs';
import { MemDir, calls, dirHandle } from '../support/memFolder';

/**
 * The folder over the browser's File System Access API keeps what it learned (ADR "One reading worker,
 * files kept"; the runner's phone took up to a second a call): handles, texts and missing files are
 * given back with no call to the system, and what one folder of the app writes or removes the others
 * forget. Run here over a folder in memory with the API's shape.
 */
const reset = () => { for (const k of Object.keys(calls)) delete calls[k]; };
const opened: BrowserFolder[] = [];
const folderOn = (root: MemDir) => { const f = new BrowserFolder(dirHandle(root)); opened.push(f); return f; };
const settle = () => new Promise((r) => setTimeout(r, 2));

afterEach(() => { reset(); opened.length = 0; });

describe('Folder keeps what it learned', () => {
  it('A file read again, a missing file and the folders found once ask the system nothing', async () => {
    const root = new MemDir();
    const f = folderOn(root);
    await f.writeText('.isostride/derived/runs-index.json', '{"runs":[]}');
    reset();
    const ops0 = BrowserFolder.operations;
    // Kept from its own write: no call.
    expect(await f.readText('.isostride/derived/runs-index.json')).toBe('{"runs":[]}');
    expect(calls).toEqual({});
    // A missing file: asked once (the folders already known), then not again.
    expect(await f.readText('.isostride/derived/settings.json')).toBeNull();
    expect(calls).toEqual({ getFileHandle: 1 });
    expect(await f.readText('.isostride/derived/settings.json')).toBeNull();
    expect(calls).toEqual({ getFileHandle: 1 });
    // Written by the app: read as written.
    await f.writeText('.isostride/derived/settings.json', '{"zones":{}}');
    expect(await f.readText('.isostride/derived/settings.json')).toBe('{"zones":{}}');
    expect(BrowserFolder.operations).toBeGreaterThan(ops0);
    // Bytes and a listing go to the folder each time (new FIT files show).
    await f.writeBytes('fit/a.fit', new Uint8Array([1, 2, 3]));
    expect([...(await f.readBytes('fit/a.fit'))]).toEqual([1, 2, 3]);
    expect((await f.list('')).map((e) => e.name).sort()).toEqual(['.isostride', 'fit']);
    expect(await f.list('nowhere')).toEqual([]);
    await expect(f.readBytes('fit/none.fit')).rejects.toThrow();
  });

  it('What one folder of the app writes or removes the others forget', async () => {
    const root = new MemDir();
    const page = folderOn(root);
    const worker = folderOn(root);
    await worker.writeText('.isostride/derived/runs-index.json', 'v1');
    expect(await page.readText('.isostride/derived/runs-index.json')).toBe('v1');
    expect(await page.readText('.isostride/user/settings.json')).toBeNull();
    // The worker writes: the page reads the new text, and the file it knew missing.
    await worker.writeText('.isostride/derived/runs-index.json', 'v2');
    await worker.writeText('.isostride/user/settings.json', 's');
    await settle();
    expect(await page.readText('.isostride/derived/runs-index.json')).toBe('v2');
    expect(await page.readText('.isostride/user/settings.json')).toBe('s');
    // A recompute removes derived/ and makes it again: the page's handles go with it.
    await worker.remove('.isostride/derived');
    await settle();
    expect(await page.readText('.isostride/derived/runs-index.json')).toBeNull();
    await worker.writeText('.isostride/derived/runs-index.json', 'v3');
    await settle();
    expect(await page.readText('.isostride/derived/runs-index.json')).toBe('v3');
    // Removing what is not there is no failure.
    await page.remove('.isostride/nothing');
  });

  it('A handle kept that went stale is let go and the call made again', async () => {
    const root = new MemDir();
    const f = folderOn(root);
    await f.writeText('.isostride/derived/a.json', 'a');
    // derived/ made again behind the folder's back (no word on the channel): its kept handle is stale.
    const isostride = root.entriesMap.get('.isostride') as MemDir;
    isostride.entriesMap.set('derived', new MemDir('derived'));
    await f.writeText('.isostride/derived/b.json', 'b');
    expect((isostride.entriesMap.get('derived') as MemDir).entriesMap.has('b.json')).toBe(true);
    expect((await f.list('.isostride/derived')).map((e) => e.name)).toEqual(['b.json']);
  });
});

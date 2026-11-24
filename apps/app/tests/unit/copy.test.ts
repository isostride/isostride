import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserFolder, MirroredFolder, openCopy, openDataFolder, pruneCopies, removeCopy, usesCopy, type DataFolder } from '@/lib/fs';
import { MemDir, dirHandle } from '../support/memFolder';

/**
 * The copy in the browser on a phone (ADR "A copy in the browser on phones"): where it lives in the
 * browser's private storage, when a device keeps one, and the bytes of the app's files through it.
 * The browser's storage and the device are played here by a folder in memory and a user agent.
 */
let opfs: MemDir;
const store = new Map<string, string>();

beforeEach(() => {
  opfs = new MemDir('opfs');
  store.clear();
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', storage: { getDirectory: async () => dirHandle(opfs) } });
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('Copy in the browser', () => {
  it('Kept on Android, or as this browser says', () => {
    expect(usesCopy()).toBe(false);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/157.0.0.0 Mobile' });
    expect(usesCopy()).toBe(true);
    store.set('isostride.mirror', 'off');
    expect(usesCopy()).toBe(false);
    store.set('isostride.mirror', 'on');
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' });
    expect(usesCopy()).toBe(true);
  });

  it('One copy a folder in the browser’s storage, removed when the folder is left', async () => {
    const copy = await openCopy('c-1');
    await copy.writeText('.isostride/derived/a.json', 'a');
    const copies = opfs.entriesMap.get('copies') as MemDir;
    expect([...copies.entriesMap.keys()]).toEqual(['c-1']);
    await removeCopy('c-1');
    expect([...copies.entriesMap.keys()]).toEqual([]);
    // Removing a copy there is not is no failure.
    await removeCopy('c-2');
    // The copies but the one in use pruned.
    await openCopy('c-3');
    await openCopy('c-4');
    await pruneCopies('c-4');
    expect([...copies.entriesMap.keys()]).toEqual(['c-4']);
  });

  it('A copy that fails leaves the folder read alone, and the next opening a new copy', async () => {
    const runner = new BrowserFolder(dirHandle(new MemDir('runs')));
    await runner.writeText('.isostride/derived/runs-index.json', '{"runs":[]}');
    const failing: DataFolder = {
      name: 'copy',
      list: async () => [],
      readBytes: async () => { throw new Error('gone'); },
      readText: async () => { throw new Error('gone'); },
      writeText: async () => { throw new Error('gone'); },
      writeBytes: async () => { throw new Error('gone'); },
      remove: async () => { throw new Error('gone'); },
    };
    let told = 0;
    const app = new MirroredFolder(runner, failing, () => told++);
    expect(await app.readText('.isostride/derived/runs-index.json')).toBe('{"runs":[]}');
    await app.writeText('.isostride/user/gear.json', '[]');
    expect(await runner.readText('.isostride/user/gear.json')).toBe('[]');
    await app.remove('.isostride/user/gear.json');
    expect(await runner.readText('.isostride/user/gear.json')).toBeNull();
    expect(told).toBe(1);
    // No copy to be had at all: the folder alone, told the same way.
    vi.stubGlobal('navigator', { userAgent: 'Android', storage: { getDirectory: async () => { throw new Error('no storage'); } } });
    let toldAgain = 0;
    expect(await openDataFolder(dirHandle(new MemDir('runs')), 'c-1', () => toldAgain++)).toBeInstanceOf(BrowserFolder);
    expect(toldAgain).toBe(1);
  });

  it('The folder read through its copy when the device keeps one', async () => {
    const runner = dirHandle(new MemDir('runs'));
    const plain = await openDataFolder(runner, null);
    expect(plain).toBeInstanceOf(BrowserFolder);
    const app = await openDataFolder(runner, 'c-1');
    expect(app).toBeInstanceOf(MirroredFolder);
    expect(app.name).toBe('runs');
    // Bytes of the app's files: written to both, read from the copy, filled from the folder when missing there.
    await app.writeBytes('.isostride/derived/cache/x.bin', new Uint8Array([7]));
    expect([...(await app.readBytes('.isostride/derived/cache/x.bin'))]).toEqual([7]);
    const folderOnly = new BrowserFolder(runner);
    await folderOnly.writeBytes('.isostride/derived/cache/y.bin', new Uint8Array([8]));
    expect([...(await app.readBytes('.isostride/derived/cache/y.bin'))]).toEqual([8]);
    const copy = await openCopy('c-1');
    expect([...(await copy.readBytes('.isostride/derived/cache/y.bin'))]).toEqual([8]);
    // The runner's FIT files are not copied.
    await app.writeBytes('fit/a.fit', new Uint8Array([1]));
    await expect(copy.readBytes('fit/a.fit')).rejects.toThrow();
  });
});

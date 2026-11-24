import { afterEach, describe, expect, it } from 'vitest';
import { BrowserFolder } from '@/lib/fs';

/**
 * The folder over the browser's File System Access API keeps what it learned (ADR "One reading worker,
 * files kept"; the runner's phone took up to a second a call): handles, texts and missing files are
 * given back with no call to the system, and what one folder of the app writes or removes the others
 * forget. Run here over a folder in memory with the API's shape.
 */
const notFound = () => new DOMException('not found', 'NotFoundError');

class MemFile {
  constructor(public data: string | Uint8Array = '') {}
}
class MemDir {
  entriesMap = new Map<string, MemDir | MemFile>();
  constructor(readonly name = 'root') {}
}
/** The calls made, by kind. */
const calls: Record<string, number> = {};
const count = (k: string) => { calls[k] = (calls[k] ?? 0) + 1; };

function fileHandle(dir: MemDir, name: string) {
  return {
    kind: 'file' as const,
    name,
    async getFile() {
      count('getFile');
      const f = dir.entriesMap.get(name);
      if (!(f instanceof MemFile)) throw notFound();
      const d = f.data;
      return { text: async () => (typeof d === 'string' ? d : new TextDecoder().decode(d)), arrayBuffer: async () => (typeof d === 'string' ? new TextEncoder().encode(d) : d).buffer };
    },
    async createWritable() {
      count('createWritable');
      if (!dir.entriesMap.has(name)) throw notFound();
      let data: string | Uint8Array = '';
      return { write: async (d: string | Uint8Array) => { data = d; }, close: async () => { const f = dir.entriesMap.get(name); if (f instanceof MemFile) f.data = data; else throw notFound(); } };
    },
  };
}

function dirHandle(dir: MemDir, alive: () => boolean = () => true): FileSystemDirectoryHandle {
  const h = {
    kind: 'directory' as const,
    name: dir.name,
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      count('getDirectoryHandle');
      if (!alive()) throw notFound();
      let d = dir.entriesMap.get(name);
      if (!d && opts?.create) dir.entriesMap.set(name, (d = new MemDir(name)));
      if (!(d instanceof MemDir)) throw notFound();
      const parent = dir;
      return dirHandle(d, () => alive() && parent.entriesMap.get(name) === d);
    },
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      count('getFileHandle');
      if (!alive()) throw notFound();
      if (!dir.entriesMap.has(name) && opts?.create) dir.entriesMap.set(name, new MemFile());
      if (!(dir.entriesMap.get(name) instanceof MemFile)) throw notFound();
      return fileHandle(dir, name);
    },
    async removeEntry(name: string) {
      count('removeEntry');
      if (!dir.entriesMap.delete(name)) throw notFound();
    },
    async *entries() {
      count('entries');
      for (const [name, e] of dir.entriesMap) yield [name, { kind: e instanceof MemDir ? 'directory' : 'file' }];
    },
  };
  return h as unknown as FileSystemDirectoryHandle;
}

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

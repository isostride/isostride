/** A folder in memory with the shape of the browser's File System Access API (FileSystemDirectoryHandle), for unit tests. */
const notFound = () => new DOMException('not found', 'NotFoundError');

export class MemFile {
  constructor(public data: string | Uint8Array = '') {}
}
export class MemDir {
  entriesMap = new Map<string, MemDir | MemFile>();
  constructor(readonly name = 'root') {}
}
/** The calls made, by kind. */
export const calls: Record<string, number> = {};
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

export function dirHandle(dir: MemDir, alive: () => boolean = () => true): FileSystemDirectoryHandle {
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


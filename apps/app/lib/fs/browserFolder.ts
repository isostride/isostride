import type { DataFolder, FolderEntry } from './folder';
import { IMPORT_REASONS, importReason } from './manifest';

/** How much text a folder keeps of the files it read, characters (about 2 bytes each). */
const KEEP_BYTES = 24_000_000;

/** DataFolder over a File System Access API directory handle (Chrome, Edge, Opera). */
export class BrowserFolder implements DataFolder {
  constructor(private readonly handle: FileSystemDirectoryHandle) {}

  get name(): string {
    return this.handle.name;
  }

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let dir = this.handle;
    for (const part of path.split('/').filter(Boolean)) {
      try {
        dir = await dir.getDirectoryHandle(part, { create });
      } catch (e) {
        if (!create && isNotFound(e)) return null;
        throw e;
      }
    }
    return dir;
  }

  private split(path: string): [string, string] {
    const i = path.lastIndexOf('/');
    return i < 0 ? ['', path] : [path.slice(0, i), path.slice(i + 1)];
  }

  async list(path: string): Promise<FolderEntry[]> {
    const dir = await this.dir(path, false);
    if (!dir) return [];
    const out: FolderEntry[] = [];
    // entries() is not in every TS lib version yet.
    for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      out.push({ name, kind: h.kind === 'directory' ? 'directory' : 'file' });
    }
    return out;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const [d, name] = this.split(path);
    const dir = await this.dir(d, false);
    if (!dir) throw new Error(importReason(IMPORT_REASONS.notFound, { path }));
    const file = await (await dir.getFileHandle(name)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  /**
   * The texts read, with the time and size of the file they came from (the review of 24 Nov 2026: the
   * screens read the same files again and again, the Dashboard the runs' index about 9 times): a file
   * not changed since is not read again. A file another worker wrote has another time or size. The
   * reads of one file at once share one reading.
   */
  private readonly texts = new Map<string, { modified: number; size: number; text: string }>();
  private readonly reading = new Map<string, Promise<string | null>>();
  private textBytes = 0;

  async readText(path: string): Promise<string | null> {
    const now = this.reading.get(path);
    if (now) return now;
    const read = this.readTextNow(path).finally(() => this.reading.delete(path));
    this.reading.set(path, read);
    return read;
  }

  private async readTextNow(path: string): Promise<string | null> {
    const [d, name] = this.split(path);
    const dir = await this.dir(d, false);
    if (!dir) return null;
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      const kept = this.texts.get(path);
      if (kept && kept.modified === file.lastModified && kept.size === file.size) return kept.text;
      const text = await file.text();
      this.keep(path, { modified: file.lastModified, size: file.size, text });
      return text;
    } catch (e) {
      if (isNotFound(e)) { this.forget(path); return null; }
      throw e;
    }
  }

  /** Keeps a text, the oldest let go past KEEP_BYTES (the run files are not kept: the worker keeps the runs it reads). */
  private keep(path: string, entry: { modified: number; size: number; text: string }): void {
    this.forget(path);
    if (path.startsWith('.isostride/derived/runs/') || entry.text.length > KEEP_BYTES / 4) return;
    this.texts.set(path, entry);
    this.textBytes += entry.text.length;
    for (const [p, e] of this.texts) {
      if (this.textBytes <= KEEP_BYTES) break;
      this.texts.delete(p);
      this.textBytes -= e.text.length;
    }
  }

  private forget(path: string): void {
    const e = this.texts.get(path);
    if (e) { this.texts.delete(path); this.textBytes -= e.text.length; }
  }

  async writeText(path: string, text: string): Promise<void> {
    this.forget(path);
    await this.write(path, text);
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    // A view of its own buffer: the writer takes no shared memory.
    await this.write(path, new Uint8Array(bytes));
  }

  private async write(path: string, data: string | Uint8Array<ArrayBuffer>): Promise<void> {
    const [d, name] = this.split(path);
    const dir = await this.dir(d, true);
    const writable = await (await dir!.getFileHandle(name, { create: true })).createWritable();
    await writable.write(data);
    await writable.close();
  }

  async remove(path: string): Promise<void> {
    for (const p of [...this.texts.keys()]) if (p === path || p.startsWith(`${path}/`)) this.forget(p);
    const [d, name] = this.split(path);
    const dir = await this.dir(d, false);
    if (!dir) return;
    try {
      await dir.removeEntry(name, { recursive: true });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');
}

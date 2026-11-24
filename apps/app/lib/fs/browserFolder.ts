import type { DataFolder, FolderEntry } from './folder';
import { IMPORT_REASONS, importReason } from './manifest';

/** How much text a folder keeps of the files it read, characters (about 2 bytes each). */
const KEEP_BYTES = 24_000_000;
/** The channel the folders of this app tell each other on what they wrote or removed (the workers, the page, other tabs). */
const CHANNEL = 'isostride-folder';
type Change = { kind: 'written' | 'removed'; path: string };

/**
 * DataFolder over a File System Access API directory handle (Chrome, Edge, Opera).
 *
 * Every call to the folder costs a call to the system, and on Android each takes up to a second
 * (the runner's diagnostics of 24 Nov 2026: a 2 KB file read in 5 s, through 4–6 such calls; "Najpierw
 * szybkie poprawki"). So a folder keeps what it learned: the handles of its subfolders and files, and
 * the texts it read, given back without asking the system again. What another worker of the app or
 * another tab writes or removes is told on a channel and forgotten here (a folder removed by a
 * recompute takes its handles with it); a call that fails on a handle kept is made again without them.
 * A file found missing is not asked for again until the app writes it. Changes made to the folder
 * outside the app (but FIT files, listed each time) are seen when the app is opened again.
 */
export class BrowserFolder implements DataFolder {
  /** The calls made to the system, counted for the diagnostics. */
  static operations = 0;
  private readonly dirs = new Map<string, FileSystemDirectoryHandle>();
  private readonly fileHandles = new Map<string, FileSystemFileHandle>();
  private readonly texts = new Map<string, string>();
  /** The files found missing (a settings.json never saved): not asked for again until written. */
  private readonly missing = new Set<string>();
  private readonly reading = new Map<string, Promise<string | null>>();
  private textBytes = 0;
  private readonly channel: BroadcastChannel | null;

  /** @param channel the channel of the folders of one place: the copy in the browser has its own (its paths are the folder's). */
  constructor(private readonly handle: FileSystemDirectoryHandle, channel = CHANNEL) {
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channel);
    if (this.channel) this.channel.onmessage = (e: MessageEvent<Change>) => this.changed(e.data, false);
  }

  get name(): string {
    return this.handle.name;
  }

  /** What changed at a path: here, and told to the others unless they told it. */
  private changed(c: Change, tell: boolean): void {
    const under = (p: string) => p === c.path || p.startsWith(`${c.path}/`);
    for (const p of [...this.texts.keys()]) if (under(p)) this.forget(p);
    for (const p of [...this.missing]) if (under(p)) this.missing.delete(p);
    if (c.kind === 'removed') {
      for (const p of [...this.dirs.keys()]) if (under(p)) this.dirs.delete(p);
      for (const p of [...this.fileHandles.keys()]) if (under(p)) this.fileHandles.delete(p);
    }
    if (tell) this.channel?.postMessage(c);
  }

  /** Lets go of every handle kept: one went stale. */
  private forgetHandles(): void {
    this.dirs.clear();
    this.fileHandles.clear();
  }

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let dir = this.handle;
    let at = '';
    for (const part of path.split('/').filter(Boolean)) {
      at = at ? `${at}/${part}` : part;
      const kept = this.dirs.get(at);
      if (kept) { dir = kept; continue; }
      try {
        BrowserFolder.operations++;
        dir = await dir.getDirectoryHandle(part, { create });
        this.dirs.set(at, dir);
      } catch (e) {
        if (!create && isNotFound(e)) return null;
        throw e;
      }
    }
    return dir;
  }

  private async file(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
    const kept = this.fileHandles.get(path);
    if (kept) return kept;
    const [d, name] = this.split(path);
    const dir = await this.dir(d, create);
    if (!dir) return null;
    try {
      BrowserFolder.operations++;
      const h = await dir.getFileHandle(name, { create });
      this.fileHandles.set(path, h);
      return h;
    } catch (e) {
      if (!create && isNotFound(e)) return null;
      throw e;
    }
  }

  /**
   * Runs a call with the handles kept; when one of them went stale (not found where it was), once
   * more without them. `missing` is what a path not there gives.
   */
  private async fresh<T>(call: () => Promise<T>): Promise<T> {
    const hadKept = this.dirs.size + this.fileHandles.size > 0;
    try {
      return await call();
    } catch (e) {
      if (!hadKept || !isNotFound(e)) throw e;
      this.forgetHandles();
      return call();
    }
  }

  private split(path: string): [string, string] {
    const i = path.lastIndexOf('/');
    return i < 0 ? ['', path] : [path.slice(0, i), path.slice(i + 1)];
  }

  async list(path: string): Promise<FolderEntry[]> {
    return this.fresh(async () => {
      const dir = await this.dir(path, false);
      if (!dir) return [];
      const out: FolderEntry[] = [];
      BrowserFolder.operations++;
      // entries() is not in every TS lib version yet.
      for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        out.push({ name, kind: h.kind === 'directory' ? 'directory' : 'file' });
      }
      return out;
    });
  }

  async readBytes(path: string): Promise<Uint8Array> {
    return this.fresh(async () => {
      const h = await this.file(path, false);
      if (!h) throw new Error(importReason(IMPORT_REASONS.notFound, { path }));
      BrowserFolder.operations += 2;
      return new Uint8Array(await (await h.getFile()).arrayBuffer());
    });
  }

  async readText(path: string): Promise<string | null> {
    const kept = this.texts.get(path);
    if (kept !== undefined) return kept;
    if (this.missing.has(path)) return null;
    const now = this.reading.get(path);
    if (now) return now;
    const read = this.fresh(async () => {
      const h = await this.file(path, false);
      if (!h) { this.missing.add(path); return null; }
      BrowserFolder.operations += 2;
      const text = await (await h.getFile()).text();
      this.keep(path, text);
      return text;
    }).catch((e) => {
      if (isNotFound(e)) { this.fileHandles.delete(path); this.missing.add(path); return null; }
      throw e;
    }).finally(() => this.reading.delete(path));
    this.reading.set(path, read);
    return read;
  }

  /**
   * Keeps a text, the oldest let go past KEEP_BYTES. A worker keeps no run file's text: the worker that
   * stays keeps the runs it read, parsed; the page keeps them, so a run opened again is not read again.
   */
  private keep(path: string, text: string): void {
    this.forget(path);
    const inWorker = typeof window === 'undefined';
    if ((inWorker && path.startsWith('.isostride/derived/runs/')) || text.length > KEEP_BYTES / 4) return;
    this.texts.set(path, text);
    this.textBytes += text.length;
    for (const [p, t] of this.texts) {
      if (this.textBytes <= KEEP_BYTES) break;
      this.texts.delete(p);
      this.textBytes -= t.length;
    }
  }

  private forget(path: string): void {
    const t = this.texts.get(path);
    if (t !== undefined) { this.texts.delete(path); this.textBytes -= t.length; }
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.write(path, text);
    this.keep(path, text);
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    // A view of its own buffer: the writer takes no shared memory.
    await this.write(path, new Uint8Array(bytes));
  }

  private async write(path: string, data: string | Uint8Array<ArrayBuffer>): Promise<void> {
    this.changed({ kind: 'written', path }, true);
    await this.fresh(async () => {
      const h = (await this.file(path, true))!;
      BrowserFolder.operations += 3;
      const writable = await h.createWritable();
      await writable.write(data);
      await writable.close();
    });
    // Told again once written: a reader that read the old text meanwhile forgets it.
    this.changed({ kind: 'written', path }, true);
  }

  async remove(path: string): Promise<void> {
    const [d, name] = this.split(path);
    await this.fresh(async () => {
      const dir = await this.dir(d, false);
      if (!dir) return;
      try {
        BrowserFolder.operations++;
        await dir.removeEntry(name, { recursive: true });
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    });
    this.changed({ kind: 'removed', path }, true);
  }
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');
}

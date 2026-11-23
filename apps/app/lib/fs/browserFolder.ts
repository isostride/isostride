import type { DataFolder, FolderEntry } from './folder';

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
    if (!dir) throw new Error(`Not found: ${path}`);
    const file = await (await dir.getFileHandle(name)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async readText(path: string): Promise<string | null> {
    const [d, name] = this.split(path);
    const dir = await this.dir(d, false);
    if (!dir) return null;
    try {
      return await (await (await dir.getFileHandle(name)).getFile()).text();
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async writeText(path: string, text: string): Promise<void> {
    const [d, name] = this.split(path);
    const dir = await this.dir(d, true);
    const writable = await (await dir!.getFileHandle(name, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
  }

  async remove(path: string): Promise<void> {
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

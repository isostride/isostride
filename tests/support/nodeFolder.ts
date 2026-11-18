import fs from 'node:fs/promises';
import path from 'node:path';
import type { DataFolder, FolderEntry } from '@/lib/fs/folder';

/** DataFolder over a directory on disk, for tests. */
export class NodeFolder implements DataFolder {
  constructor(readonly root: string) {}

  get name(): string {
    return path.basename(this.root);
  }

  private abs(p: string): string {
    return path.join(this.root, ...p.split('/').filter(Boolean));
  }

  async list(p: string): Promise<FolderEntry[]> {
    try {
      const entries = await fs.readdir(this.abs(p), { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, kind: e.isDirectory() ? 'directory' : 'file' }));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async readBytes(p: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(this.abs(p)));
  }

  async readText(p: string): Promise<string | null> {
    try {
      return await fs.readFile(this.abs(p), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async writeText(p: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(this.abs(p)), { recursive: true });
    await fs.writeFile(this.abs(p), text);
  }

  async remove(p: string): Promise<void> {
    await fs.rm(this.abs(p), { recursive: true, force: true });
  }
}

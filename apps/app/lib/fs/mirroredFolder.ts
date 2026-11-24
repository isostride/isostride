import { BrowserFolder } from './browserFolder';
import { PATHS, readJson, type DataFolder, type FolderEntry } from './folder';

/**
 * The runner's folder with a copy of the app's own files in the browser's private storage (ADR "A copy
 * in the browser on phones"; the runner's "ok idzmy z opfs w przypadku telefonu"): on Android each call
 * to the folder took up to a second, a file's content ~3 s, while the copy reads in milliseconds.
 * A file of .isostride/ is read from the copy and, missing there, from the folder and put in the copy;
 * a write goes to both before it is done, a removal removes from both. The FIT files and every listing
 * come from the folder: it stays the whole data, and the copy can be lost and filled again.
 */
export class MirroredFolder implements DataFolder {
  /** The copy failed this session (removed under it, no room): the folder alone is read until the app opens again. */
  private broken = false;

  /**
   * @param brokenCopy told once when the copy fails, so the next opening starts a new one. A failing
   * copy never fails the app: the folder holds the whole data.
   */
  constructor(private readonly folder: DataFolder, private readonly copy: DataFolder, private readonly brokenCopy?: () => void) {}

  get name(): string {
    return this.folder.name;
  }

  /** The app's own files are copied; the runner's FIT files are not; nothing once the copy failed. */
  private copied(path: string): boolean {
    return !this.broken && (path === PATHS.root || path.startsWith(`${PATHS.root}/`));
  }

  /** Does to the copy what the folder had done; a failure leaves the copy for this session. */
  private async toCopy(f: () => Promise<unknown>): Promise<void> {
    try {
      await f();
    } catch {
      if (!this.broken) { this.broken = true; this.brokenCopy?.(); }
    }
  }

  list(path: string): Promise<FolderEntry[]> {
    return this.folder.list(path);
  }

  async readText(path: string): Promise<string | null> {
    if (!this.copied(path)) return this.folder.readText(path);
    let kept: string | null = null;
    await this.toCopy(async () => { kept = await this.copy.readText(path); });
    if (kept !== null) return kept;
    const text = await this.folder.readText(path);
    if (text !== null && this.copied(path)) await this.toCopy(() => this.copy.writeText(path, text));
    return text;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    if (!this.copied(path)) return this.folder.readBytes(path);
    try {
      return await this.copy.readBytes(path);
    } catch {
      // Not in the copy yet (or the copy failed): from the folder, then into the copy.
      const bytes = await this.folder.readBytes(path);
      if (this.copied(path)) await this.toCopy(() => this.copy.writeBytes(path, bytes));
      return bytes;
    }
  }

  // The folder first, then the copy: a write the folder refused never reaches the copy alone.
  async writeText(path: string, text: string): Promise<void> {
    await this.folder.writeText(path, text);
    if (this.copied(path)) await this.toCopy(() => this.copy.writeText(path, text));
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    await this.folder.writeBytes(path, bytes);
    if (this.copied(path)) await this.toCopy(() => this.copy.writeBytes(path, bytes));
  }

  async remove(path: string): Promise<void> {
    await this.folder.remove(path);
    if (this.copied(path) || (path === '' && !this.broken)) await this.toCopy(() => this.copy.remove(path));
  }
}

interface StampFile { stamp: string }

/**
 * Whether the copy is of the folder as it is: the data stamps of both (derived/stamp.json, moved by
 * every change of the data) are the same, or the copy has none yet. A folder changed outside this
 * browser has another stamp, and its copy is dropped.
 */
export async function copyIsCurrent(folder: DataFolder, copy: DataFolder): Promise<boolean> {
  const kept = await readJson<StampFile>(copy, PATHS.dataStamp);
  if (!kept) return true;
  const now = await readJson<StampFile>(folder, PATHS.dataStamp);
  return now?.stamp === kept.stamp;
}

/** Where the copies live in the browser's private storage, one folder for each data folder chosen. */
const COPIES = 'copies';

/** The copy of a data folder, by its id, in the browser's private storage (OPFS). */
export async function openCopy(id: string): Promise<BrowserFolder> {
  const root = await navigator.storage.getDirectory();
  const copies = await root.getDirectoryHandle(COPIES, { create: true });
  return new BrowserFolder(await copies.getDirectoryHandle(id, { create: true }), 'isostride-copy');
}

/** Removes the copies but the one in use: those of folders left, dropped or failed (removed here, never under a page using them). */
export async function pruneCopies(keep: string | null): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const copies = await root.getDirectoryHandle(COPIES, { create: true });
  const names: string[] = [];
  for await (const [name] of (copies as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) names.push(name);
  for (const name of names) if (name !== keep) await copies.removeEntry(name, { recursive: true }).catch(() => undefined);
}

/** Removes the copy of a data folder no longer used (another folder chosen). */
export async function removeCopy(id: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const copies = await root.getDirectoryHandle(COPIES, { create: true });
  await copies.removeEntry(id, { recursive: true }).catch(() => undefined);
}

/**
 * Whether this device keeps a copy: on Android (its folder is slow to read), unless this browser says
 * otherwise ("isostride.mirror": "on" or "off", for a test).
 */
export function usesCopy(): boolean {
  try {
    const said = localStorage.getItem('isostride.mirror');
    if (said === 'on') return true;
    if (said === 'off') return false;
  } catch {
    // No storage (a worker): the page says, by the request.
  }
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** The folder the app reads: the runner's, with its copy when it keeps one. */
export async function openDataFolder(handle: FileSystemDirectoryHandle, copyId: string | null, brokenCopy?: () => void): Promise<DataFolder> {
  const folder = new BrowserFolder(handle);
  if (!copyId) return folder;
  try {
    return new MirroredFolder(folder, await openCopy(copyId), brokenCopy);
  } catch {
    // No copy to be had (no room, no storage): the folder alone.
    brokenCopy?.();
    return folder;
  }
}

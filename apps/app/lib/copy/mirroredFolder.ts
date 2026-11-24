import { BrowserFolder, PATHS, readJson, type DataFolder, type FolderEntry } from '@/lib/fs';

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
  /** The files this folder wrote or removed this session: the filling of the copy leaves them (they are in it as written). */
  private readonly touched = new Set<string>();

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

  /**
   * The results kept by the jobs in the background (derived/cache/) live in the copy alone: they are
   * kept to be read again, made again when missing, and a write to the folder took seconds on the phone
   * ("zrob a i b": a job of the background worker took 22 s).
   */
  private copyOnly(path: string): boolean {
    return this.copied(path) && (path === PATHS.cache || path.startsWith(`${PATHS.cache}/`));
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
    if (this.copyOnly(path)) return this.copy.readText(path).catch(() => null);
    let kept: string | null = null;
    await this.toCopy(async () => { kept = await this.copy.readText(path); });
    // An empty file in the copy is a writing cut off (a tab closed while the copy filled): read from the folder, and the copy mended.
    if (kept !== null && kept !== '') return kept;
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
    this.touched.add(path);
    if (this.copyOnly(path)) return this.toCopy(() => this.copy.writeText(path, text));
    await this.folder.writeText(path, text);
    if (this.copied(path)) await this.toCopy(() => this.copy.writeText(path, text));
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    this.touched.add(path);
    if (this.copyOnly(path)) return this.toCopy(() => this.copy.writeBytes(path, bytes));
    await this.folder.writeBytes(path, bytes);
    if (this.copied(path)) await this.toCopy(() => this.copy.writeBytes(path, bytes));
  }

  async remove(path: string): Promise<void> {
    this.touched.add(path);
    await this.folder.remove(path);
    if (this.copied(path) || (path === '' && !this.broken)) await this.toCopy(() => this.copy.remove(path));
  }

  /**
   * Fills the copy with the app's files it lacks, from the folder, one after another, in the background
   * ("zrob a i b": the first opening of each screen read its files from the folder, ~5 s each on the
   * phone): the user's files and the derived ones first, then the runs from the newest, then the tracks;
   * the kept results are not (the copy alone holds them). A file this folder wrote meanwhile is left (the
   * copy holds it as written), and one that reached the copy meanwhile too. Returns how many were copied;
   * `stop` ends it between two files.
   */
  async fill(stop: () => boolean = () => false): Promise<number> {
    let copied = 0;
    for (const dir of [PATHS.user, PATHS.derived, PATHS.runs, PATHS.tracks]) {
      if (this.broken || stop()) break;
      const names = (await this.folder.list(dir)).filter((e) => e.kind === 'file').map((e) => e.name);
      const have = new Set((await this.copy.list(dir).catch(() => [])).map((e) => e.name));
      // The runs from the newest: their ids begin with their start (yyyymmdd-hhmmss).
      const todo = names.filter((n) => !have.has(n)).sort().reverse();
      for (const name of todo) {
        if (this.broken || stop()) break;
        const path = `${dir}/${name}`;
        if (this.touched.has(path)) continue;
        const text = await this.folder.readText(path);
        if (text === null || this.touched.has(path) || !this.copied(path)) continue;
        if ((await this.copy.readText(path).catch(() => null)) !== null) continue;
        await this.toCopy(() => this.copy.writeText(path, text));
        copied++;
      }
    }
    return copied;
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

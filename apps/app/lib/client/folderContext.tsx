'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserFolder, usesCopy, type DataFolder } from '@/lib/fs';
import { chooseDemo, demoChosen, demoLeft, demoSupported, forgetDemo } from './demoChoice';
import { onCopyBroken, setCopyId } from './worker';
import { getValue, setValue } from './handleStore';

/** The Data Folder lifecycle as the screens see it (model: Data Folder lifecycle). */
export type FolderState =
  | { status: 'checking' }
  /** insecure: opened over plain http (not localhost), where the browser hides folder access */
  | { status: 'unsupported'; insecure: boolean; demoFailed?: boolean }
  /** lost: the folder remembered could not be opened (moved, renamed, its disk away), by its name */
  /** demoFailed: the demo was asked for and could not be made here */
  | { status: 'not-chosen'; lost?: string; demoFailed?: boolean }
  | { status: 'access-pending'; name: string }
  /** the demo's last months are being made: so many of its runs so far */
  | { status: 'demo-preparing'; done: number; total: number }
  /** demo: the folder is the demo's, in the browser's private storage */
  | { status: 'open'; folder: DataFolder; handle: FileSystemDirectoryHandle; demo?: boolean };

interface FolderApi {
  state: FolderState;
  pick(): Promise<void>;
  confirmAccess(): Promise<void>;
  /** Opens the app on the demo (lib/client/demo). */
  openDemo(): Promise<void>;
  /** Leaves the demo for the visitor's own folder, the demo's data removed from the browser. */
  leaveDemo(): Promise<void>;
  /** the demo's earlier history being made behind the open app: so many of its runs so far; 'short' when the browser has no room for it (the demo is its last months); null when none is being made */
  demoHistory: { done: number; total: number } | 'short' | null;
}

const Ctx = createContext<FolderApi | null>(null);
const HANDLE_KEY = 'folderHandle';
/** The id of the copy in the browser of the folder chosen (ADR "A copy in the browser on phones"). */
const COPY_KEY = 'copyId';

/** When the filling of the copy starts after the app opens, ms: the first screen reads first. */
const FILL_AFTER = 3000;
const newCopyId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The copy of the folder on this device, when it keeps one (Android): the one of this folder, or a new
 * one when another folder was chosen (`fresh`). A copy left is never removed while a page may use it:
 * the copies but the one in use are pruned in the background when the app opens.
 */
async function copyFor(fresh: boolean): Promise<string | null> {
  const kept = await getValue<string>(COPY_KEY).catch(() => undefined);
  if (!usesCopy()) {
    if (kept) await setValue(COPY_KEY, null);
    return null;
  }
  if (kept && !fresh) return kept;
  const id = newCopyId();
  await setValue(COPY_KEY, id);
  return id;
}

/** The next opening starts a new copy (this one failed, or holds a folder changed elsewhere). */
const startNewCopy = () => { void setValue(COPY_KEY, newCopyId()).catch(() => undefined); };

/**
 * The folder opened (through its copy on a phone), its data moved first from strideprism/ to .isostride/
 * when an earlier version left it there. In the background: the copies of folders left are pruned; a
 * copy of a folder changed outside this browser (another data stamp) is left for a new one, the app
 * opened again; a current copy is filled with what it lacks. A copy that fails is left the same way,
 * the folder read alone meanwhile.
 */
async function opened(handle: FileSystemDirectoryHandle, fresh = false): Promise<FolderState> {
  const before = await getValue<string | null>(COPY_KEY).catch(() => null);
  const copy = await copyFor(fresh);
  setCopyId(copy);
  // The copy's code only on a device that keeps one, or had one to prune: the screens' scripts stay in their budget.
  const copies = copy || before ? await import('@/lib/copy') : null;
  const folder = copies ? await copies.openDataFolder(handle, copy, startNewCopy) : new BrowserFolder(handle);
  // A worker whose copy failed wrote the folder alone: this page reads the folder alone too from then on.
  onCopyBroken(() => { if (copies && folder instanceof copies.MirroredFolder) folder.leaveCopy(); });
  const { moveLegacyData } = await import('@/lib/legacy');
  await moveLegacyData(folder);
  if (copies) void copies.pruneCopies(copy).catch(() => undefined);
  if (copy && copies) {
    const { MirroredFolder, copyIsCurrent, openCopy } = copies;
    void (async () => {
      if (await copyIsCurrent(new BrowserFolder(handle), await openCopy(copy))) {
        // The copy filled in the background with what it lacks, after the first screen had its turn.
        if (folder instanceof MirroredFolder) setTimeout(() => { void folder.fill().catch(() => undefined); }, FILL_AFTER);
        return;
      }
      await setValue(COPY_KEY, newCopyId());
      location.reload();
    })().catch(() => undefined);
  }
  return { status: 'open', folder, handle };
}

export function FolderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FolderState>({ status: 'checking' });
  const [remembered, setRemembered] = useState<FileSystemDirectoryHandle | null>(null);
  const [demoHistory, setDemoHistory] = useState<{ done: number; total: number } | 'short' | null>(null);

  /**
   * The app opened on the demo: its last months made first (seconds, shown as they are made), the app
   * opened on them, and the earlier history made behind it. A demo that cannot be made (no room, a
   * storage the browser withholds) is said so on the Welcome screen, and the choice of it forgotten.
   */
  const openDemo = useCallback(async () => {
    chooseDemo();
    setState({ status: 'demo-preparing', done: 0, total: 0 });
    try {
      const { openDemoFolder } = await import('./demo');
      const handle = await openDemoFolder((done, total) => setState((s) => (s.status === 'demo-preparing' ? { status: 'demo-preparing', done, total } : s)), setDemoHistory);
      setState({ status: 'open', folder: new BrowserFolder(handle), handle, demo: true });
    } catch {
      forgetDemo();
      // Back to what this browser can do without the demo: the choice of a folder, or the word that it has none.
      setState(typeof window.showDirectoryPicker === 'function' ? { status: 'not-chosen', demoFailed: true } : { status: 'unsupported', insecure: !window.isSecureContext, demoFailed: true });
    }
  }, []);

  const leaveDemo = useCallback(async () => {
    forgetDemo();
    // The app opened again from its start: on the folder chosen before, or on the choice of one. The demo's
    // folder is removed there, once no worker of this page writes it any more.
    location.assign('/');
  }, []);

  useEffect(() => {
    (async () => {
      if (demoChosen()) {
        if (demoSupported()) return openDemo();
        forgetDemo();
      }
      // A demo left before: its folder removed, now that no worker of that page writes it.
      if (demoLeft()) void import('./demo').then((m) => m.removeLeftDemo());
      if (typeof window.showDirectoryPicker !== 'function') return setState({ status: 'unsupported', insecure: !window.isSecureContext });
      const handle = await getValue<FileSystemDirectoryHandle>(HANDLE_KEY).catch(() => undefined);
      if (!handle) return setState({ status: 'not-chosen' });
      setRemembered(handle);
      const perm = await handle.queryPermission?.({ mode: 'readwrite' });
      // A folder that cannot be opened (moved, renamed, deleted, its disk not connected) is said so, with the
      // choice of a folder: left unanswered, the app stayed on an empty page at every opening (the review of 26 Nov 2026).
      if (perm === 'granted') setState(await opened(handle).catch((): FolderState => ({ status: 'not-chosen', lost: handle.name })));
      else setState({ status: 'access-pending', name: handle.name });
    })().catch(() => setState({ status: 'not-chosen' }));
  }, [openDemo]);

  const pick = useCallback(async () => {
    const handle = await window.showDirectoryPicker!({ id: 'strideprism-data', mode: 'readwrite' });
    // A folder of their own chosen from the demo: the demo is left.
    forgetDemo();
    await setValue(HANDLE_KEY, handle);
    setRemembered(handle);
    setState(await opened(handle, true));
  }, []);

  const confirmAccess = useCallback(async () => {
    if (!remembered) return;
    const perm = await remembered.requestPermission?.({ mode: 'readwrite' });
    if (perm === 'granted') setState(await opened(remembered).catch((): FolderState => ({ status: 'not-chosen', lost: remembered.name })));
  }, [remembered]);

  return <Ctx.Provider value={{ state, pick, confirmAccess, openDemo, leaveDemo, demoHistory }}>{children}</Ctx.Provider>;
}

export function useFolder(): FolderApi {
  const api = useContext(Ctx);
  // A mistake of the code, never shown to the runner. i18n-ignore
  if (!api) throw new Error('useFolder outside FolderProvider');
  return api;
}

/** The open folder; only call inside screens the Shell renders once the folder is open. */
export function useOpenFolder(): { folder: DataFolder; handle: FileSystemDirectoryHandle } {
  const { state } = useFolder();
  // A mistake of the code (the Shell renders the screens once the folder is open), never shown. i18n-ignore
  if (state.status !== 'open') throw new Error('folder not open');
  return { folder: state.folder, handle: state.handle };
}

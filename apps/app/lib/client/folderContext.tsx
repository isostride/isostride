'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserFolder, MirroredFolder, copyIsCurrent, openCopy, openDataFolder, pruneCopies, usesCopy, type DataFolder } from '@/lib/fs';
import { setCopyId } from './worker';
import { getValue, setValue } from './handleStore';

/** The Data Folder lifecycle as the screens see it (model: Data Folder lifecycle). */
export type FolderState =
  | { status: 'checking' }
  /** insecure: opened over plain http (not localhost), where the browser hides folder access */
  | { status: 'unsupported'; insecure: boolean }
  | { status: 'not-chosen' }
  | { status: 'access-pending'; name: string }
  | { status: 'open'; folder: DataFolder; handle: FileSystemDirectoryHandle };

interface FolderApi {
  state: FolderState;
  pick(): Promise<void>;
  confirmAccess(): Promise<void>;
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
  const copy = await copyFor(fresh);
  setCopyId(copy);
  const folder = await openDataFolder(handle, copy, startNewCopy);
  const { moveLegacyData } = await import('@/lib/legacy');
  await moveLegacyData(folder);
  void pruneCopies(copy).catch(() => undefined);
  if (copy) {
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

  useEffect(() => {
    (async () => {
      if (typeof window.showDirectoryPicker !== 'function') return setState({ status: 'unsupported', insecure: !window.isSecureContext });
      const handle = await getValue<FileSystemDirectoryHandle>(HANDLE_KEY).catch(() => undefined);
      if (!handle) return setState({ status: 'not-chosen' });
      setRemembered(handle);
      const perm = await handle.queryPermission?.({ mode: 'readwrite' });
      if (perm === 'granted') setState(await opened(handle));
      else setState({ status: 'access-pending', name: handle.name });
    })();
  }, []);

  const pick = useCallback(async () => {
    const handle = await window.showDirectoryPicker!({ id: 'strideprism-data', mode: 'readwrite' });
    await setValue(HANDLE_KEY, handle);
    setRemembered(handle);
    setState(await opened(handle, true));
  }, []);

  const confirmAccess = useCallback(async () => {
    if (!remembered) return;
    const perm = await remembered.requestPermission?.({ mode: 'readwrite' });
    if (perm === 'granted') setState(await opened(remembered));
  }, [remembered]);

  return <Ctx.Provider value={{ state, pick, confirmAccess }}>{children}</Ctx.Provider>;
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

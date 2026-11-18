'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserFolder } from '@/lib/fs/browserFolder';
import { getValue, setValue } from './handleStore';

/** The Data Folder lifecycle as the screens see it (model: Data Folder lifecycle). */
export type FolderState =
  | { status: 'checking' }
  | { status: 'unsupported' }
  | { status: 'not-chosen' }
  | { status: 'access-pending'; name: string }
  | { status: 'open'; folder: BrowserFolder; handle: FileSystemDirectoryHandle };

interface FolderApi {
  state: FolderState;
  pick(): Promise<void>;
  confirmAccess(): Promise<void>;
}

const Ctx = createContext<FolderApi | null>(null);
const HANDLE_KEY = 'folderHandle';

export function FolderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FolderState>({ status: 'checking' });
  const [remembered, setRemembered] = useState<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window.showDirectoryPicker !== 'function') return setState({ status: 'unsupported' });
      const handle = await getValue<FileSystemDirectoryHandle>(HANDLE_KEY).catch(() => undefined);
      if (!handle) return setState({ status: 'not-chosen' });
      setRemembered(handle);
      const perm = await handle.queryPermission?.({ mode: 'readwrite' });
      if (perm === 'granted') setState({ status: 'open', folder: new BrowserFolder(handle), handle });
      else setState({ status: 'access-pending', name: handle.name });
    })();
  }, []);

  const pick = useCallback(async () => {
    const handle = await window.showDirectoryPicker!({ id: 'strideprism-data', mode: 'readwrite' });
    await setValue(HANDLE_KEY, handle);
    setRemembered(handle);
    setState({ status: 'open', folder: new BrowserFolder(handle), handle });
  }, []);

  const confirmAccess = useCallback(async () => {
    if (!remembered) return;
    const perm = await remembered.requestPermission?.({ mode: 'readwrite' });
    if (perm === 'granted') setState({ status: 'open', folder: new BrowserFolder(remembered), handle: remembered });
  }, [remembered]);

  return <Ctx.Provider value={{ state, pick, confirmAccess }}>{children}</Ctx.Provider>;
}

export function useFolder(): FolderApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useFolder outside FolderProvider');
  return api;
}

/** The open folder; only call inside screens the Shell renders once the folder is open. */
export function useOpenFolder(): { folder: BrowserFolder; handle: FileSystemDirectoryHandle } {
  const { state } = useFolder();
  if (state.status !== 'open') throw new Error('folder not open');
  return { folder: state.folder, handle: state.handle };
}

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { DataFolder } from '@/lib/fs';
import { readSetup, setupWanted } from '@/lib/settings';
import { SETUP_CONTINUE } from './SetupSteps';

/**
 * The setup wizard opened by itself (requirement "Setup wizard": "tez bedzie uruchamial sie na
 * poczatku", "przy starcie pierwszym powinien uruchamiac wizarda"): once a folder is open, if the wizard
 * was neither gone through nor skipped in it, the app goes to it, a folder set up before included
 * (its steps filled with what is saved); and always when the folder was just picked on the Welcome
 * screen, the wizard's first step. Looked at once per folder.
 */
export function SetupGate({ folder, demo = false }: { folder: DataFolder; demo?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const looked = useRef<DataFolder | null>(null);
  useEffect(() => {
    if (looked.current === folder) return;
    looked.current = folder;
    // A folder picked on the Welcome screen, the setup's first step: the wizard goes on, whatever the folder holds.
    let picked = false;
    // Not the demo: a folder chosen and the picker cancelled, then the demo tried, opened the wizard over its runner (the review of 26 Nov 2026).
    try { picked = !demo && sessionStorage.getItem(SETUP_CONTINUE) === '1'; sessionStorage.removeItem(SETUP_CONTINUE); } catch { /* no session storage */ }
    readSetup(folder).then((setup) => {
      if ((picked || setupWanted(setup)) && !path.startsWith('/setup')) router.replace('/setup');
    }).catch(() => undefined);
  }, [folder, path, router, demo]);
  return null;
}

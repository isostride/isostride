'use client';

import { useEffect, useState } from 'react';
import { runInWorker, useOpenFolder, watchJob } from '@/lib/client';
import { unseenFitFiles } from '@/lib/fs';
import { tn } from '@/lib/i18n';

/** The least time between two looks at the folder, ms: focus and visibility often come together. */
const SETTLE = 2000;
/** How long the notice of an automatic import stays, ms. */
const NOTICE = 6000;

/**
 * New runs imported by themselves (requirement "New runs imported by themselves"): when the app
 * opens on a folder imported before, and whenever its window comes back into view, the folder is
 * listed and the FIT files no import has seen are imported, in the Processing Worker, like the
 * runner's own import (only the new files are read). Returns the notice to show, for a few seconds.
 */
function useAutoImport(): string | null {
  const { folder, handle } = useOpenFolder();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let busy = false;
    // A job running now (an import the runner started, a recompute): the look waits for the next time.
    let running = false;
    const unwatch = watchJob((j) => { running = j !== null; });
    const jobRunning = () => running;
    let last = 0;
    const look = async () => {
      if (busy || document.visibilityState !== 'visible' || Date.now() - last < SETTLE || jobRunning()) return;
      busy = true;
      last = Date.now();
      try {
        if ((await unseenFitFiles(folder)).length && !jobRunning()) {
          const done = await runInWorker('import', handle);
          if (alive && done.imported) setNotice(tn(done.imported, 'Imported {n} new run from the folder.', 'Imported {n} new runs from the folder.'));
        }
      } catch {
        // The folder could not be read now (permission, a file being written): the next look tries again.
      } finally {
        busy = false;
      }
    };
    look();
    document.addEventListener('visibilitychange', look);
    window.addEventListener('focus', look);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('focus', look);
      unwatch();
    };
  }, [folder, handle]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE);
    return () => clearTimeout(t);
  }, [notice]);
  return notice;
}


/**
 * The notice of runs imported by themselves (requirement "New runs imported by themselves"): the
 * folder is looked at when the app opens and whenever its window comes back into view. The live
 * region is always there, so that a screen reader announces the notice when it appears.
 */
export function AutoImport() {
  const notice = useAutoImport();
  return (
    <div className="toast-region" aria-live="polite">
      {notice && (
        <div className="toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></svg>
          {notice}
        </div>
      )}
    </div>
  );
}

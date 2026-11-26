'use client';

import { useEffect, useState } from 'react';
import { runInWorker, useOpenFolder, watchJob } from '@/lib/client';
import { PATHS, filesToImport, readJson } from '@/lib/fs';
import { t, tn } from '@/lib/i18n';
import { summariesCurrent } from '@/lib/load';
import type { DataFolder } from '@/lib/fs';
import { AddedRuns } from './AddedRuns';
import { onNotice, type Notice } from './notify';

/** The least time between two looks at the folder, ms: focus and visibility often come together. */
const SETTLE = 2000;
/** How long a notice stays, ms ("wystarczy np. 5 sekund i jeszcze dismiss"); × closes it before. */
const NOTICE = 5000;

/**
 * Every run of the folder imported by itself (requirements "New runs imported by themselves" and
 * "Import folder" replaced: "czy przycisk import folder ma sens ? myslalem ze aplikacja sama pobierze
 * wszystkie pliki z folderu"): when the app opens on a folder, all its FIT files no import has seen
 * (every one, the first time) and those an import failed on; whenever its window comes back into view,
 * the files no import has seen. In the Processing Worker; only the files to import are read. Returns
 * the notice to show, for a few seconds.
 */
function useAutoImport(): { notice: Notice | null; folder: DataFolder; dismiss: () => void } {
  const { folder, handle } = useOpenFolder();
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    let alive = true;
    let busy = false;
    // A job running now (an import the runner started, a recompute): the look waits until it ends.
    let running = false;
    const jobRunning = () => running;
    let last = 0;
    /**
     * Until the first look since the app opened on the folder has done its work: the data built by an older
     * version rebuilt, the files an import failed on tried again, an import cut off finished, the load
     * summaries of an older version made again. A look that could not (a job was running, the folder could
     * not be read) leaves it standing, and the next one opens the folder again: before, it was given up for
     * the whole session, and a screen that started a job as it opened kept the rebuild from ever running
     * (the review of 26 Nov 2026).
     */
    let first = true;
    const look = async () => {
      if (busy || document.visibilityState !== 'visible' || Date.now() - last < SETTLE || jobRunning()) return;
      busy = true;
      last = Date.now();
      const opening = first;
      try {
        // Data built by an older algorithm, when the app opens: rebuilt at once, by itself (requirement
        // "Offer recompute on mismatch": "Czy przeliczanie po zmianie algorytmu ma być samoczynne ... tak").
        const files = await filesToImport(folder);
        let rebuilt = false;
        if (opening && files.outdated) {
          if (jobRunning()) return;
          const done = await runInWorker('recompute', handle);
          rebuilt = true;
          if (alive) setNotice({ text: tn(done.imported, 'Rebuilt {n} run for this version of the app.', 'Rebuilt {n} runs for this version of the app.'), ids: [] });
        }
        // After a recompute the folder is looked at again: it read every file there was.
        const now = rebuilt ? await filesToImport(folder) : files;
        if (now.unseen.length || now.pending || (opening && now.failed.length)) {
          if (jobRunning()) return;
          const done = await runInWorker('import', handle);
          if (alive && done.imported) setNotice({ text: tn(done.imported, 'Imported {n} new run from the folder.', 'Imported {n} new runs from the folder.'), ids: done.runIds ?? [] });
        } else if (opening && !rebuilt) {
          // The load summaries of an older version (an import makes them again by itself): the Dashboard's
          // model tiles and a run's D′ balance read them without going through Performance.
          const [index, sums] = await Promise.all([readJson<{ runs: unknown[] }>(folder, PATHS.runsIndex), readJson<{ version?: number; algorithmVersion?: number }>(folder, PATHS.loadSummaries)]);
          if (index?.runs.length && !summariesCurrent(sums)) {
            if (jobRunning()) return;
            await runInWorker('context', handle);
          }
        }
        first = false;
      } catch {
        // The folder could not be read now (permission, a file being written): the next look tries again.
      } finally {
        busy = false;
      }
    };
    // When the job that kept the opening look from its work ends, the look is taken again at once.
    const unwatch = watchJob((j) => {
      running = j !== null;
      if (!running && first && alive) { last = 0; void look(); }
    });
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
  // The notices of the screens (a recompute, COROS), shown the same way (components/notify).
  useEffect(() => onNotice(setNotice), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE);
    return () => clearTimeout(t);
  }, [notice]);
  return { notice, folder, dismiss: () => setNotice(null) };
}


/**
 * The notices of the app at the bottom right, for 5 s (× closes one before): the runs imported by themselves (requirement
 * "New runs imported by themselves": the folder is looked at when the app opens and whenever its
 * window comes back into view), and what a screen's job did (components/notify). The live region is
 * always there, so that a screen reader announces a notice when it appears.
 */
export function AutoImport() {
  const { notice, folder, dismiss } = useAutoImport();
  return (
    <div className="toast-region" aria-live="polite">
      {notice && (
        <div className="toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></svg>
          <div className="toast-body">
            {notice.text}
            <AddedRuns folder={folder} ids={notice.ids ?? []} />
          </div>
          <button type="button" className="toast-close" onClick={dismiss} aria-label={t('Close')} title={t('Close')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

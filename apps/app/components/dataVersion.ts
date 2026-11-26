'use client';

import { useEffect, useState } from 'react';
import { watchJob } from '@/lib/client';

/**
 * A number raised each time an import, a recompute or a finding of the segments' efforts ends, wherever
 * it was started (one the app started by itself included: requirement "New runs imported by themselves"):
 * a screen that reads the runs on its own reads them again when it changes. The segments' (blocks) too: a
 * segment saved and Compare opened before its efforts are found shows them once they are
 * ("stworzylem segmenty 10 minutowe ... seria po serii porownanie nie dziala").
 */
export function useDataVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let was: string | null = null;
    return watchJob((j) => {
      const now = j && (j.job === 'import' || j.job === 'recompute' || j.job === 'blocks' || j.job === 'demo') ? j.job : null;
      // Ended, whatever runs after it (a read of Compare started meanwhile is no reason to wait), or given way to
      // another one still running: a segment's efforts found while the demo's history is made for minutes.
      if (was && now !== was) setVersion((v) => v + 1);
      was = now;
    });
  }, []);
  return version;
}

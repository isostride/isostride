'use client';

import { useEffect, useState } from 'react';
import { watchJob } from '@/lib/client';

/**
 * A number raised each time an import or a recompute ends, wherever it was started (one the app
 * started by itself included: requirement "New runs imported by themselves"): a screen that reads
 * the runs on its own reads them again when it changes.
 */
export function useDataVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let was = false;
    return watchJob((j) => {
      if (j && (j.job === 'import' || j.job === 'recompute')) was = true;
      else if (!j && was) { was = false; setVersion((v) => v + 1); }
    });
  }, []);
  return version;
}

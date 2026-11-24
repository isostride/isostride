'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import { date, km, time } from '@/lib/format';
import { t, tn } from '@/lib/i18n';
import type { IndexedRun, RunsIndex } from '@/lib/kernel';

/** How many runs a notice names; the others are counted. */
const NAMED = 3;

/**
 * The runs an import added, named in its notice (requirement "New runs marked new"): each as its day,
 * start and distance, leading to the run; the rest counted, leading to the Runs screen where they are
 * marked New.
 */
export function AddedRuns({ folder, ids }: { folder: DataFolder; ids: string[] }) {
  const [runs, setRuns] = useState<IndexedRun[] | null>(null);
  useEffect(() => {
    readJson<RunsIndex>(folder, PATHS.runsIndex)
      .then((index) => setRuns((index?.runs ?? []).filter((r) => ids.includes(r.id)).reverse()))
      .catch(() => setRuns([]));
  }, [folder, ids]);
  if (!runs?.length) return null;
  const more = runs.length - NAMED;
  return (
    <ul className="added-runs" aria-label={t('Runs added')}>
      {runs.slice(0, NAMED).map((r) => (
        <li key={r.id}>
          <Link href={`/run?id=${r.id}`}><b>{date(r.startTime)}</b> {time(r.startTime)} · <span className="tnum">{km(r.distance)} km</span></Link>
        </li>
      ))}
      {more > 0 && <li><Link href="/">{tn(more, 'and {n} more in Runs', 'and {n} more in Runs')}</Link></li>}
    </ul>
  );
}

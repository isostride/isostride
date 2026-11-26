'use client';

import Link from 'next/link';
import { SHOWN_WORDS, encodeRule, patternName, patternOf, ruleOf } from '@/lib/blocks';
import { t } from '@/lib/i18n';
import type { RunFile } from '@/lib/kernel';

/**
 * Compare with the previous run of a workout's layout (requirement "Previous workout of a layout"):
 * shown when at least two laps of the run were run as efforts; opens the Efforts tab of Analysis on
 * the reps of every run of the layout, by run, the change from the previous one on top. Loaded after the
 * screen, as the budget wants.
 */
export function WorkoutLink({ run }: { run: Pick<RunFile, 'id' | 'laps' | 'duration' | 'distance'> }) {
  const laps = patternOf(run.laps, run.distance > 0 ? run.duration / run.distance : 0);
  if (laps.filter((p) => p.effort).length < 2) return null;
  const code = encodeRule(ruleOf({ type: 'pattern', laps, tolerance: 0.03 }));
  return (
    <Link className="btn" href={`/compare?items=q:${code}:0&tab=segments`} title={t('Compare this workout rep by rep with the previous run of its layout')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></svg>
      {t('Compare with the previous {layout}', { layout: patternName(laps, SHOWN_WORDS) })}
    </Link>
  );
}

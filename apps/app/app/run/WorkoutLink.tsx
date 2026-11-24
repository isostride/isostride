'use client';

import Link from 'next/link';
import { SHOWN_WORDS, patternName, patternOf } from '@/lib/blocks';
import { t } from '@/lib/i18n';
import type { RunFile } from '@/lib/kernel';

/**
 * Compare with the previous run of a workout's layout (requirement "Previous workout of a layout"):
 * shown when at least two laps of the run were run as efforts; opens the Rep by rep tab of Analysis
 * on the run, which finds the previous one. Loaded after the screen, as the budget wants.
 */
export function WorkoutLink({ run }: { run: Pick<RunFile, 'id' | 'laps' | 'duration' | 'distance'> }) {
  const laps = patternOf(run.laps, run.distance > 0 ? run.duration / run.distance : 0);
  if (laps.filter((p) => p.effort).length < 2) return null;
  return <Link className="btn" href={`/compare?items=r:${run.id}:0&tab=reps`} title={t('Compare this workout rep by rep with the previous run of its layout')}>{t('Compare with the previous {layout}', { layout: patternName(laps, SHOWN_WORDS) })}</Link>;
}

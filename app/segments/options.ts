import type { DataFolder } from '@/lib/fs';
import { readGear, readRunTags } from '@/lib/gear';
import type { RunsIndex } from '@/lib/kernel';
import type { BuilderOptions } from './RuleBuilder';

/** What the block editor offers to choose runs by: the workout types, cues, shoes, heart rate sources and devices of the folder. */
export async function builderOptions(folder: DataFolder, rows: RunsIndex['runs']): Promise<BuilderOptions> {
  const g = await readGear(folder);
  const tags = await readRunTags(folder);
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  return {
    workoutTypes: uniq([...tags.dictionary.workoutTypes, ...rows.map((r) => r.workoutType)]),
    techniqueCues: uniq([...tags.dictionary.techniqueCues, ...rows.map((r) => r.techniqueCue)]),
    shoes: uniq([...g.filter((x) => x.type === 'shoes').map((x) => x.name), ...rows.map((r) => r.shoes)]),
    heartRateSources: uniq(rows.map((r) => r.heartRateSource)),
    devices: uniq(rows.map((r) => r.device)),
  };
}

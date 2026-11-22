import type { BlockParams } from '@/lib/blocks';

/** A run's name in the Analysis screen: its title if any, its date and its distance. */
export const runName = (start: string, distance: number, title?: string | null) =>
  `${title ? `${title} · ` : ''}${new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${(distance / 1000).toFixed(1)} km`;

/** The kinds of block, in words. */
export const TYPE_LABEL: Record<BlockParams['type'], string> = {
  route: 'route segment', structure: 'workout lap', steady: 'steady fragment', effort: 'effort, any route', tag: 'workout type', pattern: 'lap pattern', rule: 'rule', profile: 'same profile, any route',
};

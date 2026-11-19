import { BLOCK_METRICS, type BlockInstance, type BlockMetric } from '@/lib/blocks';

let n = 0;
type Over = Partial<Omit<BlockInstance, 'metrics' | 'context'>> & {
  metrics?: Partial<Record<BlockMetric, number | null>>;
  run?: Partial<BlockInstance['context']['run']>;
  pace?: number;
};

/** A synthetic accepted block instance; values not given are null. */
export function inst(day: string, o: Over = {}): BlockInstance {
  const metrics = Object.fromEntries(BLOCK_METRICS.map((m) => [m, null])) as Record<BlockMetric, number | null>;
  Object.assign(metrics, o.metrics);
  const pace = o.pace ?? (metrics.speed ? 1000 / metrics.speed : 300);
  if (metrics.speed === null) metrics.speed = 1000 / pace;
  const id = `def:${day}:${n++}`;
  return {
    id,
    definitionId: 'def',
    runId: o.runId ?? `run-${day}`,
    runStart: `${day}T07:00:00.000Z`,
    start: o.start ?? 720,
    end: o.end ?? 1020,
    duration: (o.end ?? 1020) - (o.start ?? 720),
    distance: 1000,
    metrics,
    profile: Object.fromEntries(BLOCK_METRICS.map((m) => [m, [metrics[m], metrics[m], metrics[m], metrics[m], metrics[m]]])) as BlockInstance['profile'],
    context: {
      block: { pace, grade: 0, duration: 300, heading: 45, cv: 0.05, stopped: 0, start: 'flying' },
      before: { minuteOfRun: 12, kmOfRun: 2.4, effortBefore: 0.03, lap: 1 },
      run: { device: 'COROS PACE 4', shoes: 'Shoes A', heartRateSource: 'wrist (COROS PACE 4)', workoutType: 'long', techniqueCue: null, ...o.run },
      day: { load3: 100, load7: 300, temperature: 15 },
    },
    status: o.status ?? 'accepted',
    reasons: o.reasons ?? [],
  };
}

export const days = (from: string, count: number, step = 7) =>
  Array.from({ length: count }, (_, k) => new Date(Date.parse(`${from}T12:00:00Z`) + k * step * 86_400_000).toISOString().slice(0, 10));

import type { BlockInstance } from '@/lib/blocks';
import { KNOWN_METRICS } from '@/lib/kernel';

/** One row per block instance, with its context fields and metric means (spec F15). */
export function instancesCsv(instances: BlockInstance[], names: Map<string, string> = new Map()): string {
  // A column for each metric the instances hold: the known ones in their order, then the others.
  const held = new Set(instances.flatMap((i) => Object.keys(i.metrics)));
  const known = Object.keys(KNOWN_METRICS).filter((m) => held.has(m));
  const metrics = [...known, ...[...held].filter((m) => !known.includes(m)).sort()];
  const head = [
    'definition', 'run', 'date', 'start_min', 'end_min', 'duration_s', 'distance_m', 'status', 'reasons',
    'pace_s_per_km', 'grade', 'cv', 'heading', 'minute_of_run', 'km_of_run', 'effort_before', 'lap',
    'watch', 'shoes', 'heart_rate_sensor', 'workout_type', 'technique_cue', 'load_3d', 'load_7d', 'form', 'temperature',
    ...metrics,
  ];
  const rows = instances.map((i) => [
    names.get(i.definitionId) ?? i.definitionId, i.runId, i.runStart.slice(0, 10), (i.start / 60).toFixed(1), (i.end / 60).toFixed(1),
    i.duration, i.distance, i.status, i.reasons.join('; '),
    i.context.block.pace, i.context.block.grade, i.context.block.cv, i.context.block.heading ?? '', i.context.before.minuteOfRun,
    i.context.before.kmOfRun, i.context.before.effortBefore ?? '', i.context.before.lap ?? '',
    i.context.run.device, i.context.run.shoes ?? '', i.context.run.heartRateSource, i.context.run.workoutType ?? '', i.context.run.techniqueCue ?? '',
    i.context.day.load3, i.context.day.load7, i.context.day.form ?? '', i.context.day.temperature ?? '',
    ...metrics.map((m) => i.metrics[m] ?? ''),
  ]);
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

/**
 * A cell of the file. A text that a spreadsheet would run as a formula (it starts with =, +, -, @, a tab
 * or a return, and is no number) gets an apostrophe before it: the names come from files that may be
 * someone else's (a device, a segment, a tag, gear). Quoted when it holds a quote, a comma or a line end.
 */
export function cell(v: unknown): string {
  const text = String(v);
  const s = typeof v !== 'number' && /^[=+\-@\t\r]/.test(text) && !Number.isFinite(Number(text)) ? `'${text}` : text;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

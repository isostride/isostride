import type { BlockMetric } from '@/lib/blocks';

const mmss = (v: number) => {
  const s = Math.round(v);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** A tick: whole numbers unless the step of the axis needs decimals. */
const num = (min: number) => (v: number, d = 0) => v.toFixed(Math.max(min, d));

/**
 * How the compare screens show each metric: a short button name, its full name, a value, an axis
 * tick (with the decimals its step needs), and the least range its axis shows: a difference
 * smaller than about a quarter of it is small on the chart too.
 */
export const METRIC_VIEW: { key: BlockMetric; short: string; name: string; fmt: (v: number) => string; tick: (v: number, decimals?: number) => string; minSpan: number; invert?: boolean }[] = [
  { key: 'speed', short: 'Pace', name: 'Pace (min/km)', fmt: (v) => `${mmss(v)} /km`, tick: mmss, minSpan: 20, invert: true },
  { key: 'heartRate', short: 'Heart rate', name: 'Heart rate (bpm)', fmt: (v) => `${Math.round(v)} bpm`, tick: num(0), minSpan: 10 },
  { key: 'cadence', short: 'Cadence', name: 'Cadence (spm)', fmt: (v) => `${Math.round(v)} spm`, tick: num(0), minSpan: 6 },
  { key: 'groundContactTime', short: 'Ground contact', name: 'Ground contact time (ms)', fmt: (v) => `${Math.round(v)} ms`, tick: num(0), minSpan: 20 },
  { key: 'verticalOscillation', short: 'Vertical osc.', name: 'Vertical oscillation (mm)', fmt: (v) => `${Math.round(v)} mm`, tick: num(0), minSpan: 10 },
  { key: 'stepLength', short: 'Step length', name: 'Step length (mm)', fmt: (v) => `${Math.round(v)} mm`, tick: num(0), minSpan: 60 },
  { key: 'power', short: 'Power', name: 'Power (W)', fmt: (v) => `${Math.round(v)} W`, tick: num(0), minSpan: 20 },
  { key: 'efficiency', short: 'Efficiency', name: 'Efficiency (m per heartbeat)', fmt: (v) => `${v.toFixed(3)} m/beat`, tick: num(2), minSpan: 0.1 },
  { key: 'legSpringStiffness', short: 'Leg stiffness', name: 'Leg spring stiffness (kN/m)', fmt: (v) => `${v.toFixed(1)} kN/m`, tick: num(1), minSpan: 1 },
];

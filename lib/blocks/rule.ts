import type { IndexedRun, RunFile, WindowMetric } from '@/lib/kernel';
import { STAT_LABEL, efficiencyOf, type BlockMetric, type BlockParams, type Conditions, type Rule, type RuleShape, type RunFilter, type Stat, type Tolerances } from './types';

/**
 * Rule blocks (the author's remodelling of 19 Nov 2026): the pure parts the Analysis screen and
 * the detection share: which runs a rule draws from, what a segment must meet on average, the
 * rule in words, the rule as the screen's link carries it, and a statistic over 10 s windows.
 */

export const EMPTY_FILTER: RunFilter = {
  dateFrom: null, dateTo: null, title: '', workoutTypes: [], techniqueCues: [], shoes: [], heartRateSources: [], devices: [], lapsMin: null, lapsMax: null,
};

export const EMPTY_CONDITIONS: Conditions = {
  paceMin: null, paceMax: null, hrMin: null, hrMax: null, distanceMin: null, distanceMax: null, durationMin: null, durationMax: null,
  alwaysHrMin: null, alwaysHrMax: null, alwaysPaceMin: null, alwaysPaceMax: null, start: 'any',
};

/** A rule of a shape with nothing else set: every run, no condition; the fastest stretch one per run, the others every one. */
export function ruleOf(shape: RuleShape): Rule {
  return { runs: { ...EMPTY_FILTER }, shape, conditions: { ...EMPTY_CONDITIONS }, pick: shape.type === 'fastest' ? 'best' : 'all', stat: 'avg' };
}

/** The local calendar day of an ISO time. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inRange = (v: number | null, min: number | null, max: number | null) => (min === null && max === null) || (v !== null && (min === null || v >= min) && (max === null || v <= max));
const inList = (v: string | null | undefined, list: string[]) => !list.length || (!!v && list.includes(v));

/** True when a run is one the rule draws from. */
export function matchesRunFilter(f: RunFilter, row: IndexedRun): boolean {
  const title = f.title.trim().toLowerCase();
  const day = localDay(row.startTime);
  return (
    (!title || (row.title ?? '').toLowerCase().includes(title)) &&
    (f.dateFrom === null || day >= f.dateFrom) &&
    (f.dateTo === null || day <= f.dateTo) &&
    inList(row.workoutType, f.workoutTypes) &&
    inList(row.techniqueCue, f.techniqueCues) &&
    inList(row.shoes, f.shoes) &&
    inList(row.heartRateSource, f.heartRateSources) &&
    inList(row.device, f.devices) &&
    inRange(row.laps, f.lapsMin, f.lapsMax)
  );
}

/** What the on-average conditions are checked against: a segment's own figures. */
export interface Subject {
  /** m */
  distance: number;
  /** s */
  duration: number;
  /** s/km; null when nothing moved */
  pace: number | null;
  heartRate: number | null;
}

/** A whole run as the subject: its figures from the runs index. */
export function runSubject(row: IndexedRun): Subject {
  return { distance: row.distance, duration: row.duration, pace: row.avgSpeed > 0 ? 1000 / row.avgSpeed : null, heartRate: row.avgHeartRate };
}

/** The stretch [from, to) s of a run as the subject: its distance, duration, pace over the elapsed time and mean heart rate. */
export function stretchSubject(run: RunFile, from: number, to: number): Subject {
  const s = run.samples;
  let first: number | null = null;
  let last = 0;
  let hr = 0;
  let n = 0;
  for (let k = 0; k < s.t.length; k++) {
    if (s.t[k] < from || s.t[k] >= to) continue;
    const d = s.distance[k];
    if (d !== null) { if (first === null) first = d; last = d; }
    const h = s.heartRate[k];
    if (h !== null) { hr += h; n++; }
  }
  const distance = first === null ? 0 : last - first;
  return { distance, duration: to - from, pace: distance > 0 ? (to - from) / (distance / 1000) : null, heartRate: n ? hr / n : null };
}

/** Lap i of a run as the subject: its own distance, timer time and pace, and its mean heart rate. */
export function lapSubject(run: RunFile, i: number): Subject {
  const lap = run.laps[i];
  return { distance: lap.distance, duration: lap.duration, pace: lap.distance > 0 ? lap.duration / (lap.distance / 1000) : null, heartRate: stretchSubject(run, lap.start, lap.end).heartRate };
}

/** True when a segment meets the conditions on its average pace and heart rate, its distance and its duration. */
export function meetsConditions(c: Conditions, s: Subject): boolean {
  return inRange(s.pace, c.paceMin, c.paceMax) && inRange(s.heartRate, c.hrMin, c.hrMax) && inRange(s.distance, c.distanceMin, c.distanceMax) && inRange(s.duration, c.durationMin, c.durationMax);
}

/** True when the conditions set something to hold in every 10 s window. */
export function hasAlways(c: Conditions): boolean {
  return c.alwaysHrMin !== null || c.alwaysHrMax !== null || c.alwaysPaceMin !== null || c.alwaysPaceMax !== null;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const range = (min: number | null, max: number | null, f: (v: number) => string, unit: string) =>
  min !== null && max !== null ? `${f(min)}–${f(max)}${unit}` : min !== null ? `from ${f(min)}${unit}` : max !== null ? `to ${f(max)}${unit}` : null;

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const lengthName = (kind: 'time' | 'distance', target: number) => (kind === 'time' ? `${+(target / 60).toFixed(1)} min` : `${+(target / 1000).toFixed(2)} km`);

export function shapeName(shape: RuleShape): string {
  if (shape.type === 'run') return 'Runs';
  if (shape.type === 'lap') return shape.planned ? `Laps set up as ${lengthName(shape.planned.kind, shape.planned.target)}` : 'Laps';
  if (shape.type === 'steady') return `Steady ${+(shape.minDuration / 60).toFixed(1)} min or more`;
  if (shape.type === 'main') return 'Main effort of the run';
  if (shape.type === 'pattern') return `Effort laps of ${shape.laps.length}-lap workouts`;
  if (shape.type === 'route') return `Same route: ${(shape.length / 1000).toFixed(1)} km ${COMPASS[Math.round(shape.heading / 45) % 8]}-bound`;
  if (shape.type === 'profile') {
    const k = shape.key;
    const climb = k.altitude ? Math.round(k.altitude.reduce((s, a, i, xs) => s + (i && a > xs[i - 1] ? a - xs[i - 1] : 0), 0)) : null;
    return `Same profile: ${(k.distance / 1000).toFixed(1)} km${climb === null ? '' : `, ${climb} m up`}, pace ${mmss(Math.round(k.pace))}`;
  }
  return `Fastest ${lengthName(shape.kind, shape.target)}${shape.effort ? ', run as an effort' : ''}`;
}

/**
 * A block of an older kind, or a suggestion, as the one model has it: a rule. A route segment
 * keeps its track, a workout lap is a lap set up as its length, a steady fragment a stretch whose
 * pace stays in its band, an effort the fastest stretch run as an effort, a workout type the main
 * effort of its runs, a lap pattern its effort laps, a profile its stretch most alike.
 */
export function asRule(p: BlockParams, tol: Tolerances): Rule {
  if (p.type === 'rule') { const { type: _type, ...r } = p; return r; }
  if (p.type === 'route') return ruleOf({ type: 'route', track: p.track, length: p.length, heading: p.heading });
  if (p.type === 'structure') return ruleOf({ type: 'lap', planned: { kind: p.kind, target: p.target, tolerance: p.tolerance } });
  if (p.type === 'steady') return { ...ruleOf({ type: 'steady', minDuration: p.minDuration }), conditions: { ...EMPTY_CONDITIONS, alwaysPaceMin: tol.paceMin, alwaysPaceMax: tol.paceMax } };
  if (p.type === 'effort') return { ...ruleOf({ type: 'fastest', kind: p.kind, target: p.target, effort: true }), conditions: { ...EMPTY_CONDITIONS, start: tol.start } };
  if (p.type === 'tag') return { ...ruleOf({ type: 'main' }), runs: { ...EMPTY_FILTER, workoutTypes: [p.workoutType] } };
  if (p.type === 'pattern') return ruleOf({ type: 'pattern', laps: p.laps, tolerance: p.tolerance });
  return ruleOf({ type: 'profile', key: p.key, minScore: p.minScore });
}

/** A definition in the one model: its params a rule (an older kind read as one), its tolerances kept. */
export function asRuleDefinition<T extends { params: BlockParams; tolerances: Tolerances }>(d: T): T {
  return d.params.type === 'rule' ? d : { ...d, params: { type: 'rule', ...asRule(d.params, d.tolerances) } };
}

/** "Fastest 5 min · HR never below 160 · since 2026-03-01": the rule in words, in a fixed order, as its name. */
export function ruleName(r: Rule): string {
  const c = r.conditions;
  const f = r.runs;
  const parts = [
    shapeName(r.shape),
    range(c.distanceMin, c.distanceMax, (v) => String(+(v / 1000).toFixed(2)), ' km'),
    range(c.durationMin, c.durationMax, (v) => String(Math.round(v / 60)), ' min'),
    range(c.paceMin, c.paceMax, mmss, ' /km'),
    range(c.hrMin, c.hrMax, String, ' bpm'),
    c.alwaysHrMin !== null ? `HR never below ${c.alwaysHrMin}` : null,
    c.alwaysHrMax !== null ? `HR never above ${c.alwaysHrMax}` : null,
    c.alwaysPaceMin !== null || c.alwaysPaceMax !== null ? `pace always ${range(c.alwaysPaceMin, c.alwaysPaceMax, mmss, ' /km')}` : null,
    c.start !== 'any' ? `${c.start} start` : null,
    f.title.trim() ? `“${f.title.trim()}”` : null,
    ...f.workoutTypes, ...f.techniqueCues, ...f.shoes, ...f.heartRateSources, ...f.devices,
    f.dateFrom && f.dateTo ? `${f.dateFrom} – ${f.dateTo}` : f.dateFrom ? `since ${f.dateFrom}` : f.dateTo ? `to ${f.dateTo}` : null,
    range(f.lapsMin, f.lapsMax, String, ' laps'),
    r.shape.type !== 'run' && r.shape.type !== 'fastest' && r.pick === 'best' ? 'best of each run' : null,
    r.shape.type === 'fastest' && r.pick === 'all' ? 'every one' : null,
    r.stat !== 'avg' ? STAT_LABEL[r.stat] : null,
  ].filter((p): p is string => p !== null);
  // Whole runs with nothing else set: every run.
  if (parts.length === 1 && r.shape.type === 'run') return 'All runs';
  return parts.join(' · ');
}

/** Only what differs from the empty rule, so the link stays short. */
function compact(r: Rule): unknown {
  const drop = <T extends object>(o: T, empty: T) => Object.fromEntries(Object.entries(o).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((empty as Record<string, unknown>)[k])));
  const base = ruleOf(r.shape);
  return { s: r.shape, f: drop(r.runs, EMPTY_FILTER), c: drop(r.conditions, EMPTY_CONDITIONS), ...(r.pick !== base.pick ? { p: r.pick } : {}), ...(r.stat !== 'avg' ? { t: r.stat } : {}) };
}

const toBase64Url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (code: string) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)));

/** A rule as the Analysis link carries it: letters, digits, "-" and "_" only. */
export function encodeRule(r: Rule): string {
  return toBase64Url(JSON.stringify(compact(r)));
}

/** A rule read back from the link; null when it is not one. */
export function decodeRule(code: string): Rule | null {
  try {
    const o = JSON.parse(fromBase64Url(code)) as { s?: RuleShape; f?: Partial<RunFilter>; c?: Partial<Conditions>; p?: Rule['pick']; t?: Stat };
    const shape = o.s;
    if (!shape || !['run', 'lap', 'fastest', 'steady'].includes(shape.type)) return null;
    if (shape.type === 'fastest' && !(shape.target > 0 && (shape.kind === 'time' || shape.kind === 'distance'))) return null;
    if (shape.type === 'steady' && !(shape.minDuration > 0)) return null;
    const base = ruleOf(shape);
    return { runs: { ...EMPTY_FILTER, ...o.f }, shape, conditions: { ...EMPTY_CONDITIONS, ...o.c }, pick: o.p === 'best' || o.p === 'all' ? o.p : base.pick, stat: o.t && o.t in STAT_LABEL ? o.t : 'avg' };
  } catch {
    return null;
  }
}

const WINDOW = 10;

/**
 * A statistic of a metric over the 10 s windows with movement whose centre lies in [from, to) s
 * of a run: pace in s/km (so its minimum is the fastest window), efficiency per window.
 */
export function windowStat(run: RunFile, metric: BlockMetric | WindowMetric, stat: Stat, from = 0, to = Infinity): number | null {
  const w = run.windows;
  const vals: number[] = [];
  for (let i = 0; i < w.start.length; i++) {
    const centre = w.start[i] + WINDOW / 2;
    if (centre < from || centre >= to || w.flags.stopped[i]) continue;
    let v: number | null;
    if (metric === 'efficiency') v = efficiencyOf(w.speed[i], w.heartRate[i]);
    else if (metric === 'speed' || metric === 'effortPace') { const sp = w[metric][i]; v = sp !== null && sp > 0 ? 1000 / sp : null; }
    else v = w[metric][i];
    if (v !== null) vals.push(v);
  }
  if (!vals.length) return null;
  if (stat === 'avg') return vals.reduce((a, b) => a + b, 0) / vals.length;
  vals.sort((a, b) => a - b);
  if (stat === 'min') return vals[0];
  if (stat === 'max') return vals[vals.length - 1];
  const mid = (vals.length - 1) / 2;
  return (vals[Math.floor(mid)] + vals[Math.ceil(mid)]) / 2;
}

/** The period presets of the block builder, by key. */
export const PERIOD_PRESETS = ['all', 'month', 'quarter', 'year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** The dates of a preset, counted from today: the last 30 days, the last 3 months (91 days), this year, or everything. */
export function presetDates(preset: PeriodPreset, now = new Date()): { dateFrom: string | null; dateTo: string | null } {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = (n: number) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  if (preset === 'month') return { dateFrom: days(30), dateTo: null };
  if (preset === 'quarter') return { dateFrom: days(91), dateTo: null };
  if (preset === 'year') return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: null };
  return { dateFrom: null, dateTo: null };
}

/** Lengths of a fastest stretch the builder offers. */
export const STRETCH_PRESETS: { kind: 'time' | 'distance'; target: number }[] = [
  { kind: 'time', target: 300 }, { kind: 'time', target: 600 }, { kind: 'time', target: 1200 }, { kind: 'time', target: 1800 }, { kind: 'time', target: 3600 },
  { kind: 'distance', target: 1000 }, { kind: 'distance', target: 3000 }, { kind: 'distance', target: 5000 }, { kind: 'distance', target: 10000 },
];

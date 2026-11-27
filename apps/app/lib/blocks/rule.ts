import { isPace, metricInfo, runningGap, secondsPerKm, type IndexedRun, type RunFile, minSec } from '@/lib/kernel';
import { SAVED_WORDS, SHOWN_WORDS, lengthName, routeName, type Words } from './words';
import { patternName, repsName } from './logical';
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
  alwaysHrMin: null, alwaysHrMax: null, alwaysPaceMin: null, alwaysPaceMax: null, metric: null, metricMin: null, metricMax: null, start: 'any',
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
    inRange(row.laps, f.lapsMin, f.lapsMax) &&
    // An identical layout has as many laps: the others' files need not be read.
    (!f.layout || f.layout.match === 'similar' || row.laps === f.layout.laps.length)
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
  /** the mean of the metric of the conditions over the moving part, when they name one (a pace in s/km) */
  metric?: number | null;
}

/** A whole run as the subject: its figures from the runs index. */
export function runSubject(row: IndexedRun): Subject {
  return { distance: row.distance, duration: row.duration, pace: row.avgSpeed > 0 ? 1000 / row.avgSpeed : null, heartRate: row.avgHeartRate };
}

/**
 * The stretch [from, to) s of a run as the subject: its distance, duration, pace over the moving time
 * (a wait at the lights left out, as the similar efforts read it) and mean heart rate.
 */
export function stretchSubject(run: RunFile, from: number, to: number, metric?: string | null): Subject {
  const s = run.samples;
  const series = metric ? s.values[metric] : undefined;
  let msum = 0;
  let mn = 0;
  let first: number | null = null;
  let last = 0;
  let hr = 0;
  let n = 0;
  let moving = 0;
  let prev: number | null = null;
  const gap = runningGap(s.t);
  for (let k = 0; k < s.t.length; k++) {
    if (s.t[k] < from || s.t[k] >= to) continue;
    const d = s.distance[k];
    if (d !== null) { if (first === null) first = d; last = d; }
    const h = (s.values.heartRate?.[k] ?? null);
    if (h !== null) { hr += h; n++; }
    const mv = series?.[k] ?? null;
    if (mv !== null && (s.values.speed?.[k] ?? 1) >= 0.5) { msum += mv; mn++; }
    // Moving: a gap the watch leaves while it records (runningGap) at 0.8 m/s or more (the moving time of a profile).
    const sp = (s.values.speed?.[k] ?? null);
    if (prev !== null) { const dt = s.t[k] - prev; if (dt > 0 && dt <= gap && (sp === null || sp >= 0.8)) moving += dt; }
    prev = s.t[k];
  }
  const distance = first === null ? 0 : last - first;
  const time = moving > 0 ? moving : to - from;
  const mean = mn ? msum / mn : null;
  return { distance, duration: to - from, pace: distance > 0 ? time / (distance / 1000) : null, heartRate: n ? hr / n : null, ...(metric ? { metric: mean !== null && isPace(metric) ? secondsPerKm(mean) : mean } : {}) };
}

/** Lap i of a run as the subject: its own distance, timer time and pace, and its mean heart rate. */
export function lapSubject(run: RunFile, i: number, metric?: string | null): Subject {
  const lap = run.laps[i];
  const within = stretchSubject(run, lap.start, lap.end, metric);
  return { distance: lap.distance, duration: lap.duration, pace: lap.distance > 0 ? lap.duration / (lap.distance / 1000) : null, heartRate: within.heartRate, ...(metric ? { metric: within.metric } : {}) };
}

/** True when a segment meets the conditions on its average pace and heart rate, its distance and its duration. */
export function meetsConditions(c: Conditions, s: Subject): boolean {
  return inRange(s.pace, c.paceMin, c.paceMax) && inRange(s.heartRate, c.hrMin, c.hrMax) && inRange(s.distance, c.distanceMin, c.distanceMax) && inRange(s.duration, c.durationMin, c.durationMax)
    && (!c.metric || inRange(s.metric ?? null, c.metricMin ?? null, c.metricMax ?? null));
}

/** True when the conditions set something to hold in every 10 s window. */
export function hasAlways(c: Conditions): boolean {
  return c.alwaysHrMin !== null || c.alwaysHrMax !== null || c.alwaysPaceMin !== null || c.alwaysPaceMax !== null;
}

const mmss = (sec: number) => minSec(sec);
const range = (w: Words, min: number | null, max: number | null, f: (v: number) => string, unit: string) =>
  min !== null && max !== null ? `${f(min)}–${f(max)}${unit}` : min !== null ? w.t('from {value}', { value: `${f(min)}${unit}` }) : max !== null ? w.t('to {value}', { value: `${f(max)}${unit}` }) : null;

/** The stretch of a rule in words: "Fastest 5 min", "Laps", "Same route: 5.2 km north-bound"; in the language in use unless given the saved words. */
export function shapeName(shape: RuleShape, w: Words = SHOWN_WORDS): string {
  if (shape.type === 'run') return w.t('Runs');
  if (shape.type === 'lap') return shape.planned ? w.t('Laps set up as {length}', { length: lengthName(shape.planned.kind, shape.planned.target, w) }) : w.t('Laps');
  if (shape.type === 'steady') return w.t('Steady {min} min or more', { min: w.num(+(shape.minDuration / 60).toFixed(1)) });
  if (shape.type === 'main') return w.t('Main effort of the run');
  if (shape.type === 'pattern') return shape.match === 'similar' ? w.t('Reps of {reps}, any layout', { reps: repsName(shape.laps, w) }) : w.t('Reps of {layout}', { layout: patternName(shape.laps, w) });
  if (shape.type === 'route') return w.t('Same route: {route}', { route: routeName(shape.length, shape.heading, w) });
  if (shape.type === 'profile') {
    const k = shape.key;
    const climb = k.altitude ? Math.round(k.altitude.reduce((s, a, i, xs) => s + (i && a > xs[i - 1] ? a - xs[i - 1] : 0), 0)) : null;
    const vars = { km: w.num(w.dist(k.distance), 1), unit: w.distUnit(), climb: w.num(Math.round(w.elev(climb ?? 0))), climbUnit: w.elevUnit(), pace: mmss(Math.round(w.pace(k.pace))) };
    return climb === null ? w.t('Same profile: {km} {unit}, pace shape of {pace}', vars) : w.t('Same profile: {km} {unit}, {climb} {climbUnit} up, pace shape of {pace}', vars);
  }
  const length = lengthName(shape.kind, shape.target, w);
  return shape.effort ? w.t('Fastest {length}, run as an effort', { length }) : w.t('Fastest {length}', { length });
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

/**
 * "Fastest 5 min · HR never below 160 · since 2026-03-01": the rule in words, in a fixed order, as its
 * name. In English as the data folder keeps it, unless given the words of the language in use.
 */
export function ruleName(r: Rule, w: Words = SAVED_WORDS): string {
  const c = r.conditions;
  const f = r.runs;
  const n2 = (v: number) => w.num(+v.toFixed(2));
  const parts = [
    shapeName(r.shape, w),
    range(w, c.distanceMin, c.distanceMax, (v) => n2(w.dist(v)), ` ${w.distUnit()}`),
    range(w, c.durationMin, c.durationMax, (v) => w.num(Math.round(v / 60)), ' min'),
    range(w, c.paceMin, c.paceMax, (v) => mmss(w.pace(v)), ` ${w.paceUnit()}`),
    range(w, c.hrMin, c.hrMax, (v) => w.num(v), ' bpm'),
    c.metric && (c.metricMin != null || c.metricMax != null) ? `${w.t(metricInfo(c.metric).name)} ${range(w, c.metricMin ?? null, c.metricMax ?? null, isPace(c.metric) ? (v) => mmss(w.pace(v)) : n2, isPace(c.metric) ? ` ${w.paceUnit()}` : metricInfo(c.metric).unit ? ` ${metricInfo(c.metric).unit}` : '')}` : null,
    c.alwaysHrMin !== null ? w.t('HR never below {hr}', { hr: w.num(c.alwaysHrMin) }) : null,
    c.alwaysHrMax !== null ? w.t('HR never above {hr}', { hr: w.num(c.alwaysHrMax) }) : null,
    c.alwaysPaceMin !== null || c.alwaysPaceMax !== null ? w.t('pace always {range}', { range: range(w, c.alwaysPaceMin, c.alwaysPaceMax, (v) => mmss(w.pace(v)), ` ${w.paceUnit()}`) ?? '' }) : null,
    c.start === 'standing' ? w.t('standing start') : c.start === 'flying' ? w.t('flying start') : null,
    f.title.trim() ? w.t('“{title}”', { title: f.title.trim() }) : null,
    // The runner's tags, gear and devices: data, as they are.
    ...f.workoutTypes, ...f.techniqueCues, ...f.shoes, ...f.heartRateSources, ...f.devices,
    f.dateFrom && f.dateTo ? `${w.day(f.dateFrom)} – ${w.day(f.dateTo)}` : f.dateFrom ? w.t('since {date}', { date: w.day(f.dateFrom) }) : f.dateTo ? w.t('to {value}', { value: w.day(f.dateTo) }) : null,
    f.lapsMin !== null || f.lapsMax !== null ? w.t('{range} laps', { range: range(w, f.lapsMin, f.lapsMax, (v) => w.num(v), '') ?? '' }) : null,
    f.layout ? (f.layout.match === 'similar' ? w.t('runs with {reps}', { reps: repsName(f.layout.laps, w) }) : w.t('runs of {layout}', { layout: patternName(f.layout.laps, w) })) : null,
    r.shape.type !== 'run' && r.shape.type !== 'fastest' && r.pick === 'best' ? w.t('best of each run') : null,
    r.shape.type === 'fastest' && r.pick === 'all' ? w.t('every one') : null,
    r.stat !== 'avg' ? w.t(STAT_LABEL[r.stat]) : null,
  ].filter((p): p is string => p !== null);
  // Whole runs with nothing else set: every run.
  if (parts.length === 1 && r.shape.type === 'run') return w.t('All runs');
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
    if (!shape || !['run', 'lap', 'fastest', 'steady', 'pattern'].includes(shape.type)) return null;
    if (shape.type === 'pattern' && !(Array.isArray(shape.laps) && shape.laps.some((l) => l.effort) && shape.tolerance >= 0)) return null;
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
export function windowStat(run: RunFile, metric: BlockMetric, stat: Stat, from = 0, to = Infinity): number | null {
  const w = run.windows;
  const vals: number[] = [];
  for (let i = 0; i < w.start.length; i++) {
    const centre = w.start[i] + WINDOW / 2;
    if (centre < from || centre >= to || w.flags.stopped[i]) continue;
    let v: number | null;
    if (metric === 'efficiency') v = efficiencyOf((w.values.speed?.[i] ?? null), (w.values.heartRate?.[i] ?? null));
    else if (isPace(metric)) v = secondsPerKm(w.values[metric]?.[i] ?? null);
    else v = w.values[metric]?.[i] ?? null;
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

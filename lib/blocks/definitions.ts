import { meanHeading, resample } from '@/lib/geo';
import type { RunFile } from '@/lib/kernel';
import { DEFAULT_TOLERANCES, LOGICAL_HR_SKIP, RULE_TOLERANCES, type BlockType, type BlockDefinition, type BlockDefinitionsFile, type BlockParams, type Recommendation, type Rule, type Tolerances } from './types';
import { EMPTY_CONDITIONS, EMPTY_FILTER, ruleName } from './rule';
import { effortName, patternName, patternOf } from './logical';
import { lapKey, structureName } from './structure';
import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';

/** user/block-definitions.json: the runner's definitions and the recommendations they rejected. */
/** The definitions, with a default for each tolerance an older file lacks (and none it no longer has); a criteria block of an older file reads as the rule it was. */
export async function readDefinitions(folder: DataFolder): Promise<BlockDefinition[]> {
  const defs = (await readJson<BlockDefinitionsFile>(folder, PATHS.blockDefinitions))?.definitions ?? [];
  return defs.map((d) => { const params = fromLegacy(d.params); return { ...d, params, tolerances: withDefaults(d.tolerances, params.type) }; });
}

/** A block "from criteria" as files of 19 Nov 2026 keep it: whole runs or laps that meet the criteria. */
interface LegacyCriteria {
  type: 'criteria';
  scope: 'run' | 'lap';
  criteria: { title: string; distanceMin: number | null; distanceMax: number | null; paceMin: number | null; paceMax: number | null; durationMin: number | null; durationMax: number | null; workoutTypes: string[]; techniqueCues: string[]; shoes: string[]; heartRateSources: string[]; dateFrom: string | null; dateTo: string | null; devices: string[]; heartRateMin: number | null; heartRateMax: number | null; lapsMin: number | null; lapsMax: number | null };
}

function fromLegacy(params: BlockParams | LegacyCriteria): BlockParams {
  if (params.type !== 'criteria') return params;
  const c = params.criteria;
  return {
    type: 'rule', shape: { type: params.scope }, pick: 'all', stat: 'avg',
    runs: { ...EMPTY_FILTER, title: c.title, workoutTypes: c.workoutTypes, techniqueCues: c.techniqueCues, shoes: c.shoes, heartRateSources: c.heartRateSources, devices: c.devices, dateFrom: c.dateFrom, dateTo: c.dateTo, lapsMin: c.lapsMin, lapsMax: c.lapsMax },
    conditions: { ...EMPTY_CONDITIONS, distanceMin: c.distanceMin, distanceMax: c.distanceMax, paceMin: c.paceMin, paceMax: c.paceMax, durationMin: c.durationMin, durationMax: c.durationMax, hrMin: c.heartRateMin, hrMax: c.heartRateMax },
  };
}

/** Tolerances for a block of a type: effort and workout-type blocks measure heart rate from minute 5 of the block. */
export function defaultTolerances(type: BlockType): Tolerances {
  if (type === 'rule') return { ...RULE_TOLERANCES };
  return { ...DEFAULT_TOLERANCES, hrSkip: type === 'effort' || type === 'tag' ? LOGICAL_HR_SKIP : null };
}

/** A block from a rule: the rule's conditions decide, the general conditions are off. */
export function definitionFromRule(name: string, rule: Rule, now = new Date()): BlockDefinition {
  return {
    id: newDefinitionId(), origin: 'manual', status: 'active', createdAt: now.toISOString(),
    name: name.trim() || ruleName(rule),
    params: { type: 'rule', ...rule },
    tolerances: { ...RULE_TOLERANCES },
  };
}

function withDefaults(t: Partial<Tolerances>, type: BlockType): Tolerances {
  const out = defaultTolerances(type);
  for (const k of Object.keys(DEFAULT_TOLERANCES) as (keyof Tolerances)[]) if (k in t) (out as unknown as Record<string, unknown>)[k] = t[k];
  return out;
}

export async function writeDefinitions(folder: DataFolder, definitions: BlockDefinition[]): Promise<void> {
  await writeJson(folder, PATHS.blockDefinitions, { definitions } satisfies BlockDefinitionsFile);
}

export function newDefinitionId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Accepting keeps the recommendation as an active definition; rejecting keeps it as rejected, so it is not proposed again. */
export function fromRecommendation(rec: Recommendation, status: 'active' | 'rejected', now = new Date()): BlockDefinition {
  return {
    id: newDefinitionId(),
    name: rec.name,
    origin: 'recommendation',
    status,
    createdAt: now.toISOString(),
    params: rec.params,
    tolerances: rec.tolerances,
  };
}

export const RECOMMENDATIONS_PATH = `${PATHS.derived}/recommendations.json`;


const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** The definition types a fragment [from, to) s of a run can become: route needs GPS, structure a lap it covers. */
export function selectionOptions(run: RunFile, from: number, to: number): BlockType[] {
  const out: BlockType[] = [];
  const gps = run.samples.t.filter((t, i) => t >= from && t < to && run.samples.lat[i] !== null).length;
  if (gps > 30) out.push('route');
  if (lapFor(run, from, to) !== null) out.push('structure');
  out.push('steady');
  // An effort of the selection's length (rounded to 0.5 km), at least 1 km.
  if (selectionDistance(run, from, to) >= 1000) out.push('effort');
  return out;
}

function selectionDistance(run: RunFile, from: number, to: number): number {
  const s = run.samples;
  let first: number | null = null;
  let last = 0;
  for (let i = 0; i < s.t.length; i++) {
    if (s.t[i] < from || s.t[i] >= to || s.distance[i] === null) continue;
    if (first === null) first = s.distance[i]!;
    last = s.distance[i]!;
  }
  return first === null ? 0 : last - first;
}

/**
 * A lap-pattern block made from one run's laps (a COROS test, a planned workout): runs with
 * the same layout on any route are its instances, their faster-than-average set laps compared.
 */
export function definitionFromLaps(run: RunFile, now = new Date()): BlockDefinition {
  const laps = patternOf(run.laps, run.distance > 0 ? run.duration / run.distance : 0);
  if (laps.filter((l) => l.kind !== 'free').length < 2 || !laps.some((l) => l.effort)) throw new Error('the run has fewer than 2 set laps or no effort lap');
  return {
    id: newDefinitionId(), origin: 'manual', status: 'active', createdAt: now.toISOString(),
    name: patternName(laps),
    params: { type: 'pattern', laps, tolerance: 0.03 },
    tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null },
  };
}

/** True when a run's laps can make a lap-pattern block. */
export function canDefineFromLaps(run: RunFile): boolean {
  const laps = patternOf(run.laps, run.distance > 0 ? run.duration / run.distance : 0);
  return laps.filter((l) => l.kind !== 'free').length >= 2 && laps.some((l) => l.effort);
}

/** The lap a fragment covers: one lap overlapping at least 80 % of the fragment and of itself. */
function lapFor(run: RunFile, from: number, to: number): number | null {
  for (let i = 0; i < run.laps.length; i++) {
    const l = run.laps[i];
    const overlap = Math.min(to, l.end) - Math.max(from, l.start);
    if (overlap >= 0.8 * (to - from) && overlap >= 0.8 * (l.end - l.start)) return i;
  }
  return null;
}

/**
 * A block definition made from a fragment the runner selected on a run's chart or
 * map (spec F8): a route segment from its GPS track, the lap it covers as a
 * workout structure element, or a steady fragment with a 30 s/km band around its pace.
 */
export function definitionFromSelection(run: RunFile, from: number, to: number, type: BlockType, now = new Date()): BlockDefinition {
  const s = run.samples;
  let dist = 0;
  let first: number | null = null;
  for (let i = 0; i < s.t.length; i++) {
    if (s.t[i] < from || s.t[i] >= to || s.distance[i] === null) continue;
    if (first === null) first = s.distance[i]!;
    dist = s.distance[i]! - first;
  }
  const pace = dist > 0 ? (to - from) / (dist / 1000) : 300;
  const centre = Math.round(pace / 15) * 15;
  const base = { id: newDefinitionId(), origin: 'manual' as const, status: 'active' as const, createdAt: now.toISOString() };
  if (type === 'route') {
    const idx = s.t.map((t, i) => (t >= from && t < to ? i : -1)).filter((i) => i >= 0);
    const track = resample(idx.map((i) => s.lat[i]), idx.map((i) => s.lon[i]), idx.map((i) => s.t[i]), 10).map(({ lat, lon, heading }) => ({
      lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, heading: Math.round(heading),
    }));
    const heading = Math.round(meanHeading(track));
    const length = (track.length - 1) * 10;
    return {
      ...base,
      name: `${(length / 1000).toFixed(1)} km ${COMPASS[Math.round(heading / 45) % 8]}-bound, pace ${fmt(centre - 15)}–${fmt(centre + 15)}`,
      params: { type: 'route', track, length, heading },
      tolerances: { ...DEFAULT_TOLERANCES, paceMin: centre - 15, paceMax: centre + 15 },
    };
  }
  if (type === 'structure') {
    const i = lapFor(run, from, to);
    if (i === null) throw new Error('the selection does not cover a lap');
    const lap = run.laps[i];
    const key = lapKey(lap, i, run.laps) ?? { kind: 'time' as const, target: Math.round(lap.duration / 30) * 30 };
    return {
      ...base,
      name: structureName(key.kind, key.target),
      params: { type: 'structure', kind: key.kind, target: key.target, tolerance: 0.03 },
      tolerances: { ...DEFAULT_TOLERANCES, effortBeforeMax: null },
    };
  }
  if (type === 'effort') {
    const target = Math.max(1000, Math.round(selectionDistance(run, from, to) / 500) * 500);
    return {
      ...base,
      name: effortName('distance', target),
      params: { type: 'effort', kind: 'distance', target },
      tolerances: { ...defaultTolerances('effort'), effortBeforeMax: null },
    };
  }
  const minDuration = Math.max(60, Math.floor((to - from) / 60) * 60);
  return {
    ...base,
    name: `Steady ${fmt(centre - 15)}–${fmt(centre + 15)} for ${minDuration / 60} min`,
    params: { type: 'steady', minDuration },
    tolerances: { ...DEFAULT_TOLERANCES, paceMin: centre - 15, paceMax: centre + 15 },
  };
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

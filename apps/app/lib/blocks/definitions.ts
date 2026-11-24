import { meanHeading } from '@/lib/geo';
import { DEFAULT_TOLERANCES, LOGICAL_HR_SKIP, RULE_TOLERANCES, type RefPoint, type BlockType, type BlockDefinition, type BlockDefinitionsFile, type BlockParams, type Recommendation, type Rule, type Tolerances } from './types';
import { EMPTY_CONDITIONS, EMPTY_FILTER, asRuleDefinition, ruleName, ruleOf } from './rule';
import { PROFILE_MIN_SCORE, SIMILAR_PACE_WITHIN, type ProfileKey } from './profile';
import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';
import { tagName } from './logical';
import { SAVED_WORDS, routeName, type Words } from './words';

/** user/block-definitions.json: the runner's definitions and the recommendations they rejected. */
/** The definitions, with a default for each tolerance an older file lacks (and none it no longer has); a criteria block of an older file reads as the rule it was. */
export async function readDefinitions(folder: DataFolder): Promise<BlockDefinition[]> {
  const defs = (await readJson<BlockDefinitionsFile>(folder, PATHS.blockDefinitions))?.definitions ?? [];
  // One model: every kind of block is read as the rule it is (requirement "One way to make a block").
  return defs.map((d) => { const params = fromLegacy(d.params); return asRuleDefinition({ ...d, params, tolerances: withDefaults(d.tolerances, params.type) }); });
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
  return asRuleDefinition({
    id: newDefinitionId(),
    name: rec.name,
    origin: 'recommendation',
    status,
    createdAt: now.toISOString(),
    params: rec.params,
    tolerances: rec.tolerances,
  });
}

export const RECOMMENDATIONS_PATH = `${PATHS.derived}/recommendations.json`;

function fmt(sec: number): string {
  // Rounded first: 299.6 s is 5:00, not 4:60.
  const r = Math.round(sec);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

/** A pace band around a pace, s/km: within SIMILAR_PACE_WITHIN of it, to the whole second. */
const likePace = (pace: number) => ({ paceMin: Math.round(pace * (1 - SIMILAR_PACE_WITHIN)), paceMax: Math.round(pace * (1 + SIMILAR_PACE_WITHIN)) });

/** "5.2 km north-bound, pace 4:45–5:15": the name of a route segment kept from a selection; English unless given the words of the language in use. */
export function routeSegmentName(length: number, heading: number, band: { paceMin: number; paceMax: number } | null, w: Words = SAVED_WORDS): string {
  const route = routeName(length, heading, w);
  return band ? w.t('{route}, pace {from}–{to}', { route, from: fmt(band.paceMin), to: fmt(band.paceMax) }) : w.t('{route}, any pace', { route });
}

/** "Like 3.0 km, 25 m up, pace 4:50": the name of a profile segment kept from a selection; English unless given the words of the language in use. */
export function profileSegmentName(key: ProfileKey, w: Words = SAVED_WORDS): string {
  const climb = key.altitude ? Math.round(key.altitude.reduce((s, a, i, xs) => s + (i && a > xs[i - 1] ? a - xs[i - 1] : 0), 0)) : null;
  const vars = { km: w.num(key.distance / 1000, 1), climb: w.num(climb ?? 0), pace: fmt(key.pace) };
  return climb === null ? w.t('Like {km} km, pace {pace}', vars) : w.t('Like {km} km, {climb} m up, pace {pace}', vars);
}

/**
 * A route block of every pass over a track at any pace, the general conditions off: what the Find
 * similar panel lists as the same route, kept (requirement "Similar stretches of a selection").
 */
export function definitionFromRoute(track: RefPoint[], pace: number | null = null, now = new Date()): BlockDefinition {
  const heading = Math.round(meanHeading(track));
  const length = (track.length - 1) * 10;
  const band = pace ? likePace(pace) : null;
  return {
    id: newDefinitionId(), origin: 'manual', status: 'active', createdAt: now.toISOString(),
    name: routeSegmentName(length, heading, band),
    // The pace band is the rule's own condition, shown and changed in the editor ("jak klikne edit to wszystko jest puste").
    params: { type: 'rule', ...ruleOf({ type: 'route', track, length, heading }), conditions: { ...EMPTY_CONDITIONS, ...band } },
    tolerances: { ...RULE_TOLERANCES },
  };
}

/** A profile block: in each run, the stretch most like the profile from the same score, on any route, the general conditions off. */
export function definitionFromProfile(key: ProfileKey, now = new Date()): BlockDefinition {
  return {
    id: newDefinitionId(), origin: 'manual', status: 'active', createdAt: now.toISOString(),
    name: profileSegmentName(key),
    params: { type: 'rule', ...ruleOf({ type: 'profile', key, minScore: PROFILE_MIN_SCORE }), conditions: { ...EMPTY_CONDITIONS, ...likePace(key.pace) } },
    tolerances: { ...RULE_TOLERANCES },
  };
}

/**
 * The definitions with a name renamed in their rules (a tag, or a piece of gear, by the name runs
 * carry): the runs a rule draws from, the workout type of a tag segment and its name of "Workout: …".
 * The others as they are.
 */
export function renameInDefinitions(definitions: BlockDefinition[], field: 'workoutTypes' | 'techniqueCues' | 'shoes' | 'heartRateSources', from: string, to: string): BlockDefinition[] {
  return definitions.map((d) => {
    const p = d.params;
    if (p.type === 'rule' && p.runs[field].includes(from)) return { ...d, params: { ...p, runs: { ...p.runs, [field]: p.runs[field].map((v) => (v === from ? to : v)) } } };
    if (p.type === 'tag' && field === 'workoutTypes' && p.workoutType === from) return { ...d, name: d.name === tagName(from) ? tagName(to) : d.name, params: { ...p, workoutType: to } };
    return d;
  });
}

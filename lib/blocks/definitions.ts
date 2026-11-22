import { meanHeading } from '@/lib/geo';
import { DEFAULT_TOLERANCES, LOGICAL_HR_SKIP, RULE_TOLERANCES, type RefPoint, type BlockType, type BlockDefinition, type BlockDefinitionsFile, type BlockParams, type Recommendation, type Rule, type Tolerances } from './types';
import { EMPTY_CONDITIONS, EMPTY_FILTER, asRuleDefinition, ruleName, ruleOf } from './rule';
import { PROFILE_MIN_SCORE, type ProfileKey } from './profile';
import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';

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


const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

function fmt(sec: number): string {
  // Rounded first: 299.6 s is 5:00, not 4:60.
  const r = Math.round(sec);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

/**
 * A route block of every pass over a track at any pace, the general conditions off: what the Find
 * similar panel lists as the same route, kept (requirement "Similar stretches of a selection").
 */
export function definitionFromRoute(track: RefPoint[], now = new Date()): BlockDefinition {
  const heading = Math.round(meanHeading(track));
  const length = (track.length - 1) * 10;
  return {
    id: newDefinitionId(), origin: 'manual', status: 'active', createdAt: now.toISOString(),
    name: `${(length / 1000).toFixed(1)} km ${COMPASS[Math.round(heading / 45) % 8]}-bound, any pace`,
    params: { type: 'rule', ...ruleOf({ type: 'route', track, length, heading }) },
    tolerances: { ...RULE_TOLERANCES },
  };
}

/** A profile block: in each run, the stretch most like the profile from the same score, on any route, the general conditions off. */
export function definitionFromProfile(key: ProfileKey, now = new Date()): BlockDefinition {
  const climb = key.altitude ? Math.round(key.altitude.reduce((s, a, i, xs) => s + (i && a > xs[i - 1] ? a - xs[i - 1] : 0), 0)) : null;
  return {
    id: newDefinitionId(), origin: 'manual', status: 'active', createdAt: now.toISOString(),
    name: `Like ${(key.distance / 1000).toFixed(1)} km${climb === null ? '' : `, ${climb} m up`}, pace ${fmt(key.pace)}`,
    params: { type: 'rule', ...ruleOf({ type: 'profile', key, minScore: PROFILE_MIN_SCORE }) },
    tolerances: { ...RULE_TOLERANCES },
  };
}

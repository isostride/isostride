import { meanHeading, resample } from '@/lib/geo';
import type { RunFile } from '@/lib/kernel';
import { DEFAULT_TOLERANCES, type BlockType, type BlockDefinition, type BlockDefinitionsFile, type Recommendation, type Tolerances } from './types';
import { lapKey, structureName } from './structure';
import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';

/** user/block-definitions.json: the runner's definitions and the recommendations they rejected. */
/** The definitions, with a default for each tolerance an older file lacks (and none it no longer has). */
export async function readDefinitions(folder: DataFolder): Promise<BlockDefinition[]> {
  const defs = (await readJson<BlockDefinitionsFile>(folder, PATHS.blockDefinitions))?.definitions ?? [];
  return defs.map((d) => ({ ...d, tolerances: withDefaults(d.tolerances) }));
}

function withDefaults(t: Partial<Tolerances>): Tolerances {
  const out = { ...DEFAULT_TOLERANCES } as Tolerances;
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
  return out;
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

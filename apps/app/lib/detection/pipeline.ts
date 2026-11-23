import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';
import { resample, type TrackPoint } from '@/lib/geo';
import { type IndexedRun, type RunFile, type RunsIndex, ALGORITHM_VERSION } from '@/lib/kernel';
import { detectRouteSegments } from './segments';
import { RECOMMENDATIONS_PATH, asRule, fromRecommendation, matchesRunFilter, readDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { detectInstances } from './detect';
import { MIN_ROUTE_INSTANCES, MIN_STRUCTURE_WORKOUTS, recommend } from './recommend';

export interface BlocksReport {
  segments: number;
  instances: number;
  recommendations: number;
}

/**
 * Data flow steps 2 (route segments) and 4 (detection): finds the shared route
 * segments, detects the instances of every active definition in every run, and
 * proposes new definitions. Runs after each import and each change to the
 * definitions; it rebuilds its files from scratch, so the result never depends on
 * what was there before.
 */
export async function runBlocks(folder: DataFolder): Promise<BlocksReport> {
  const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
  const defs = await readDefinitions(folder);
  const runs: RunFile[] = [];
  const tracks = new Map<string, TrackPoint[]>();
  for (const row of index?.runs ?? []) {
    const run = await readJson<RunFile>(folder, PATHS.runFile(row.id));
    if (!run) continue;
    runs.push(run);
    tracks.set(run.id, resample(run.samples.lat, run.samples.lon, run.samples.t, 10));
  }

  const segments = detectRouteSegments(runs.map((r) => ({ runId: r.id, pts: tracks.get(r.id)! })));
  await writeJson(folder, PATHS.segments, { algorithmVersion: ALGORITHM_VERSION, segments });

  const rows = new Map((index?.runs ?? []).map((r) => [r.id, r]));
  const instances: BlockInstance[] = [];
  for (const def of defs.filter((d) => d.status === 'active')) {
    for (const run of runs) instances.push(...detectInstances(def, run, rows.get(run.id)!, tracks.get(run.id)!));
  }
  await writeJson(folder, PATHS.blockInstances, { algorithmVersion: ALGORITHM_VERSION, instances } satisfies BlockInstancesFile);

  // A suggestion only when enough of its instances meet the matching conditions (the author's
  // report of 19 Nov 2026: a block whose passes were all rejected left the Trend empty).
  const recommendations: Recommendation[] = [];
  for (const rec of recommend(segments, runs, tracks, defs, index?.runs ?? [])) {
    const def = fromRecommendation(rec, 'active');
    const accepted = runs.flatMap((run) => detectInstances(def, run, rows.get(run.id)!, tracks.get(run.id)!)).filter((i) => i.status === 'accepted');
    const enough = rec.params.type === 'route' ? accepted.length >= MIN_ROUTE_INSTANCES : new Set(accepted.map((i) => i.runId)).size >= MIN_STRUCTURE_WORKOUTS;
    // Kept in the one model: a rule.
    if (enough) recommendations.push({ ...rec, params: { type: 'rule', ...asRule(rec.params, rec.tolerances) }, accepted: accepted.length, basis: `${rec.basis}; ${accepted.length} meet the conditions` });
  }
  await writeJson(folder, RECOMMENDATIONS_PATH, { algorithmVersion: ALGORITHM_VERSION, recommendations });

  return { segments: segments.length, instances: instances.length, recommendations: recommendations.length };
}

/**
 * The instances of definitions that are not kept (a block being built in Analysis, or one that
 * lives in its link), computed now from the run files: each run is read once, and not at all
 * when no rule draws from it. Nothing is written.
 */
export async function instancesOf(folder: DataFolder, defs: BlockDefinition[], onProgress?: (p: { done: number; total: number; file: string }) => void): Promise<Record<string, BlockInstance[]>> {
  const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
  const out: Record<string, BlockInstance[]> = Object.fromEntries(defs.map((d) => [d.id, []]));
  const rows = (index?.runs ?? []).filter((row) => defs.some((d) => d.params.type !== 'rule' || matchesRunFilter(d.params.runs, row)));
  const needTrack = defs.some((d) => asRule(d.params, d.tolerances).shape.type === 'route');
  let done = 0;
  for (const row of rows) {
    const run = await readJson<RunFile>(folder, PATHS.runFile(row.id));
    onProgress?.({ done: ++done, total: rows.length, file: row.file });
    if (!run) continue;
    const track = needTrack ? resample(run.samples.lat, run.samples.lon, run.samples.t, 10) : [];
    for (const def of defs) out[def.id].push(...detectInstances(def, run, row, track));
  }
  return out;
}

/** The context fields of a run that detection reads: a rule's run filter, a tag block, the suggestions. */
export type DetectionField = 'title' | 'workoutType' | 'techniqueCue' | 'shoes' | 'heartRateSource';
export const DETECTION_FIELDS: DetectionField[] = ['title', 'workoutType', 'techniqueCue', 'shoes', 'heartRateSource'];

/** The detection fields whose value changed in some run between two versions of the index. */
export function changedFields(before: IndexedRun[], after: IndexedRun[]): Set<DetectionField> {
  const old = new Map(before.map((r) => [r.id, r]));
  const out = new Set<DetectionField>();
  for (const r of after) {
    const o = old.get(r.id);
    for (const f of DETECTION_FIELDS) if (!o || (o[f] ?? null) !== (r[f] ?? null)) out.add(f);
  }
  if (before.some((r) => !after.some((a) => a.id === r.id))) DETECTION_FIELDS.forEach((f) => out.add(f));
  return out;
}

/**
 * Whether a change of these fields can change what detection finds: a workout type (tag blocks and
 * the suggestions by workout type), or a field a kept rule filters its runs by.
 */
export function needsDetection(defs: BlockDefinition[], changed: Set<DetectionField>): boolean {
  if (changed.has('workoutType')) return true;
  return defs.some((d) => {
    if (d.status !== 'active' || d.params.type !== 'rule') return false;
    const f = d.params.runs;
    return (changed.has('title') && f.title.trim() !== '') || (changed.has('techniqueCue') && f.techniqueCues.length > 0)
      || (changed.has('shoes') && f.shoes.length > 0) || (changed.has('heartRateSource') && f.heartRateSources.length > 0);
  });
}

/**
 * The run and day context of every kept instance written again from the index (the context is
 * denormalized into block-instances.json): what follows a change of gear, tags or the load model
 * when detection itself would find the same segments. No run file is read.
 */
export async function rejoinInstances(folder: DataFolder): Promise<void> {
  const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
  const file = await readJson<BlockInstancesFile>(folder, PATHS.blockInstances);
  if (!index || !file) return;
  const rows = new Map(index.runs.map((r) => [r.id, r]));
  const instances = file.instances.map((i) => {
    const row = rows.get(i.runId);
    if (!row) return i;
    const { run, day } = i.context;
    return {
      ...i,
      context: {
        ...i.context,
        run: { ...run, shoes: row.shoes ?? null, heartRateSource: row.heartRateSource ?? `wrist (${run.device})`, workoutType: row.workoutType ?? null, techniqueCue: row.techniqueCue ?? null },
        day: { ...day, load3: row.load3 ?? 0, load7: row.load7 ?? 0, form: row.form ?? 0 },
      },
    };
  });
  await writeJson(folder, PATHS.blockInstances, { algorithmVersion: ALGORITHM_VERSION, instances } satisfies BlockInstancesFile);
}

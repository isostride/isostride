import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';
import { resample, type TrackPoint } from '@/lib/geo';
import { type RunFile, type RunsIndex, ALGORITHM_VERSION } from '@/lib/kernel';
import { detectRouteSegments } from './segments';
import { RECOMMENDATIONS_PATH, fromRecommendation, readDefinitions, type BlockInstance, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
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
  for (const rec of recommend(segments, runs, tracks, defs)) {
    const def = fromRecommendation(rec, 'active');
    const accepted = runs.flatMap((run) => detectInstances(def, run, rows.get(run.id)!, tracks.get(run.id)!)).filter((i) => i.status === 'accepted');
    const enough = rec.params.type === 'route' ? accepted.length >= MIN_ROUTE_INSTANCES : new Set(accepted.map((i) => i.runId)).size >= MIN_STRUCTURE_WORKOUTS;
    if (enough) recommendations.push({ ...rec, accepted: accepted.length, basis: `${rec.basis}; ${accepted.length} meet the conditions` });
  }
  await writeJson(folder, RECOMMENDATIONS_PATH, { algorithmVersion: ALGORITHM_VERSION, recommendations });

  return { segments: segments.length, instances: instances.length, recommendations: recommendations.length };
}

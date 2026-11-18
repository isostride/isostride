import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs/folder';
import { resample, type TrackPoint } from '@/lib/geo/geo';
import type { RunFile, RunsIndex } from '@/lib/ingest/importFolder';
import { detectRouteSegments } from '@/lib/prepare/segments';
import { ALGORITHM_VERSION } from '@/lib/version';
import { RECOMMENDATIONS_PATH, readDefinitions } from './definitions';
import { detectInstances } from './detect';
import { recommend } from './recommend';
import type { BlockInstance, BlockInstancesFile, Recommendation } from './types';

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

  const recommendations: Recommendation[] = recommend(segments, runs, tracks, defs);
  await writeJson(folder, RECOMMENDATIONS_PATH, { algorithmVersion: ALGORITHM_VERSION, recommendations });

  return { segments: segments.length, instances: instances.length, recommendations: recommendations.length };
}

import { KeptRuns, PATHS, readJson, writeJson, type DataFolder, readRunFile } from '@/lib/fs';
import { resample, type TrackPoint } from '@/lib/geo';
import { type IndexedRun, type RunFile, type RunsIndex, ALGORITHM_VERSION } from '@/lib/kernel';
import { detectRouteSegments, type RouteSegment } from './segments';
import { findPasses } from './routeMatch';
import { RECOMMENDATIONS_PATH, SAVED_WORDS, asRule, basisOf, fromRecommendation, matchesRunFilter, readDefinitions, type BlockDefinition, type BlockInstance, type BlockInstancesFile, type Recommendation } from '@/lib/blocks';
import { detectInstances } from './detect';
import { MIN_ROUTE_INSTANCES, MIN_STRUCTURE_WORKOUTS, factsOf, passPaces, recommend, type RunFacts } from './recommend';

export interface BlocksReport {
  segments: number;
  instances: number;
  recommendations: number;
  /** the run files read: only those of runs added, or of runs a changed block or field touches */
  runsRead: number;
}

/** derived/segments.json: the route segments and the runs they were found among. */
interface SegmentsFile {
  algorithmVersion: number;
  segments: RouteSegment[];
  /** the ids of the runs looked at, joined: the same runs give the same segments */
  runs?: string;
}

/** What the detection keeps to do next time only what changed (derived/blocks-cache.json). */
interface BlocksCache {
  algorithmVersion: number;
  /** each run's facts for the suggestions, by run id */
  facts: Record<string, RunFacts>;
  /** the paces of a run's passes over a suggested route, by `${route}|${run}` */
  paces: Record<string, number[]>;
  /** the instances of a suggestion a run gives that meet its conditions, by `${suggestion}|${run as detection reads it}` */
  accepted: Record<string, number>;
  /** the fingerprints of the blocks and the runs block-instances.json was detected for: those unchanged are not detected again */
  keys?: { defs: Record<string, string>; runs: Record<string, string> };
}

/** derived/tracks/<id>.json */
interface TrackFile { algorithmVersion: number; track: TrackPoint[] }

/** A short hash of a text (FNV-1a, twice): a fingerprint to compare, not to read back. */
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/** A run as detection reads it: its id and the fields a rule's filter or a suggestion looks at. */
const runKey = (r: IndexedRun) => fingerprint(JSON.stringify([r.id, r.startTime, r.title ?? null, r.workoutType ?? null, r.techniqueCue ?? null, r.shoes ?? null, r.heartRateSource ?? null, r.device, r.laps]));
/**
 * A run as one block reads it: its id (its figures do not change) and the fields the block's filter
 * looks at, only those (a suggestion filters by none but a workout type: new shoes leave its counts).
 */
function runKeyFor(def: BlockDefinition, r: IndexedRun): string {
  const f = asRule(def.params, def.tolerances).runs;
  return fingerprint(JSON.stringify([
    r.id,
    f.title.trim() ? r.title ?? null : 0,
    f.workoutTypes.length ? r.workoutType ?? null : 0,
    f.techniqueCues.length ? r.techniqueCue ?? null : 0,
    f.shoes.length ? r.shoes ?? null : 0,
    f.heartRateSources.length ? r.heartRateSource ?? null : 0,
    f.devices.length ? r.device : 0,
    f.lapsMin !== null || f.lapsMax !== null ? r.laps : 0,
  ]));
}

/** A block as detection reads it: what it selects and how. */
const defKey = (d: BlockDefinition) => fingerprint(JSON.stringify([d.params, d.tolerances]));

/**
 * Whether a block can find anything in a run at all, from its track alone: a route's pass starts
 * near the route, so a run with no pass over it is not read (most runs, for most routes).
 */
function mayFind(def: BlockDefinition, track: TrackPoint[]): boolean {
  const rule = asRule(def.params, def.tolerances);
  return rule.shape.type !== 'route' || findPasses(rule.shape.track, track, def.tolerances.routeRadius, def.tolerances.routeShare).length > 0;
}

/** An instance's run and day context as the index has it now (the context is denormalized into block-instances.json). */
function withContext(i: BlockInstance, row: IndexedRun | undefined): BlockInstance {
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
}

/** The run files a detection keeps in memory at once, in values of samples and windows (about 100 MB, as the worker that stays). */
const KEPT_VALUES = 12_000_000;

/**
 * Data flow steps 2 (route segments) and 4 (detection): finds the shared route segments, detects the
 * instances of every active definition in every run, and proposes new definitions. Runs after each
 * import and each change to the definitions or to the fields detection reads.
 *
 * It does only what changed (the review of 24 Nov 2026: "czy nie przeliczasz rzeczy wielokrotnie",
 * then "tak zrob 1-4"): a run's track every 10 m is kept in derived/tracks/, so the segments are found
 * without the runs' files, and found again only when the runs are other ones; the instances of a block
 * in a run are kept with fingerprints of both and detected again only when one changed; the facts,
 * paces and counts of the suggestions are kept for each run. A run file is read only when something of
 * it must be computed: a run added, or one a changed block or field touches. What it writes is what
 * a detection from scratch writes (tests/integration/blocks.test.ts holds them equal).
 */
export async function runBlocks(folder: DataFolder): Promise<BlocksReport> {
  const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
  const rows = index?.runs ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const defs = await readDefinitions(folder);
  const active = defs.filter((d) => d.status === 'active');
  const keptCache = await readJson<BlocksCache>(folder, PATHS.blocksCache);
  const cache: BlocksCache = keptCache?.algorithmVersion === ALGORITHM_VERSION ? keptCache : { algorithmVersion: ALGORITHM_VERSION, facts: {}, paces: {}, accepted: {} };

  // A run's file, read only when needed and kept while there is room (KEPT_VALUES): every file read was kept
  // until the end, and a first detection or a rebuild of a thousand runs held them all, over a gigabyte
  // (the review of 26 Nov 2026).
  const files = new KeptRuns(KEPT_VALUES);
  const runsRead = new Set<string>();
  const fileOf = async (id: string): Promise<RunFile | null> => {
    const file = await files.read(folder, id);
    if (file) runsRead.add(id);
    return file;
  };

  // Each run's track: kept, or made from its file (the first time, or a run just added).
  const tracks = new Map<string, TrackPoint[]>();
  const runIds: string[] = [];
  for (const row of rows) {
    const keptTrack = await readJson<TrackFile>(folder, PATHS.trackFile(row.id));
    let track = keptTrack?.algorithmVersion === ALGORITHM_VERSION ? keptTrack.track : null;
    if (!track) {
      const run = await fileOf(row.id);
      if (!run) continue;
      track = resample(run.samples.lat, run.samples.lon, run.samples.t, 10);
      await writeJson(folder, PATHS.trackFile(row.id), { algorithmVersion: ALGORITHM_VERSION, track } satisfies TrackFile);
    }
    tracks.set(row.id, track);
    runIds.push(row.id);
  }

  // The segments: those found before when the runs are the same ones.
  const runsLooked = runIds.join(',');
  const keptSegments = await readJson<SegmentsFile>(folder, PATHS.segments);
  const segments = keptSegments?.algorithmVersion === ALGORITHM_VERSION && keptSegments.runs === runsLooked
    ? keptSegments.segments
    : detectRouteSegments(runIds.map((id) => ({ runId: id, pts: tracks.get(id)! })));
  if (segments !== keptSegments?.segments) await writeJson(folder, PATHS.segments, { algorithmVersion: ALGORITHM_VERSION, segments, runs: runsLooked } satisfies SegmentsFile);

  // The instances: kept for a block and a run whose fingerprints did not change, detected for the others.
  const keptInstances = await readJson<BlockInstancesFile>(folder, PATHS.blockInstances);
  const oldKeys = keptInstances?.algorithmVersion === ALGORITHM_VERSION ? cache.keys : undefined;
  const grouped = new Map<string, BlockInstance[]>();
  for (const i of oldKeys ? keptInstances!.instances : []) {
    const k = `${i.definitionId}|${i.runId}`;
    grouped.set(k, [...(grouped.get(k) ?? []), i]);
  }
  const keys = { defs: Object.fromEntries(active.map((d) => [d.id, defKey(d)])), runs: Object.fromEntries(runIds.map((id) => [id, runKey(byId.get(id)!)])) };
  const instances: BlockInstance[] = [];
  for (const def of active) {
    for (const id of runIds) {
      const row = byId.get(id)!;
      if (oldKeys && oldKeys.defs[def.id] === keys.defs[def.id] && oldKeys.runs[id] === keys.runs[id]) {
        instances.push(...(grouped.get(`${def.id}|${id}`) ?? []).map((i) => withContext(i, row)));
        continue;
      }
      if (!mayFind(def, tracks.get(id)!)) continue;
      const run = await fileOf(id);
      if (run) instances.push(...detectInstances(def, run, row, tracks.get(id)!));
    }
  }
  await writeJson(folder, PATHS.blockInstances, { algorithmVersion: ALGORITHM_VERSION, instances } satisfies BlockInstancesFile);

  // The suggestions, from each run's facts and the paces of its passes, kept or computed now.
  const facts: RunFacts[] = [];
  for (const id of runIds) {
    let f = cache.facts[id];
    if (!f) {
      const run = await fileOf(id);
      if (!run) continue;
      f = cache.facts[id] = factsOf(run);
    }
    facts.push(f);
  }
  const usedPaces = new Set<string>();
  const usedAccepted = new Set<string>();
  const routePaces = async (seg: RouteSegment): Promise<number[]> => {
    const route = fingerprint(JSON.stringify(seg.track));
    const out: number[] = [];
    for (const id of runIds) {
      const k = `${route}|${id}`;
      usedPaces.add(k);
      if (!cache.paces[k]) {
        const track = tracks.get(id)!;
        const run = findPasses(seg.track, track).length ? await fileOf(id) : null;
        cache.paces[k] = run ? passPaces(seg, run, track) : [];
      }
      out.push(...cache.paces[k]);
    }
    return out;
  };
  const paces = new Map<RouteSegment, number[]>();
  for (const seg of segments) if (seg.passes >= MIN_ROUTE_INSTANCES) paces.set(seg, await routePaces(seg));

  // A suggestion only when enough of its instances meet the matching conditions (the author's
  // report of 19 Nov 2026: a block whose passes were all rejected left the Trend empty).
  const recommendations: Recommendation[] = [];
  for (const rec of recommend(segments, facts, tracks, defs, rows, (seg) => paces.get(seg) ?? [])) {
    const def = fromRecommendation(rec, 'active');
    const sugg = defKey(def);
    let accepted = 0;
    const acceptedRuns = new Set<string>();
    for (const id of runIds) {
      const k = `${sugg}|${runKeyFor(def, byId.get(id)!)}`;
      usedAccepted.add(k);
      if (cache.accepted[k] === undefined) {
        const run = mayFind(def, tracks.get(id)!) ? await fileOf(id) : null;
        cache.accepted[k] = run ? detectInstances(def, run, byId.get(id)!, tracks.get(id)!).filter((i) => i.status === 'accepted').length : 0;
      }
      accepted += cache.accepted[k];
      if (cache.accepted[k]) acceptedRuns.add(id);
    }
    const enough = rec.params.type === 'route' ? accepted >= MIN_ROUTE_INSTANCES : acceptedRuns.size >= MIN_STRUCTURE_WORKOUTS;
    // Kept in the one model: a rule.
    if (enough) recommendations.push({ ...rec, params: { type: 'rule', ...asRule(rec.params, rec.tolerances) }, accepted, basis: basisOf({ ...rec, accepted }, SAVED_WORDS) });
  }
  await writeJson(folder, RECOMMENDATIONS_PATH, { algorithmVersion: ALGORITHM_VERSION, recommendations });

  // What is kept: the facts of the runs there are, the paces and counts used now.
  const present = new Set(runIds);
  await writeJson(folder, PATHS.blocksCache, {
    algorithmVersion: ALGORITHM_VERSION,
    facts: Object.fromEntries(Object.entries(cache.facts).filter(([id]) => present.has(id))),
    paces: Object.fromEntries([...usedPaces].map((k) => [k, cache.paces[k]])),
    accepted: Object.fromEntries([...usedAccepted].map((k) => [k, cache.accepted[k]])),
    keys,
  } satisfies BlocksCache);

  return { segments: segments.length, instances: instances.length, recommendations: recommendations.length, runsRead: runsRead.size };
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
    const run = await readRunFile(folder, row.id);
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
  const instances = file.instances.map((i) => withContext(i, rows.get(i.runId)));
  await writeJson(folder, PATHS.blockInstances, { algorithmVersion: ALGORITHM_VERSION, instances } satisfies BlockInstancesFile);
  // Detection would find the same: the runs as it reads them now are those it detected for.
  const cache = await readJson<BlocksCache>(folder, PATHS.blocksCache);
  if (cache?.keys && cache.algorithmVersion === ALGORITHM_VERSION) {
    const runs = Object.fromEntries(Object.keys(cache.keys.runs).map((id) => [id, rows.has(id) ? runKey(rows.get(id)!) : cache.keys!.runs[id]]));
    await writeJson(folder, PATHS.blocksCache, { ...cache, keys: { ...cache.keys, runs } } satisfies BlocksCache);
  }
}

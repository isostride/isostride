import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import { resample } from '@/lib/geo';
import type { RunFile, RunsIndex } from '@/lib/kernel';
import { PROFILE_MIN_SCORE, bestProfileMatch, distanceAtTime, profileOfStretch, stretchFigures, trackOf, type ProfileKey, type ProfileParts, type RefPoint, type StretchFigures, type Track } from '@/lib/blocks';
import { findPasses } from './routeMatch';

/**
 * The stretches of other runs like one selected on a run (the runner's request of 22 Nov 2026:
 * "otwieram wczorajszy bieg, zaznaczam fragment i klikam przycisk... mam podglad innych segmentow w
 * innych biegach z ktorymi moge porownac"; requirement "Similar stretches of a selection"): those over
 * the same route, at any pace, and those of the same profile (distance, terrain and pace) on other routes.
 */

/** The stretch selected: [from, to) s of a run. */
export interface SimilarQuery {
  runId: string;
  from: number;
  to: number;
}

/** A stretch found, or the one selected: where it is and what it shows. */
export interface SimilarStretch extends StretchFigures {
  runId: string;
  runStart: string;
  title: string | null;
  /** s since the start of its run */
  from: number;
  to: number;
  /** the profile's likeness, for a stretch of the same profile */
  score?: number;
  parts?: ProfileParts;
}

export interface SimilarResult {
  /** null: the selection has no profile (under 400 m, or no distance); `why` says so */
  reference: SimilarStretch | null;
  /** the selection's profile, for a block of it */
  key: ProfileKey | null;
  /** the selection's track, every 10 m (none without GPS), for a route block */
  track: RefPoint[];
  route: SimilarStretch[];
  profile: SimilarStretch[];
  why: string | null;
}

/** The most stretches of the same profile listed (model's choice). */
const MAX_PROFILE = 20;
/** Fewer GPS points in the selection than this, every 10 m: no route to follow. */
const MIN_TRACK = 30;

/** The stretch [from, to) s of a run with its figures; null when it has none. */
function stretchOf(run: RunFile, title: string | null, tr: Track, from: number, to: number): SimilarStretch | null {
  const a = distanceAtTime(tr, from);
  const b = distanceAtTime(tr, to);
  if (a === null || b === null || b <= a) return null;
  const f = stretchFigures(tr, a, b - a);
  return f && { ...f, runId: run.id, runStart: run.startTime, title, from, to };
}

/**
 * The stretches like [from, to) of one run in another: every pass over its track, and, when there is
 * none, the stretch of its profile closest to it.
 */
export function similarIn(ref: { track: RefPoint[]; key: ProfileKey | null }, run: RunFile, title: string | null): { route: SimilarStretch[]; profile: SimilarStretch | null } {
  const tr = trackOf(run);
  const route: SimilarStretch[] = [];
  if (ref.track.length >= MIN_TRACK) {
    const pts = resample(run.samples.lat, run.samples.lon, run.samples.t, 10);
    for (const p of findPasses(ref.track, pts)) {
      const s = stretchOf(run, title, tr, pts[p.from].t, pts[p.to].t);
      if (s) route.push(s);
    }
  }
  if (route.length || !ref.key) return { route, profile: null };
  const m = bestProfileMatch(ref.key, tr, PROFILE_MIN_SCORE);
  const s = m && stretchOf(run, title, tr, m.from, m.to);
  return { route, profile: s ? { ...s, score: m!.score, parts: m!.parts } : null };
}

/** The selection's track every 10 m, as a route block keeps it. */
export function trackOfStretch(run: RunFile, from: number, to: number): RefPoint[] {
  return resample(run.samples.lat, run.samples.lon, run.samples.t, 10)
    .filter((p) => p.t >= from && p.t <= to)
    .map((p) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6, heading: Math.round(p.heading) }));
}

/**
 * The stretches like the selected one in every other run of the folder, each run read once: those
 * over the same route newest first, those of the same profile most alike first (the best 20).
 */
export async function similarOf(folder: DataFolder, q: SimilarQuery, onProgress?: (p: { done: number; total: number; file: string }) => void): Promise<SimilarResult> {
  const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
  const rows = index?.runs ?? [];
  const own = await readJson<RunFile>(folder, PATHS.runFile(q.runId));
  const empty: SimilarResult = { reference: null, key: null, track: [], route: [], profile: [], why: null };
  if (!own) return { ...empty, why: 'The run is not in the data folder.' };
  const ownRow = rows.find((r) => r.id === q.runId);
  const tr = trackOf(own);
  const key = profileOfStretch(tr, q.from, q.to);
  const reference = stretchOf(own, ownRow?.title ?? null, tr, q.from, q.to);
  const track = trackOfStretch(own, q.from, q.to);
  if (!key || !reference) return { ...empty, reference, track, why: 'Select at least 400 m of a run with distance to find stretches like it.' };
  const ref = { track: track.length >= MIN_TRACK ? track : [], key };
  const route: SimilarStretch[] = [];
  const profile: SimilarStretch[] = [];
  const others = rows.filter((r) => r.id !== q.runId);
  let done = 0;
  for (const row of others) {
    const run = await readJson<RunFile>(folder, PATHS.runFile(row.id));
    onProgress?.({ done: ++done, total: others.length, file: row.file });
    if (!run) continue;
    const found = similarIn(ref, run, row.title ?? null);
    route.push(...found.route);
    if (found.profile) profile.push(found.profile);
  }
  route.sort((a, b) => b.runStart.localeCompare(a.runStart) || a.from - b.from);
  profile.sort((a, b) => b.score! - a.score!);
  return { reference, key, track: ref.track, route, profile: profile.slice(0, MAX_PROFILE), why: null };
}

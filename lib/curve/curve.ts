import { fastestFragment } from '@/lib/blocks';
import { PATHS, readJson, type DataFolder } from '@/lib/fs';
import type { RunFile, RunsIndex } from '@/lib/kernel';

/**
 * The pace curve (the author's request of 19 Nov 2026: "os x czas, os y - tempo ... ze wszystkich
 * prob"): for each length of time, the fastest stretch of that length inside the segments of an
 * Analysis item, whichever run it comes from.
 */

/** The lengths of the curve, s: 30 s to 2 h on a logarithmic axis (model's choice). */
export const CURVE_DURATIONS = [30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200];

/** One point of the curve: the fastest stretch of a length, and the run it comes from. */
export interface CurvePoint {
  /** s */
  duration: number;
  /** s/km */
  pace: number;
  runId: string;
  date: string;
  title: string | null;
  from: number;
  to: number;
}

/** What a curve is drawn from: the stretches [from, to) s of each run, by run id. */
export interface CurveSource {
  key: string;
  ranges: Record<string, [number, number][]>;
}

/** The fastest stretch of each length inside the given stretches of one run; lengths none of them covers are left out. */
export function bestsWithin(run: RunFile, ranges: [number, number][]): { duration: number; pace: number; from: number; to: number }[] {
  const out: { duration: number; pace: number; from: number; to: number }[] = [];
  for (const duration of CURVE_DURATIONS) {
    let best: { pace: number; from: number; to: number } | null = null;
    for (const range of ranges) {
      if (range[1] - range[0] < duration - 2) continue;
      const f = fastestFragment(run, 'time', duration, undefined, range);
      if (!f || f.distance <= 0) continue;
      const pace = (f.to - f.from) / (f.distance / 1000);
      if (!best || pace < best.pace) best = { pace, from: f.from, to: f.to };
    }
    if (best) out.push({ duration, ...best });
  }
  return out;
}

/** Keeps, for each length, the faster of two points. */
export function mergeBests(curve: CurvePoint[], more: CurvePoint[]): CurvePoint[] {
  const by = new Map(curve.map((p) => [p.duration, p]));
  for (const p of more) { const have = by.get(p.duration); if (!have || p.pace < have.pace) by.set(p.duration, p); }
  return [...by.values()].sort((a, b) => a.duration - b.duration);
}

/**
 * The pace curves of several sources in one pass over the run files they name: each run is read
 * once, with progress.
 */
export async function curvesOf(folder: DataFolder, sources: CurveSource[], onProgress?: (p: { done: number; total: number; file: string }) => void): Promise<Record<string, CurvePoint[]>> {
  const rows = new Map(((await readJson<RunsIndex>(folder, PATHS.runsIndex))?.runs ?? []).map((r) => [r.id, r]));
  const ids = [...new Set(sources.flatMap((s) => Object.keys(s.ranges)))].filter((id) => rows.has(id));
  const out: Record<string, CurvePoint[]> = Object.fromEntries(sources.map((s) => [s.key, []]));
  let done = 0;
  for (const id of ids) {
    const row = rows.get(id)!;
    const run = await readJson<RunFile>(folder, PATHS.runFile(id));
    onProgress?.({ done: ++done, total: ids.length, file: row.file });
    if (!run) continue;
    for (const s of sources) {
      const ranges = s.ranges[id];
      if (!ranges?.length) continue;
      out[s.key] = mergeBests(out[s.key], bestsWithin(run, ranges).map((b) => ({ ...b, runId: id, date: run.startTime, title: row.title ?? null })));
    }
  }
  return out;
}

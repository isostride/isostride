import type { RunFile } from '@/lib/kernel';

/** Fragments of a run by length (pure): the fastest stretch covering a distance or lasting a time. */

/** The fragment from sample i covering `target` m (distance) or lasting `target` s (time): its end index, or -1. */
function endFrom(ts: number[], ds: number[], i: number, kind: 'time' | 'distance', target: number): number {
  let lo = i;
  let hi = ts.length - 1;
  const reached = (j: number) => (kind === 'distance' ? ds[j] - ds[i] >= target : ts[j] - ts[i] >= target - 2);
  if (!reached(hi)) return -1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (reached(mid)) hi = mid; else lo = mid + 1; }
  return lo;
}

/**
 * The fastest fragment [from, to) s of a run covering `target` metres (distance) or lasting
 * `target` s (time), among those whose start `allow` accepts (every start by default), within
 * `range` s of the run when one is given.
 */
export function fastestFragment(run: RunFile, kind: 'time' | 'distance', target: number, allow?: (t: number) => boolean, range?: [number, number]): { from: number; to: number; distance: number } | null {
  const { t, distance } = run.samples;
  const ts: number[] = [];
  const ds: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const d = distance[i];
    if (d !== null && (!range || (t[i] >= range[0] && t[i] < range[1]))) { ts.push(t[i]); ds.push(d); }
  }
  let best: { from: number; to: number; distance: number } | null = null;
  for (let i = 0; i < ts.length; i++) {
    if (allow && !allow(ts[i])) continue;
    const j = endFrom(ts, ds, i, kind, target);
    if (j < 0) break;
    const cand = { from: ts[i], to: ts[j], distance: ds[j] - ds[i] };
    const better = !best || (kind === 'distance' ? cand.to - cand.from < best.to - best.from : cand.distance > best.distance);
    if (better) best = cand;
  }
  return best;
}

/** One candidate stretch of a length: its bounds, its distance and where it lies among the samples with a distance. */
export interface Stretch {
  from: number;
  to: number;
  distance: number;
  i: number;
  j: number;
}

/**
 * Every stretch of a run covering `target` metres or lasting `target` s, one per starting sample
 * (the shortest that reaches the target), with the samples' times: the candidates a rule's
 * conditions choose among.
 */
export function stretches(run: RunFile, kind: 'time' | 'distance', target: number): { ts: number[]; idx: number[]; list: Stretch[] } {
  const { t, distance } = run.samples;
  const ts: number[] = [];
  const ds: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const d = distance[i];
    if (d !== null) { ts.push(t[i]); ds.push(d); idx.push(i); }
  }
  const list: Stretch[] = [];
  for (let i = 0; i < ts.length; i++) {
    const j = endFrom(ts, ds, i, kind, target);
    if (j < 0) break;
    if (ds[j] - ds[i] > 0 && ts[j] > ts[i]) list.push({ from: ts[i], to: ts[j], distance: ds[j] - ds[i], i, j });
  }
  return { ts, idx, list };
}

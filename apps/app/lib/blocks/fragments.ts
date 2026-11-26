import type { RunFile } from '@/lib/kernel';

/** Fragments of a run by length (pure): the fastest stretch covering a distance or lasting a time. */

/**
 * The fragment from sample i covering `target` m (distance) or lasting `target` s (time): its end index, or -1.
 * A time may fall `slack` s short of its length (the last sample ends a run).
 */
function endFrom(ts: number[], ds: number[], i: number, kind: 'time' | 'distance', target: number, slack = 0): number {
  let lo = i;
  let hi = ts.length - 1;
  const reached = (j: number) => (kind === 'distance' ? ds[j] - ds[i] >= target : ts[j] - ts[i] >= target - slack);
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
  return fastestOver(ts, ds, kind, target, allow);
}

/**
 * The fastest fragment over samples at times `ts` with cumulative distances `ds` (see fastestFragment).
 * A stretch of time is taken whole: where no whole one exists, the longest there is when it falls 2 s
 * short at most (a segment ending on its last sample); a shorter stretch is a faster one, so it would
 * pass for the best of its length. `ok` may refuse a candidate
 * by its sample indices (a downhill, for the bests of pace).
 */
export function fastestOver(ts: number[], ds: number[], kind: 'time' | 'distance', target: number, allow?: (t: number) => boolean, ok?: (i: number, j: number) => boolean): { from: number; to: number; distance: number } | null {
  // Short of a whole stretch, the longest there is, when it falls 2 s short at most.
  const short = ts.length ? target - (ts[ts.length - 1] - ts[0]) : Infinity;
  for (const slack of kind === 'time' && short > 0 && short <= 2 ? [0, short] : [0]) {
    let best: { from: number; to: number; distance: number } | null = null;
    for (let i = 0; i < ts.length; i++) {
      if (allow && !allow(ts[i])) continue;
      const j = endFrom(ts, ds, i, kind, target, slack);
      if (j < 0) break;
      if (ok && !ok(i, j)) continue;
      const cand = { from: ts[i], to: ts[j], distance: ds[j] - ds[i] };
      // By speed: the stretches of one length differ in what they overshoot it by (one of 30 s lasts 30 to 36 s
      // between samples 1 to 7 s apart), and the longer one covered more ground at a slower pace.
      const better = !best || cand.distance * (best.to - best.from) > best.distance * (cand.to - cand.from);
      if (better) best = cand;
    }
    if (best) return best;
    // A whole stretch fits, but none passes: no shorter one is taken for it.
    if (ts.length && endFrom(ts, ds, 0, kind, target, slack) >= 0) return null;
  }
  return null;
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
  // Whole stretches (a "fastest 5 minutes" was 298 s: every start took the 2 s meant for the last sample
  // of a run). Only a stretch that ends on the run's last sample may fall 2 s short: that sample ends the
  // run, and the last 5 minutes of a run recorded every second lie 299 s apart.
  const last = ts.length - 1;
  for (let i = 0; i < ts.length; i++) {
    let j = endFrom(ts, ds, i, kind, target);
    if (j < 0 && kind === 'time' && ts[last] - ts[i] >= target - 2) j = last;
    if (j < 0) break;
    if (ds[j] - ds[i] > 0 && ts[j] > ts[i]) list.push({ from: ts[i], to: ts[j], distance: ds[j] - ds[i], i, j });
  }
  return { ts, idx, list };
}

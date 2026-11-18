import { angleBetween, distance, type TrackPoint } from '@/lib/geo/geo';
import type { RefPoint } from './types';

export interface Pass {
  /** index in the run's resampled track where the pass starts and ends */
  from: number;
  to: number;
  /** share of reference points matched */
  share: number;
}

const MAX_ANGLE = 60;

/**
 * Finds every pass of a run over a reference track: a stretch of the run where at
 * least `minShare` of the reference points have a run point within `radius` metres
 * travelling the same way (spec section 5: ≥ 90 % within 30 m, same direction).
 */
export function findPasses(ref: RefPoint[], run: TrackPoint[], radius = 30, minShare = 0.9): Pass[] {
  const passes: Pass[] = [];
  if (ref.length < 2 || run.length < 2) return passes;
  // Look for run points near the reference's first point, heading the same way.
  let j = 0;
  while (j < run.length) {
    if (!(distance(run[j], ref[0]) <= radius && angleBetween(run[j].heading, ref[0].heading) <= MAX_ANGLE)) {
      j++;
      continue;
    }
    // Take the closest point of this approach as the start.
    let best = j;
    while (j + 1 < run.length && distance(run[j + 1], ref[0]) <= radius) {
      j++;
      if (distance(run[j], ref[0]) < distance(run[best], ref[0])) best = j;
    }
    const m = matchFrom(ref, run, best, radius);
    if (m.share >= minShare) {
      passes.push({ from: best, to: m.to, share: m.share });
      j = Math.max(m.to, best) + 1;
    } else {
      j = best + 1;
    }
  }
  return passes;
}

/** Walks the reference from run point `start`, advancing a pointer along the run (monotonic). */
function matchFrom(ref: RefPoint[], run: TrackPoint[], start: number, radius: number): { share: number; to: number } {
  let q = start;
  let matched = 0;
  let lastMatched = start;
  // The run may meander; allow it to lag or lead by up to 400 m of track.
  const LOOKAHEAD = 40;
  for (const r of ref) {
    let bestQ = -1;
    let bestD = Infinity;
    for (let k = q; k < Math.min(run.length, q + LOOKAHEAD); k++) {
      const d = distance(run[k], r);
      if (d < bestD) {
        bestD = d;
        bestQ = k;
      }
    }
    if (bestQ >= 0 && bestD <= radius && angleBetween(run[bestQ].heading, r.heading) <= MAX_ANGLE) {
      matched++;
      q = bestQ;
      lastMatched = bestQ;
    }
  }
  return { share: matched / ref.length, to: lastMatched };
}

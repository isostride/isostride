import type { TrackPoint } from '@/lib/geo/geo';
import type { IndexedRun, RunFile } from '@/lib/ingest/importFolder';
import { buildInstance } from './instance';
import { findPasses } from './routeMatch';
import { lapKey } from './structure';
import type { BlockDefinition, BlockInstance } from './types';

/** Detects the instances of one block definition in one run (spec F10). */
export function detectInstances(def: BlockDefinition, run: RunFile, row: IndexedRun, track: TrackPoint[]): BlockInstance[] {
  const p = def.params;
  if (p.type === 'route') {
    // A run without GPS has no route passes; structure and steady blocks still work.
    return findPasses(p.track, track, def.tolerances.routeRadius, def.tolerances.routeShare).map((pass) =>
      buildInstance(def, run, row, track[pass.from].t, track[pass.to].t, { heading: p.heading }),
    );
  }
  if (p.type === 'structure') {
    // Only laps the runner set up as this element: auto-laps and manual presses are not workouts.
    return run.laps.flatMap((lap, i) => {
      const k = lapKey(lap, i, run.laps);
      const value = p.kind === 'time' ? lap.duration : lap.distance;
      return k && k.kind === p.kind && Math.abs(value - p.target) <= p.target * p.tolerance ? [buildInstance(def, run, row, lap.start, lap.end, { lap: i + 1 })] : [];
    });
  }
  return steadyFragments(def, run).map(([from, to]) => buildInstance(def, run, row, from, to));
}

/** Maximal stretches of unflagged 10 s windows whose pace stays in the band, at least minDuration long. */
function steadyFragments(def: BlockDefinition, run: RunFile): [number, number][] {
  if (def.params.type !== 'steady') return [];
  const { paceMin, paceMax } = def.tolerances;
  if (paceMin === null || paceMax === null) return [];
  const w = run.windows;
  const step = w.start.length > 1 ? w.start[1] - w.start[0] : 10;
  const ok = w.start.map((_, i) => {
    const v = w.speed[i];
    if (v === null || v <= 0 || w.flags.stopped[i] || w.flags.missingSignal[i]) return false;
    const pace = 1000 / v;
    return pace >= paceMin && pace <= paceMax;
  });
  const out: [number, number][] = [];
  let i0 = -1;
  for (let i = 0; i <= ok.length; i++) {
    if (i < ok.length && ok[i]) {
      if (i0 < 0) i0 = i;
    } else if (i0 >= 0) {
      const from = w.start[i0];
      const to = w.start[i - 1] + step;
      if (to - from >= def.params.minDuration) out.push([from, to]);
      i0 = -1;
    }
  }
  return out;
}

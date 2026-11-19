import type { TrackPoint } from '@/lib/geo';
import type { IndexedRun, RunFile } from '@/lib/kernel';
import { buildInstance } from './instance';
import { effortIn, followsPattern, mainEffort } from './logical';
import { findPasses } from './routeMatch';
import { lapKey, lapSubject, matchesCriteria, runSubject, type BlockDefinition, type BlockInstance } from '@/lib/blocks';

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
  if (p.type === 'effort') {
    // On any route: the run's fastest fragment of this length, when it is an effort.
    const e = effortIn(run, p.kind, p.target, def.tolerances.start);
    return e ? [buildInstance(def, run, row, e.from, e.to)] : [];
  }
  if (p.type === 'tag') {
    if (row.workoutType !== p.workoutType) return [];
    const m = mainEffort(run);
    return [buildInstance(def, run, row, m.from, m.to, { lap: m.lap })];
  }
  if (p.type === 'pattern') {
    if (!followsPattern(run.laps, p.laps, p.tolerance)) return [];
    return p.laps.flatMap((lap, i) => (lap.effort ? [buildInstance(def, run, row, run.laps[i].start, run.laps[i].end, { lap: i + 1 })] : []));
  }
  if (p.type === 'criteria') {
    // The runner's own criteria: the whole run that meets them, or each of its laps that does.
    if (p.scope === 'run') {
      const end = run.samples.t[run.samples.t.length - 1] ?? 0;
      return matchesCriteria(p.criteria, runSubject(row)) ? [buildInstance(def, run, row, 0, end + 1)] : [];
    }
    return run.laps.flatMap((lap, i) => (matchesCriteria(p.criteria, lapSubject(run, row, i)) ? [buildInstance(def, run, row, lap.start, lap.end, { lap: i + 1 })] : []));
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

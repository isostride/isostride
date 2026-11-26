import { DEFAULT_TOLERANCES, bestProfileMatch, followsLayout, hasAlways, repLaps, lapKey, lapSubject, matchesRunFilter, meetsConditions, runSubject, stretchSubject, stretches, trackOf, type Conditions, type Rule, type Tolerances } from '@/lib/blocks';
import { resample, type TrackPoint } from '@/lib/geo';
import { isPace, metricSeries, secondsPerKm, type IndexedRun, type RunFile } from '@/lib/kernel';
import { startKind, stopTimes } from './instance';
import { effortIn, mainEffort } from './logical';
import { findPasses } from './routeMatch';

/**
 * The segments a rule selects in one run (the author's remodelling of 19 Nov 2026: "system
 * wybiera mi wszystkie segmenty i je uzywa"): whole runs, laps, the fastest stretches of a
 * length, or stretches that keep the conditions for a time; each must meet the conditions on
 * average and in every 10 s window, and start the way the rule says.
 */

export interface Segment {
  from: number;
  to: number;
  /** the lap it is, 1-based, for a lap rule */
  lap?: number;
  /** the route's bearing, for a pass over a route */
  heading?: number;
}

const WINDOW = 10;
/** At most this many stretches of a length from one run (model's choice: an interval session has fewer). */
export const MAX_STRETCHES = 30;

/**
 * A count, up to each 10 s window, of the windows that break an "always" condition: heart rate
 * outside its bounds (or not recorded), or, while moving, pace outside its band.
 */
function brokenBefore(run: RunFile, c: Conditions): Int32Array {
  const w = run.windows;
  const acc = new Int32Array(w.start.length + 1);
  const hrSet = c.alwaysHrMin !== null || c.alwaysHrMax !== null;
  const paceSet = c.alwaysPaceMin !== null || c.alwaysPaceMax !== null;
  for (let k = 0; k < w.start.length; k++) {
    const hr = (w.values.heartRate?.[k] ?? null);
    const sp = (w.values.speed?.[k] ?? null);
    const pace = sp !== null && sp > 0 ? 1000 / sp : null;
    const hrBad = hrSet && (hr === null || (c.alwaysHrMin !== null && hr < c.alwaysHrMin) || (c.alwaysHrMax !== null && hr > c.alwaysHrMax));
    const paceBad = paceSet && !w.flags.stopped[k] && (pace === null || (c.alwaysPaceMin !== null && pace < c.alwaysPaceMin) || (c.alwaysPaceMax !== null && pace > c.alwaysPaceMax));
    acc[k + 1] = acc[k] + (hrBad || paceBad ? 1 : 0);
  }
  return acc;
}

/** True when no window whose centre lies in [from, to) breaks an "always" condition. */
function holds(acc: Int32Array, from: number, to: number): boolean {
  const n = acc.length - 1;
  const k0 = Math.min(n, Math.max(0, Math.ceil((from - WINDOW / 2) / WINDOW)));
  const k1 = Math.min(n, Math.max(k0, Math.ceil((to - WINDOW / 2) / WINDOW)));
  return acc[k1] - acc[k0] === 0;
}

/** The fastest stretches of a length that meet the conditions: the best, or every one that does not overlap a faster one. */
function fastest(rule: Rule, run: RunFile, acc: Int32Array | null, startsRight: (t: number) => boolean): Segment[] {
  if (rule.shape.type !== 'fastest') return [];
  const c = rule.conditions;
  const { idx, list } = stretches(run, rule.shape.kind, rule.shape.target);
  // Heart rate summed up to each sample with a distance, for the mean of any stretch.
  const hr = metricSeries(run.samples, 'heartRate');
  const sum = new Float64Array(idx.length + 1);
  const cnt = new Int32Array(idx.length + 1);
  for (let k = 0; k < idx.length; k++) { const h = hr[idx[k]]; sum[k + 1] = sum[k] + (h ?? 0); cnt[k + 1] = cnt[k] + (h === null ? 0 : 1); }
  const hrSet = c.hrMin !== null || c.hrMax !== null;
  // The other metric of the conditions, summed the same way, as a stretch's is read (the samples in motion):
  // it was not looked at here, and "Fastest 5 min · Power 300–350 W" gave the fastest 5 minutes whatever their power.
  const other = c.metric ? metricSeries(run.samples, c.metric) : null;
  const speed = metricSeries(run.samples, 'speed');
  const msum = new Float64Array(idx.length + 1);
  const mcnt = new Int32Array(idx.length + 1);
  if (other) for (let k = 0; k < idx.length; k++) { const v = other[idx[k]]; const on = v !== null && (speed[idx[k]] ?? 1) >= 0.5; msum[k + 1] = msum[k] + (on ? v : 0); mcnt[k + 1] = mcnt[k] + (on ? 1 : 0); }
  const ok = list.filter((s) => {
    const pace = (s.to - s.from) / (s.distance / 1000);
    if ((c.paceMin !== null && pace < c.paceMin) || (c.paceMax !== null && pace > c.paceMax)) return false;
    if (other) {
      const n = mcnt[s.j] - mcnt[s.i];
      const mean = n ? (msum[s.j] - msum[s.i]) / n : null;
      const value = mean !== null && isPace(c.metric!) ? secondsPerKm(mean) : mean;
      const [lo, hi] = [c.metricMin ?? null, c.metricMax ?? null];
      if ((lo !== null || hi !== null) && (value === null || (lo !== null && value < lo) || (hi !== null && value > hi))) return false;
    }
    if (hrSet) {
      const n = cnt[s.j] - cnt[s.i];
      const mean = n ? (sum[s.j] - sum[s.i]) / n : null;
      if (mean === null || (c.hrMin !== null && mean < c.hrMin) || (c.hrMax !== null && mean > c.hrMax)) return false;
    }
    return (!acc || holds(acc, s.from, s.to)) && startsRight(s.from);
  });
  ok.sort((a, b) => b.distance / (b.to - b.from) - a.distance / (a.to - a.from));
  if (rule.pick === 'best') return ok.slice(0, 1).map((s) => ({ from: s.from, to: s.to }));
  const taken: Segment[] = [];
  for (const s of ok) {
    if (taken.length >= MAX_STRETCHES) break;
    if (!taken.some((x) => s.from < x.to && x.from < s.to)) taken.push({ from: s.from, to: s.to });
  }
  return taken.sort((a, b) => a.from - b.from);
}

/** The stretches of unbroken running, at least minDuration long, in which no window breaks an "always" condition. */
function steady(rule: Rule, run: RunFile, acc: Int32Array | null): Segment[] {
  if (rule.shape.type !== 'steady') return [];
  const w = run.windows;
  const out: Segment[] = [];
  let k0 = -1;
  for (let k = 0; k <= w.start.length; k++) {
    const good = k < w.start.length && !w.flags.stopped[k] && (w.values.speed?.[k] ?? null) !== null && (!acc || acc[k + 1] - acc[k] === 0);
    if (good) { if (k0 < 0) k0 = k; continue; }
    if (k0 >= 0) {
      const from = w.start[k0];
      const to = w.start[k - 1] + WINDOW;
      if (to - from >= rule.shape.minDuration) out.push({ from, to });
      k0 = -1;
    }
  }
  return out;
}

/** The segments of one run a rule selects: none when the run is not one the rule draws from. */
export function ruleSegments(rule: Rule, run: RunFile, row: IndexedRun, ctx: { track?: TrackPoint[]; tolerances?: Tolerances } = {}): Segment[] {
  if (!matchesRunFilter(rule.runs, row)) return [];
  // Runs of a layout of laps, identical or similar (requirement "Segments by lap layout").
  const layout = rule.runs.layout;
  if (layout && !followsLayout(run, layout.laps, layout.match)) return [];
  const c = rule.conditions;
  const acc = hasAlways(c) ? brokenBefore(run, c) : null;
  const speed = metricSeries(run.samples, 'speed');
  const stops = c.start === 'any' ? [] : stopTimes(run.samples.t, speed);
  const startsRight = (t: number) => c.start === 'any' || startKind(run.samples.t, speed, t, stops) === c.start;
  const end = (run.samples.t[run.samples.t.length - 1] ?? 0) + 1;

  const shape = rule.shape;
  if (shape.type === 'fastest' && !shape.effort) return fastest(rule, run, acc, startsRight);
  const tol = ctx.tolerances ?? DEFAULT_TOLERANCES;
  // The stretches a reference finds, then the conditions on each.
  let candidates: Segment[] | null = null;
  if (shape.type === 'fastest') {
    // Run as an effort: the run's fastest stretch of the length, when it is one.
    const e = effortIn(run, shape.kind, shape.target, c.start);
    candidates = e ? [{ from: e.from, to: e.to }] : [];
  } else if (shape.type === 'main') {
    const m = mainEffort(run);
    candidates = [{ from: m.from, to: m.to, ...(m.lap === null ? {} : { lap: m.lap }) }];
  } else if (shape.type === 'pattern') {
    // The reps of the layout: its effort laps in a run of the same laps, a run's own in one of the same reps.
    candidates = followsLayout(run, shape.laps, shape.match, shape.tolerance) ? repLaps(run, shape.laps, shape.match).map((i) => ({ from: run.laps[i].start, to: run.laps[i].end, lap: i + 1 })) : [];
  } else if (shape.type === 'route') {
    // A run without GPS has no passes.
    const pts = ctx.track ?? resample(run.samples.lat, run.samples.lon, run.samples.t, 10);
    candidates = findPasses(shape.track, pts, tol.routeRadius, tol.routeShare).map((p) => ({ from: pts[p.from].t, to: pts[p.to].t, heading: shape.heading }));
  } else if (shape.type === 'profile') {
    // The best stretch among those in the rule's pace band, so a faster or slower one does not hide it.
    const m = bestProfileMatch(shape.key, trackOf(run), shape.minScore, [], { min: c.paceMin, max: c.paceMax });
    candidates = m ? [{ from: m.from, to: m.to }] : [];
  }
  if (candidates) {
    // The start too (standing, flying), as for laps and steady stretches: it was asked of those alone, and "Reps of
    // 6 × 1 km · standing start" kept every rep. An effort's start is already asked of its search above.
    const startOk = (seg: Segment) => (shape.type === 'fastest' ? true : startsRight(seg.from));
    const kept = candidates.filter((seg) => meetsConditions(c, seg.lap ? lapSubject(run, seg.lap - 1, c.metric) : stretchSubject(run, seg.from, seg.to, c.metric)) && (!acc || holds(acc, seg.from, seg.to)) && startOk(seg));
    return rule.pick === 'best' && kept.length > 1 ? [kept.reduce((a, b) => ((stretchSubject(run, b.from, b.to).pace ?? Infinity) < (stretchSubject(run, a.from, a.to).pace ?? Infinity) ? b : a))] : kept;
  }

  let found: { seg: Segment; pace: number | null }[] = [];
  if (rule.shape.type === 'run') {
    const s = c.metric ? { ...runSubject(row), metric: stretchSubject(run, 0, end, c.metric).metric } : runSubject(row);
    if (meetsConditions(c, s) && (!acc || holds(acc, 0, end))) found = [{ seg: { from: 0, to: end }, pace: s.pace }];
  } else if (rule.shape.type === 'lap') {
    const planned = rule.shape.planned;
    run.laps.forEach((lap, i) => {
      // Only the laps the runner set up as this length: auto-laps and presses are no workout.
      if (planned) {
        const k = lapKey(lap, i, run.laps);
        const value = planned.kind === 'time' ? lap.duration : lap.distance;
        if (!k || k.kind !== planned.kind || Math.abs(value - planned.target) > planned.target * planned.tolerance) return;
      }
      const s = lapSubject(run, i, c.metric);
      if (meetsConditions(c, s) && (!acc || holds(acc, lap.start, lap.end)) && startsRight(lap.start)) found.push({ seg: { from: lap.start, to: lap.end, lap: i + 1 }, pace: s.pace });
    });
  } else {
    for (const seg of steady(rule, run, acc)) {
      const s = stretchSubject(run, seg.from, seg.to, c.metric);
      if (meetsConditions(c, s) && startsRight(seg.from)) found.push({ seg, pace: s.pace });
    }
  }
  // The best of a run: its fastest qualifying segment.
  if (rule.pick === 'best' && found.length > 1) found = [found.reduce((a, b) => ((b.pace ?? Infinity) < (a.pace ?? Infinity) ? b : a))];
  return found.map((f) => f.seg);
}

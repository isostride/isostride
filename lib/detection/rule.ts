import { hasAlways, lapSubject, matchesRunFilter, meetsConditions, runSubject, stretchSubject, stretches, type Conditions, type Rule } from '@/lib/blocks';
import type { IndexedRun, RunFile } from '@/lib/kernel';
import { startKind, stopTimes } from './instance';

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
    const hr = w.heartRate[k];
    const sp = w.speed[k];
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
  const hr = run.samples.heartRate;
  const sum = new Float64Array(idx.length + 1);
  const cnt = new Int32Array(idx.length + 1);
  for (let k = 0; k < idx.length; k++) { const h = hr[idx[k]]; sum[k + 1] = sum[k] + (h ?? 0); cnt[k + 1] = cnt[k] + (h === null ? 0 : 1); }
  const hrSet = c.hrMin !== null || c.hrMax !== null;
  const ok = list.filter((s) => {
    const pace = (s.to - s.from) / (s.distance / 1000);
    if ((c.paceMin !== null && pace < c.paceMin) || (c.paceMax !== null && pace > c.paceMax)) return false;
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
    const good = k < w.start.length && !w.flags.stopped[k] && w.speed[k] !== null && (!acc || acc[k + 1] - acc[k] === 0);
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
export function ruleSegments(rule: Rule, run: RunFile, row: IndexedRun): Segment[] {
  if (!matchesRunFilter(rule.runs, row)) return [];
  const c = rule.conditions;
  const acc = hasAlways(c) ? brokenBefore(run, c) : null;
  const stops = c.start === 'any' ? [] : stopTimes(run.samples.t, run.samples.speed);
  const startsRight = (t: number) => c.start === 'any' || startKind(run.samples.t, run.samples.speed, t, stops) === c.start;
  const end = (run.samples.t[run.samples.t.length - 1] ?? 0) + 1;

  if (rule.shape.type === 'fastest') return fastest(rule, run, acc, startsRight);

  let found: { seg: Segment; pace: number | null }[] = [];
  if (rule.shape.type === 'run') {
    const s = runSubject(row);
    if (meetsConditions(c, s) && (!acc || holds(acc, 0, end))) found = [{ seg: { from: 0, to: end }, pace: s.pace }];
  } else if (rule.shape.type === 'lap') {
    run.laps.forEach((lap, i) => {
      const s = lapSubject(run, i);
      if (meetsConditions(c, s) && (!acc || holds(acc, lap.start, lap.end)) && startsRight(lap.start)) found.push({ seg: { from: lap.start, to: lap.end, lap: i + 1 }, pace: s.pace });
    });
  } else {
    for (const seg of steady(rule, run, acc)) {
      const s = stretchSubject(run, seg.from, seg.to);
      if (meetsConditions(c, s) && startsRight(seg.from)) found.push({ seg, pace: s.pace });
    }
  }
  // The best of a run: its fastest qualifying segment.
  if (rule.pick === 'best' && found.length > 1) found = [found.reduce((a, b) => ((b.pace ?? Infinity) < (a.pace ?? Infinity) ? b : a))];
  return found.map((f) => f.seg);
}

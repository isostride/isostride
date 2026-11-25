import { CS_RANGE, CURVE_DURATIONS } from '@/lib/curve';
import { MARKER_DAYS } from './insights';
import type { LoadRow } from './models';
import type { LoadSummary } from './summary';

/**
 * How hard the best efforts were (the author's example of 21 Nov 2026: "jesli nigdy nie pobieglem
 * na max na 3 min to krzywa mocy jest bezwartosciowa"; ADR "Models grouped by evidence, assumptions
 * checked"): the curve models take each best for an all-out effort of its length, so each best is
 * classed by the heart rate reached in it, and the bests together by whether they are separate
 * efforts and whether the short ones are clearly faster than the long ones.
 */

/** all-out: the heart rate reached the share of the maximum an all-out effort reaches; hard: close to it; easy: far from it. */
export type Effort = 'allout' | 'hard' | 'easy' | 'unknown';

/**
 * The evidence (model's choices). An effort up to SHORT_EFFORT s is read by the peak of its heart
 * rate, which lags too much for a mean: all-out from 90 % of the maximum. A longer one by its mean
 * heart rate after the first 90 s, so that a stretch half easy and half hard does not pass for an
 * all-out one: all-out from 88 %. Hard, though not all-out, from 85 % either way.
 */
export const SHORT_EFFORT = 180;
export const ALLOUT_PEAK = 0.9;
export const ALLOUT_MEAN = 0.88;
export const HARD_SHARE = 0.85;

/** The lengths the curve models are fitted to: 2, 3, 5, 10, 15 and 20 minutes. */
export const EFFORT_DURATIONS = CURVE_DURATIONS.filter((d) => d >= CS_RANGE[0] && d <= CS_RANGE[1]);

/** How hard a best of a length was, from the heart rate read for that length (its peak or its mean) against the maximum. */
export function effortOf(duration: number, hr: number | null | undefined, maxHr: number | null): Effort {
  // i18n-ignore
  if (hr === null || hr === undefined || !maxHr) return 'unknown';
  const share = hr / maxHr;
  // i18n-ignore
  if (share >= (duration <= SHORT_EFFORT ? ALLOUT_PEAK : ALLOUT_MEAN)) return 'allout';
  // i18n-ignore
  return share >= HARD_SHARE ? 'hard' : 'easy';
}

/** The best of a length in the window: its value, the run and stretch it comes from, and how hard it was. */
export interface BestEffort {
  /** s */
  duration: number;
  /** speed, m/s, or power, W */
  value: number;
  runId: string;
  startTime: string;
  /** [from, to] s of the run */
  at: [number, number] | null;
  /** the heart rate the effort is read by, bpm: the peak of a short stretch, the mean (after the first 90 s) of a longer one */
  hr: number | null;
  hrKind: 'peak' | 'mean';
  effort: Effort;
}

const DAY = 86_400_000;

/**
 * The best of each length of 2–20 minutes (or of the `durations` given: the whole curve's, 30 s to
 * 2 h) over the runs of the `days` days up to `today` (the window of the fitness markers), for speed
 * or for power; null where no run has one.
 */
export function bestEfforts(rows: LoadRow[], summaries: Record<string, LoadSummary>, kind: 'speed' | 'power', maxHr: number | null, today: string, days = MARKER_DAYS, durations: number[] = EFFORT_DURATIONS): (BestEffort | null)[] {
  const to = new Date(`${today}T23:59:59`).getTime();
  const from = to - days * DAY;
  const inside = rows.filter((r) => { const t = Date.parse(r.startTime); return summaries[r.id] && t > from && t <= to; });
  return durations.map((duration) => {
    let best: BestEffort | null = null;
    for (const r of inside) {
      const b = summaries[r.id].bests.find((x) => x.duration === duration);
      const value = b ? (kind === 'power' ? b.power : b.speed) : null;
      if (!b || value === null || (best && value <= best.value)) continue;
      const hrKind = duration <= SHORT_EFFORT ? 'peak' as const : 'mean' as const;
      const hr = (kind === 'power' ? (hrKind === 'peak' ? b.powerHrPeak : b.powerHr) : (hrKind === 'peak' ? b.speedHrPeak : b.speedHr)) ?? null;
      best = { duration, value, runId: r.id, startTime: r.startTime, at: (kind === 'power' ? b.powerAt : b.speedAt) ?? null, hr, hrKind, effort: effortOf(duration, hr, maxHr) };
    }
    return best;
  });
}

/** What the bests of a window show together. */
export interface EffortEvidence {
  /** lengths with a best */
  lengths: number;
  /** the lengths whose best was all-out, and those whose best was hard, s */
  allOut: number[];
  hard: number[];
  easy: number[];
  /** bests with no heart rate */
  unknown: number;
  /** separate efforts among the bests: bests of one run whose stretches overlap are one effort */
  distinct: number;
  /** the best of 3 min or less over the best of 15 min or more (speed or power); null without both */
  ratio: number | null;
  /** days from the newest all-out best to `today`; null with none */
  newestAllOut: number | null;
}

export function effortEvidence(efforts: (BestEffort | null)[], today: string): EffortEvidence {
  const have = efforts.filter((e): e is BestEffort => e !== null);
  const of = (k: Effort) => have.filter((e) => e.effort === k).map((e) => e.duration);
  // Separate efforts: per run, the stretches merged where they overlap.
  let distinct = 0;
  for (const runId of new Set(have.map((e) => e.runId))) {
    const spans = have.filter((e) => e.runId === runId).map((e) => e.at).filter((a): a is [number, number] => a !== null).sort((a, b) => a[0] - b[0]);
    if (!spans.length) { distinct++; continue; }
    let end = -Infinity;
    for (const [from, to] of spans) { if (from >= end) distinct++; end = Math.max(end, to); }
  }
  const short = have.filter((e) => e.duration <= SHORT_EFFORT).sort((a, b) => a.duration - b.duration)[0];
  const long = have.filter((e) => e.duration >= 900).sort((a, b) => b.duration - a.duration)[0];
  const end = new Date(`${today}T23:59:59`).getTime();
  const allOutTimes = have.filter((e) => e.effort === 'allout').map((e) => Date.parse(e.startTime));
  return {
    lengths: have.length, allOut: of('allout'), hard: of('hard'), easy: of('easy'), unknown: of('unknown').length, distinct,
    ratio: short && long && long.value > 0 ? Math.round((short.value / long.value) * 1000) / 1000 : null,
    newestAllOut: allOutTimes.length ? Math.floor((end - Math.max(...allOutTimes)) / DAY) : null,
  };
}

/** A length's best pace and best power side by side, and whether they are one stretch of one run. */
export interface EffortPair {
  /** s */
  duration: number;
  pace: BestEffort | null;
  power: BestEffort | null;
  /** both from the same run, their stretches overlapping: one effort, read two ways */
  same: boolean;
}

/**
 * The best pace and the best power of each length in one list (the runner's "tak" to one table:
 * "w capacity best efforts mam osobny graf na pace i power ... czy to nie to samo"): uphill, into the
 * wind or on soft ground the power is high and the pace slow, so a length's two bests can be two
 * runs; on the flat they are one stretch. A length with neither is left out.
 */
export function pairEfforts(pace: (BestEffort | null)[], power: (BestEffort | null)[]): EffortPair[] {
  const out: EffortPair[] = [];
  for (let k = 0; k < Math.max(pace.length, power.length); k++) {
    const a = pace[k] ?? null;
    const b = power[k] ?? null;
    if (!a && !b) continue;
    const overlap = !!a && !!b && a.runId === b.runId && (!a.at || !b.at || (a.at[0] < b.at[1] && b.at[0] < a.at[1]));
    out.push({ duration: (a ?? b)!.duration, pace: a, power: b, same: overlap });
  }
  return out;
}

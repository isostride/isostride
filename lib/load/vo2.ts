import { dayOf } from '@/lib/gear';
import { markersOverTime, type MarkerWeek } from './insights';
import type { LoadRow } from './models';
import type { LoadSummary } from './summary';

/**
 * VO2max estimated three ways (the author's request of 21 Nov 2026: "szacowanie VO2max z tempa i
 * tetna ... mozesz to zrobic"; ADR "Fitted model and VO2max estimates"), each named with its method.
 */

/**
 * Daniels and Gilbert's VDOT (1979) of a race: the oxygen cost of its speed over the fraction of
 * VO2max held for its duration, ml/kg/min.
 */
export function danielsVdot(distance: number, seconds: number): number {
  const t = seconds / 60;
  const v = distance / t;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const fraction = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / fraction;
}

/** The VDOT of each week, from the predicted 5 km of its fitness markers (the runner's own bests). */
export function vdotOverTime(weeks: MarkerWeek[]): { end: string; vdot: number | null }[] {
  return weeks.map((w) => {
    const p = w.predictions.find((x) => x.distance === 5000);
    return { end: w.end, vdot: p ? Math.round(danielsVdot(5000, p.seconds) * 10) / 10 : null };
  });
}

/** A run counts for the heart rate estimate when this long (s) and this hard (fraction of the reserve). */
export const HR_VO2_MIN_SECONDS = 20 * 60;
export const HR_VO2_MIN_RESERVE = 0.5;

/**
 * VO2max from a run's pace and heart rate: the ACSM running equation on level ground
 * (VO2 = 0.2·v + 3.5 ml/kg/min, v in m/min) over the run's fraction of the heart rate reserve
 * (Swain 1997: %HRR ≈ %VO2R). Null for a short or easy run, where the relation is loose.
 */
export function hrVo2max(s: LoadSummary, restHr: number, maxHr: number): number | null {
  if (s.ef === null || s.avgHr === null || s.moving < HR_VO2_MIN_SECONDS || maxHr <= restHr) return null;
  const reserve = (s.avgHr - restHr) / (maxHr - restHr);
  if (reserve < HR_VO2_MIN_RESERVE || reserve >= 1) return null;
  const speed = (s.ef * s.avgHr) / 60;
  const vo2 = 0.2 * speed * 60 + 3.5;
  return Math.round(((vo2 - 3.5) / reserve + 3.5) * 10) / 10;
}

/** The heart rate estimate of each run that qualifies, in date order. */
export function hrVo2Runs(rows: LoadRow[], summaries: Record<string, LoadSummary>, restHr: number, maxHr: number): { runId: string; startTime: string; vo2max: number }[] {
  return rows.flatMap((r) => {
    const s = summaries[r.id];
    const v = s ? hrVo2max(s, restHr, maxHr) : null;
    return v === null ? [] : [{ runId: r.id, startTime: r.startTime, vo2max: v }];
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Uth's estimate (2004): 15.3 × max HR ÷ resting HR, ml/kg/min; a population figure. */
export function uthVo2max(restHr: number, maxHr: number): number {
  return Math.round(((15.3 * maxHr) / restHr) * 10) / 10;
}

/** The heart rate estimate now: the median of the runs of this many days up to the last of them. */
export const HR_VO2_MEDIAN_DAYS = 28;
export function hrVo2Now(perRun: { startTime: string; vo2max: number }[]): { value: number | null; runs: number } {
  if (!perRun.length) return { value: null, runs: 0 };
  const last = Date.parse(perRun[perRun.length - 1].startTime);
  const recent = perRun.filter((p) => Date.parse(p.startTime) > last - HR_VO2_MEDIAN_DAYS * 86_400_000).map((p) => p.vo2max).sort((a, b) => a - b);
  return { value: recent[Math.floor(recent.length / 2)], runs: recent.length };
}

/** What the fitted model takes for a performance: VO2max from heart rate, a mean per day; or the weekly VDOT. */
export type Criterion = 'hr' | 'vdot';
export function performancesFor(criterion: Criterion, rows: LoadRow[], summaries: Record<string, LoadSummary>, restHr: number, maxHr: number | null, today: string): { date: string; value: number }[] {
  if (criterion === 'vdot') return vdotOverTime(markersOverTime(rows, summaries, today)).flatMap((w) => (w.vdot === null ? [] : [{ date: w.end, value: w.vdot }]));
  if (!maxHr) return [];
  const by = new Map<string, number[]>();
  for (const r of hrVo2Runs(rows, summaries, restHr, maxHr)) { const d = dayOf(r.startTime); (by.get(d) ?? by.set(d, []).get(d)!).push(r.vo2max); }
  return [...by].map(([date, vs]) => ({ date, value: vs.reduce((s, v) => s + v, 0) / vs.length }));
}

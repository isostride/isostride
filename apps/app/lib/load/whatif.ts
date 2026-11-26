import { CS_RANGE, CURVE_DURATIONS, MIN_FIT_SECONDS, estimateCurve, fitWholeCurve, wholePredictions, type CurveEstimate } from '@/lib/curve';
import { dayOf } from '@/lib/gear';
import { formSeed, formSeries, type FormDay } from './form';
import { weeklyLoad } from './insights';
import { danielsVdot } from './vo2';

/**
 * What if (the runner's request of 25 Nov 2026: "co gdybym mial takie a nie inne obciazenia; jak by
 * krzywa mocy wyglądała gdybym 20 min przebiegł 3 minuty szybciej"): the models of Performance fed
 * with an effort or weeks of load that did not happen, beside what they say now. Nothing of it is
 * written to the runs: a scenario only changes what the models are given.
 */

/** An effort of the scenario: a length of time and the distance run in it. */
export interface WhatIfEffort {
  /** s */
  seconds: number;
  /** m */
  metres: number;
}

/** What the curve models say of a set of bests. */
export interface CurveState {
  /** the best speed of each length, m/s */
  bests: { duration: number; speed: number }[];
  estimate: CurveEstimate | null;
  /** the predicted race times of the curve model chosen: Riegel's law over 3–20 minutes, or Péronnet–Thibault over every length */
  predictions: { distance: number; seconds: number }[];
  /** from the predicted 5 km (Daniels) */
  vdot: number | null;
}

export interface CurveWhatIf {
  now: CurveState;
  then: CurveState;
  /** each effort of the scenario: whether it changes the curve, and what the models can make of it */
  efforts: {
    effort: WhatIfEffort; speed: number; raises: boolean; beyond: boolean;
    /** the longest length of the curve it counts as, s; null when it is shorter than every length */
    counts: number | null;
    /** under 3 minutes the predicted times leave it out (the power law is fitted from 3 minutes) */
    short: boolean;
  }[];
}

/**
 * A speed counts as faster only by more than this share: the link keeps metres to a tenth, and the
 * effort offered first is the best itself, so the rounding alone must change nothing (0.01 % is under
 * 0.1 s/km).
 */
const FASTER = 1 + 1e-4;

const stateOf = (bests: Map<number, number>, model: 'riegel' | 'whole'): CurveState => {
  const list = [...bests].sort(([a], [b]) => a - b).map(([duration, speed]) => ({ duration, speed }));
  // Critical speed, D′ and the predicted times from the bests of 2–20 minutes, as Capacity fits them.
  const estimate = estimateCurve(list.filter((b) => b.duration >= CS_RANGE[0] && b.duration <= CS_RANGE[1]).map((b) => ({ duration: b.duration, value: 1000 / b.speed })), 'speed');
  const predictions = model === 'whole' ? wholePredictions(fitWholeCurve(list.map((b) => ({ duration: b.duration, value: 1000 / b.speed })), 'speed')) : estimate?.predictions ?? [];
  const five = predictions.find((p) => p.distance === 5000);
  return { bests: list, estimate, predictions, vdot: five ? Math.round(danielsVdot(5000, five.seconds) * 10) / 10 : null };
};

/**
 * The curve with the scenario's efforts in it, as the import would count them had they been run: the
 * curve holds the bests of fixed lengths (30 s to 2 h), and an effort of T seconds at a
 * speed v is a best of each of them up to T at v at least (a stretch inside it is as fast on average),
 * so it raises each of those bests that is slower; a longer length keeps its best, and a length between
 * them (17 minutes) counts as the one under it. `bests` are the bests of the window of the markers (90
 * days), `ever` the best speed of each length in all the runs: an effort above it is beyond what the
 * runner has shown.
 */
export function curveWhatIf(bests: { duration: number; speed: number }[], efforts: WhatIfEffort[], ever: Map<number, number> = new Map(), model: 'riegel' | 'whole' = 'riegel'): CurveWhatIf {
  const now = new Map(bests.map((b) => [b.duration, b.speed]));
  const then = new Map(now);
  const out: CurveWhatIf['efforts'] = [];
  for (const e of efforts) {
    if (!(e.seconds > 0 && e.metres > 0)) continue;
    const speed = e.metres / e.seconds;
    const lengths = CURVE_DURATIONS.filter((d) => d <= e.seconds);
    let raises = false;
    for (const d of lengths) {
      if (speed > (then.get(d) ?? 0) * FASTER) { then.set(d, speed); raises = true; }
    }
    const counts = lengths.length ? lengths[lengths.length - 1] : null;
    out.push({
      effort: e, speed, raises, counts,
      beyond: counts !== null && ever.has(counts) && speed > ever.get(counts)! * FASTER,
      short: counts !== null && counts < MIN_FIT_SECONDS,
    });
  }
  return { now: stateOf(now, model), then: stateOf(then, model), efforts: out };
}

/** "m:ss" or "h:mm:ss" (or a number of minutes) in seconds; null when it is not one. */
export function parseClock(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * 60;
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  const [h, min, sec] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  return sec >= 60 || (m[1] !== undefined && min >= 60) ? null : h * 3600 + min * 60 + sec;
}

/** The efforts of a scenario in its link: "1200-5217.4,600-2800" (seconds-metres). */
export const effortsParam = (efforts: WhatIfEffort[]) => efforts.map((e) => `${Math.round(e.seconds)}-${Math.round(e.metres * 10) / 10}`).join(',');
export function parseEfforts(text: string | null): WhatIfEffort[] {
  return (text ?? '').split(',').flatMap((part) => {
    const [s, m] = part.split('-').map(Number);
    return s > 0 && m > 0 ? [{ seconds: s, metres: m }] : [];
  });
}

/** The weeks of a load scenario at most, and a week's share of the recent weeks at most, %. */
export const WHATIF_WEEKS = 16;
export const WHATIF_MAX_PERCENT = 300;
/** The weeks the pattern of a scenario's days is taken from. */
export const PATTERN_WEEKS = 4;

/** The weeks of a scenario in its link: "110,110,70" (% of the recent weeks). */
export const weeksParam = (weeks: number[]) => weeks.map((w) => Math.round(w)).join(',');
export function parseWeeks(text: string | null): number[] {
  return (text ?? '').split(',').map(Number).filter((v) => Number.isFinite(v) && v >= 0 && v <= WHATIF_MAX_PERCENT).slice(0, WHATIF_WEEKS);
}

export interface WhatIfWeek {
  /** its first and last day */
  from: string;
  to: string;
  percent: number;
  load: number;
  /** at the end of its last day */
  fitness: number;
  fatigue: number;
  /** the morning after its last day: fitness − fatigue */
  form: number;
  /** the highest acute:chronic ratio in it */
  acwr: number | null;
  /** the change of fitness over it */
  ramp: number;
  /** heavier than any week of Monday to Sunday the runner has run */
  beyond: boolean;
}

export interface LoadWhatIf {
  /** the daily series, the past and the scenario */
  days: FormDay[];
  /** the scenario's runs: one a day with a load, at noon */
  planned: { startTime: string; load: number }[];
  /** the first day of the scenario (tomorrow) and its last */
  from: string;
  until: string;
  /** the load of each day of the week in the recent weeks, Monday first, and a week of it */
  pattern: number[];
  recentWeek: number;
  /** the heaviest week of Monday to Sunday so far */
  heaviest: number;
  /** today's state, and each week of the scenario */
  today: FormDay | null;
  weeks: WhatIfWeek[];
}

const shift = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return dayOf(d.toISOString()); };
const weekday = (day: string) => (new Date(`${day}T12:00:00`).getDay() + 6) % 7;

/**
 * Fitness, fatigue and form had the runner trained so in the weeks after today: each week of the
 * scenario a share of the recent weeks, spread over its days as they were (the mean load of each day
 * of the week over the PATTERN_WEEKS weeks up to today), so a scenario keeps the runner's own rhythm
 * of hard days and rest. Weeks run from tomorrow, seven days each.
 */
export function loadWhatIf(runs: { startTime: string; load: number }[], p: { fitnessDays: number; fatigueDays: number }, today: string, weeks: number[]): LoadWhatIf {
  const past = formSeries(runs, p, today);
  const recent = past.slice(-PATTERN_WEEKS * 7);
  const pattern = Array.from({ length: 7 }, (_, w) => {
    const of = recent.filter((d) => weekday(d.date) === w);
    // By the days of that weekday there were: a history shorter than the weeks is not taken for rest.
    return of.length ? of.reduce((s, d) => s + d.load, 0) / of.length : 0;
  });
  const recentWeek = pattern.reduce((s, v) => s + v, 0);
  const from = shift(today, 1);
  const until = shift(today, Math.max(1, weeks.length) * 7);
  const planned: LoadWhatIf['planned'] = [];
  weeks.forEach((percent, k) => {
    for (let i = 0; i < 7; i++) {
      const day = shift(from, k * 7 + i);
      const load = Math.round(pattern[weekday(day)] * (percent / 100) * 10) / 10;
      if (load > 0) planned.push({ startTime: new Date(`${day}T12:00:00`).toISOString(), load });
    }
  });
  // The averages start as those of the runs alone: with a short history the scenario's days would move the start.
  const days = weeks.length ? formSeries([...runs, ...planned], p, until, formSeed(runs, today)) : past;
  const heaviest = Math.max(0, ...weeklyLoad(past).map((w) => w.load));
  const at = new Map(days.map((d, i) => [d.date, i]));
  const todayDay = past[past.length - 1] ?? null;
  const out: WhatIfWeek[] = weeks.map((percent, k) => {
    const first = shift(from, k * 7);
    const last = shift(first, 6);
    const span = days.slice(at.get(first) ?? days.length, (at.get(last) ?? -1) + 1);
    const end = span[span.length - 1];
    const before = k === 0 ? todayDay : days[(at.get(first) ?? 1) - 1];
    const load = Math.round(span.reduce((s, d) => s + d.load, 0));
    const acwrs = span.map((d) => d.acwr).filter((v): v is number => v !== null);
    return {
      from: first, to: last, percent, load,
      fitness: end?.fitness ?? 0, fatigue: end?.fatigue ?? 0,
      form: Math.round(((end?.fitness ?? 0) - (end?.fatigue ?? 0)) * 10) / 10,
      acwr: acwrs.length ? Math.max(...acwrs) : null,
      ramp: Math.round(((end?.fitness ?? 0) - (before?.fitness ?? 0)) * 10) / 10,
      beyond: load > heaviest * 1.0001 && heaviest > 0,
    };
  });
  return { days, planned, from, until, pattern, recentWeek, heaviest, today: todayDay, weeks: out };
}

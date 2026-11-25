import { CS_RANGE, estimateCurve, fitWholeCurve, wholePredictions } from '@/lib/curve';
import { dayOf } from '@/lib/gear';
import { zoneOf } from '@/lib/settings';
import type { FormDay } from './form';
import type { LoadRow } from './models';
import type { LoadSummary } from './summary';

/**
 * What helps to judge performance beyond the form (the author's request of 21 Nov 2026: "dodaj
 * brakujace elementy .. ktore pomoga w ocenie wydajnsoci"; ADR "Performance markers from
 * summaries"): fitness markers over time, weekly load with monotony and strain, the intensity
 * distribution and aerobic efficiency, all from the runs' summaries.
 */

const DAY = 86_400_000;
const shift = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return dayOf(d.toISOString()); };
/** The Monday of a day's week. */
export const weekOf = (day: string) => { const d = new Date(`${day}T12:00:00`); return shift(day, -((d.getDay() + 6) % 7)); };

export interface LoadWeek {
  /** its Monday */
  start: string;
  load: number;
  /** mean daily load over its standard deviation (Foster 1998); null for a week of one value */
  monotony: number | null;
  /** the week's load times its monotony */
  strain: number | null;
  /** the change of fitness (CTL) over the week */
  ramp: number;
}

/** Weeks of the daily series, Monday to Sunday: load, monotony, strain, ramp rate. */
export function weeklyLoad(days: FormDay[]): LoadWeek[] {
  const by = new Map<string, FormDay[]>();
  for (const d of days) { const w = weekOf(d.date); (by.get(w) ?? by.set(w, []).get(w)!).push(d); }
  const out: LoadWeek[] = [];
  let before = 0;
  for (const [start, list] of [...by].sort(([a], [b]) => a.localeCompare(b))) {
    const loads = Array.from({ length: 7 }, (_, k) => list.find((d) => d.date === shift(start, k))?.load ?? 0);
    const load = loads.reduce((s, v) => s + v, 0);
    const mean = load / 7;
    const sd = Math.sqrt(loads.reduce((s, v) => s + (v - mean) ** 2, 0) / 7);
    const monotony = sd > 0 ? mean / sd : null;
    const end = list[list.length - 1].fitness;
    out.push({ start, load: Math.round(load), monotony: monotony === null ? null : Math.round(monotony * 100) / 100, strain: monotony === null ? null : Math.round(load * monotony), ramp: Math.round((end - before) * 10) / 10 });
    before = end;
  }
  return out;
}

export interface MarkerWeek {
  /** the Sunday ending the window */
  end: string;
  /** critical speed, m/s, and D′, m */
  cs: number | null;
  dPrime: number | null;
  /** critical power, W, and W′, J */
  cp: number | null;
  wPrime: number | null;
  /** predicted times by distance, s (Riegel's law over the same bests) */
  predictions: { distance: number; seconds: number }[];
  /** runs in the window */
  runs: number;
}

/** The days of the window of the markers. */
export const MARKER_DAYS = 90;

/**
 * The fitness markers at the end of each week, from the best of each length of 2–20 minutes over
 * the runs of the MARKER_DAYS days up to it: critical speed and D′, critical power and W′, and
 * the predicted race times: Riegel's law over the same bests, or with the whole curve chosen
 * Péronnet–Thibault over the bests of every length, 30 s to 2 h.
 */
export function markersOverTime(rows: LoadRow[], summaries: Record<string, LoadSummary>, until?: string, model: 'riegel' | 'whole' = 'riegel'): MarkerWeek[] {
  const runs = rows.filter((r) => summaries[r.id]).map((r) => ({ t: Date.parse(r.startTime), s: summaries[r.id], day: dayOf(r.startTime) })).sort((a, b) => a.t - b.t);
  if (!runs.length) return [];
  const last = until ?? runs[runs.length - 1].day;
  const out: MarkerWeek[] = [];
  for (let end = shift(weekOf(runs[0].day), 6); end <= shift(weekOf(last), 6); end = shift(end, 7)) {
    const to = new Date(`${end}T23:59:59`).getTime();
    const from = to - MARKER_DAYS * DAY;
    const inside = runs.filter((r) => r.t > from && r.t <= to);
    const speed = new Map<number, number>();
    const power = new Map<number, number>();
    // Every length, 30 s to 2 h, for the whole curve's predicted times.
    const all = new Map<number, number>();
    if (model === 'whole') for (const r of inside) for (const b of r.s.bests) if (b.speed !== null && b.speed > (all.get(b.duration) ?? 0)) all.set(b.duration, b.speed);
    // The markers of 2–20 minutes, as they were fitted before the summaries held every length.
    for (const r of inside) for (const b of r.s.bests) {
      if (b.duration < CS_RANGE[0] || b.duration > CS_RANGE[1]) continue;
      if (b.speed !== null && b.speed > (speed.get(b.duration) ?? 0)) speed.set(b.duration, b.speed);
      if (b.power !== null && b.power > (power.get(b.duration) ?? 0)) power.set(b.duration, b.power);
    }
    const sp = estimateCurve([...speed].map(([duration, v]) => ({ duration, value: 1000 / v })), 'speed');
    const pw = estimateCurve([...power].map(([duration, v]) => ({ duration, value: v })), 'power');
    out.push({
      end, runs: inside.length,
      cs: sp?.critical?.rate ?? null, dPrime: sp?.critical?.reserve ?? null,
      cp: pw?.critical?.rate ?? null, wPrime: pw?.critical?.reserve ?? null,
      predictions: model === 'whole' ? wholePredictions(fitWholeCurve([...all].map(([duration, v]) => ({ duration, value: 1000 / v })), 'speed')) : sp?.predictions ?? [],
    });
  }
  return out;
}

export interface ZoneWeek {
  start: string;
  /** seconds in each heart rate zone, Z1 first */
  seconds: number[];
}

/** Each week's time in each heart rate zone, from the seconds at each heart rate of its runs. */
export function zonesByWeek(rows: LoadRow[], summaries: Record<string, LoadSummary>, hrZones: number[]): ZoneWeek[] {
  const n = hrZones.length + 1;
  const by = new Map<string, number[]>();
  for (const r of rows) {
    const s = summaries[r.id];
    if (!s || !s.hr.length) continue;
    const w = weekOf(dayOf(r.startTime));
    const sec = by.get(w) ?? by.set(w, Array(n).fill(0)).get(w)!;
    s.hr.forEach((v, k) => { sec[zoneOf('heartRate', hrZones, s.hrFrom + k)] += v; });
  }
  return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([start, seconds]) => ({ start, seconds: seconds.map((v) => Math.round(v)) }));
}

/**
 * Seiler's three intensity zones from the zones of Settings: low (Z1–Z2), moderate (Z3), high (Z4
 * and above); with fewer zones, the last is high and the one before moderate.
 */
export function intensityShares(weeks: ZoneWeek[]): { low: number; moderate: number; high: number; seconds: number } {
  const sums = weeks.reduce((acc, w) => acc.map((v, k) => v + (w.seconds[k] ?? 0)), Array(Math.max(0, ...weeks.map((w) => w.seconds.length))).fill(0) as number[]);
  const total = sums.reduce((s, v) => s + v, 0);
  if (!total) return { low: 0, moderate: 0, high: 0, seconds: 0 };
  const n = sums.length;
  const lowEnd = n >= 5 ? 2 : Math.max(1, n - 2);
  const low = sums.slice(0, lowEnd).reduce((s, v) => s + v, 0);
  const moderate = sums.slice(lowEnd, lowEnd + 1).reduce((s, v) => s + v, 0);
  const high = total - low - moderate;
  return { low: low / total, moderate: moderate / total, high: high / total, seconds: total };
}

export interface EfficiencyRun {
  runId: string;
  startTime: string;
  /** metres per heartbeat while moving */
  ef: number;
  /** %, for runs of DECOUPLING_MIN and more */
  decoupling: number | null;
  /** its mean heart rate lies in Z1–Z2 */
  easy: boolean;
  moving: number;
}

/** Decoupling is read for runs this long and more, s (model's choice: 45 min). */
export const DECOUPLING_MIN = 45 * 60;
/** The window of the trend of the efficiency factor, days. */
export const EF_TREND_DAYS = 28;

/** The efficiency of each run with a heart rate, and its decoupling when it is long enough. */
export function efficiencyRuns(rows: LoadRow[], summaries: Record<string, LoadSummary>, hrZones: number[]): EfficiencyRun[] {
  const easyMax = hrZones.length >= 2 ? hrZones[1] : hrZones[0] ?? Infinity;
  return rows.flatMap((r) => {
    const s = summaries[r.id];
    if (!s || s.ef === null || s.avgHr === null) return [];
    return [{ runId: r.id, startTime: r.startTime, ef: s.ef, decoupling: s.moving >= DECOUPLING_MIN ? s.decoupling : null, easy: s.avgHr < easyMax, moving: s.moving }];
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** The mean of the values of the days up to each point, over `days` days. */
export function trailingMean<T extends { startTime: string }>(points: T[], value: (p: T) => number | null, days: number): (number | null)[] {
  return points.map((p) => {
    const t = Date.parse(p.startTime);
    const vs = points.filter((q) => { const u = Date.parse(q.startTime); return u <= t && u > t - days * DAY; }).map(value).filter((v): v is number => v !== null);
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  });
}

/**
 * The efficiency now: the mean factor of the easy runs of the EF_TREND_DAYS days up to the last
 * run and of the days before them, and the median decoupling of the last long runs (5 at most).
 */
export function efficiencyNow(points: EfficiencyRun[]): { ef: number | null; before: number | null; easyRuns: number; decoupling: number | null; longRuns: number; longRuns90: number } {
  if (!points.length) return { ef: null, before: null, easyRuns: 0, decoupling: null, longRuns: 0, longRuns90: 0 };
  const last = Date.parse(points[points.length - 1].startTime);
  const within = (p: EfficiencyRun, from: number, to: number) => { const t = Date.parse(p.startTime); return t > from && t <= to; };
  const easy = points.filter((p) => p.easy);
  const mean = (list: EfficiencyRun[]) => (list.length ? list.reduce((s, p) => s + p.ef, 0) / list.length : null);
  const recent = easy.filter((p) => within(p, last - EF_TREND_DAYS * DAY, last));
  const long = points.filter((p) => p.decoupling !== null);
  const lastLong = long.slice(-5).map((p) => p.decoupling!).sort((a, b) => a - b);
  return {
    ef: mean(recent), before: mean(easy.filter((p) => within(p, last - 2 * EF_TREND_DAYS * DAY, last - EF_TREND_DAYS * DAY))), easyRuns: recent.length,
    decoupling: lastLong.length ? lastLong[Math.floor(lastLong.length / 2)] : null, longRuns: lastLong.length,
    longRuns90: long.filter((p) => within(p, last - MARKER_DAYS * DAY, last)).length,
  };
}

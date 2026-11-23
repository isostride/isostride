import type { IndexedRun } from '@/lib/kernel';

/**
 * The training log of the Runs screen ("moze kalendarz ?", "statystyki na tydzien ?"): the runs
 * grouped into weeks, Monday to Sunday, newest first, each with its days and its totals.
 */

export interface LogDay {
  /** YYYY-MM-DD, the runner's local day */
  date: string;
  runs: IndexedRun[];
}

export interface LogWeek {
  /** YYYY-MM-DD, its Monday */
  start: string;
  days: LogDay[];
  count: number;
  /** m */
  distance: number;
  /** s, timer time */
  duration: number;
  /** bpm, weighted by time over the runs with a heart rate; null with none */
  heartRate: number | null;
  /** the week holding `today` */
  current: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A local day at noon, safe from the hours a daylight-saving change moves. */
const noon = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12); };

/** The runner's local day of a moment. */
export const localDay = (iso: string) => ymd(new Date(iso));

/** The day `n` days after `day`. */
export function addDays(day: string, n: number): string {
  const d = noon(day);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** The Monday of the week of a day. */
export function mondayOf(day: string): string {
  return addDays(day, -((noon(day).getDay() + 6) % 7));
}

/**
 * The weeks from the one holding the latest run (or `today`, if later) back to the one holding
 * the first, newest first, the weeks with no run kept, so that a gap shows.
 */
export function weeksOf(runs: IndexedRun[], today: string = ymd(new Date())): LogWeek[] {
  if (!runs.length) return [];
  const byDay = new Map<string, IndexedRun[]>();
  for (const r of runs) {
    const d = localDay(r.startTime);
    byDay.set(d, [...(byDay.get(d) ?? []), r].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  }
  const days = [...byDay.keys()].sort();
  const thisWeek = mondayOf(today);
  const last = mondayOf(days[days.length - 1]);
  const first = mondayOf(days[0]);
  const weeks: LogWeek[] = [];
  for (let start = thisWeek > last ? thisWeek : last; start >= first; start = addDays(start, -7)) {
    const ds = Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); return { date, runs: byDay.get(date) ?? [] }; });
    const all = ds.flatMap((d) => d.runs);
    const withHr = all.filter((r) => r.avgHeartRate);
    const hrTime = withHr.reduce((a, r) => a + r.duration, 0);
    weeks.push({
      start, days: ds, count: all.length,
      distance: all.reduce((a, r) => a + r.distance, 0),
      duration: all.reduce((a, r) => a + r.duration, 0),
      heartRate: hrTime ? withHr.reduce((a, r) => a + r.avgHeartRate! * r.duration, 0) / hrTime : null,
      current: start === thisWeek,
    });
  }
  return weeks;
}

/** The ISO number of the week starting on a Monday: the week holding the year's first Thursday is 1. */
export function isoWeek(monday: string): number {
  const thursday = noon(addDays(monday, 3));
  const jan1 = new Date(thursday.getFullYear(), 0, 1, 12);
  return Math.floor(Math.round((thursday.getTime() - jan1.getTime()) / 86400000) / 7) + 1;
}

export interface LogMonth {
  /** YYYY-MM */
  month: string;
  /** its weeks, newest first: those whose Thursday falls in it */
  weeks: LogWeek[];
  /** the totals of the runs dated in it */
  count: number;
  distance: number;
  duration: number;
}

/**
 * The weeks grouped by month ("miesiac pokazuj lepiej na kalnaderzu ... pogrupowac wiersze"): a week
 * across two months goes with the month of its Thursday (holding most of its days, as ISO weeks are
 * counted); a month's totals are those of the runs dated in it.
 */
export function monthsOf(weeks: LogWeek[]): LogMonth[] {
  const months: LogMonth[] = [];
  for (const w of weeks) {
    const month = addDays(w.start, 3).slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.month !== month) { m = { month, weeks: [], count: 0, distance: 0, duration: 0 }; months.push(m); }
    m.weeks.push(w);
  }
  // The runs dated in a month, wherever their week went.
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const d of weeks.flatMap((w) => w.days)) {
    const m = byMonth.get(d.date.slice(0, 7));
    if (!m) continue;
    for (const r of d.runs) { m.count++; m.distance += r.distance; m.duration += r.duration; }
  }
  return months;
}

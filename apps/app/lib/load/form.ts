import { dayOf } from '@/lib/gear';

/**
 * Fitness, fatigue and form over time (requirement "Form over time", ADR "Load and form models"):
 * Banister's impulse–response model as exponentially weighted averages of the daily load
 * (Banister 1975; the Performance Manager of Coggan), and the acute:chronic load ratio.
 */

export interface FormDay {
  /** YYYY-MM-DD, the runner's local day */
  date: string;
  /** the load of the day's runs */
  load: number;
  /** fitness (CTL) at the end of the day */
  fitness: number;
  /** fatigue (ATL) at the end of the day */
  fatigue: number;
  /** form (TSB) in the morning: fitness − fatigue of the day before */
  form: number;
  /** acute:chronic ratio at the end of the day: 7- over 28-day averages; null before 28 days of data */
  acwr: number | null;
}

/** The acute and chronic windows of the ratio, days (Williams et al. 2017: exponentially weighted). */
export const ACWR_DAYS: [number, number] = [7, 28];

const next = (day: string) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + 1); return dayOf(d.toISOString()); };

/** The daily series from the first run's day to `until` (a day, default the last run's), every day present. */
export function formSeries(runs: { startTime: string; load: number }[], p: { fitnessDays: number; fatigueDays: number }, until?: string): FormDay[] {
  if (!runs.length) return [];
  const perDay = new Map<string, number>();
  for (const r of runs) { const d = dayOf(r.startTime); perDay.set(d, (perDay.get(d) ?? 0) + r.load); }
  const days = [...perDay.keys()].sort();
  const last = until && until > days[days.length - 1] ? until : days[days.length - 1];
  const k = (tau: number) => 1 - Math.exp(-1 / tau);
  const [kf, ka, k7, k28] = [k(p.fitnessDays), k(p.fatigueDays), k(ACWR_DAYS[0]), k(ACWR_DAYS[1])];
  const out: FormDay[] = [];
  let fitness = 0;
  let fatigue = 0;
  let acute = 0;
  let chronic = 0;
  let n = 0;
  for (let day = days[0]; day <= last; day = next(day)) {
    const load = perDay.get(day) ?? 0;
    const form = fitness - fatigue;
    fitness += (load - fitness) * kf;
    fatigue += (load - fatigue) * ka;
    acute += (load - acute) * k7;
    chronic += (load - chronic) * k28;
    n++;
    const r = (x: number) => Math.round(x * 10) / 10;
    out.push({ date: day, load: r(load), fitness: r(fitness), fatigue: r(fatigue), form: r(form), acwr: n >= ACWR_DAYS[1] && chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null });
  }
  return out;
}

/** The context's day layer: the load of the 3 and 7 days before each day, and its form. */
export function dayLoads(runs: { startTime: string; load: number }[], p: { fitnessDays: number; fatigueDays: number }): Record<string, { load3: number; load7: number; form: number }> {
  const series = formSeries(runs, p);
  const out: Record<string, { load3: number; load7: number; form: number }> = {};
  series.forEach((d, i) => {
    const before = (n: number) => series.slice(Math.max(0, i - n), i).reduce((s, x) => s + x.load, 0);
    out[d.date] = { load3: Math.round(before(3)), load7: Math.round(before(7)), form: Math.round(d.form) };
  });
  return out;
}

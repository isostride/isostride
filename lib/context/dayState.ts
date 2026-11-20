import { dayOf } from '@/lib/gear';

/**
 * The state of one day, from the runner's own runs only (spec F6, without the
 * dropped "days since the last hard session").
 *
 * Load is the run's load by the model chosen in Settings (requirement "Load of the model in the
 * context"); the moving time of the runs, in minutes, for a run with none.
 */
export interface DayState {
  date: string;
  /** load from the 3 days before this date */
  load3: number;
  /** load from the 7 days before this date */
  load7: number;
  /** fitness − fatigue in the morning of this date */
  form: number;
}

export interface LoadInput {
  startTime: string;
  /** timer time, s */
  duration: number;
  /** the run's load by the model of Settings, when computed */
  load?: number | null;
}

export function runLoad(run: LoadInput): number {
  return run.load ?? run.duration / 60;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayOf(d.toISOString());
}

/** Day states for every day that has a run, plus any extra days asked for. */
export function computeDayStates(runs: LoadInput[], extraDays: string[] = [], forms?: Record<string, number>): Record<string, DayState> {
  const perDay = new Map<string, number>();
  for (const r of runs) {
    const d = dayOf(r.startTime);
    perDay.set(d, (perDay.get(d) ?? 0) + runLoad(r));
  }
  const days = new Set([...perDay.keys(), ...extraDays]);
  const out: Record<string, DayState> = {};
  for (const day of [...days].sort()) {
    let load3 = 0;
    let load7 = 0;
    for (let k = 1; k <= 7; k++) {
      const v = perDay.get(addDays(day, -k)) ?? 0;
      load7 += v;
      if (k <= 3) load3 += v;
    }
    out[day] = { date: day, load3: Math.round(load3), load7: Math.round(load7), form: forms?.[day] ?? 0 };
  }
  return out;
}

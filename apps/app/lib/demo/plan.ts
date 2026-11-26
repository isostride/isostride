import { rng, type Rng } from './random';
import { CLIMB, HILL_LOOP, hillLegs, laps, outAndBack, parkLegs, type Leg } from './routes';
import { PEAK_PACE, SEASON_WEEKS, STORY_WEEKS, allOutSpeed, allOutTime, dPrime, nominalPace, plannedLoad } from './runner';
import { WORDS, type DemoLang, type Words } from './words';

/**
 * The training of the demo runner, day by day: what was run on each day of the two years of the story,
 * told the way a club runner trains. A week has easy runs, a session of repetitions on Tuesday, a tempo
 * on Thursday, a rest day and a long run; the seasons go from a break through a base with hills, a
 * build towards road races, a track season and an autumn on the road, with races, a week of holidays, a
 * cold, a strained calf and a flu on the way. A day is planned from its date alone (a seeded
 * generator), so the plan is the same whenever it is made, and cheap: no run is generated here.
 */

export type WorkoutKind = 'easy' | 'long' | 'tempo' | 'intervals' | 'hills' | 'race' | 'test';
/** How the pace goes inside a part of a run (record.ts). */
export type PartKind = 'easy' | 'steady' | 'rep' | 'jog' | 'race' | 'stride' | 'float';

/** A part of a run: so many metres or seconds at a share of the critical speed. */
export interface Part {
  metres?: number;
  seconds?: number;
  share: number;
  kind: PartKind;
  /** the lap button pressed at its end */
  lap?: boolean;
}

export type ShoeId = `g-daily-${number}` | 'g-tempo-1' | 'g-tempo-2' | 'g-tempo-3' | 'g-race';

export interface PlannedRun {
  /** the local calendar day, counted from 1 Jan 1970 */
  day: number;
  /** the week of the story, with the day as its fraction */
  week: number;
  /** the runner's critical speed that day, m/s */
  cs: number;
  start: Date;
  /** the run's id, as an import gives it: its start in UTC, yyyymmdd-hhmmss */
  id: string;
  /** its FIT file in the folder */
  file: string;
  kind: WorkoutKind;
  title: string | null;
  note: string | null;
  /** run with the technique cue in mind */
  cue: boolean;
  /** the shoes worn in place of the everyday ones of that date */
  shoes: ShoeId | null;
  /** the heart rate from a chest strap (from the wrist before the runner had one) */
  strap: boolean;
  /** the way run; null on a treadmill */
  legs: Leg[] | null;
  parts: Part[];
  /** a lap each kilometre */
  autoLap: boolean;
  /** stops on the way (a crossing, a shoelace) */
  stops: number;
  /** °C warmer than at home (the holidays) */
  warmer: number;
  /** the run ends where the distance planned ends, back at its start */
  home: boolean;
  /** the seed of its samples */
  seed: number;
  /** how long it takes, about, s */
  estimate: number;
}

const DAY_MS = 86_400_000;
/** The local calendar day of a time, counted from 1 Jan 1970. */
export const dayNumber = (d: Date): number => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
/** A local time on a calendar day. */
export function dateOfDay(day: number, hours = 0, minutes = 0): Date {
  const u = new Date(day * DAY_MS);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), hours, minutes, 0);
}
/** YYYY-MM-DD of a calendar day. */
export const isoDay = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);
const weekOf = (day: number) => Math.floor((day + 3) / 7);
/** 0 Monday … 6 Sunday */
const weekdayOf = (day: number) => (((day + 3) % 7) + 7) % 7;
/** The week of the story a day is in: the last one (STORY_WEEKS − 1) is the week the demo was opened in. */
export const storyWeek = (day: number, anchor: number): number => STORY_WEEKS - 1 + weekOf(day) - weekOf(anchor);
/** The Monday the story starts on. */
export const firstDay = (anchor: number): number => (weekOf(anchor) - (STORY_WEEKS - 1)) * 7 - 3;
/** The Monday of a week of the story. */
export const mondayOf = (week: number, anchor: number): number => firstDay(anchor) + week * 7;

interface Race { metres: number; day: 5 | 6; where: 'track' | 'road'; trial?: boolean }
const HALF = 21097.5;
/** The races, by the week of the story: on the road in spring and autumn, on the track in summer. */
export const RACES: Record<number, Race> = {
  13: { metres: 3000, day: 5, where: 'track', trial: true }, 18: { metres: 10000, day: 6, where: 'road' }, 22: { metres: 5000, day: 5, where: 'road' }, 25: { metres: HALF, day: 6, where: 'road' },
  30: { metres: 1500, day: 5, where: 'track' }, 32: { metres: 800, day: 5, where: 'track' }, 34: { metres: 3000, day: 5, where: 'track' }, 36: { metres: 5000, day: 5, where: 'track' }, 38: { metres: 1500, day: 5, where: 'track' },
  44: { metres: 10000, day: 6, where: 'road' }, 48: { metres: HALF, day: 6, where: 'road' }, 50: { metres: 5000, day: 5, where: 'road' },
  65: { metres: 3000, day: 5, where: 'track', trial: true }, 71: { metres: 10000, day: 6, where: 'road' }, 74: { metres: 5000, day: 5, where: 'road' }, 77: { metres: HALF, day: 6, where: 'road' },
  83: { metres: 1500, day: 5, where: 'track' }, 84: { metres: 800, day: 5, where: 'track' }, 86: { metres: 3000, day: 5, where: 'track' }, 88: { metres: 5000, day: 5, where: 'track' }, 90: { metres: 1500, day: 5, where: 'track' },
  92: { metres: 800, day: 5, where: 'track' }, 96: { metres: 10000, day: 6, where: 'road' }, 98: { metres: 5000, day: 5, where: 'road' }, 100: { metres: HALF, day: 6, where: 'road' }, 102: { metres: 5000, day: 5, where: 'road' },
};

/**
 * The weeks of a test of the critical speed, on Tuesday in place of the session, the first on the first
 * Tuesday of the story (a runner new to the app tests where they stand): 3 minutes and 12 minutes
 * all-out, every three months or so. They give the bests of short lengths the races do not (a race
 * gives the best of its own length), so the curve fitted to the bests of 90 days has both its ends; two
 * in the last weeks, so that neither alone decides the D′ of today.
 */
const TESTS = [0, 7, 15, 28, 41, 54, 66, 80, 95, 99];

/** The weeks training stopped or nearly: a cold, a strained calf (and the way back), a flu. */
const COLD = 9;
const CALF = [57, 58, 59, 60];
const FLU = 67;
/** The runner got a chest strap in this week; the heart rate comes from the wrist before. */
export const STRAP_FROM = 10;
/** The weeks of the technique cue: every other easy run with it in mind. */
export const CUE_WEEKS: [number, number] = [84, 95];
/** The everyday shoes last this many weeks; the list of gear follows from it. */
export const DAILY_SHOES_WEEKS = 16;
/** The weeks each pair of faster shoes came in: the second pair of sessions' shoes, the third (worn in turn with the second from then on), the racing pair. */
export const SHOES_FROM = { tempo2: 44, tempo3: 78, race: 18 };

type Phase = 'off' | 'return' | 'base' | 'build' | 'recover' | 'holiday' | 'track' | 'autumn';
function phaseOf(week: number): Phase {
  if (week === 0) return 'return';
  const m = ((week % SEASON_WEEKS) + SEASON_WEEKS) % SEASON_WEEKS;
  if (m === 0) return 'off';
  if (m === 1) return 'return';
  if (m <= 13) return 'base';
  if (m <= 25) return 'build';
  if (m === 26) return 'recover';
  if (m === 27) return 'holiday';
  return m <= 39 ? 'track' : 'autumn';
}

/** How far through the story a week is, 0 to 1: the training grows with it. */
const progress = (week: number) => Math.min(1, Math.max(0, week / (STORY_WEEKS - 1)));

/** How much is run in a week against a full one: more as the two years go (from two thirds), less in the base's first weeks, every fourth week and before a race. */
function volume(week: number): number {
  const phase = phaseOf(week);
  const m = week % SEASON_WEEKS;
  let v = phase === 'base' ? 0.85 + (0.2 * (m - 2)) / 11 : phase === 'build' || phase === 'autumn' ? 1 : phase === 'track' ? 0.92 : 0.8;
  if (week % 4 === 3) v *= 0.85;
  if (RACES[week]) v *= 0.85;
  return v * (0.66 + 0.36 * progress(week));
}

/** An even number of km, 6 at least: the loops of the park make it. */
const even = (km: number) => Math.max(6, 2 * Math.round(km / 2));
const isWinter = (day: number) => { const m = new Date(day * DAY_MS).getUTCMonth(); return m === 11 || m <= 1; };

type Draft = Pick<PlannedRun, 'kind' | 'title' | 'legs' | 'parts' | 'autoLap'> & Partial<Pick<PlannedRun, 'note' | 'shoes' | 'stops' | 'warmer' | 'home' | 'cue'>> & { hour: number; minute: number };

const WARM_UP: Part = { seconds: 900, share: 0.7, kind: 'easy', lap: true };
const COOL_DOWN: Part = { seconds: 600, share: 0.68, kind: 'easy', lap: true };

/** n repetitions with their recoveries; the last one a little faster, as runners do. */
function reps(r: Rng, n: number, work: { metres?: number; seconds?: number; share: number }, rest: { metres?: number; seconds?: number; share: number; kind?: PartKind }): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ ...work, share: work.share * (i === n - 1 ? 1.015 : 1), kind: 'rep', lap: true });
    out.push({ ...rest, ...(rest.seconds ? { seconds: Math.round(rest.seconds * (0.9 + 0.25 * r.next())) } : {}), kind: rest.kind ?? 'jog', lap: true });
  }
  return out;
}

/** Strides: 20 s accelerations with an easy minute between. */
const strides = (n: number): Part[] => Array.from({ length: n }, () => [{ seconds: 20, share: 1.28, kind: 'stride' as const }, { seconds: 65, share: 0.62, kind: 'float' as const }]).flat();
/** What strides add to a run, about, m. */
const STRIDE_METRES = 340;

/** What a part covers, about, m, at a critical speed. */
const metresOf = (p: Part, cs: number) => p.metres ?? p.seconds! * p.share * cs;

/** The day's run as planned for a critical speed (m/s), or null on a day off. */
function draftOf(day: number, week: number, weekday: number, r: Rng, w: Words, cs: number): Draft | null {
  const phase = phaseOf(week);
  const race = RACES[week];
  const before = RACES[week - 1];
  const vol = volume(week);
  const reserve = dPrime(week);
  /** The sessions grow with the two years too: three quarters of their repetitions and minutes at the start. */
  const grown = (n: number) => Math.max(2, Math.round(n * (0.75 + 0.25 * progress(week))));
  const minutesOf = (m: number) => 5 * Math.round((m * (0.75 + 0.25 * progress(week))) / 5);
  const morning = { hour: 6, minute: 10 + r.int(0, 70) };
  const evening = { hour: 17, minute: 30 + r.int(0, 50) };
  const weekend = { hour: 8, minute: r.int(0, 80) };

  const easy = (km: number, o: { strides?: number; share?: number; cue?: boolean; when?: { hour: number; minute: number } } = {}): Draft => {
    const indoor = isWinter(day) && !o.strides && r.chance(0.12);
    const share = (o.share ?? 0.73) + r.gauss() * 0.012;
    const extra = r.int(0, 3) * 100;
    const parts: Part[] = o.strides
      ? [{ metres: km * 1000 - o.strides * STRIDE_METRES - 500, share, kind: 'easy' }, ...strides(o.strides), { metres: 500 + extra, share, kind: 'easy' }]
      : [{ metres: km * 1000 + extra, share, kind: 'easy' }];
    return { kind: 'easy', title: null, legs: indoor ? null : parkLegs(km, r.chance(0.5)), parts, autoLap: true, stops: indoor ? 0 : r.chance(0.3) ? r.int(1, 2) : 0, cue: o.cue, ...(o.when ?? (weekday >= 5 ? weekend : morning)) };
  };
  /** An easy run of the holidays: along the promenade and back. */
  const away = (km: number, n = 0): Draft => ({ ...easy(km, { strides: n }), legs: outAndBack('promenade', km * 1000), warmer: 9, home: true, hour: 7, minute: 30 + r.int(0, 60) });

  const long = (km: number): Draft => {
    const share = 0.745 + r.gauss() * 0.01;
    const m = week % SEASON_WEEKS;
    let parts: Part[] = [{ metres: km * 1000 + r.int(0, 4) * 100, share, kind: 'steady' }];
    let title: string | null = null;
    if ((phase === 'build' || phase === 'autumn') && m % 4 === 1 && km >= 20) {
      parts = [{ metres: (km - 5) * 1000, share, kind: 'steady' }, { metres: 5000, share: 0.9, kind: 'steady', lap: true }];
      title = w.longFast;
    } else if (phase === 'autumn' && m % 4 === 2 && km >= 22) {
      parts = [{ metres: 8000, share, kind: 'steady' }, ...[0, 1, 2].flatMap((): Part[] => [{ metres: 3000, share: 0.935, kind: 'steady', lap: true }, { metres: 1000, share: 0.72, kind: 'easy', lap: true }]), { metres: (km - 20) * 1000, share: 0.72, kind: 'easy' }];
      title = w.longBlocks;
    }
    const river = week % 2 === 0;
    return { kind: 'long', title, legs: river ? outAndBack('river', km * 1000) : parkLegs(km, r.chance(0.5)), parts, autoLap: true, stops: r.chance(0.5) ? 1 : 0, home: river, ...weekend };
  };

  /** The shoes of the sessions: a pair after another, the two last worn in turn. */
  const fast: ShoeId = week < SHOES_FROM.tempo2 ? 'g-tempo-1' : week < SHOES_FROM.tempo3 ? 'g-tempo-2' : (week + (weekday === 1 ? 0 : 1)) % 2 ? 'g-tempo-2' : 'g-tempo-3';
  const onTrack = (title: string, main: Part[]): Draft => ({ kind: 'intervals', title, legs: [laps('track', 200)], parts: [WARM_UP, ...main, COOL_DOWN], autoLap: false, shoes: fast, ...evening });
  const kilometres = (n: number, share: number, rest = 120) => onTrack(w.reps(n, '1 km'), reps(r, n, { metres: 1000, share }, { seconds: rest, share: 0.55 }));
  const oneMore = (n: number) => grown(n) + (r.chance(0.25) ? (r.chance(0.5) ? -1 : 1) : 0);

  /** The test of the critical speed: 3 minutes all-out, a long easy jog, 12 minutes all-out. */
  const test = (): Draft => ({
    kind: 'test', title: w.test, legs: [laps('track', 200)], autoLap: false, shoes: fast, ...evening,
    parts: [WARM_UP, ...strides(3), { seconds: 180, share: 0.5, kind: 'float', lap: true }, { seconds: 180, share: allOutSpeed(180, cs, reserve) / cs, kind: 'race', lap: true }, { seconds: 1500, share: 0.6, kind: 'easy', lap: true }, { seconds: 720, share: allOutSpeed(720, cs, reserve) / cs, kind: 'race', lap: true }, COOL_DOWN],
  });

  const session = (): Draft => {
    const k = week % 3;
    if (TESTS.includes(week)) return test();
    // Before a race: a short session, then fast 400s and 200s to sharpen (the runner's bests of a minute and of half a minute come from them).
    if (race) {
      const fast = (metres: number, seconds: number) => ({ metres, share: (0.96 * allOutSpeed(seconds, cs, reserve)) / cs });
      return onTrack(`${w.reps(2, '1 km')}, ${w.reps(2, '400 m')}, ${w.reps(4, '200 m')}`, [...reps(r, 2, { metres: 1000, share: 1.045 }, { seconds: 120, share: 0.55 }), ...reps(r, 2, fast(400, 59), { seconds: 180, share: 0.5 }), ...reps(r, 4, fast(200, 28), { seconds: 150, share: 0.5 })]);
    }
    if (phase === 'base') {
      if (k === 0) {
        const n = grown(r.int(8, 10));
        return { kind: 'hills', title: w.hills(n, CLIMB), legs: hillLegs(2, n), parts: [{ metres: 2 * HILL_LOOP, share: 0.7, kind: 'easy', lap: true }, ...reps(r, n, { metres: CLIMB, share: 1 }, { metres: CLIMB, share: 0.5 }), { metres: 2 * HILL_LOOP, share: 0.68, kind: 'easy', lap: true }], autoLap: false, ...evening };
      }
      if (k === 1) {
        const n = grown(r.int(7, 9));
        return { kind: 'intervals', title: w.fartlek(n), legs: [laps('perimeter', 6)], parts: [WARM_UP, ...reps(r, n, { seconds: 120, share: 1 }, { seconds: 60, share: 0.78, kind: 'float' }), COOL_DOWN], autoLap: false, shoes: fast, ...evening };
      }
      return kilometres(grown(5), 1.035);
    }
    if (phase === 'build') {
      if (k === 0) return kilometres(oneMore(6), 1.055);
      if (k === 1) { const n = grown(5); return onTrack(w.reps(n, '1200 m'), reps(r, n, { metres: 1200, share: 1.045 }, { seconds: 150, share: 0.55 })); }
      const n = grown(4);
      return onTrack(w.reps(n, '1600 m'), reps(r, n, { metres: 1600, share: 1.03 }, { seconds: 180, share: 0.55 }));
    }
    if (phase === 'track') {
      if (k === 0) return kilometres(oneMore(5), 1.06, 150);
      if (k === 1) { const n = oneMore(11); return onTrack(w.reps(n, '400 m'), reps(r, n, { metres: 400, share: 1.13 }, { seconds: 75, share: 0.5 })); }
      const n = grown(6);
      return onTrack(w.reps(n, '800 m'), reps(r, n, { metres: 800, share: 1.09 }, { seconds: 120, share: 0.52 }));
    }
    if (k === 0) return kilometres(oneMore(6), 1.055);
    if (k === 1) { const n = grown(4); return onTrack(w.reps(n, '2 km'), reps(r, n, { metres: 2000, share: 1.02 }, { seconds: 150, share: 0.55 })); }
    const n = grown(3);
    return onTrack(w.reps(n, '3 km'), reps(r, n, { metres: 3000, share: 1 }, { seconds: 180, share: 0.55 }));
  };

  const tempo = (): Draft => {
    let title: string; let main: Part[];
    if (phase === 'base' || before?.metres === HALF) {
      const minutes = minutesOf(before ? 25 : 30 + 5 * (week % 3));
      title = w.steady(minutes);
      main = [{ seconds: minutes * 60, share: 0.9, kind: 'steady', lap: true }];
    } else if (week % 2) {
      title = w.reps(3, '10 min');
      main = reps(r, 3, { seconds: 600, share: 0.985 }, { seconds: 120, share: 0.6 });
    } else {
      const minutes = minutesOf(20 + 5 * (week % 3));
      title = w.tempo(minutes);
      main = [{ seconds: minutes * 60, share: 0.955, kind: 'steady', lap: true }];
    }
    const parts = [WARM_UP, ...main, COOL_DOWN];
    const river = week % 4 < 2;
    const total = parts.reduce((a, p) => a + metresOf(p, cs), 0);
    return { kind: 'tempo', title, legs: river ? outAndBack('river', total) : [laps('perimeter', 4)], parts, autoLap: false, shoes: fast, home: river, ...evening };
  };

  const racing = (x: Race): Draft => {
    const share = x.metres / allOutTime(x.metres, cs, reserve) / cs;
    const parts: Part[] = [{ seconds: 720, share: 0.7, kind: 'easy', lap: true }, ...strides(4), { seconds: 240, share: 0.5, kind: 'float', lap: true }, { metres: x.metres, share, kind: 'race', lap: true }, { seconds: 480, share: 0.66, kind: 'easy', lap: true }];
    const total = parts.reduce((a, p) => a + metresOf(p, cs), 0);
    const legs = x.where === 'track' ? [laps('track', 300)] : x.metres <= 5000 ? [laps('perimeter', 3)] : outAndBack('river', total);
    const title = x.trial ? w.trial(x.metres) : x.where === 'track' ? w.trackRace(x.metres) : x.metres === HALF ? w.half : w.roadRace(x.metres / 1000);
    return { kind: 'race', title, note: w.notes[week] ?? null, legs, parts, autoLap: x.where === 'road', shoes: week >= SHOES_FROM.race ? 'g-race' : fast, home: x.where === 'road' && x.metres > 5000, hour: x.where === 'track' ? 17 : 10, minute: x.where === 'track' ? 30 : 0 };
  };

  // The weeks out of the ordinary.
  if (week === 0 && weekday === 1) return test();
  if (week === COLD) return weekday === 3 || weekday === 5 ? { ...easy(6, { share: 0.7 }), note: weekday === 3 ? w.notes[COLD] ?? null : null } : null;
  if (week === CALF[0] && weekday > 1) return null;
  if (week === CALF[1]) return null;
  if (week === CALF[2]) return weekday === 2 || weekday === 4 || weekday === 6 ? { ...easy(6, { share: 0.69 }), note: weekday === 2 ? w.notes[CALF[2]] ?? null : null } : null;
  if (week === CALF[3]) return weekday === 4 ? null : easy(weekday === 6 ? 14 : 8, { share: 0.71 });
  if (week === FLU) return weekday >= 5 ? easy(6, { share: 0.69 }) : null;
  if (phase === 'off') return weekday === 6 ? easy(6, { share: 0.7 }) : null;
  if (phase === 'return') return [1, 3, 5, 6].includes(weekday) ? easy(8, { share: 0.71 }) : null;
  if (phase === 'holiday') return weekday === 0 || weekday === 3 ? null : weekday === 6 ? away(16) : away(weekday === 4 ? 8 : 10, weekday === 4 ? 4 : 0);
  if (phase === 'recover') return weekday === 2 || weekday === 4 ? null : weekday === 6 ? long(16) : easy(weekday === 3 ? 10 : 8, { strides: weekday === 1 || weekday === 5 ? 5 : 0 });

  const cueWeek = week >= CUE_WEEKS[0] && week <= CUE_WEEKS[1];
  const skipped = r.chance(0.05);
  switch (weekday) {
    case 0:
      if (before?.day === 6) return before.metres === HALF ? null : easy(8, { share: 0.7 });
      return skipped ? null : easy(even(11 * vol), { strides: phase !== 'base' && r.chance(0.25) ? 5 : 0, cue: cueWeek });
    case 1:
      return before?.metres === HALF ? easy(10) : session();
    case 2:
      return skipped ? null : easy(even(10 * vol));
    case 3:
      return race ? easy(8, { strides: 5, when: evening }) : tempo();
    case 4:
      return week >= SEASON_WEEKS && !race && (phase === 'build' || phase === 'autumn') && r.chance(0.15) ? easy(6, { share: 0.69 }) : null;
    case 5:
      if (race?.day === 5) return racing(race);
      if (race?.day === 6) return easy(6, { strides: 4 });
      return skipped ? null : easy(even(9 * vol), { strides: r.chance(0.5) ? 5 : 0, cue: cueWeek });
    default: {
      if (race?.day === 6) return racing(race);
      if (race?.day === 5) return easy(10, { share: 0.7 });
      const m = week % SEASON_WEEKS;
      const km = phase === 'base' ? 20 + Math.min(8, m - 2) : phase === 'track' ? 20 : 25;
      return long(even(km * (week % 4 === 3 ? 0.85 : 1) * (0.72 + 0.28 * progress(week))));
    }
  }
}

const two = (n: number) => String(n).padStart(2, '0');
const planSeed = (day: number) => day * 7919 + 17;

/** The time constants of fitness and fatigue of the demo runner, days, and what a thousand of each sum of loads is worth, s/km. */
const FITNESS_DAYS = 45;
const FATIGUE_DAYS = 8;
const FITNESS_GAIN = 11;
const FATIGUE_COST = 5;
/** The days after the story the fitness is counted for: a demo opened again is added to for eight weeks. */
const DAYS_AFTER = 70;

/**
 * The critical pace of each day of a demo, s/km, from its first Monday: Banister's impulse–response model
 * on the training planned (performance = p0 + k1·fitness − k2·fatigue, each a sum of the loads before the
 * day, decayed with its time constant), scaled so that the pace on the day of the story's last race is
 * 3:15. So the runner gets faster as the training grows over the two years, loses in a break, a cold or
 * an injury, and is fresh after an easier week; and the response model the app fits to the runner's
 * performances finds what is there. The loads are those of the plan made for an even gain of pace
 * (nominalPace): the plan does not wait for the fitness it makes.
 */
const fitness = new Map<number, Float64Array>();
function paces(anchor: number): Float64Array {
  const kept = fitness.get(anchor);
  if (kept) return kept;
  const first = firstDay(anchor);
  const days = STORY_WEEKS * 7 + DAYS_AFTER;
  const loads = new Float64Array(days);
  for (let i = 0; i < days; i++) {
    const day = first + i;
    const week = storyWeek(day, anchor);
    const cs = 1000 / nominalPace(week);
    const draft = draftOf(day, week, weekdayOf(day), rng(planSeed(day)), WORDS.en, cs);
    for (const p of draft?.parts ?? []) loads[i] += plannedLoad((p.seconds ?? p.metres! / (p.share * cs)) / 60, p.share);
  }
  // The history before the story: the steady state of its first four weeks.
  const seed = loads.subarray(0, 28).reduce((a, b) => a + b, 0) / 28;
  const sums = (tau: number) => {
    const decay = Math.exp(-1 / tau);
    const out = new Float64Array(days);
    out[0] = (seed * decay) / (1 - decay);
    for (let i = 1; i < days; i++) out[i] = decay * (out[i - 1] + loads[i - 1]);
    return out;
  };
  const fit = sums(FITNESS_DAYS);
  const tired = sums(FATIGUE_DAYS);
  // The day of the last race of the story: the Saturday of its last week but one.
  const peak = (STORY_WEEKS - 2) * 7 + 5;
  const pace = new Float64Array(days);
  for (let i = 0; i < days; i++) pace[i] = Math.min(225, Math.max(188, PEAK_PACE + (FITNESS_GAIN * (fit[peak] - fit[i]) - FATIGUE_COST * (tired[peak] - tired[i])) / 1000));
  fitness.set(anchor, pace);
  return pace;
}

/** The critical speed of the demo runner on a calendar day, m/s. */
export function criticalSpeedOn(day: number, anchor: number): number {
  const pace = paces(anchor);
  return 1000 / pace[Math.min(pace.length - 1, Math.max(0, day - firstDay(anchor)))];
}

/** The run of a calendar day in a demo anchored on a day (the day it was first opened), or null on a day off. */
export function planDay(day: number, anchor: number, lang: DemoLang): PlannedRun | null {
  const week = storyWeek(day, anchor);
  const weekday = weekdayOf(day);
  const cs = criticalSpeedOn(day, anchor);
  const draft = draftOf(day, week, weekday, rng(planSeed(day)), WORDS[lang], cs);
  if (!draft) return null;
  const start = dateOfDay(day, draft.hour, draft.minute);
  const at = week + weekday / 7;
  const estimate = draft.parts.reduce((a, p) => a + (p.seconds ?? p.metres! / (p.share * cs)), 0) * 1.04 + (draft.stops ?? 0) * 40;
  const local = `${start.getFullYear()}-${two(start.getMonth() + 1)}-${two(start.getDate())}`;
  return {
    day,
    week: at,
    cs,
    start,
    id: start.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15),
    file: `fit/${local}_${two(start.getHours())}${two(start.getMinutes())}.fit`,
    kind: draft.kind,
    title: draft.title,
    note: draft.note ?? null,
    cue: !!draft.cue,
    shoes: draft.shoes ?? null,
    strap: week >= STRAP_FROM,
    legs: draft.legs,
    parts: draft.parts,
    autoLap: draft.autoLap,
    stops: draft.stops ?? 0,
    warmer: draft.warmer ?? 0,
    home: !!draft.home,
    seed: day * 104_729 + 5,
    estimate,
  };
}

/** How long after a run's end it is in the folder, s: the watch synced. */
const SYNCED_AFTER = 900;

/** Every run of the story up to now, oldest first: from its first Monday to the runs already over. */
export function demoPlan(anchor: number, now: Date, lang: DemoLang): PlannedRun[] {
  const out: PlannedRun[] = [];
  const today = dayNumber(now);
  for (let day = firstDay(anchor); day <= today; day++) {
    const run = planDay(day, anchor, lang);
    if (run && run.start.getTime() + (run.estimate + SYNCED_AFTER) * 1000 <= now.getTime()) out.push(run);
  }
  return out;
}

/**
 * The demo runner (the runner's request of 26 Nov 2026: "demo powinno byc skonstyrowane tak ze pokazuje
 * biegacza .... z tempem krytycznym ok 3:15 .... wszystkie dane powinny byc sensowne"; "fajnie by bylo
 * miec ok 2 lata danych"): a sample athlete (nobody real), two years of training told in weeks of a story that ends
 * the week the demo is opened. Everything a run holds is drawn from these few figures, so the screens
 * agree with each other: the races are run to the critical speed model, the heart rate follows the
 * speed against the critical speed, the power the speed, and the critical speed itself follows the
 * training done (plan.ts), as the fitted response model of the app takes it to.
 */

/** The weeks of the story up to the week the demo is opened in, that week included. */
export const STORY_WEEKS = 104;
/** The weeks of a season: a break, a base, a build, a track season, an autumn on the road. */
export const SEASON_WEEKS = 52;
/** Resting and maximum heart rate, bpm. */
export const HR_REST = 44;
export const HR_MAX = 190;
/** The critical pace on the day of the story's last race, s/km: 3:15. */
export const PEAK_PACE = 195;
/** The share of the heart rate reserve used at the critical speed; under it the share follows the speed. */
export const RESERVE_AT_CS = 0.9;

/** The critical pace a week of the story is planned for, s/km, before the training done is counted: from 3:29 to 3:15, evenly. */
export const nominalPace = (week: number): number => PEAK_PACE + 14 * (1 - Math.min(1, Math.max(0, week / (STORY_WEEKS - 2))));

/** D′ in a week of the story, m: the distance the runner has above the critical speed. */
export const dPrime = (week: number): number => 185 + 20 * Math.min(1, Math.max(0, week / (STORY_WEEKS - 1)));

/** How long the critical speed model holds, s; past it the speed falls as a power of the time. */
const MODEL_UP_TO = 1200;
/** The fall of the speed past 20 minutes: speed ∝ time^−0.065 (a 10 km some 3 % slower than the model gives, a half marathon 8 %). */
const DECLINE = 0.065;

/**
 * Under 3 minutes the critical speed model promises too much (800 m in 1:56 for this runner): there the
 * speed rises as a power of the time from that of 3 minutes, speed ∝ time^−0.1 (800 m in about 2:03,
 * 400 m in about 57 s).
 */
const MODEL_FROM = 180;
const SPRINT = 0.1;

/** The time of an all-out effort over a distance, s, at a critical speed (m/s) and a D′ (m): (d − D′) / CS from 3 to 20 minutes, a power law under and past them. */
export function allOutTime(metres: number, cs: number, reserve: number): number {
  if (metres < cs * MODEL_FROM + reserve) return (metres / ((cs + reserve / MODEL_FROM) * MODEL_FROM ** SPRINT)) ** (1 / (1 - SPRINT));
  if (metres <= cs * MODEL_UP_TO + reserve) return (metres - reserve) / cs;
  const v20 = cs + reserve / MODEL_UP_TO;
  return (metres / (v20 * MODEL_UP_TO ** DECLINE)) ** (1 / (1 - DECLINE));
}

/** The speed of an all-out effort of a length of time, m/s: CS + D′ / t from 3 to 20 minutes, the power laws under and past them. */
export function allOutSpeed(seconds: number, cs: number, reserve: number): number {
  if (seconds < MODEL_FROM) return (cs + reserve / MODEL_FROM) * (MODEL_FROM / seconds) ** SPRINT;
  const v = cs + reserve / Math.min(seconds, MODEL_UP_TO);
  return seconds <= MODEL_UP_TO ? v : v * (seconds / MODEL_UP_TO) ** -DECLINE;
}

/**
 * The load of a stretch of running, as Banister's TRIMP counts it (minutes weighted by the share of the
 * heart rate reserve, exponentially): what the plan takes the training done for.
 */
export function plannedLoad(minutes: number, share: number): number {
  const x = Math.min(1, RESERVE_AT_CS * share);
  return minutes * x * 0.64 * Math.exp(1.92 * x);
}

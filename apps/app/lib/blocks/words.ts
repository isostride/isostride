import { dateText, distanceUnit, elevationUnit, locale, msg, number, paceUnit, t, tn, toDistance, toElevation, toPace } from '@/lib/i18n';

type Vars = Record<string, string | number>;

/**
 * How a segment's name and its rule are put into words (requirement "App in English and Polish"):
 * in English, as the data folder keeps a name the app made (SAVED_WORDS), or in the language in
 * use, as a screen shows it (SHOWN_WORDS). The English text is the key in both.
 */
export interface Words {
  t: (text: string, vars?: Vars) => string;
  tn: (n: number, one: string, other: string, vars?: Vars) => string;
  /** a number; with digits, fixed to them */
  num: (v: number, digits?: number) => string;
  /** a calendar day, YYYY-MM-DD */
  day: (iso: string) => string;
  /** metres in the unit of distance (requirement "Units chosen"): km as kept, km or mi as shown; its unit */
  dist: (m: number) => number;
  distUnit: () => string;
  /** a pace in s/km in seconds per that unit; its unit, /km or /mi */
  pace: (secPerKm: number) => number;
  paceUnit: () => string;
  /** a climb in metres in m as kept, m or ft as shown; its unit */
  elev: (m: number) => number;
  elevUnit: () => string;
}

const fill = (text: string, vars?: Vars): string =>
  vars ? text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all)) : text;

/** English, whatever the language in use: a name the app makes and keeps in the data folder. */
export const SAVED_WORDS: Words = {
  t: fill,
  tn: (n, one, other, vars) => fill(n === 1 ? one : other, { n, ...vars }),
  num: (v, digits) => (digits === undefined ? String(v) : v.toFixed(digits)),
  day: (iso) => iso,
  // Kept in metric whatever the units chosen: a name the app made is found again by these words.
  dist: (m) => m / 1000,
  distUnit: () => 'km',
  pace: (s) => s,
  paceUnit: () => '/km',
  elev: (m) => m,
  elevUnit: () => 'm',
};

/** The language in use: what a screen shows. English shows a day as it is kept (YYYY-MM-DD), as before. */
export const SHOWN_WORDS: Words = {
  t,
  tn,
  num: (v, digits) => number(v, digits),
  day: (iso) => (locale() === 'en' ? iso : dateText(`${iso}T00:00`, { day: 'numeric', month: 'short', year: 'numeric' })),
  dist: toDistance,
  distUnit: distanceUnit,
  pace: toPace,
  paceUnit,
  elev: toElevation,
  elevUnit: elevationUnit,
};

const COMPASS = [msg('north'), msg('northeast'), msg('east'), msg('southeast'), msg('south'), msg('southwest'), msg('west'), msg('northwest')];

/** "5.2 km north-bound": a route by its length and heading. */
export function routeName(length: number, heading: number, w: Words = SAVED_WORDS): string {
  return w.t('{km} {unit} {direction}-bound', { km: w.num(w.dist(length), 1), unit: w.distUnit(), direction: w.t(COMPASS[Math.round(heading / 45) % 8]) });
}

/** "5 min", "2.5 km": a set length of time or distance. */
export function lengthName(kind: 'time' | 'distance', target: number, w: Words = SAVED_WORDS): string {
  return kind === 'time' ? `${w.num(+(target / 60).toFixed(1))} min` : `${w.num(+w.dist(target).toFixed(2))} ${w.distUnit()}`;
}

/** A context value as shown: the watch's own heart rate sensor, "wrist (COROS PACE 4)", in the language in use; any other (a name) as it is. */
// Here, not with the comparisons: the charts every screen's script holds name a source, and with it came the whole of lib/compare.
export function contextValue(v: string): string {
  const wrist = /^wrist \((.*)\)$/.exec(v);
  return wrist ? t('wrist ({device})', { device: wrist[1] }) : v;
}

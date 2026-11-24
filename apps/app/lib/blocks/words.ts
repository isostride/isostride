import { dateText, locale, msg, number, t, tn } from '@/lib/i18n';

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
}

const fill = (text: string, vars?: Vars): string =>
  vars ? text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all)) : text;

/** English, whatever the language in use: a name the app makes and keeps in the data folder. */
export const SAVED_WORDS: Words = {
  t: fill,
  tn: (n, one, other, vars) => fill(n === 1 ? one : other, { n, ...vars }),
  num: (v, digits) => (digits === undefined ? String(v) : v.toFixed(digits)),
  day: (iso) => iso,
};

/** The language in use: what a screen shows. English shows a day as it is kept (YYYY-MM-DD), as before. */
export const SHOWN_WORDS: Words = {
  t,
  tn,
  num: (v, digits) => number(v, digits),
  day: (iso) => (locale() === 'en' ? iso : dateText(`${iso}T00:00`, { day: 'numeric', month: 'short', year: 'numeric' })),
};

const COMPASS = [msg('north'), msg('northeast'), msg('east'), msg('southeast'), msg('south'), msg('southwest'), msg('west'), msg('northwest')];

/** "5.2 km north-bound": a route by its length and heading. */
export function routeName(length: number, heading: number, w: Words = SAVED_WORDS): string {
  return w.t('{km} km {direction}-bound', { km: w.num(length / 1000, 1), direction: w.t(COMPASS[Math.round(heading / 45) % 8]) });
}

/** "5 min", "2.5 km": a set length of time or distance. */
export function lengthName(kind: 'time' | 'distance', target: number, w: Words = SAVED_WORDS): string {
  return kind === 'time' ? `${w.num(+(target / 60).toFixed(1))} min` : `${w.num(+(target / 1000).toFixed(2))} km`;
}

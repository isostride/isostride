/**
 * The languages of the app (the runner's request of 24 Nov 2026: "wersjami jezykowymi .... chce
 * angielski i polski i kolejne w przyszlosci"; requirement "App in English and Polish", ADR
 * "Languages without a library"). The English text is the key: a text written in the code is the
 * English one, and each other language maps it to its own. A language is added by a dictionary
 * like pl/ and a line in LOCALES.
 */
export type Locale = 'en' | 'pl';
export const LOCALES: readonly { key: Locale; name: string; tag: string }[] = [
  { key: 'en', name: 'English', tag: 'en-US' },
  { key: 'pl', name: 'Polski', tag: 'pl-PL' },
];

/** A text's forms by the plural rule of its language (Intl.PluralRules): one, few, many, other. */
export type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Dictionary = Record<string, string | Forms>;
/** A language's dictionary and its parts (a part per area of the app). */
interface Loaded { dictionary: Dictionary; parts: Record<string, Dictionary> }
/**
 * The dictionaries are loaded when their language is chosen, each in a script of its own: the pages carry
 * no dictionary in English, and the one chosen only (requirement "Pages load fast": the budget of a page's scripts).
 */
const LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<Loaded>> = {
  pl: () => import('./pl').then((m) => ({ dictionary: m.PL, parts: m.PL_PARTS })),
};
const loaded: Partial<Record<Locale, Loaded>> = { en: { dictionary: {}, parts: {} } };

/** Loads a language's dictionary once; setLocale needs it loaded. */
export async function loadLocale(l: Locale): Promise<void> {
  if (!loaded[l] && l !== 'en') loaded[l] = await LOADERS[l]();
}

let current: Locale = 'en';
const listeners = new Set<(l: Locale) => void>();

/** The language in use. */
export const locale = (): Locale => current;
/** The BCP 47 tag of the language in use, for Intl (dates, numbers). */
export const localeTag = (l: Locale = current): string => LOCALES.find((x) => x.key === l)!.tag;

export const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.key === v);

/** The language of a browser: the first of its languages the app has, English otherwise. */
export function localeOf(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

/** Sets the language in use; the parts listening (the screens) render again in it. */
export function setLocale(l: Locale): void {
  // i18n-ignore: a mistake of the code, not shown to the runner
  if (!loaded[l]) throw new Error(`The dictionary of ${l} is not loaded: await loadLocale('${l}') first`);
  if (l === current) return;
  current = l;
  for (const f of listeners) f(l);
}

/** Calls back on every change of the language; returns the unsubscribe. */
export function onLocale(f: (l: Locale) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

const fill = (text: string, vars?: Record<string, string | number>): string =>
  vars ? text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all)) : text;

/**
 * A text in the language in use: the English text is the key; {name} takes the value of vars.name.
 * A text with no translation stays English (the check of the texts fails on it).
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const m = loaded[current]!.dictionary[text];
  return fill(m === undefined ? text : typeof m === 'string' ? m : m.other, vars);
}

/**
 * A text with a count in it, in the form its language takes for that count: tn(3, '{n} run', '{n} runs')
 * is "3 runs" in English, "3 biegi" in Polish. The plural English form is the key; {n} is the count,
 * written as a number of the language.
 */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const rule = new Intl.PluralRules(localeTag()).select(n);
  const m = loaded[current]!.dictionary[other];
  const text = m === undefined ? (rule === 'one' ? one : other) : typeof m === 'string' ? m : (m[rule] ?? m.other);
  return fill(text, { n: number(n), ...vars });
}

/**
 * Marks a text to be translated later, where it is shown (a constant's label, a model's name): msg('Pace')
 * is 'Pace', and t(label) shows it in the language in use. The check of the texts reads msg() as a key.
 */
export const msg = <T extends string>(text: T): T => text;

/** A number in the language in use: 5.24 in English, 5,24 in Polish; digits fixed when given. */
export function number(v: number, digits?: number, opts: Intl.NumberFormatOptions = {}): string {
  return formatter(numberFormats, Intl.NumberFormat, {
    useGrouping: false,
    ...(digits === undefined ? { maximumFractionDigits: 20 } : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    ...opts,
  }).format(v);
}

/** A date (or time) in the language in use: options as for toLocaleDateString. */
export function dateText(d: Date | string | number, opts: Intl.DateTimeFormatOptions): string {
  const date = new Date(d);
  // As toLocaleString: a date that is none reads "Invalid Date" (the formatter would throw), no options give the date and the time.
  if (Number.isNaN(date.getTime())) return String(date);
  return formatter<Intl.DateTimeFormatOptions, Intl.DateTimeFormat>(dateFormats, Intl.DateTimeFormat, Object.keys(opts).length ? opts : DATE_AND_TIME).format(date);
}

/**
 * The formatters made so far, by language and options: making one costs tens of µs, and a screen of
 * 500 runs formats thousands of numbers and dates (the review of 24 Nov 2026: "czy nie przeliczasz
 * rzeczy wielokrotnie").
 */
const numberFormats = new Map<string, Intl.NumberFormat>();
/** What toLocaleString shows with no options: the date and the time. */
const DATE_AND_TIME: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
const dateFormats = new Map<string, Intl.DateTimeFormat>();
function formatter<O extends object, F>(made: Map<string, F>, Make: new (tag: string, opts: O) => F, opts: O): F {
  const tag = localeTag();
  const key = `${tag} ${JSON.stringify(opts)}`;
  let f = made.get(key);
  if (!f) made.set(key, (f = new Make(tag, opts)));
  return f;
}

/** The dictionary of a language once loaded, for the check of the texts. */
export const dictionary = (l: Locale): Dictionary => loaded[l]?.dictionary ?? {};

/** The parts of a language's dictionary, for the check that a text has one translation everywhere. */
export const dictionaryParts = (l: Locale): Record<string, Dictionary> => loaded[l]?.parts ?? {};

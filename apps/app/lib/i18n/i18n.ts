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

/** Calls back on every change of the language or of the units; returns the unsubscribe. */
export function onLocale(f: (l: Locale) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * The units a distance, a pace and an elevation are shown and typed in (the runner's request of
 * 27 Nov 2026: "dodaj obsluge innych jednostek mam na mysli mile ... ustawienie oczwicje w languegs &
 * loca..."; requirement "Units chosen"): metric (km, min/km, m) or imperial (mi, min/mi, ft). The data
 * keep metres and s/km whatever is chosen; only what is shown and typed changes. Metric at first.
 */
export type Units = 'metric' | 'imperial';
export const isUnits = (v: unknown): v is Units => v === 'metric' || v === 'imperial';

let currentUnits: Units = 'metric';
/** The units in use. */
export const units = (): Units => currentUnits;
/** Sets the units in use; the parts listening render again in them. */
export function setUnits(u: Units): void {
  if (u === currentUnits) return;
  currentUnits = u;
  for (const f of listeners) f(current);
}
/** The language and the units in use as one key: what a screen is drawn in. */
export const shownKey = (): string => `${current} ${currentUnits}`;

/** A mile and a foot, m. */
export const MILE = 1609.344;
export const FOOT = 0.3048;
/** The metres of one unit of distance shown: 1000 or a mile. */
export const distanceStep = (): number => (currentUnits === 'imperial' ? MILE : 1000);
/** The unit of distance shown: km or mi. */
export const distanceUnit = (): string => (currentUnits === 'imperial' ? 'mi' : 'km');
/** The unit of a pace shown, after its m:ss: /km or /mi. */
export const paceUnit = (): string => `/${distanceUnit()}`;
/** The unit of an elevation shown: m or ft. */
export const elevationUnit = (): string => (currentUnits === 'imperial' ? 'ft' : 'm');
/** Metres in the unit of distance shown (km or mi), and back. */
export const toDistance = (m: number): number => m / distanceStep();
export const fromDistance = (v: number): number => v * distanceStep();
/** A pace in s/km as seconds per the unit shown (s/km or s/mi), and back. */
export const toPace = (secPerKm: number): number => (secPerKm * distanceStep()) / 1000;
export const fromPace = (secPerUnit: number): number => (secPerUnit * 1000) / distanceStep();
/** An elevation in metres in the unit shown (m or ft), and back. */
export const toElevation = (m: number): number => (currentUnits === 'imperial' ? m / FOOT : m);
export const fromElevation = (v: number): number => (currentUnits === 'imperial' ? v * FOOT : v);

/** A distance in metres with its unit: "5.24 km", "3.26 mi"; two decimals unless given. */
export function distanceText(m: number, digits = 2): string {
  return `${number(toDistance(m), digits)} ${distanceUnit()}`;
}
/** An elevation in metres with its unit, whole: "120 m", "394 ft". */
export function elevationText(m: number): string {
  return `${number(Math.round(toElevation(m)))} ${elevationUnit()}`;
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
  // A value that writes as zero is zero: −0.04 to one decimal read "-0.0", and −0 "-0".
  if (digits === undefined ? v === 0 : Math.abs(v) < 0.5 * 10 ** -digits) v = 0;
  return formatter(numberFormats, Intl.NumberFormat, {
    useGrouping: false,
    ...(digits === undefined ? { maximumFractionDigits: 20 } : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    ...opts,
  }).format(v);
}

/** The sign of a number as it is written to `digits` decimals: the minus of print only when it does not write as zero (−0.04 to one decimal is +0.0). */
export const signOf = (v: number, digits = 0): '+' | '−' => (Number(v.toFixed(digits)) < 0 ? '−' : '+');

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

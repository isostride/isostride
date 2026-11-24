import type { IndexedRun } from '@/lib/kernel';
import { LOCALES } from '@/lib/i18n';
import { localDay } from './weeks';

/**
 * The search of the Runs screen ("doloz podstawowe sprawy dotyczace z przesukiwaniem kalendarza i
 * wyszuiwaniem treningow"): words over what is known of a run, a workout type, a distance range.
 */
export interface RunSearch {
  text: string;
  type: string | null;
  /** km, inclusive; null: no bound */
  minKm: number | null;
  maxKm: number | null;
}

export const NO_SEARCH: RunSearch = { text: '', type: null, minKm: null, maxKm: null };

export const isSearching = (s: RunSearch) => s.text.trim() !== '' || s.type !== null || s.minKm !== null || s.maxKm !== null;

/** The names of a day's month and weekday in a language: the month alone and as in a date ("listopad", "24 listopada"), short, the weekday. */
const dayNames = (d: Date, tag: string) => [
  d.toLocaleDateString(tag, { month: 'long' }), d.toLocaleDateString(tag, { day: 'numeric', month: 'long' }),
  d.toLocaleDateString(tag, { month: 'short' }), d.toLocaleDateString(tag, { weekday: 'long' }),
];

/**
 * What the words of a search look through: the run's title, note, tags, gear, watch and its date,
 * its month and weekday named in every language of the app ("november", "listopad", "wtorek").
 */
function haystack(r: IndexedRun): string {
  let text = haystacks.get(r);
  if (text === undefined) haystacks.set(r, (text = haystackOf(r)));
  return text;
}

/** Each run's text, made once (a run read again from the index is a new object, its text made again). */
const haystacks = new WeakMap<IndexedRun, string>();

function haystackOf(r: IndexedRun): string {
  const day = localDay(r.startTime);
  const d = new Date(`${day}T12:00:00`);
  const words = [
    r.title, r.note, r.workoutType, r.techniqueCue, r.shoes, r.device, r.heartRateSource,
    day, ...dayNames(d, 'en-GB'), ...LOCALES.filter((l) => l.key !== 'en').flatMap((l) => dayNames(d, l.tag)), String(d.getFullYear()),
  ];
  return words.filter(Boolean).join(' ').toLowerCase();
}

/** Whether a run matches: every word found, its type the one asked, its distance within the range. */
export function matchesSearch(r: IndexedRun, s: RunSearch): boolean {
  const km = r.distance / 1000;
  if (s.type !== null && r.workoutType !== s.type) return false;
  if (s.minKm !== null && km < s.minKm) return false;
  if (s.maxKm !== null && km > s.maxKm) return false;
  const words = s.text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack(r);
  return words.every((w) => hay.includes(w));
}

const km = (v: string | null) => (v === null || v.trim() === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));

/** The search a link gives (q, type, min, max). */
export function searchFromParams(p: URLSearchParams): RunSearch {
  return { text: p.get('q') ?? '', type: p.get('type') || null, minKm: km(p.get('min')), maxKm: km(p.get('max')) };
}

/** The search written into a link's query, over its other parts. */
export function searchToParams(s: RunSearch, into: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(into);
  for (const [k, v] of [['q', s.text.trim() ? s.text : null], ['type', s.type], ['min', s.minKm === null ? null : String(s.minKm)], ['max', s.maxKm === null ? null : String(s.maxKm)]] as const) {
    if (v === null) p.delete(k); else p.set(k, v);
  }
  return p;
}

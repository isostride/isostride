import { msg, number, t } from '@/lib/i18n';
import { profileSegmentName, routeSegmentName } from './definitions';
import { effortName, patternName, tagName } from './logical';
import { asRule, ruleName, shapeName } from './rule';
import { structureName } from './structure';
import type { BlockParams, Recommendation, Rule, Tolerances } from './types';
import { SAVED_WORDS, SHOWN_WORDS, routeName, type Words } from './words';

/**
 * Names and texts the app made in English and keeps in the data folder (a segment's name, a
 * suggestion's basis, an effort's reasons), shown in the language in use. A name the runner typed
 * stays as it is.
 */

/** The names the app gives a segment of a rule, in the words given; the same order in every language. */
function madeNames(r: Rule, w: Words): string[] {
  const s = r.shape;
  const out = [ruleName(r, w), shapeName(s, w)];
  if (s.type === 'route') {
    const c = r.conditions;
    out.push(routeName(s.length, s.heading, w), routeSegmentName(s.length, s.heading, c.paceMin !== null && c.paceMax !== null ? { paceMin: c.paceMin, paceMax: c.paceMax } : null, w));
  }
  if (s.type === 'lap' && s.planned) out.push(structureName(s.planned.kind, s.planned.target, w));
  if (s.type === 'fastest') out.push(effortName(s.kind, s.target, w));
  if (s.type === 'main' && r.runs.workoutTypes.length === 1) out.push(tagName(r.runs.workoutTypes[0], w));
  if (s.type === 'pattern') out.push(patternName(s.laps, w));
  if (s.type === 'profile') out.push(profileSegmentName(s.key, w));
  return out;
}

/** A segment's name as a screen shows it: one the app made (kept in English) in the language in use, one the runner typed as it is. */
export function shownName(name: string, rule: Rule): string {
  const i = madeNames(rule, SAVED_WORDS).indexOf(name);
  return i < 0 ? name : madeNames(rule, SHOWN_WORDS)[i];
}

/** A suggestion's name as a screen shows it. */
export const shownSuggestionName = (r: Pick<Recommendation, 'name' | 'params' | 'tolerances'>): string => shownName(r.name, asRule(r.params, r.tolerances));

/**
 * Why a segment is suggested: "route passed 6 times in 4 runs; 5 meet the conditions". In English as
 * the suggestions file keeps it, or in the language in use (the default) as a screen shows it.
 */
export function basisOf(r: { params: BlockParams; tolerances: Tolerances; runs: number; instances: number; accepted?: number; basis?: string }, w: Words = SHOWN_WORDS): string {
  const rule = asRule(r.params, r.tolerances);
  const s = rule.shape;
  const found =
    s.type === 'route' ? w.tn(r.runs, 'route passed {passes} times in {n} run', 'route passed {passes} times in {n} runs', { passes: w.num(r.instances) })
    : s.type === 'lap' ? w.tn(r.runs, 'lap found in {n} workout', 'lap found in {n} workouts')
    : s.type === 'fastest' ? w.tn(r.runs, 'effort found in {n} run, on any route', 'effort found in {n} runs, on any route')
    : s.type === 'main' ? w.tn(r.runs, '{n} run tagged {type}', '{n} runs tagged {type}', { type: rule.runs.workoutTypes[0] ?? '' })
    : s.type === 'pattern' ? w.tn(r.runs, 'lap pattern found in {n} run, on any route', 'lap pattern found in {n} runs, on any route')
    : null;
  if (found === null) return r.basis ?? '';
  return r.accepted === undefined ? found : `${found}; ${w.tn(r.accepted, '{n} meets the conditions', '{n} meet the conditions')}`;
}

/** Why an effort was not counted, as the matching writes it (lib/detection): the texts, by their placeholders. */
export const REASONS = {
  standingNeedsFlying: msg('start: standing, the segment needs a flying start'),
  flyingNeedsStanding: msg('start: flying, the segment needs a standing start'),
  pace: msg('pace: {pace} outside {from}–{to}'),
  grade: msg('grade: effort pace differs by {grade}%, limit {limit}%'),
  steadiness: msg('pace steadiness: CV {cv}, limit {limit}'),
  short: msg('effort {seconds} s, minimum {minimum} s'),
  noEffortBefore: msg('effort before it: less than 1 min of data'),
  effortBefore: msg('effort before it: {effort}%, limit {limit}%'),
} as const;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Each reason's text as a pattern, its placeholders the parts read back. */
const PATTERNS = Object.values(REASONS).map((key) => {
  const parts = key.split(/\{(\w+)\}/);
  const names = parts.filter((_, i) => i % 2 === 1);
  return { key, names, re: new RegExp(`^${parts.map((p, i) => (i % 2 ? '(.+?)' : escape(p))).join('')}$`) };
});

/** A reason an effort was not counted, kept in English, in the language in use: its numbers in the language's form. */
export function reasonText(reason: string): string {
  for (const p of PATTERNS) {
    const m = p.re.exec(reason);
    if (!m) continue;
    const vars: Record<string, string> = {};
    p.names.forEach((name, i) => {
      const v = m[i + 1];
      vars[name] = /^-?\d+(\.\d+)?$/.test(v) ? number(Number(v), v.split('.')[1]?.length ?? 0) : v;
    });
    return t(p.key, vars);
  }
  return t(reason);
}

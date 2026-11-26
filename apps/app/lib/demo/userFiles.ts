import { DAILY_SHOES_WEEKS, RACES, SHOES_FROM, STRAP_FROM, firstDay, isoDay, mondayOf, storyWeek, type PlannedRun, type ShoeId } from './plan';
import { HR_MAX, HR_REST, STORY_WEEKS } from './runner';
import { WORDS, type DemoLang } from './words';

/**
 * What the demo runner would have entered in the app, as the files of the folder's user/ hold it: the
 * gear with its dates, the tags of each run, the zones and the load model, a few segments, saved
 * analyses and the Dashboard's tiles. Plain objects in the shapes those files have (lib/gear,
 * lib/settings, lib/blocks, lib/compare, lib/dashboard read them); the tests read them back through
 * those parts.
 */

/** The version of the demo's data: a folder made by another is made again. */
export const DEMO_VERSION = 2;
/** A demo opened again this many days after it was made is made again, ending today; before that, the days since are added to it. */
export const DEMO_KEPT_DAYS = 56;

/** user/demo.json: what marks a folder as the demo, and the day its story is anchored on. */
export interface DemoFile {
  version: number;
  /** the local calendar day the demo was made (counted from 1 Jan 1970): the last week of the story is its week */
  anchor: number;
  lang: DemoLang;
  /** every run of the story up to the day it was last opened is in the folder */
  complete?: boolean;
  /** runs were imported whose segments are still to be found (the earlier history is made in parts, its segments found once at its end) */
  segmentsPending?: boolean;
}

interface GearEntry { id: string; name: string; type: 'shoes' | 'hrSensor'; from: string; to: string | null }

/** The pairs of everyday shoes of the story, one after another. */
const dailyPairs = (weeks: number) => Math.ceil(weeks / DAILY_SHOES_WEEKS);
const dailyShoes = (week: number): ShoeId => `g-daily-${Math.min(dailyPairs(STORY_WEEKS), Math.floor(Math.max(0, week) / DAILY_SHOES_WEEKS) + 1)}`;

/** The gear of the demo runner: the everyday shoes in turn, the pairs for sessions and races, the chest strap. */
export function demoGear(anchor: number, lang: DemoLang): GearEntry[] {
  const w = WORDS[lang].gear;
  const day = (week: number) => isoDay(mondayOf(week, anchor));
  const pairs = dailyPairs(STORY_WEEKS);
  const gear: GearEntry[] = Array.from({ length: pairs }, (_, i) => ({
    id: `g-daily-${i + 1}`, name: w.daily(i + 4), type: 'shoes', from: day(i * DAILY_SHOES_WEEKS), to: i === pairs - 1 ? null : isoDay(mondayOf((i + 1) * DAILY_SHOES_WEEKS, anchor) - 1),
  }));
  gear.push(
    { id: 'g-tempo-1', name: w.tempo(1), type: 'shoes', from: day(0), to: isoDay(mondayOf(SHOES_FROM.tempo2, anchor) - 1) },
    { id: 'g-tempo-2', name: w.tempo(2), type: 'shoes', from: day(SHOES_FROM.tempo2), to: null },
    { id: 'g-tempo-3', name: w.tempo(3), type: 'shoes', from: day(SHOES_FROM.tempo3), to: null },
    { id: 'g-race', name: w.race, type: 'shoes', from: isoDay(mondayOf(SHOES_FROM.race, anchor) + RACES[SHOES_FROM.race].day), to: null },
    { id: 'g-strap', name: w.strap, type: 'hrSensor', from: day(STRAP_FROM), to: null },
  );
  return gear;
}

/** The shoes the app gives a day by the gear's dates (lib/gear: the pair that started last among those in use). */
function shoesByDate(gear: GearEntry[], day: string): string | null {
  const covering = gear.filter((g) => g.type === 'shoes' && g.from <= day && (g.to === null || day <= g.to)).sort((a, b) => b.from.localeCompare(a.from));
  return covering[0]?.id ?? null;
}

interface Tag { title?: string; workoutType?: string; techniqueCue?: string; shoesOverride?: string; note?: string }

/** The tags of the runs given, by run id: the workout type, the title, the note, the cue, and the shoes where the dates give another pair. */
export function demoTags(runs: PlannedRun[], anchor: number, lang: DemoLang): Record<string, Tag> {
  const w = WORDS[lang];
  const gear = demoGear(anchor, lang);
  const tags: Record<string, Tag> = {};
  for (const run of runs) {
    const worn = run.shoes ?? dailyShoes(storyWeek(run.day, anchor));
    tags[run.id] = {
      workoutType: w.types[run.kind],
      ...(run.title ? { title: run.title } : {}),
      ...(run.note ? { note: run.note } : {}),
      ...(run.cue ? { techniqueCue: w.cue } : {}),
      ...(worn !== shoesByDate(gear, isoDay(run.day)) ? { shoesOverride: worn } : {}),
    };
  }
  return tags;
}

const NO_FILTER = { dateFrom: null, dateTo: null, title: '', workoutTypes: [] as string[], techniqueCues: [], shoes: [], heartRateSources: [], devices: [], lapsMin: null, lapsMax: null };
const NO_CONDITIONS = { paceMin: null, paceMax: null, hrMin: null, hrMax: null, distanceMin: null, distanceMax: null, durationMin: null, durationMax: null, alwaysHrMin: null, alwaysHrMax: null, alwaysPaceMin: null, alwaysPaceMax: null, start: 'any' };
const TOLERANCES = { paceMin: null, paceMax: null, gradeMax: 0.04, routeShare: 0.9, routeRadius: 30, cvMax: 0.15, effortBeforeMax: null, hrSkip: null, start: 'any' };

/**
 * The files of user/ of a new demo folder, by their path under it: everything but the runs' tags, which
 * are added as the runs are (demoTags).
 */
export function demoUserFiles(anchor: number, lang: DemoLang, now: Date): Record<string, unknown> {
  const w = WORDS[lang];
  const created = `${isoDay(firstDay(anchor))}T12:00:00.000Z`;
  const block = (id: string, name: string, shape: unknown, extra: { runs?: object; pick?: string; tolerances?: object } = {}) => ({
    id, name, origin: 'manual', status: 'active', createdAt: created,
    params: { type: 'rule', runs: { ...NO_FILTER, ...extra.runs }, shape, conditions: { ...NO_CONDITIONS }, pick: extra.pick ?? 'all', stat: 'avg' },
    tolerances: { ...TOLERANCES, ...extra.tolerances },
  });
  const saved = now.toISOString();
  return {
    'demo.json': { version: DEMO_VERSION, anchor, lang } satisfies DemoFile,
    'gear.json': { gear: demoGear(anchor, lang) },
    'settings.json': {
      schemaVersion: 1,
      zones: { heartRate: [114, 133, 152, 171], speed: [252, 222, 207, 193], cadence: [165, 175, 185], power: [258, 291, 323, 371], groundContactTime: [200, 215, 230, 245], verticalOscillation: [78, 84, 90, 96] },
      performance: { load: 'trimpBanister', curve: 'riegel', restHr: HR_REST, maxHr: HR_MAX, sex: 'male', thresholdPace: null, thresholdPower: null, fitnessDays: 42, fatigueDays: 7, confirmed: true, thresholds: {} },
    },
    'block-definitions.json': { definitions: [
      block('b-demo-10min', w.blocks.tenMinutes, { type: 'fastest', kind: 'time', target: 600, effort: true }, { pick: 'best', tolerances: { hrSkip: 300 } }),
      block('b-demo-1km', w.blocks.kilometres, { type: 'lap', planned: { kind: 'distance', target: 1000, tolerance: 0.03 } }, { runs: { workoutTypes: [w.types.intervals] } }),
      block('b-demo-easy', w.blocks.easy, { type: 'run' }, { runs: { workoutTypes: [w.types.easy] } }),
      block('b-demo-long', w.blocks.long, { type: 'run' }, { runs: { workoutTypes: [w.types.long] } }),
    ] },
    'analyses.json': { analyses: [
      { id: 'an-demo-1km', name: w.analyses.kilometres, query: 'items=b%3Ab-demo-1km%3A0&m=speed%2CheartRate%2CgroundContactTime&tab=trends', savedAt: saved },
      { id: 'an-demo-shoes', name: w.analyses.shoes, query: 'items=b%3Ab-demo-1km%3A0&m=groundContactTime%2Cspeed&tab=ab&ab=b-demo-1km', savedAt: saved },
      { id: 'an-demo-easy', name: w.analyses.easy, query: 'items=b%3Ab-demo-easy%3A0&m=speed%2CheartRate%2Cefficiency&tab=trends', savedAt: saved },
    ] },
    // The Dashboard in rows that fill: three figures of now, the weeks beside the last runs, then the charts
    // the whole width each, the runner's capacity first (the app names a chart by its view; the name kept is for a view gone).
    'dashboard.json': { tiles: [
      { id: 'week', kind: 'week' }, { id: 'form', kind: 'form' }, { id: 'last', kind: 'last' },
      { id: 'weekly', kind: 'weekly', size: 2 }, { id: 'recent', kind: 'recent' },
      { id: 'perf:capacity/critical', kind: 'perf', ref: 'capacity/critical', name: 'Capacity · Critical speed and power', size: 3 },
      { id: 'perf:capacity/efforts', kind: 'perf', ref: 'capacity/efforts', name: 'Capacity · Best efforts', size: 3 },
      { id: 'perf:load/form', kind: 'perf', ref: 'load/form', name: 'Load · Form', size: 3 },
    ] },
    'setup.json': { state: 'done', at: saved },
  };
}

/** The tag dictionary of the demo folder: the workout types and the technique cue, in the folder's language. */
export function demoDictionary(lang: DemoLang): { workoutTypes: string[]; techniqueCues: string[] } {
  const w = WORDS[lang];
  return { workoutTypes: Object.values(w.types), techniqueCues: [w.cue] };
}

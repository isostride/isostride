import { describe, expect, it } from 'vitest';
import { asRule, type BlockDefinition } from '@/lib/blocks';
import { parseItems } from '@/lib/compare';
import { DEMO_VERSION, PEAK_PACE, RACES, STORY_WEEKS, allOutSpeed, allOutTime, criticalSpeedOn, dPrime, dayNumber, demoDictionary, demoGear, demoPlan, demoTags, demoUserFiles, firstDay, generateRun, isoDay, mondayOf, planDay, storyWeek } from '@/lib/demo';
import { gearOn, type Gear } from '@/lib/gear';
import { parseFit, runFromMessages } from '@/lib/ingest';

/** The demo opened on a Thursday evening. */
const NOW = new Date(2026, 10, 26, 19, 0, 0);
const ANCHOR = dayNumber(NOW);
const plan = demoPlan(ANCHOR, NOW, 'en');
const pace = (day: number) => 1000 / criticalSpeedOn(day, ANCHOR);

describe('Demo runner', () => {
  it('Demo runner trains for two years', () => {
    // The story: 104 weeks from a Monday to the week the demo is opened in, five or six runs in most of them.
    expect(storyWeek(ANCHOR, ANCHOR)).toBe(STORY_WEEKS - 1);
    expect(new Date(isoDay(firstDay(ANCHOR))).getUTCDay()).toBe(1);
    expect(ANCHOR - firstDay(ANCHOR)).toBeGreaterThan(720);
    expect(plan.length).toBeGreaterThan(500);
    expect(plan.length).toBeLessThan(640);
    expect(plan[0].day).toBeGreaterThanOrEqual(firstDay(ANCHOR));
    // Each run its own file and id, in the order of time, none after now.
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length);
    expect(new Set(plan.map((r) => r.file)).size).toBe(plan.length);
    for (let i = 1; i < plan.length; i++) expect(plan[i].start.getTime()).toBeGreaterThan(plan[i - 1].start.getTime());
    expect(plan[plan.length - 1].start.getTime()).toBeLessThan(NOW.getTime());
    // What a club runner does: easy runs, long runs, tempo, repetitions, hills, races, tests of the critical speed.
    const kinds = new Set(plan.map((r) => r.kind));
    for (const k of ['easy', 'long', 'tempo', 'intervals', 'hills', 'race', 'test']) expect(kinds.has(k as never), k).toBe(true);
    expect(plan.filter((r) => r.kind === 'race')).toHaveLength(Object.keys(RACES).length);
    // The weeks out of the ordinary: a week of a cold with two runs, a strained calf with none.
    const inWeek = (week: number) => plan.filter((r) => storyWeek(r.day, ANCHOR) === week);
    expect(inWeek(9)).toHaveLength(2);
    expect(inWeek(58)).toHaveLength(0);
    // The holidays elsewhere, a few winter runs on a treadmill, the rest in and around the park.
    expect(inWeek(27).every((r) => r.legs?.[0].path === 'promenade')).toBe(true);
    expect(plan.some((r) => r.legs === null)).toBe(true);
  });

  it('Demo plan is the same whenever it is made', () => {
    // A day is planned from its date alone: the same run in a plan made again, and in one made days later.
    const again = demoPlan(ANCHOR, NOW, 'en');
    expect(again.map((r) => [r.id, r.file, r.title, r.cs, r.seed])).toEqual(plan.map((r) => [r.id, r.file, r.title, r.cs, r.seed]));
    const later = demoPlan(ANCHOR, new Date(2026, 10, 30, 21, 0, 0), 'en');
    expect(later.length).toBeGreaterThan(plan.length);
    expect(later.slice(0, plan.length).map((r) => r.id)).toEqual(plan.map((r) => r.id));
    // A run of today is in the plan only once it is over: at noon the evening's session is not.
    const noon = demoPlan(ANCHOR, new Date(2026, 10, 26, 12, 0, 0), 'en');
    expect(noon[noon.length - 1].day).toBeLessThan(ANCHOR);
    // In Polish the same runs, with their titles in Polish.
    const pl = demoPlan(ANCHOR, NOW, 'pl');
    expect(pl.map((r) => r.id)).toEqual(plan.map((r) => r.id));
    expect(pl.find((r) => r.kind === 'race' && r.title?.includes('Półmaraton'))).toBeTruthy();
    expect(planDay(plan[0].day, ANCHOR, 'en')!.id).toBe(plan[0].id);
  });

  it('Demo runner has a critical pace of about 3:15', () => {
    // 3:15 /km on the day of the story's last race, the Saturday before the last week.
    const peak = mondayOf(STORY_WEEKS - 2, ANCHOR) + 5;
    expect(pace(peak)).toBeCloseTo(PEAK_PACE, 6);
    expect(Math.abs(pace(ANCHOR) - PEAK_PACE)).toBeLessThan(4);
    // Slower two years before, by the training done since; never out of what such a runner runs.
    expect(pace(firstDay(ANCHOR))).toBeGreaterThan(PEAK_PACE + 6);
    for (let day = firstDay(ANCHOR); day <= ANCHOR; day += 7) { expect(pace(day)).toBeGreaterThan(188); expect(pace(day)).toBeLessThan(222); }
    // Slower after the weeks without running (the strained calf) than before them.
    expect(pace(mondayOf(60, ANCHOR))).toBeGreaterThan(pace(mondayOf(56, ANCHOR)) + 3);
    // The races to the model: 5 km in about 15:35, 10 km about 32:30, a half marathon about 1:12 at 3:15 and D′ 205 m.
    const cs = 1000 / PEAK_PACE;
    expect(allOutTime(5000, cs, 205)).toBeCloseTo((5000 - 205) / cs, 6);
    expect(allOutTime(10000, cs, 205) / 60).toBeGreaterThan(32);
    expect(allOutTime(10000, cs, 205) / 60).toBeLessThan(33);
    expect(allOutTime(21097.5, cs, 205) / 60).toBeGreaterThan(70);
    expect(allOutTime(21097.5, cs, 205) / 60).toBeLessThan(74);
    expect(allOutSpeed(180, cs, 205)).toBeCloseTo(cs + 205 / 180, 6);
    expect(dPrime(STORY_WEEKS - 1)).toBe(205);
  });

  it('Demo run reads back from its FIT file as generated', () => {
    // The shortest easy run of the last weeks: its FIT file decoded by the SDK is the run the generator hands to the import.
    const run = plan.filter((r) => r.kind === 'easy' && r.legs).slice(-30).reduce((a, b) => (b.estimate < a.estimate ? b : a));
    const made = generateRun(run);
    const direct = runFromMessages(made.messages);
    expect(parseFit(made.fit)).toEqual(direct);
    // As a watch records: a sample a second, the heart rate, the position, the running dynamics and the power.
    expect(direct.startTime).toBe(run.start.toISOString());
    expect(direct.samples.t.length).toBe(direct.duration);
    for (const k of ['speed', 'heartRate', 'cadence', 'groundContactTime', 'verticalOscillation', 'stepLength', 'power', 'altitude']) expect(direct.metrics.some((m) => m.key === k), k).toBe(true);
    expect(direct.samples.lat.some((v) => v !== null)).toBe(true);
    const planned = run.parts.reduce((a, p) => a + (p.metres ?? p.seconds! * p.share * run.cs), 0);
    expect(Math.abs(direct.distance - planned)).toBeLessThan(planned * 0.08);
    // An easy pace and an easy heart rate for this runner.
    const speed = direct.distance / direct.duration;
    expect(1000 / speed).toBeGreaterThan(245);
    expect(1000 / speed).toBeLessThan(300);
    const hr = direct.samples.values.heartRate!.filter((v): v is number => v !== null);
    const mean = hr.reduce((a, b) => a + b, 0) / hr.length;
    expect(mean).toBeGreaterThan(125);
    expect(mean).toBeLessThan(155);
    // The same again: the generator is seeded by the day.
    expect(generateRun(run).fit).toEqual(made.fit);
  });

  it('Demo race is run to the critical speed model', () => {
    // The last race on the track (one lap of the watch for the race): it takes what the model gives for the
    // runner's critical speed that day and its distance.
    const race = plan.filter((r) => r.kind === 'race' && !r.autoLap).pop()!;
    const metres = race.parts.find((p) => p.kind === 'race')!.metres!;
    const made = generateRun(race);
    const lap = made.messages.lapMesgs.find((l) => Math.abs((l.totalDistance as number) - metres) < 30)!;
    const model = allOutTime(metres, race.cs, dPrime(race.week));
    expect(Math.abs((lap.totalElapsedTime as number) - model)).toBeLessThan(model * 0.015);
    expect(race.shoes).toBe('g-race');
  });

  it('Demo folder holds what the runner would have entered', () => {
    const files = demoUserFiles(ANCHOR, 'en', NOW);
    expect(files['demo.json']).toEqual({ version: DEMO_VERSION, anchor: ANCHOR, lang: 'en' });
    // The set-up is done: the wizard does not open on the demo.
    expect((files['setup.json'] as { state: string }).state).toBe('done');
    // The gear: the everyday shoes one pair after another to today, the pairs for sessions and races, the strap.
    const gear = demoGear(ANCHOR, 'en') as Gear[];
    expect(new Set(gear.map((g) => g.id)).size).toBe(gear.length);
    for (const day of [firstDay(ANCHOR), ANCHOR - 300, ANCHOR]) expect(gearOn(gear, 'shoes', isoDay(day)), isoDay(day)).not.toBeNull();
    expect(gearOn(gear, 'hrSensor', isoDay(firstDay(ANCHOR)))).toBeNull();
    expect(gearOn(gear, 'hrSensor', isoDay(ANCHOR))?.id).toBe('g-strap');
    // Each run tagged with a type of the dictionary; the shoes named where the dates would give another pair.
    const tags = demoTags(plan, ANCHOR, 'en');
    const dictionary = demoDictionary('en');
    for (const run of plan) {
      const tag = tags[run.id];
      expect(dictionary.workoutTypes).toContain(tag.workoutType);
      const worn = tag.shoesOverride ?? gearOn(gear, 'shoes', isoDay(run.day))!.id;
      if (run.shoes) expect(worn).toBe(run.shoes); else expect(worn).toMatch(/^g-daily-/);
    }
    expect(Object.values(tags).some((t) => t.techniqueCue === dictionary.techniqueCues[0])).toBe(true);
    // The segments are rules the app reads, the 1 km repetitions within 3 % of a kilometre.
    const defs = (files['block-definitions.json'] as { definitions: BlockDefinition[] }).definitions;
    for (const d of defs) expect(() => asRule(d.params, d.tolerances)).not.toThrow();
    const km = asRule(defs.find((d) => d.id === 'b-demo-1km')!.params, defs[0].tolerances).shape;
    expect(km.type === 'lap' && km.planned?.tolerance).toBe(0.03);
    // The saved analyses name segments that are there.
    for (const a of (files['analyses.json'] as { analyses: { query: string }[] }).analyses) {
      const items = parseItems(new URLSearchParams(a.query).get('items'));
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) expect(defs.some((d) => d.id === i.id)).toBe(true);
    }
    // In Polish: the same files, the runner's own words in Polish.
    expect(demoDictionary('pl').workoutTypes).toContain('interwały');
    expect(demoGear(ANCHOR, 'pl').map((g) => g.id)).toEqual(gear.map((g) => g.id));
  });
});

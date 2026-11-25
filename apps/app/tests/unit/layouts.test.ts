import { describe, expect, it } from 'vitest';
import { RULE_TOLERANCES, decodeRule, encodeRule, followsLayout, matchesRunFilter, patternName, ruleName, ruleOf, type BlockDefinition, type Rule } from '@/lib/blocks';
import { detectInstances } from '@/lib/detection';
import type { RunFile } from '@/lib/kernel';
import { layoutsOf } from '@/app/segments/options';
import { rowFor, syntheticRun } from '../support/synthetic';

/** A run of laps one after another, each at its pace (s/km). */
function workout(id: string, parts: [seconds: number, pace: number][]): RunFile {
  const laps: RunFile['laps'] = [];
  let t = 0;
  for (const [s, pace] of parts) { laps.push({ start: t, end: t + s, duration: s, distance: (s * 1000) / pace }); t += s; }
  const run = syntheticRun(t, (time) => ({ speed: 1000 / parts[laps.findIndex((l) => time >= l.start && time < l.end)][1], heartRate: 150 }), laps);
  return { ...run, id, startTime: `2026-10-${id.padStart(2, '0')}T18:00:00.000Z` };
}

/** 10 min warm-up, 3 × 10 min with 2 min jogs, 5 min cool-down. */
const tenMin = (id: string, rep = 250) => workout(id, [[600, 330], [600, rep], [120, 430], [600, rep], [120, 430], [600, rep], [120, 450], [300, 360]]);
/** 2 km warm-up, 3 × 10 min with 3 min jogs: the same reps in another layout. */
const twoKm = (id: string) => workout(id, [[660, 330], [600, 248], [180, 420], [600, 247], [180, 420], [600, 246], [400, 360]]);
/** 2 × 15 min: other reps. */
const fifteen = (id: string) => workout(id, [[600, 330], [900, 245], [180, 420], [900, 247], [300, 360]]);

const def = (rule: Rule): BlockDefinition => ({ id: 'd', name: ruleName(rule), origin: 'manual', status: 'active', createdAt: '', params: { type: 'rule', ...rule }, tolerances: RULE_TOLERANCES });
const reps = (rule: Rule, run: RunFile) => detectInstances(def(rule), run, rowFor(run), []).map((i) => i.context.before.lap);

describe('Segments by lap layout', () => {
  const runs = [tenMin('1'), tenMin('2', 246), twoKm('3'), fifteen('4')];

  it('Layouts found in the runs', () => {
    const found = layoutsOf(runs);
    // Each layout once, the most runs first; the same reps counted across the layouts.
    expect(found.map((l) => [patternName(l.laps), l.runs, l.similar])).toEqual([
      ['10 min + 3 × 10 min', 2, 3],
      ['10 min + 2 × 15 min', 1, 1],
      ['11 min + 3 × 10 min', 1, 3],
    ]);
    // A run of one lap is no layout.
    expect(layoutsOf([workout('5', [[1800, 330]])])).toEqual([]);
  });

  it('Reps of a layout, identical or similar', () => {
    const layout = layoutsOf(runs)[0].laps;
    // Identical: only the runs of the same laps, the layout's effort laps.
    const identical = ruleOf({ type: 'pattern', laps: layout, tolerance: 0.03 });
    expect(runs.map((r) => reps(identical, r))).toEqual([[2, 4, 6], [2, 4, 6], [], []]);
    // Similar: the same reps in any layout, each run's own effort laps; 2 × 15 min never.
    const similar = ruleOf({ type: 'pattern', laps: layout, tolerance: 0.03, match: 'similar' });
    expect(runs.map((r) => reps(similar, r))).toEqual([[2, 4, 6], [2, 4, 6], [2, 4, 6], []]);
    expect([ruleName(identical), ruleName(similar)]).toEqual(['Reps of 10 min + 3 × 10 min', 'Reps of 3 × 10 min, any layout']);
    // Carried by a link and read back.
    expect(decodeRule(encodeRule(similar))).toEqual(similar);
  });

  it('Runs filtered by a layout', () => {
    const laps = layoutsOf(runs)[0].laps;
    // Whole runs of the layout: identical, two; similar, three.
    const identical: Rule = { ...ruleOf({ type: 'run' }), runs: { ...ruleOf({ type: 'run' }).runs, layout: { laps, match: 'identical' } } };
    const similar: Rule = { ...identical, runs: { ...identical.runs, layout: { laps, match: 'similar' } } };
    expect(runs.map((r) => reps(identical, r).length)).toEqual([1, 1, 0, 0]);
    expect(runs.map((r) => reps(similar, r).length)).toEqual([1, 1, 1, 0]);
    expect(ruleName(identical)).toBe('Runs · runs of 10 min + 3 × 10 min');
    expect(ruleName(similar)).toBe('Runs · runs with 3 × 10 min');
    // An identical layout needs as many laps: the index row alone leaves the others out.
    expect(runs.map((r) => matchesRunFilter(identical.runs, rowFor(r)))).toEqual([true, true, false, false]);
    expect(runs.map((r) => matchesRunFilter(similar.runs, rowFor(r)))).toEqual([true, true, true, true]);
    expect([followsLayout(twoKm('6'), laps, 'similar'), followsLayout(twoKm('6'), laps, 'identical')]).toEqual([true, false]);
  });
});

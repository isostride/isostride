import { describe, expect, it } from 'vitest';
import { renameInDefinitions, ruleOf, type BlockDefinition } from '@/lib/blocks';
import { renameTag, type RunTagsFile } from '@/lib/gear';

const def = (id: string, name: string, params: BlockDefinition['params']): BlockDefinition => ({ id, name, origin: 'manual', status: 'active', createdAt: '2026-11-24T10:00:00.000Z', params, tolerances: {} as BlockDefinition['tolerances'] });

describe('Gear and tags renamed', () => {
  it('Tag renamed everywhere it is used', () => {
    const file: RunTagsFile = { dictionary: { workoutTypes: ['easy', 'tempo', 'race'], techniqueCues: ['cadence'] }, tags: { r1: { workoutType: 'tempo', note: 'x' }, r2: { workoutType: 'easy' }, r3: { techniqueCue: 'cadence' } } };
    // In its place in the dictionary, and on every run tagged with it.
    const out = renameTag(file, 'workoutTypes', 'tempo', ' threshold ');
    expect(out.dictionary.workoutTypes).toEqual(['easy', 'threshold', 'race']);
    expect(out.tags).toEqual({ r1: { workoutType: 'threshold', note: 'x' }, r2: { workoutType: 'easy' }, r3: { techniqueCue: 'cadence' } });
    expect(renameTag(file, 'techniqueCues', 'cadence', 'arms').tags.r3).toEqual({ techniqueCue: 'arms' });
    // An empty name, the same, another tag's or an unknown tag: nothing changes.
    for (const [from, to] of [['tempo', ''], ['tempo', 'tempo'], ['tempo', 'easy'], ['hills', 'x']]) expect(renameTag(file, 'workoutTypes', from, to)).toBe(file);
    // The segments' rules naming it follow: the runs a rule draws from, a tag segment and its name.
    const rule = ruleOf({ type: 'main' });
    const defs = [
      def('a', 'Tempo runs', { type: 'rule', ...rule, runs: { ...rule.runs, workoutTypes: ['tempo', 'race'] } }),
      def('b', 'Workout: tempo', { type: 'tag', workoutType: 'tempo' }),
      def('c', 'Easy', { type: 'tag', workoutType: 'easy' }),
      def('d', 'In Shoes A', { type: 'rule', ...rule, runs: { ...rule.runs, shoes: ['Shoes A'] } }),
    ];
    const renamed = renameInDefinitions(defs, 'workoutTypes', 'tempo', 'threshold');
    expect(renamed[0].params).toMatchObject({ runs: { workoutTypes: ['threshold', 'race'] } });
    expect([renamed[1].name, renamed[1].params]).toEqual(['Workout: threshold', { type: 'tag', workoutType: 'threshold' }]);
    expect(renamed[2]).toBe(defs[2]);
    // A piece of gear renamed: the rules naming its old name.
    expect(renameInDefinitions(defs, 'shoes', 'Shoes A', 'Shoes B')[3].params).toMatchObject({ runs: { shoes: ['Shoes B'] } });
  });
});

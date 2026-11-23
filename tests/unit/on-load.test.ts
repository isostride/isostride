import { describe, expect, it } from 'vitest';
import { onLoad, type ModelKey } from '@/lib/load';

describe('Models the load model changes', () => {
  it('The load and what rests on it, directly or through another', () => {
    const m = (key: ModelKey, parents: ModelKey[] = []) => ({ key, parents });
    const set = onLoad([m('load'), m('form', ['load']), m('fittedVdot', ['form', 'vdot']), m('efforts'), m('vdot', ['predictions']), m('predictions', ['efforts']), m('ef')]);
    expect([...set].sort()).toEqual(['fittedVdot', 'form', 'load']);
  });
});

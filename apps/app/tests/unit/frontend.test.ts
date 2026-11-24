import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ES modules without types
import { LIMIT_DAYS, evaluate } from '../../scripts/framework-support.mjs';
// @ts-expect-error plain ES modules without types
import { allowedByAdrs, otherFrameworks } from '../../scripts/frameworks.mjs';
import { recordMeasure } from '../support/fixtures';

const ROOT = path.resolve(__dirname, '../..');

describe('Built on the chosen framework', () => {
  it('Only React', async () => {
    const pkg = { file: 'package.json', json: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) };
    // The decision records are read only when the package declares another framework: reading the
    // whole model (some 500 files) each time put this unit test over its 100 ms.
    const declared = otherFrameworks([pkg]);
    const found = declared.length ? otherFrameworks([pkg], allowedByAdrs(path.join(ROOT, '../../.radical/model'))) : declared;
    await recordMeasure('otherFrameworks', found.length);
    expect(found).toEqual([]);
    expect(pkg.json.dependencies.react).toBeDefined();
  });

  it('Second framework refused', () => {
    // A change adds vue: the check fails until an accepted decision record allows it.
    const pkg = { file: 'package.json', json: { dependencies: { react: '19.0.0', vue: '3.5.0' } } };
    const model = fs.mkdtempSync(path.join(os.tmpdir(), 'model-'));
    expect(otherFrameworks([pkg], allowedByAdrs(model))).toEqual(['package.json declares vue, another UI framework; an accepted decision record must allow it']);
    fs.writeFileSync(path.join(model, 'vue.md'), '---\ntype: "adr"\nstatus: "proposed"\ndecision: "The map editor uses the package vue."\n---\n');
    expect(otherFrameworks([pkg], allowedByAdrs(model))).toHaveLength(1);
    fs.writeFileSync(path.join(model, 'vue.md'), '---\ntype: "adr"\nstatus: "accepted"\ndecision: "The map editor uses the package vue."\n---\n');
    expect(otherFrameworks([pkg], allowedByAdrs(model))).toEqual([]);
  });
});

describe('Supported framework versions', () => {
  it('End of support ahead', () => {
    // A framework major whose end of support is less than 180 days away fails, naming the version and date.
    const today = new Date('2026-11-19T00:00:00Z');
    const data = { nextjs: [{ cycle: '16', eol: false }, { cycle: '15', eol: '2027-01-31' }], react: [{ cycle: '19', eol: false }] };
    const r = evaluate([{ product: 'nextjs', cycle: '15' }, { product: 'nextjs', cycle: '16' }, { product: 'react', cycle: '19' }], data, today);
    const close = r.filter((x: { days: number }) => x.days < LIMIT_DAYS);
    expect(close).toEqual([{ product: 'nextjs', cycle: '15', days: 73, eol: '2027-01-31' }]);
  });
});
